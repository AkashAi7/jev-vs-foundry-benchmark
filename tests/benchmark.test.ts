import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClientSecretCredential } from '@azure/identity';
import { cases, scenarios } from '../shared/scenarios';
import { percentile, summarize } from '../shared/metrics';
import type { Observation, RunOptions, Stage } from '../shared/types';
import { Configuration, configSchema, normalizeEndpoint, requireConfigured } from '../server/config';
import { demoProviders, shuffled } from '../server/demo';
import { LabError, safeError } from '../server/errors';
import { evaluate } from '../server/pipeline';
import { createFoundryCredential, createProviders, foundryMessages, validateFoundry, validateJev, type Providers } from '../server/providers';
import { schedule } from '../server/runner';

const item = cases[0]!;
const scenario = scenarios[0]!;
const signal = new AbortController().signal;
const testIdentity = { tenantId: 'test-tenant', clientId: 'test-client', clientSecret: 'test-secret' };
const testCredential = { getToken: async () => ({ token: 'test-only-bearer', expiresOnTimestamp: Date.now() + 3600000 }) };
const options: RunOptions = {
  mode: 'live', arms: ['foundry', 'jev', 'hybrid'], scenarioIds: scenarios.map(s => s.id),
  repetitions: 1, threshold: 0.8, seed: 42,
};
const stage: Stage = {
  provider: 'jev', model: 'test-model', latencyMs: 10, choice: 'billing', confidence: 0.8,
  probabilities: { billing: 0.8, technical: 0.1, sales: 0.1 }, usage: { inputTokens: 10, outputTokens: 2 },
};
const jevResponse = {
  model: 'jev-resolved', answers: { decision: {
    type: 'choice', choice: 'billing', confidence: 0.82,
    probabilities: { billing: 0.8, technical: 0.1, sales: 0.1 },
  } }, usage: { input_tokens: 10, output_tokens: 2 },
};

test('dataset has 18 unique valid cases and balanced support/priority labels', () => {
  assert.equal(cases.length, 18);
  assert.equal(new Set(cases.map(row => row.id)).size, 18);
  for (const rubric of scenarios) {
    const selected = cases.filter(row => row.scenarioId === rubric.id);
    assert.equal(selected.length, 6);
    assert.equal(selected.filter(row => row.difficulty === 'edge').length, 3);
    for (const row of selected) assert.ok(Object.hasOwn(rubric.criteria, row.expected));
  }
});

test('schedule is deterministic, shuffled, complete and independently evaluates each arm', () => {
  const jobs = schedule({ ...options, repetitions: 2 });
  assert.equal(jobs.length, 108);
  assert.deepEqual(jobs, schedule({ ...options, repetitions: 2 }));
  assert.notDeepEqual(jobs, schedule({ ...options, repetitions: 2, seed: 43 }));
  assert.equal(new Set(jobs.map(job => `${job.item.id}-${job.arm}-${job.repetition}`)).size, 108);
  const input = [1, 2, 3, 4, 5];
  shuffled(input, 1);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
});

test('confidence equality accepts Jev; low confidence invokes Foundry and counts both stages', async () => {
  let jevCalls = 0;
  let foundryCalls = 0;
  const providers: Providers = {
    async jev() { jevCalls++; return stage; },
    async foundry(actualItem, actualScenario, _, evidence) {
      foundryCalls++;
      assert.equal(actualItem.input, item.input);
      assert.equal(actualScenario.instructions, scenario.instructions);
      assert.equal(evidence?.confidence, 0.8);
      return { ...stage, provider: 'foundry', confidence: null };
    },
  };
  const accepted = await evaluate(item, scenario, 'hybrid', 1, options, providers, signal);
  assert.equal(accepted.escalated, false);
  assert.equal(accepted.correct, true);
  assert.equal(foundryCalls, 0);
  await evaluate(item, scenario, 'jev', 1, options, providers, signal);
  const escalated = await evaluate(item, scenario, 'hybrid', 1, { ...options, threshold: 0.81 }, providers, signal);
  assert.equal(jevCalls, 3, 'hybrid must perform its own Jev call');
  assert.equal(escalated.stages.length, 2);
  assert.equal(escalated.escalated, true);
  assert.equal(foundryCalls, 1);
  const metrics = summarize([escalated], 'hybrid', scenarios);
  assert.equal(metrics.inputTokens, 20);
  assert.equal(metrics.outputTokens, 4);
  assert.equal(metrics.foundryCalls, 1);
});

