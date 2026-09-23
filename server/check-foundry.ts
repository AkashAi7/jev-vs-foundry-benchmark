import { existsSync } from 'node:fs';
import { cases, scenarios } from '../shared/scenarios';
import type { RunOptions } from '../shared/types';
import { Configuration, requireConfigured } from './config';
import { safeError } from './errors';
import { evaluate } from './pipeline';
import { createProviders } from './providers';

try {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const config = new Configuration().snapshot();
  const item = cases[0]!;
  const scenario = scenarios.find(value => value.id === item.scenarioId)!;
  const options: RunOptions = {
    mode: 'live', arms: ['foundry'], scenarioIds: [scenario.id],
    repetitions: 1, threshold: 0.8, seed: 42,
  };
  requireConfigured(options, config);
  const result = await evaluate(item, scenario, 'foundry', 1, options, createProviders(config), new AbortController().signal);
  const stage = result.stages[0];
  console.log(JSON.stringify({
    authMode: config.foundryAuth,
    status: result.status,
    notice: 'Single-request connectivity check, not a comparative benchmark. No report was saved.',
    model: stage?.model ?? null,
    latencyMs: result.latencyMs,
    usage: stage?.usage ?? null,
    error: result.error,
  }, null, 2));
  if (result.status !== 'success') process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ status: 'error', error: safeError(error) }));
  process.exitCode = 1;
}
