import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeJev } from '../shared/insights';
import { summarizeJev } from '../shared/jev-report';
import { cases, scenarios } from '../shared/scenarios';
import { exportJson } from '../server/export';
import type { BenchmarkRun, Observation, Stage } from '../shared/types';

function observation(confidence: number | null, choice = 'billing', overrides: Partial<Observation> = {}): Observation {
  const stage: Stage = {
    provider: 'jev', model: 'test', latencyMs: 20, choice, confidence,
    probabilities: { billing: 0.6, technical: 0.3, sales: 0.1 }, usage: null,
  };
  return {
    id: 'test', caseId: cases[0]!.id, scenarioId: 'support', arm: 'jev', repetition: 0,
    expected: 'billing', predicted: choice, correct: choice === 'billing', status: 'success',
    latencyMs: 20, stages: [stage], escalated: false, error: null, ...overrides,
  };
}

test('confidence bins include exact boundaries once, distinguish probability and use stage correctness', () => {
  const rows = [0, 0.2, 0.4, 0.6, 0.8, 1].map(confidence => observation(confidence));
  rows.push(observation(0.9, 'technical'));
  rows.push(observation(null));
  rows.push(observation(1, 'technical', { arm: 'hybrid' }));
  const result = analyzeJev(rows, 0.8);
  assert.deepEqual(result.bins.map(bin => bin.count), [1, 1, 1, 1, 3]);
  assert.equal(result.samples, 7);
  assert.equal(result.unavailable, 1);
  assert.equal(result.accepted, 3);
  assert.equal(result.acceptedCorrect, 2);
  assert.equal(result.acceptedAccuracy, 2 / 3);
  assert.equal(result.highConfidenceErrors, 1);
  assert.equal(result.escalated, 4);
  assert.equal(result.thresholdSweep.find(value => value.threshold === 0.8)!.coverage, 3 / 8);
  assert.equal(result.thresholdSweep.at(-1)!.accepted, 1);
  assert.equal(result.hybrid, null);
});

test('hybrid diagnostics retain failed escalation evidence and separate rescue from regression', () => {
  const escalation = (jevChoice: string, foundryChoice: string | null) => {
    const row = observation(0.3, jevChoice, {
      arm: 'hybrid', escalated: true, predicted: foundryChoice,
      correct: foundryChoice === 'billing', status: foundryChoice ? 'success' : 'error',
      error: foundryChoice ? null : 'Access denied',
    });
    if (foundryChoice) row.stages.push({
      provider: 'foundry', model: 'test-foundry', latencyMs: 100, choice: foundryChoice,
      confidence: null, probabilities: null, usage: null,
    });
    return row;
  };
  const result = analyzeJev([
    escalation('technical', 'billing'),
    escalation('billing', 'technical'),
    escalation('billing', 'billing'),
    escalation('technical', null),
    observation(0.95, 'technical', { arm: 'hybrid' }),
    observation(0.95),
  ], 0.8, 'hybrid');
  assert.equal(result.total, 5);
  assert.equal(result.samples, 5);
  assert.equal(result.bins[1]!.correct, 2, 'counts Jev stage, not final hybrid prediction');
  assert.equal(result.highConfidenceErrors, 1);
  assert.deepEqual(result.hybrid, {
    escalations: 4, completedEscalations: 3, rescued: 1, regressed: 1, unchanged: 1, failedEscalations: 1,
  });
});

test('empty diagnostics are explicitly unmeasured and invalid gates fail', () => {
  const result = analyzeJev([], 0.8, 'hybrid');
  assert.equal(result.samples, 0);
  assert.equal(result.acceptedAccuracy, null);
  assert.ok(result.bins.every(bin => bin.accuracy === null && bin.meanConfidence === null));
  assert.ok(result.thresholdSweep.every(point => point.coverage === null && point.accuracy === null));
  for (const threshold of [-0.1, 1.1, NaN, Infinity]) assert.throws(() => analyzeJev([], threshold), RangeError);
});

test('saved report and JSON diagnostics use run threshold and saved scenario definitions', () => {
  const run: BenchmarkRun = {
    id: 'test', datasetVersion: 'test', datasetHash: 'test', dataset: { scenarios, cases },
    protocol: { version: 'test', stageTimeoutMs: 60000, maxCompletionTokens: 2048, retries: 0, foundryEndpoint: '' },
    createdAt: '', completedAt: '', status: 'completed',
    options: { mode: 'demo', arms: ['jev'], scenarioIds: ['support'], repetitions: 1, threshold: 0.95, seed: 42 },
    total: 1, observations: [observation(0.9)], models: { jev: 'test', foundry: '' }, fatalError: null,
  };
  assert.equal(summarizeJev(run).confidence.accepted, 0);
  const exported = JSON.parse(exportJson(run));
  assert.deepEqual(exported.jevDiagnostics, [analyzeJev(run.observations, 0.95)]);
  assert.equal(exported.jevReport.confidence.gate, 0.95);
  assert.equal(exported.scenarioMetrics.length, 1);
  assert.equal(exported.scenarioMetrics[0].metrics[0].accuracy, 1);
});
