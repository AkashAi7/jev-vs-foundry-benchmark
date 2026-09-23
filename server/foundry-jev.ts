import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { FoundryJevDecisionRequest, JevDecisionResult } from '../shared/jev-converter';
import type { ProviderConfig } from './config';
import { LabError, safeError } from './errors';
import { buildDecisionPrompt } from './local-jev';
import { createFoundryClient, createFoundryCredential, type FoundryCredential } from './providers';

const choiceSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
  description: z.string().trim().min(1).max(240),
}).strict();

export const foundryJevDecisionSchema = z.object({
  provider: z.literal('foundry'),
  deployment: z.string().trim().min(1).max(128).regex(/^[\w.-]+$/),
  question: z.string().trim().min(1).max(4000),
  choices: z.array(choiceSchema).min(2).max(20),
}).strict().superRefine((request, context) => {
  if (new Set(request.choices.map(choice => choice.id.toLowerCase())).size !== request.choices.length) {
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Choice IDs must be unique.' });
  }
});

export async function scoreFoundryDecision(
  input: FoundryJevDecisionRequest,
  config: ProviderConfig,
  transport: typeof fetch = fetch,
  credential: FoundryCredential | null = createFoundryCredential(config),
): Promise<JevDecisionResult> {
  const request = foundryJevDecisionSchema.parse(input);
  const foundry = createFoundryClient(config, transport, credential);
  if (!foundry) {
    throw new LabError('Foundry endpoint or the selected Microsoft Entra identity is not configured.');
  }
  const labels = request.choices.map((_, index) => String.fromCharCode(65 + index));
  const prompt = buildDecisionPrompt(request.question, request.choices, labels);
  const started = performance.now();
  let response;
  try {
    response = await foundry.chat.completions.create({
      model: request.deployment,
      messages: [
        { role: 'system', content: 'Make a bounded decision. Output exactly one letter label and no other text.' },
        { role: 'user', content: prompt },
      ],
      max_completion_tokens: 1,
      temperature: 0,
      logprobs: true,
      top_logprobs: 20,
    });
  } catch (error) {
    throw new LabError(safeError(error), typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number' ? error.status : 502);
  }
  const choice = response.choices[0];
  const firstToken = choice?.logprobs?.content?.[0];
  if (!choice || !firstToken) {
    throw new LabError('This Foundry deployment did not return next-token log probabilities.', 422);
  }
  const candidates = [firstToken, ...firstToken.top_logprobs];
  const logProbability = new Map<string, number>();
  for (const candidate of candidates) {
    const label = candidate.token.trim().toUpperCase();
    if (labels.includes(label)) {
      logProbability.set(label, Math.max(logProbability.get(label) ?? Number.NEGATIVE_INFINITY, candidate.logprob));
    }
  }
  const missing = labels.filter(label => !logProbability.has(label));
  if (missing.length) {
    throw new LabError(`The deployment did not expose log probabilities for labels ${missing.join(', ')}. Try fewer choices or a model with chat logprobs support.`, 422);
  }
  const maximum = Math.max(...labels.map(label => logProbability.get(label)!));
  const weights = labels.map(label => Math.exp(logProbability.get(label)! - maximum));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const scores = request.choices
    .map((item, index) => ({ ...item, label: labels[index]!, probability: weights[index]! / total }))
    .sort((left, right) => right.probability - left.probability);
  return {
    decision: scores[0]!.id,
    confidence: scores[0]!.probability,
    scores,
    prompt,
    latencyMs: Math.round(performance.now() - started),
    provider: 'foundry',
    model: response.model,
    usage: response.usage ? {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
    } : null,
  };
}
