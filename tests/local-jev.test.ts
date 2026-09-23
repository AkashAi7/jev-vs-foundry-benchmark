import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDecisionPrompt, jevDecisionSchema, normalizeLocalEndpoint, scoreLocalDecision } from '../server/local-jev';

const input = {
  provider: 'local' as const,
  endpoint: 'http://127.0.0.1:30000',
  question: 'I was charged twice.',
  choices: [
    { id: 'billing', description: 'Billing issue' },
    { id: 'technical', description: 'Technical issue' },
    { id: 'escalate', description: 'None applies' },
  ],
};

test('builds a fixed-choice prompt ending at the answer position', () => {
  const prompt = buildDecisionPrompt(input.question, input.choices);
  assert.match(prompt, /A: Billing issue/);
  assert.match(prompt, /C: None applies/);
  assert.ok(prompt.endsWith('Label:'));
});

test('accepts only local SGLang origins', () => {
  assert.equal(normalizeLocalEndpoint('http://localhost:30000/'), 'http://localhost:30000');
  assert.throws(() => normalizeLocalEndpoint('https://localhost:30000'), /must use http/);
  assert.throws(() => normalizeLocalEndpoint('http://example.com:30000'), /loopback/);
  assert.throws(() => normalizeLocalEndpoint('http://localhost:30000/admin'), /only the local SGLang origin/);
});

test('validates a bounded set of uniquely identified choices', () => {
  assert.equal(jevDecisionSchema.parse(input).choices.length, 3);
  assert.throws(() => jevDecisionSchema.parse({
    ...input,
    choices: [...input.choices, { id: 'BILLING', description: 'Duplicate ID' }],
  }), /Choice IDs must be unique/);
  assert.throws(() => jevDecisionSchema.parse({ ...input, choices: [input.choices[0]] }));
  assert.throws(() => jevDecisionSchema.parse({ ...input, choices: Array(27).fill(input.choices[0]) }));
});

test('validates labels and maps SGLang probabilities back to semantic choices', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let token = 31;
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (String(url).endsWith('/tokenize')) {
      token += 1;
      return Response.json({ input_ids: [token] });
    }
    return Response.json({ scores: [[0.68, 0.27, 0.05]] });
  };
  const result = await scoreLocalDecision(input, fetcher);
  assert.equal(result.decision, 'billing');
  assert.equal(result.confidence, 0.68);
  assert.deepEqual(result.scores.map(score => score.id), ['billing', 'technical', 'escalate']);
  assert.deepEqual(calls.at(-1)?.body.label_token_ids, [32, 33, 34]);
  assert.equal(calls.at(-1)?.body.apply_softmax, true);
  assert.deepEqual(calls.at(-1)?.body.items, ['']);
});

test('rejects labels that are not exactly one token', async () => {
  const fetcher = async () => Response.json({ input_ids: [1, 2] });
  await assert.rejects(() => scoreLocalDecision(input, fetcher), /not one token/);
});

test('rejects duplicate label tokens and malformed score distributions', async () => {
  let tokenCalls = 0;
  const duplicateLabels = async () => {
    tokenCalls += 1;
    return Response.json({ input_ids: [tokenCalls === 1 ? 1 : 1] });
  };
  await assert.rejects(() => scoreLocalDecision(input, duplicateLabels), /same token/);

  let nextToken = 0;
  const badDistribution = async (url: string | URL | Request) => {
    if (String(url).endsWith('/tokenize')) {
      return Response.json({ input_ids: [++nextToken] });
    }
    return Response.json({ scores: [[0.8, 0.8, -0.6]] });
  };
  await assert.rejects(() => scoreLocalDecision(input, badDistribution), /softmax probabilities/);
});