test('failed escalation is an error and preserves completed Jev usage', async () => {
  const providers: Providers = {
    async jev() { return { ...stage, confidence: 0.5 }; },
    async foundry() { throw Object.assign(new Error('secret upstream body'), { status: 429 }); },
  };
  const row = await evaluate(item, scenario, 'hybrid', 1, options, providers, signal);
  assert.equal(row.status, 'error');
  assert.equal(row.correct, false);
  assert.equal(row.predicted, null);
  assert.equal(row.escalated, true);
  assert.equal(row.stages.length, 1);
  assert.match(row.error!, /quota/);
  assert.ok(!JSON.stringify(row).includes('secret upstream body'));
  const metrics = summarize([row], 'hybrid', scenarios);
  assert.equal(metrics.accuracy, 0);
  assert.equal(metrics.p50Ms, null);
  assert.equal(metrics.inputTokens, 10);
  assert.equal(metrics.usageKnown, false);
  assert.equal(metrics.foundryCalls, 0);
});

test('cancellation terminates even a provider ignoring AbortSignal without making a fake result', async () => {
  const controller = new AbortController();
  const providers: Providers = {
    jev: () => new Promise(() => {}),
    foundry: () => new Promise(() => {}),
  };
  const pending = evaluate(item, scenario, 'jev', 1, options, providers, controller.signal);
  controller.abort();
  await assert.rejects(pending, /abort/i);
});

test('metrics include errors in accuracy/F1 and exclude them from success latency', () => {
  const base: Observation = {
    id: 'one', caseId: item.id, scenarioId: scenario.id, arm: 'jev', repetition: 1,
    expected: 'billing', predicted: 'billing', correct: true, status: 'success',
    latencyMs: 10, stages: [stage], escalated: false, error: null,
  };
  const rows: Observation[] = [
    base,
    { ...base, id: 'two', expected: 'technical', predicted: 'billing', correct: false, latencyMs: 30 },
    { ...base, id: 'three', expected: 'sales', predicted: null, correct: false, status: 'error', latencyMs: 999, stages: [], error: 'failed' },
  ];
  const result = summarize(rows, 'jev', scenarios);
  assert.equal(result.accuracy, 1 / 3);
  assert.equal(result.macroF1, (2 / 3) / 3);
  assert.equal(result.p50Ms, 20);
  assert.equal(result.p95Ms, 29);
  assert.equal(result.errors, 1);
  assert.equal(result.usageKnown, false);
  assert.equal(summarize([], 'jev', scenarios).accuracy, null);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([5], 0.95), 5);
});

test('demo is deterministic and unmistakeably synthetic', async () => {
  const demoOptions = { ...options, mode: 'demo' as const };
  const a = await evaluate(item, scenario, 'hybrid', 1, demoOptions, demoProviders(42, 1), signal);
  const b = await evaluate(item, scenario, 'hybrid', 1, demoOptions, demoProviders(42, 1), signal);
  assert.deepEqual(a, b);
  assert.ok(a.stages.every(value => value.model.startsWith('synthetic-')));
  assert.equal(a.latencyMs, a.stages.reduce((total, value) => total + value.latencyMs, 0));
});

test('endpoint allowlist rejects project paths, redirects and non-Azure hosts', () => {
  assert.equal(normalizeEndpoint('https://example.openai.azure.com'), 'https://example.openai.azure.com/openai/v1/');
  assert.equal(normalizeEndpoint('https://example.services.ai.azure.com/openai/v1'), 'https://example.services.ai.azure.com/openai/v1/');
  for (const endpoint of [
    'http://example.openai.azure.com', 'https://evil.test', 'https://example.openai.azure.com.evil.test',
    'https://example.services.ai.azure.com/api/projects/test', 'https://user:pass@example.openai.azure.com',
    'https://example.openai.azure.com?key=x', 'https://127.0.0.1', 'https://example.openai.azure.com:9000',
  ]) assert.throws(() => normalizeEndpoint(endpoint), LabError);
});

