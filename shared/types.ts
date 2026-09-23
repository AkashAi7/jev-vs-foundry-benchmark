export const ARMS = ['foundry', 'jev', 'hybrid'] as const;
export type Arm = typeof ARMS[number];
export const FOUNDRY_AUTH_MODES = ['service-principal', 'vscode', 'azure-cli'] as const;
export type FoundryAuth = typeof FOUNDRY_AUTH_MODES[number];
export const ARM_LABELS: Record<Arm, string> = {
  foundry: 'Foundry LLM',
  jev: 'Jev',
  hybrid: 'Foundry + Jev',
};

export interface Scenario {
  id: string;
  name: string;
  description: string;
  instructions: string;
  criteria: Record<string, string>;
}

export interface BenchmarkCase {
  id: string;
  scenarioId: string;
  title: string;
  input: string;
  expected: string;
  difficulty: 'standard' | 'edge';
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface Stage {
  provider: 'jev' | 'foundry';
  model: string;
  latencyMs: number;
  choice: string;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  usage: Usage | null;
}

export interface Observation {
  id: string;
  caseId: string;
  scenarioId: string;
  arm: Arm;
  repetition: number;
  expected: string;
  predicted: string | null;
  correct: boolean;
  status: 'success' | 'error';
  latencyMs: number;
  stages: Stage[];
  escalated: boolean;
  error: string | null;
}

export interface RunOptions {
  mode: 'demo' | 'live';
  arms: Arm[];
  scenarioIds: string[];
  repetitions: number;
  threshold: number;
  seed: number;
}

export interface BenchmarkRun {
  id: string;
  datasetVersion: string;
  datasetHash: string;
  dataset: { scenarios: Scenario[]; cases: BenchmarkCase[] };
  protocol: {
    version: string; stageTimeoutMs: number; maxCompletionTokens: number; retries: number; foundryEndpoint: string;
    foundryAuth?: FoundryAuth | null;
  };
  createdAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  options: RunOptions;
  total: number;
  observations: Observation[];
  models: { jev: string; foundry: string };
  fatalError: string | null;
}

export interface MetricSummary {
  arm: Arm;
  total: number;
  successes: number;
  errors: number;
  accuracy: number | null;
  macroF1: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  meanMs: number | null;
  inputTokens: number;
  outputTokens: number;
  usageKnown: boolean;
  escalated: number;
  foundryCalls: number;
}

export interface PublicConfig {
  csrfToken: string;
  jevConfigured: boolean;
  foundryConfigured: boolean;
  foundryEndpoint: string;
  foundryDeployment: string;
  jevModel: string;
  foundryAuth: FoundryAuth;
  foundryIdentityConfigured: boolean;
}

export interface ConfigUpdate {
  jevKey?: string;
  foundryEndpoint?: string;
  foundryDeployment?: string;
  jevModel?: string;
  clearKeys?: boolean;
}

export interface Bootstrap {
  config: PublicConfig;
  scenarios: Scenario[];
  cases: BenchmarkCase[];
  runs: BenchmarkRun[];
}
