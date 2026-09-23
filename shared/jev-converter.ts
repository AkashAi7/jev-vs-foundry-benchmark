export interface JevChoice {
  id: string;
  description: string;
}

export interface LocalJevDecisionRequest {
  provider: 'local';
  endpoint: string;
  question: string;
  choices: JevChoice[];
}

export interface FoundryJevDecisionRequest {
  provider: 'foundry';
  deployment: string;
  question: string;
  choices: JevChoice[];
}

export type JevDecisionRequest = LocalJevDecisionRequest | FoundryJevDecisionRequest;

export interface JevDecisionScore extends JevChoice {
  label: string;
  probability: number;
}

export interface JevDecisionResult {
  decision: string;
  confidence: number;
  scores: JevDecisionScore[];
  prompt: string;
  latencyMs: number;
  provider: 'local' | 'foundry';
  model: string | null;
  usage: { inputTokens: number; outputTokens: number } | null;
}
