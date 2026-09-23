import { summarize } from './metrics';
import { analyzeJev, type ConfidenceBin } from './insights';
import type { BenchmarkCase, BenchmarkRun, MetricSummary, Scenario } from './types';

export type { ConfidenceBin } from './insights';

export interface JevScenarioReport {
  scenario: Scenario;
  summary: MetricSummary;
  confusion: { labels: string[]; cells: number[][]; errors: number[] };
}

export interface JevReport {
  summary: MetricSummary;
  casesPlanned: number;
  casesEvaluated: number;
  models: string[];
  scenarios: JevScenarioReport[];
  difficulties: { difficulty: BenchmarkCase['difficulty']; summary: MetricSummary }[];
  confidence: {
    gate: number;
    available: number;
    missing: number;
    mean: number | null;
    meanMargin: number | null;
    accepted: number;
    acceptedCorrect: number;
    acceptedAccuracy: number | null;
    coverage: number | null;
    review: number;
    highConfidenceMistakes: number;
    bins: ConfidenceBin[];
  };
  repeats: {
    eligibleCases: number;
    consistentCases: number;
    agreement: number | null;
    pendingCases: number;
  };
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator ? numerator / denominator : null;

export function summarizeJev(run: BenchmarkRun, confidenceGate = run.options.threshold): JevReport {
  if (!Number.isFinite(confidenceGate) || confidenceGate < 0 || confidenceGate > 1) {
    throw new RangeError('Confidence gate must be between zero and one.');
  }
  const selectedScenarios = run.dataset.scenarios.filter(s => run.options.scenarioIds.includes(s.id));
  const plannedCases = run.dataset.cases.filter(c => run.options.scenarioIds.includes(c.scenarioId));
  const rows = run.observations.filter(row => row.arm === 'jev');
  const successes = rows.filter(row => row.status === 'success');
  const evidence = successes.flatMap(row => {
    const stage = row.stages.find(value => value.provider === 'jev');
    return stage && stage.confidence !== null ? [{ row, stage, confidence: stage.confidence }] : [];
  });
  const accepted = evidence.filter(item => item.confidence >= confidenceGate);
  const acceptedCorrect = accepted.filter(item => item.row.correct).length;
  const margins = evidence.flatMap(({ stage }) => {
    if (!stage.probabilities) return [];
    const probabilities = Object.values(stage.probabilities).sort((a, b) => b - a);
    return probabilities.length >= 2 ? [probabilities[0]! - probabilities[1]!] : [];
  });
  const { bins } = analyzeJev(rows, confidenceGate);
  let eligibleCases = 0;
  let consistentCases = 0;
  if (run.options.repetitions >= 2) {
    for (const item of plannedCases) {
      const trials = rows.filter(row => row.caseId === item.id && row.scenarioId === item.scenarioId);
      const complete = trials.length === run.options.repetitions
        && new Set(trials.map(row => row.repetition)).size === run.options.repetitions
        && trials.every(row => row.status === 'success');
      if (!complete) continue;
      eligibleCases++;
      if (new Set(trials.map(row => row.predicted)).size === 1) consistentCases++;
    }
  }
  return {
    summary: summarize(rows, 'jev', selectedScenarios),
    casesPlanned: run.options.arms.includes('jev') ? plannedCases.length : 0,
    casesEvaluated: new Set(rows.map(row => row.caseId)).size,
    models: [...new Set(successes.flatMap(row => row.stages
      .filter(stage => stage.provider === 'jev').map(stage => stage.model)))],
    scenarios: selectedScenarios.map(scenario => {
      const labels = Object.keys(scenario.criteria);
      const subset = rows.filter(row => row.scenarioId === scenario.id);
      return {
        scenario,
        summary: summarize(subset, 'jev', [scenario]),
        confusion: {
          labels,
          cells: labels.map(expected => labels.map(predicted => subset
            .filter(row => row.status === 'success' && row.expected === expected && row.predicted === predicted).length)),
          errors: labels.map(expected => subset.filter(row => row.expected === expected && row.status === 'error').length),
        },
      };
    }),
    difficulties: (['standard', 'edge'] as const).map(difficulty => {
      const ids = new Set(plannedCases.filter(item => item.difficulty === difficulty).map(item => item.id));
      return { difficulty, summary: summarize(rows.filter(row => ids.has(row.caseId)), 'jev', selectedScenarios) };
    }),
    confidence: {
      gate: confidenceGate, available: evidence.length, missing: successes.length - evidence.length,
      mean: ratio(evidence.reduce((sum, item) => sum + item.confidence, 0), evidence.length),
      meanMargin: ratio(margins.reduce((sum, margin) => sum + margin, 0), margins.length),
      accepted: accepted.length, acceptedCorrect,
      acceptedAccuracy: ratio(acceptedCorrect, accepted.length),
      coverage: ratio(accepted.length, rows.length),
      review: rows.length - accepted.length,
      highConfidenceMistakes: accepted.length - acceptedCorrect,
      bins,
    },
    repeats: {
      eligibleCases, consistentCases,
      agreement: ratio(consistentCases, eligibleCases),
      pendingCases: run.options.arms.includes('jev') && run.options.repetitions >= 2
        ? plannedCases.length - eligibleCases : 0,
    },
  };
}
