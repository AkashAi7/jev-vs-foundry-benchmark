import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import type { JevChoice, JevDecisionResult, LocalJevDecisionRequest } from '../shared/jev-converter';
import { LabError } from './errors';

const choiceSchema = z.object({
  id: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/),
  description: z.string().trim().min(1).max(240),
}).strict();

export const jevDecisionSchema = z.object({
  provider: z.literal('local').default('local'),
  endpoint: z.string().trim().url().max(256),
  question: z.string().trim().min(1).max(4000),
  choices: z.array(choiceSchema).min(2).max(26),
}).strict().superRefine((request, context) => {
  if (new Set(request.choices.map(choice => choice.id.toLowerCase())).size !== request.choices.length) {
    context.addIssue({ code: 'custom', path: ['choices'], message: 'Choice IDs must be unique.' });
  }
});

type Fetch = typeof fetch;

export function normalizeLocalEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:') throw new LabError('The local SGLang endpoint must use http.');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new LabError('The SGLang endpoint must use localhost or a loopback address.');
  }
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new LabError('Enter only the local SGLang origin, for example http://127.0.0.1:30000.');
  }
  return url.origin;
}

export function buildDecisionPrompt(question: string, choices: JevChoice[], labels = labelsFor(choices.length)): string {
  const options = choices.map((choice, index) => `${labels[index]}: ${choice.description}`).join('\n');
  return [
    'Select the single best answer from the allowed choices.',
    'Return only its letter label.',
    '',
    'Allowed choices:',
    options,
    '',
    `Question: ${question}`,
    'Label:',
  ].join('\n');
}

export async function scoreLocalDecision(
  input: LocalJevDecisionRequest,
  fetcher: Fetch = fetch,
): Promise<JevDecisionResult> {
  const decision = jevDecisionSchema.parse(input);
  const endpoint = normalizeLocalEndpoint(decision.endpoint);
  const labels = labelsFor(decision.choices.length);
  const continuations = labels.map(label => ` ${label}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const started = performance.now();
  try {
    const tokenIds = await Promise.all(continuations.map(async continuation => {
      const response = await postJson(fetcher, `${endpoint}/tokenize`, { text: continuation }, controller.signal);
      const ids = tokenIdsFrom(response);
      if (ids.length !== 1 || !Number.isInteger(ids[0])) {
        throw new LabError(`Label "${continuation}" is not one token for this model. Use a compatible model or tokenizer.`, 422);
      }
      return ids[0]!;
    }));
    if (new Set(tokenIds).size !== tokenIds.length) {
      throw new LabError('The model tokenizer maps multiple labels to the same token.', 422);
    }

    const prompt = buildDecisionPrompt(decision.question, decision.choices, labels);
    const response = await postJson(fetcher, `${endpoint}/v1/score`, {
      query: prompt,
      items: [''],
      label_token_ids: tokenIds,
      apply_softmax: true,
    }, controller.signal);
    const probabilities = probabilitiesFrom(response, decision.choices.length);
    const scores = decision.choices
      .map((choice, index) => ({ ...choice, label: labels[index]!, probability: probabilities[index]! }))
      .sort((left, right) => right.probability - left.probability);
    return {
      decision: scores[0]!.id,
      confidence: scores[0]!.probability,
      scores,
      prompt,
      latencyMs: Math.round(performance.now() - started),
      provider: 'local',
      model: null,
      usage: null,
    };
  } catch (error) {
    if (error instanceof LabError || error instanceof z.ZodError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LabError('The local SGLang request timed out after 30 seconds.', 504);
    }
    throw new LabError('Could not reach the local SGLang scoring server. Verify that it is running and supports /tokenize and /v1/score.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

function labelsFor(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

async function postJson(fetcher: Fetch, url: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const response = await fetcher(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new LabError(`Local SGLang returned HTTP ${response.status}.`, 502);
  return response.json();
}

function tokenIdsFrom(value: unknown): number[] {
  if (Array.isArray(value) && value.every(item => typeof item === 'number')) return value;
  if (typeof value !== 'object' || value === null) throw new LabError('Unexpected response from SGLang /tokenize.', 502);
  for (const key of ['input_ids', 'token_ids'] as const) {
    const candidate = Reflect.get(value, key);
    if (Array.isArray(candidate) && candidate.every(item => typeof item === 'number')) return candidate;
  }
  throw new LabError('SGLang /tokenize did not return token IDs.', 502);
}

function probabilitiesFrom(value: unknown, expected: number): number[] {
  if (typeof value !== 'object' || value === null) throw new LabError('Unexpected response from SGLang /v1/score.', 502);
  const raw = Reflect.get(value, 'scores');
  const scores = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
  if (!Array.isArray(scores) || scores.length !== expected || !scores.every(score => typeof score === 'number' && Number.isFinite(score))) {
    throw new LabError('SGLang /v1/score returned an invalid probability distribution.', 502);
  }
  const total = scores.reduce((sum, score) => sum + score, 0);
  if (scores.some(score => score < 0 || score > 1) || Math.abs(total - 1) > 0.01) {
    throw new LabError('SGLang /v1/score did not return softmax probabilities.', 502);
  }
  return scores;
}
