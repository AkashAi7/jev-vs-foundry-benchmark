import type { BenchmarkCase, Scenario, Stage } from '../shared/types';
import type { Providers } from './providers';

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(values: T[], seed: number): T[] {
  const random = seededRandom(seed);
  const output = [...values];
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [output[i], output[j]] = [output[j]!, output[i]!];
  }
  return output;
}

export function demoProviders(seed: number, repetition: number): Providers {
  function example(provider: 'jev' | 'foundry', item: BenchmarkCase, scenario: Scenario): Stage {
    const hash = [...`${item.id}-${provider}`].reduce((a, char) => Math.imul(a, 31) + char.charCodeAt(0) | 0, seed + repetition);
    const random = seededRandom(hash);
    const correct = random() > (provider === 'jev' ? 0.23 : 0.13);
    const labels = Object.keys(scenario.criteria);
    const choice = correct ? item.expected : labels.find(label => label !== item.expected)!;
    const confidence = correct ? 0.82 + random() * 0.17 : 0.45 + random() * 0.4;
    return {
      provider, model: `synthetic-${provider}-fixture`,
      latencyMs: provider === 'jev' ? 35 + random() * 90 : 600 + random() * 1400,
      choice, confidence: provider === 'jev' ? confidence : null,
      probabilities: provider === 'jev' ? Object.fromEntries(labels.map(label => [label, label === choice ? 0.8 : 0.2 / (labels.length - 1)])) : null,
      usage: { inputTokens: 180 + Math.floor(random() * 70), outputTokens: provider === 'jev' ? 35 : 18 },
    };
  }
  return {
    async jev(item, scenario, signal) { signal.throwIfAborted(); return example('jev', item, scenario); },
    async foundry(item, scenario, signal) { signal.throwIfAborted(); return example('foundry', item, scenario); },
  };
}
