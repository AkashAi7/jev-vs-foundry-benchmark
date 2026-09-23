import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { cases, DATASET_VERSION, scenarios } from '../shared/scenarios';
import type { BenchmarkRun, RunOptions } from '../shared/types';
import { Configuration, requireConfigured, type ProviderConfig } from './config';
import { demoProviders, shuffled } from './demo';
import { LabError } from './errors';
import { evaluate } from './pipeline';
import { createProviders, PROTOCOL_VERSION, STAGE_TIMEOUT_MS, type Providers } from './providers';
import { RunStore, optionsSchema } from './store';

export function schedule(options: RunOptions) {
  return shuffled(cases.filter(item => options.scenarioIds.includes(item.scenarioId)).flatMap(item =>
    Array.from({ length: options.repetitions }, (_, repetition) =>
      options.arms.map(arm => ({ item, arm, repetition: repetition + 1 })),
    ).flat(),
  ), options.seed);
}

export class Runner {
  private runs: BenchmarkRun[] = [];
  private active: { run: BenchmarkRun; abort: AbortController } | null = null;
  private starting = false;
  private work: Promise<void> = Promise.resolve();

  constructor(
    readonly config: Configuration,
    private readonly store: RunStore,
    private readonly providers: (config: ProviderConfig) => Providers = createProviders,
  ) {}

  async initialize(): Promise<void> { this.runs = await this.store.load(); }
  list(): BenchmarkRun[] { return this.runs; }
  get(id: string): BenchmarkRun {
    const run = this.runs.find(item => item.id === id);
    if (!run) throw new LabError('Run not found.', 404);
    return run;
  }
  isBusy(): boolean { return this.active !== null || this.starting; }
  async waitForIdle(): Promise<void> { await this.work; }

  async start(raw: unknown): Promise<BenchmarkRun> {
    if (this.isBusy()) throw new LabError('A run is already active. Cancel it or wait for completion.', 409);
    const options = optionsSchema.parse(raw);
    if (options.scenarioIds.some(id => !scenarios.some(scenario => scenario.id === id))) {
      throw new LabError('Unknown scenario selected.');
    }
    const configuration = this.config.snapshot();
    requireConfigured(options, configuration);
    const jobs = schedule(options);
    const dataset = structuredClone({ scenarios, cases });
    const run: BenchmarkRun = {
      id: randomUUID(), datasetVersion: DATASET_VERSION,
      datasetHash: createHash('sha256').update(JSON.stringify(dataset)).digest('hex'),
      dataset,
      protocol: {
        version: PROTOCOL_VERSION, stageTimeoutMs: STAGE_TIMEOUT_MS, maxCompletionTokens: 2048,
        retries: 0, foundryEndpoint: options.mode === 'live' ? configuration.foundryEndpoint : '',
        foundryAuth: options.mode === 'live' && options.arms.some(arm => arm !== 'jev') ? configuration.foundryAuth : null,
      },
      createdAt: new Date().toISOString(), completedAt: null, status: 'running', options,
      total: jobs.length, observations: [],
      models: {
        jev: options.mode === 'demo' ? 'synthetic-jev-fixture' : configuration.jevModel,
        foundry: options.mode === 'demo' ? 'synthetic-foundry-fixture' : configuration.foundryDeployment,
      },
      fatalError: null,
    };
    this.starting = true;
    try {
      await this.store.save(run);
      this.runs.unshift(run);
      const abort = new AbortController();
      this.active = { run, abort };
      this.work = this.execute(run, jobs, configuration, abort.signal);
      return run;
    } finally { this.starting = false; }
  }

  cancel(id: string): BenchmarkRun {
    const run = this.get(id);
    if (this.active?.run.id === id) this.active.abort.abort();
    return run;
  }

  private async execute(
    run: BenchmarkRun, jobs: ReturnType<typeof schedule>, config: ProviderConfig, signal: AbortSignal,
  ): Promise<void> {
    try {
      const live = run.options.mode === 'live' ? this.providers(config) : null;
      for (const job of jobs) {
        signal.throwIfAborted();
        const scenario = run.dataset.scenarios.find(item => item.id === job.item.scenarioId)!;
        const adapters = live ?? demoProviders(run.options.seed, job.repetition);
        const observation = await evaluate(job.item, scenario, job.arm, job.repetition, run.options, adapters, signal);
        run.observations.push(observation);
        await this.store.save(run);
        if (run.options.mode === 'demo' && run.observations.length < run.total) await delay(35, undefined, { signal });
      }
      run.status = 'completed';
    } catch (error) {
      if (signal.aborted) {
        run.status = 'cancelled';
      } else {
        run.status = 'failed';
        run.fatalError = error instanceof LabError ? error.message : 'Run stopped because local storage or runner setup failed. Check write access and provider configuration.';
        console.error(`Run ${run.id} failed; details withheld. ${run.fatalError}`);
      }
    } finally {
      run.completedAt = new Date().toISOString();
      try { await this.store.save(run); }
      catch {
        run.status = 'failed';
        run.fatalError = 'Could not persist final results. Export this run now; check local disk space and write permissions.';
        console.error(`Run ${run.id}: failed to persist final results.`);
      }
      this.active = null;
    }
  }
}