test('configuration never exposes keys and invalid updates are atomic', () => {
  const config = new Configuration({});
  config.update({ jevKey: 'not-a-real-jev-key' });
  assert.equal(config.public().jevConfigured, true);
  assert.ok(!JSON.stringify(config.public()).includes('not-a-real'));
  assert.throws(() => config.update({ clearKeys: true, foundryEndpoint: 'http://unsafe.test' }));
  assert.equal(config.public().jevConfigured, true);
  config.update({ clearKeys: true });
  assert.equal(config.public().jevConfigured, false);
  assert.equal(config.public().foundryAuth, 'service-principal');
  assert.equal(config.public().foundryIdentityConfigured, false);
  assert.equal(safeError(new Error('credential contents')), 'Provider or credential operation failed. Check connectivity and server authentication. Raw error details are withheld to protect credentials.');
});

test('Conditional Access errors explain the blocker without exposing raw credential details', () => {
  const message = safeError(new Error('AADSTS53003: raw-credential-value correlation-id private-details'));
  assert.match(message, /Conditional Access \(AADSTS53003\)/);
  assert.match(message, /No Foundry model inference was measured/);
  assert.ok(!message.includes('raw-credential-value'));
  assert.ok(!message.includes('private-details'));
  assert.ok(!safeError(new Error('AADSTS530030: not the same code')).includes('Conditional Access'));
  assert.equal(safeError(new Error('SDK wrapper', { cause: new Error('AADSTS53003 private-details') })), message);
  const cyclic = new Error('private-details');
  cyclic.cause = cyclic;
  assert.equal(safeError(cyclic), safeError(new Error('private-details')));
});

test('Foundry requires the complete service principal and never falls back to keys or user login', () => {
  const env = {
    TYPESAFE_API_KEY: 'test-jev', FOUNDRY_ENDPOINT: 'https://test.openai.azure.com',
    FOUNDRY_DEPLOYMENT: 'test', FOUNDRY_API_KEY: 'ignored-key',
    AZURE_TENANT_ID: 'test-tenant', AZURE_CLIENT_ID: 'test-client', AZURE_CLIENT_SECRET: 'test-secret',
  };
  for (const missing of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) {
    const config = new Configuration({ ...env, [missing]: '' });
    assert.equal(config.public().foundryConfigured, false);
    assert.equal(createFoundryCredential(config.snapshot()), null);
    assert.throws(() => requireConfigured({ ...options, mode: 'live' }, config.snapshot()), /service principal/);
    assert.doesNotThrow(() => requireConfigured({ ...options, mode: 'live', arms: ['jev'] }, config.snapshot()));
  }
  const complete = new Configuration(env);
  assert.equal(complete.public().foundryConfigured, true);
  assert.ok(createFoundryCredential(complete.snapshot()) instanceof ClientSecretCredential);
  assert.doesNotThrow(() => requireConfigured({ ...options, mode: 'live' }, complete.snapshot()));
  assert.ok(!JSON.stringify(complete.public()).includes('test-secret'));
  assert.throws(() => configSchema.parse({ foundryKey: 'rejected' }));
  complete.update({ clearKeys: true });
  assert.equal(complete.public().foundryIdentityConfigured, true);
  const snapshot = complete.snapshot();
  snapshot.servicePrincipal!.clientSecret = 'mutated';
  assert.equal(complete.snapshot().servicePrincipal!.clientSecret, 'test-secret');
});

