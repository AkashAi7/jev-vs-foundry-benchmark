import type { Arm, MetricSummary, Observation, Scenario } from './types';

export function percentile(values: number[], fraction: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const low = sorted[Math.floor(position)]!;
  const high = sorted[Math.ceil(position)]!;
  return low + (high - low) * (position % 1);
}

export function summarize(rows: Observation[], arm: Arm, scenarios: Scenario[]): MetricSummary {
  const selected = rows.filter(row => row.arm === arm);
  const successes = selected.filter(row => row.status === 'success');
  const scores: number[] = [];
  for (const scenario of scenarios) {
    const subset = selected.filter(row => row.scenarioId === scenario.id);
    if (!subset.length) continue;
    for (const label of Object.keys(scenario.criteria)) {
      const tp = subset.filter(row => row.expected === label && row.predicted === label).length;
      const fp = subset.filter(row => row.expected !== label && row.predicted === label).length;
      const fn = subset.filter(row => row.expected === label && row.predicted !== label).length;
      scores.push(2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : 0);
    }
  }
  const stages = selected.flatMap(row => row.stages);
  const latencies = successes.map(row => row.latencyMs);
  return {
    arm,
    total: selected.length,
    successes: successes.length,
    errors: selected.length - successes.length,
    accuracy: selected.length ? selected.filter(row => row.correct).length / selected.length : null,
    macroF1: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    meanMs: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
    inputTokens: stages.reduce((sum, stage) => sum + (stage.usage?.inputTokens ?? 0), 0),
    outputTokens: stages.reduce((sum, stage) => sum + (stage.usage?.outputTokens ?? 0), 0),
    usageKnown: selected.length > 0 && selected.every(row => row.status === 'success' && row.stages.every(stage => stage.usage !== null)),
    escalated: selected.filter(row => row.escalated).length,
    foundryCalls: stages.filter(stage => stage.provider === 'foundry').length,
  };
}
