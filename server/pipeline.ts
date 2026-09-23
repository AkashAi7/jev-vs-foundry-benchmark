import type { Arm, BenchmarkCase, Observation, RunOptions, Scenario, Stage } from '../shared/types';
import type { Providers } from './providers';
import { STAGE_TIMEOUT_MS } from './providers';
import { safeError } from './errors';

async function boundedStage(signal: AbortSignal, callback: (signal: AbortSignal) => Promise<Stage>): Promise<Stage> {
  const combined = AbortSignal.any([signal, AbortSignal.timeout(STAGE_TIMEOUT_MS)]);
  combined.throwIfAborted();
  let abort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(combined.reason);
    combined.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([callback(combined), aborted]); }
  finally { combined.removeEventListener('abort', abort); }
}

export async function evaluate(
  item: BenchmarkCase, scenario: Scenario, arm: Arm, repetition: number,
  options: RunOptions, providers: Providers, signal: AbortSignal,
): Promise<Observation> {
  const start = performance.now();
  const stages: Stage[] = [];
  let escalated = false;
  let error: string | null = null;
  let predicted: string | null = null;
  try {
    let decision: Stage;
    if (arm === 'foundry') {
      decision = await boundedStage(signal, current => providers.foundry(item, scenario, current));
      stages.push(decision);
    } else {
      decision = await boundedStage(signal, current => providers.jev(item, scenario, current));
      stages.push(decision);
      if (arm === 'hybrid' && (decision.confidence === null || decision.confidence < options.threshold)) {
        escalated = true;
        const evidence = decision;
        decision = await boundedStage(signal, current => providers.foundry(item, scenario, current, evidence));
        stages.push(decision);
      }
    }
    predicted = decision.choice;
  } catch (cause) {
    if (signal.aborted) throw cause;
    error = safeError(cause);
  }
  return {
    id: `${item.id}-${repetition}-${arm}`, caseId: item.id, scenarioId: scenario.id, arm, repetition,
    expected: item.expected, predicted,
    correct: error === null && predicted === item.expected,
    status: error === null ? 'success' : 'error',
    latencyMs: options.mode === 'demo' ? stages.reduce((sum, stage) => sum + stage.latencyMs, 0) : performance.now() - start,
    stages, escalated, error,
  };
}