test('VS Code identity is an explicit tenant-scoped opt-in and discards service-principal secrets', () => {
  const env = {
    FOUNDRY_ENDPOINT: 'https://test.openai.azure.com', FOUNDRY_DEPLOYMENT: 'test',
    AZURE_TENANT_ID: 'test-tenant', AZURE_CLIENT_ID: 'ignored-client', AZURE_CLIENT_SECRET: 'ignored-secret',
    FOUNDRY_AUTH_MODE: 'vscode',
  };
  const config = new Configuration(env);
  assert.equal(config.public().foundryAuth, 'vscode');
  assert.equal(config.public().foundryConfigured, true, 'settings readiness is not authentication verification');
  assert.equal(config.snapshot().servicePrincipal, null);
  assert.equal(config.snapshot().foundryTenantId, 'test-tenant');
  assert.ok(!JSON.stringify(config.snapshot()).includes('ignored-secret'));
  assert.ok(!JSON.stringify(config.public()).includes('test-tenant'));
  assert.ok(createFoundryCredential(config.snapshot()));
  assert.ok(!(createFoundryCredential(config.snapshot()) instanceof ClientSecretCredential));
  assert.doesNotThrow(() => requireConfigured({ ...options, arms: ['foundry'] }, config.snapshot()));
  const missingTenant = new Configuration({ ...env, AZURE_TENANT_ID: '' });
  assert.equal(missingTenant.public().foundryConfigured, false);
  assert.equal(createFoundryCredential(missingTenant.snapshot()), null);
  assert.throws(() => requireConfigured({ ...options, arms: ['foundry'] }, missingTenant.snapshot()), /AZURE_TENANT_ID/);
  assert.throws(() => configSchema.parse({ foundryAuth: 'vscode' }), 'the browser cannot switch identities');
  for (const mode of ['', 'default', 'cli', 'automatic', 'invalid-sensitive-value']) {
    assert.throws(() => new Configuration({ ...env, FOUNDRY_AUTH_MODE: mode }), error =>
      error instanceof LabError && error.message.includes('FOUNDRY_AUTH_MODE')
      && !error.message.includes('invalid-sensitive-value'));
  }
});

test('an unavailable or denied selected credential never sends inference or falls back', async () => {
  for (const mode of ['service-principal', 'vscode']) {
    const config = new Configuration({
      FOUNDRY_AUTH_MODE: mode, FOUNDRY_ENDPOINT: 'https://test.openai.azure.com',
      FOUNDRY_DEPLOYMENT: 'test', AZURE_TENANT_ID: 'test-tenant',
      AZURE_CLIENT_ID: 'test-client', AZURE_CLIENT_SECRET: 'test-secret',
    }).snapshot();
    for (const failure of [
      Object.assign(new Error('private-cache-path raw-token'), { name: 'CredentialUnavailableError' }),
      Object.assign(new Error('private-cache-path raw-token'), { name: 'AuthenticationRequiredError' }),
      new Error('AADSTS53003 private-cache-path raw-token'),
    ]) {
      let tokens = 0;
      let requests = 0;
      const providers = createProviders(config, async () => { requests++; throw new Error('Unexpected inference'); }, {
        async getToken() { tokens++; throw failure; },
      });
      const result = await evaluate(item, scenario, 'foundry', 1, options, providers, signal);
      assert.equal(tokens, 1);
      assert.equal(requests, 0);
      assert.equal(result.status, 'error');
      assert.equal(result.stages.length, 0);
      assert.equal(result.predicted, null);
      assert.ok(!JSON.stringify(result).includes('raw-token'));
      assert.ok(!JSON.stringify(result).includes('private-cache-path'));
      assert.match(result.error!, /No alternative identity|no alternative identity/);
    }
  }
});

test('provider output validation fails closed', () => {
  assert.equal(validateJev(jevResponse, scenario, 1).confidence, 0.82);
  assert.throws(() => validateJev({ ...jevResponse, answers: { decision: { ...jevResponse.answers.decision, confidence: 1.2 } } }, scenario, 1));
  assert.throws(() => validateJev({ ...jevResponse, answers: { decision: { ...jevResponse.answers.decision, probabilities: { billing: 0.8 } } } }, scenario, 1));
  assert.throws(() => validateJev({ ...jevResponse, answers: { decision: { ...jevResponse.answers.decision, choice: 'wrong' } } }, scenario, 1));
  assert.equal(validateFoundry('{"choice":"billing"}', scenario), 'billing');
  for (const content of [null, 'not-json', '{"choice":"wrong"}', '{"choice":"billing","reason":"extra"}']) {
    assert.throws(() => validateFoundry(content, scenario));
  }
});

test('ground truth and case metadata never reach Foundry messages', () => {
  const marker = 'GROUND_TRUTH_MUST_STAY_LOCAL';
  const input = { ...item, expected: marker, title: marker, id: marker };
  assert.ok(!JSON.stringify(foundryMessages(input, scenario)).includes(marker));
  assert.ok(!JSON.stringify(foundryMessages(input, scenario, stage)).includes(marker));
});

