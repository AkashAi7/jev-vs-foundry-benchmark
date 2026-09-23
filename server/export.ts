import type { BenchmarkRun } from '../shared/types';
import { summarize } from '../shared/metrics';
import { summarizeJev } from '../shared/jev-report';
import { analyzeJev } from '../shared/insights';

export function exportJson(run: BenchmarkRun): string {
  return JSON.stringify({
    ...run,
    notice: run.options.mode === 'demo'
      ? 'SYNTHETIC EXAMPLE ONLY. No provider was called. These values are not measured model performance.'
      : 'Live pilot measurements on a small synthetic labelled suite, not a general model ranking.',
    metrics: run.options.arms.map(arm => summarize(run.observations, arm, run.dataset.scenarios)),
    ...(run.options.arms.includes('jev') ? { jevReport: summarizeJev(run) } : {}),
    jevDiagnostics: (['jev', 'hybrid'] as const).filter(arm => run.options.arms.includes(arm))
      .map(arm => analyzeJev(run.observations, run.options.threshold, arm)),
    scenarioMetrics: run.dataset.scenarios.filter(scenario => run.options.scenarioIds.includes(scenario.id))
      .map(scenario => ({
        scenarioId: scenario.id,
        metrics: run.options.arms.map(arm => summarize(
          run.observations.filter(row => row.scenarioId === scenario.id), arm, [scenario],
        )),
      })),
  }, null, 2);
}

export function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function exportCsv(run: BenchmarkRun): string {
  const headers = [
    'run_id', 'mode', 'dataset_version', 'dataset_hash', 'protocol', 'threshold', 'seed',
    'case_id', 'scenario', 'arm', 'repetition', 'expected', 'predicted', 'correct', 'status',
    'latency_ms', 'escalated', 'input_tokens_observed', 'output_tokens_observed', 'usage_complete', 'stages_json', 'error', 'foundry_auth',
  ];
  const rows = run.observations.map(row => [
    run.id, run.options.mode, run.datasetVersion, run.datasetHash, run.protocol.version,
    run.options.threshold, run.options.seed, row.caseId, row.scenarioId, row.arm, row.repetition,
    row.expected, row.predicted, row.correct, row.status, row.latencyMs, row.escalated,
    row.stages.reduce((sum, stage) => sum + (stage.usage?.inputTokens ?? 0), 0),
    row.stages.reduce((sum, stage) => sum + (stage.usage?.outputTokens ?? 0), 0),
    row.status === 'success' && row.stages.every(stage => stage.usage !== null),
    JSON.stringify(row.stages), row.error,
    run.protocol.foundryAuth === undefined ? 'not-recorded' : run.protocol.foundryAuth ?? 'not-used',
  ]);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
}
