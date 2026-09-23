import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { FOUNDRY_AUTH_MODES, type BenchmarkRun } from '../shared/types';
import { LabError } from './errors';

const runFile = /^[0-9a-f-]{36}\.json$/;

export class RunStore {
  constructor(private readonly directory: string) {}

  async save(run: BenchmarkRun): Promise<void> {
    if (!z.uuid().safeParse(run.id).success) throw new LabError('Invalid run ID.');
    await mkdir(this.directory, { recursive: true });
    const file = path.join(this.directory, `${run.id}.json`);
    const temporary = `${file}.tmp`;
    await writeFile(temporary, JSON.stringify(run, null, 2), { mode: 0o600 });
    await rename(temporary, file);
  }

  async load(): Promise<BenchmarkRun[]> {
    await mkdir(this.directory, { recursive: true });
    const names = (await readdir(this.directory)).filter(name => runFile.test(name));
    const runs: BenchmarkRun[] = [];
    for (const name of names) {
      const text = await readFile(path.join(this.directory, name), 'utf8');
      let raw: unknown;
      try { raw = JSON.parse(text); }
      catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        throw new LabError(`Saved run ${name} contains malformed JSON. Move it out of the runs directory before restarting.`, 500);
      }
      const parsed = persistedRunSchema.safeParse(raw);
      if (!parsed.success || parsed.data.id !== name.slice(0, -5)) {
        throw new LabError(`Saved run ${name} is invalid. Move it out of the runs directory before restarting.`, 500);
      }
      const run: BenchmarkRun = parsed.data;
      if (run.status === 'running') {
        run.status = 'interrupted';
        run.completedAt = new Date().toISOString();
        run.fatalError = 'The server stopped before this run completed. Partial measurements are retained.';
        await this.save(run);
      }
      runs.push(run);
    }
    return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}

const nonNegative = z.number().finite().nonnegative();
const usage = z.object({ inputTokens: nonNegative, outputTokens: nonNegative });
const stage = z.object({
  provider: z.enum(['jev', 'foundry']), model: z.string(), latencyMs: nonNegative,
  choice: z.string(), confidence: z.number().min(0).max(1).nullable(),
  probabilities: z.record(z.string(), z.number().min(0).max(1)).nullable(), usage: usage.nullable(),
});
export const optionsSchema = z.object({
  mode: z.enum(['demo', 'live']),
  arms: z.array(z.enum(['foundry', 'jev', 'hybrid'])).min(1).max(3).refine(values => new Set(values).size === values.length),
  scenarioIds: z.array(z.string()).min(1).max(3).refine(values => new Set(values).size === values.length),
  repetitions: z.number().int().min(1).max(10),
  threshold: z.number().min(0).max(1),
  seed: z.number().int().min(0).max(2147483647),
}).strict();

const persistedRunSchema = z.object({
  id: z.uuid(), datasetVersion: z.string(), datasetHash: z.string(),
  dataset: z.object({
    scenarios: z.array(z.object({
      id: z.string(), name: z.string(), description: z.string(), instructions: z.string(),
      criteria: z.record(z.string(), z.string()),
    })),
    cases: z.array(z.object({
      id: z.string(), scenarioId: z.string(), title: z.string(), input: z.string(),
      expected: z.string(), difficulty: z.enum(['standard', 'edge']),
    })),
  }),
  protocol: z.object({
    version: z.string(), stageTimeoutMs: nonNegative, maxCompletionTokens: nonNegative,
    retries: nonNegative, foundryEndpoint: z.string(),
    foundryAuth: z.enum(FOUNDRY_AUTH_MODES).nullable().optional(),
  }),
  createdAt: z.string(), completedAt: z.string().nullable(),
  status: z.enum(['running', 'completed', 'cancelled', 'failed', 'interrupted']),
  options: optionsSchema, total: nonNegative,
  models: z.object({ jev: z.string(), foundry: z.string() }),
  fatalError: z.string().nullable(),
  observations: z.array(z.object({
    id: z.string(), caseId: z.string(), scenarioId: z.string(),
    arm: z.enum(['foundry', 'jev', 'hybrid']), repetition: nonNegative, expected: z.string(),
    predicted: z.string().nullable(), correct: z.boolean(), status: z.enum(['success', 'error']),
    latencyMs: nonNegative, stages: z.array(stage), escalated: z.boolean(), error: z.string().nullable(),
  })),
});