test('SDK output guards reject refusals, truncation and invalid usage; missing usage remains unknown', async () => {
  const completion = {
    id: 'completion-test', object: 'chat.completion', created: 1, model: 'foundry-resolved',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"choice":"billing"}', refusal: null } }],
  };
  let response: unknown = completion;
  const providers = createProviders({
    jevKey: '', jevModel: 'jev-latest', servicePrincipal: testIdentity,
    foundryAuth: 'service-principal', foundryTenantId: testIdentity.tenantId,
    foundryEndpoint: 'https://test.openai.azure.com/openai/v1/', foundryDeployment: 'test',
  }, async () => Response.json(response), testCredential);
  assert.equal((await providers.foundry(item, scenario, signal)).usage, null);
  const { usage: _usage, ...withoutUsage } = jevResponse;
  assert.equal(validateJev(withoutUsage, scenario, 1).usage, null);
  for (const invalid of [
    { ...completion, choices: [] },
    { ...completion, choices: [{ ...completion.choices[0], finish_reason: 'length' }] },
    { ...completion, choices: [{ ...completion.choices[0], message: { ...completion.choices[0]!.message, refusal: 'not allowed' } }] },
    { ...completion, model: '' },
    { ...completion, usage: { prompt_tokens: -1, completion_tokens: 3 } },
    { ...completion, usage: { prompt_tokens: 3 } },
  ]) {
    response = invalid;
    await assert.rejects(() => providers.foundry(item, scenario, signal), LabError);
  }
});

test('real SDK adapters send correct payloads with no retries or redirects using mock HTTP', async () => {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    requests.push(request);
    if (request.url.startsWith('https://api.typesafe.ai/')) {
      return Response.json(jevResponse);
    }
    return Response.json({
      id: 'completion-test', object: 'chat.completion', created: 1, model: 'foundry-resolved',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"choice":"billing"}', refusal: null } }],
      usage: { prompt_tokens: 20, completion_tokens: 3, total_tokens: 23 },
    });
  };
  const providers = createProviders({
    jevKey: 'test-only-jev-key', jevModel: 'jev-latest', servicePrincipal: null,
    foundryAuth: 'vscode', foundryTenantId: testIdentity.tenantId,
    foundryEndpoint: 'https://test.openai.azure.com/openai/v1/', foundryDeployment: 'deployment-test',
  }, transport, { getToken: async scopes => {
    assert.deepEqual(scopes, ['https://ai.azure.com/.default']);
    return testCredential.getToken();
  } });
  const sentItem = { ...item, expected: 'SECRET_EXPECTATION', title: 'SECRET_TITLE' };
  const jev = await providers.jev(sentItem, scenario, signal);
  const foundry = await providers.foundry(sentItem, scenario, signal);
  assert.equal(jev.model, 'jev-resolved');
  assert.equal(foundry.model, 'foundry-resolved');
  assert.deepEqual(foundry.usage, { inputTokens: 20, outputTokens: 3 });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.url, 'https://api.typesafe.ai/v1/systemone');
  assert.ok(requests[0]!.headers.get('authorization')?.includes('test-only-jev-key'), 'SDK sends the configured credential');
  assert.equal(requests[1]!.url, 'https://test.openai.azure.com/openai/v1/chat/completions');
  assert.equal(requests[1]!.headers.get('authorization'), 'Bearer test-only-bearer');
  assert.equal(requests[1]!.headers.has('api-key'), false);
  for (const request of requests) {
    assert.equal(request.redirect, 'error');
    const body = await request.text();
    assert.ok(!body.includes('SECRET_'));
    assert.ok(body.includes(item.input));
  }
  let failures = 0;
  const failing = createProviders({
    jevKey: 'test', jevModel: 'jev-latest', servicePrincipal: testIdentity,
    foundryAuth: 'service-principal', foundryTenantId: testIdentity.tenantId,
    foundryEndpoint: 'https://test.openai.azure.com/openai/v1/', foundryDeployment: 'test',
  }, async () => { failures++; return Response.json({ error: { message: 'test' } }, { status: 429 }); }, testCredential);
  await assert.rejects(() => failing.jev(item, scenario, signal));
  await assert.rejects(() => failing.foundry(item, scenario, signal));
  assert.equal(failures, 2, 'each failed call must make exactly one attempt');
});
