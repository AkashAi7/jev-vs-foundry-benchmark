import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreFoundryDecision } from '../server/foundry-jev';
import type { ProviderConfig } from '../server/config';
import type { FoundryCredential } from '../server/providers';

const config: ProviderConfig = {
  jevKey: '',
  jevModel: 'jev-latest',
  foundryEndpoint: 'https://test.services.ai.azure.com/openai/v1/',
  foundryDeployment: 'test-model',
  foundryAuth: 'service-principal',
  foundryTenantId: 'tenant',
  servicePrincipal: { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' },
};

test('converts Foundry chat logprobs into a restricted choice distribution', async () => {
  const credential: FoundryCredential = { getToken: async () => ({ token: 'test-token', expiresOnTimestamp: Date.now() + 60_000 }) };
  const transport: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { logprobs: boolean; top_logprobs: number; max_completion_tokens: number };
    assert.equal(body.logprobs, true);
    assert.equal(body.top_logprobs, 20);
    assert.equal(body.max_completion_tokens, 1);
    return Response.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1,
      model: 'gpt-test',
      choices: [{
        index: 0,
        finish_reason: 'length',
        message: { role: 'assistant', content: 'A', refusal: null },
        logprobs: { content: [{
          token: 'A',
          bytes: [65],
          logprob: -0.1,
          top_logprobs: [
            { token: ' A', bytes: [32, 65], logprob: -0.1 },
            { token: ' B', bytes: [32, 66], logprob: -1.1 },
            { token: ' C', bytes: [32, 67], logprob: -2.1 },
          ],
        }], refusal: null },
      }],
      usage: { prompt_tokens: 100, completion_tokens: 1, total_tokens: 101 },
    });
  };
  const result = await scoreFoundryDecision({
    provider: 'foundry',
    deployment: 'converted-model',
    question: 'Route this request.',
    choices: [
      { id: 'billing', description: 'Billing' },
      { id: 'support', description: 'Support' },
      { id: 'escalate', description: 'Escalate' },
    ],
  }, config, transport, credential);
  assert.equal(result.provider, 'foundry');
  assert.equal(result.model, 'gpt-test');
  assert.equal(result.decision, 'billing');
  assert.ok(result.confidence > 0.66 && result.confidence < 0.67);
  assert.deepEqual(result.usage, { inputTokens: 100, outputTokens: 1 });
});
