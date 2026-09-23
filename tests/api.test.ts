import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createApp } from '../server/app';
import { Configuration } from '../server/config';
import { csvCell, exportCsv, exportJson } from '../server/export';
import { demoProviders } from '../server/demo';
import { Runner } from '../server/runner';
import { RunStore } from '../server/store';
import type { BenchmarkRun, Bootstrap, RunOptions } from '../shared/types';

const options: RunOptions = {
  mode: 'demo', arms: ['foundry', 'jev', 'hybrid'], scenarioIds: ['support'],
  repetitions: 1, threshold: 0.8, seed: 42,
};

test('Foundry CLI check fails closed for missing identity without requiring Jev or writing a report', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-foundry-check-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const mode of ['service-principal', 'vscode']) {
    const result = await new Promise<{ code: number | string | null; killed: boolean; stdout: string; stderr: string }>(resolve => {
      execFile(process.execPath, ['--import', import.meta.resolve('tsx'), fileURLToPath(new URL('../server/check-foundry.ts', import.meta.url))], {
        cwd: directory,
        env: {
          ...process.env,
          FOUNDRY_AUTH_MODE: mode, FOUNDRY_ENDPOINT: 'https://test.openai.azure.com', FOUNDRY_DEPLOYMENT: 'test',
          AZURE_TENANT_ID: '', AZURE_CLIENT_ID: '', AZURE_CLIENT_SECRET: '', TYPESAFE_API_KEY: '',
        },
        timeout: 60000,
      }, (error, stdout, stderr) => resolve({ code: error?.code ?? null, killed: error?.killed ?? false, stdout, stderr }));
    });
    assert.equal(result.killed, false, 'CLI must finish without its process timeout');
    assert.equal(result.code, 1);
    assert.equal(result.stdout, '');
    const failure = JSON.parse(result.stderr) as { status: string; error: string };
    assert.equal(failure.status, 'error');
    assert.match(failure.error, /AZURE_TENANT_ID/);
    assert.ok(!failure.error.includes('Jev is not configured'));
    await assert.rejects(() => readFile(path.join(directory, '.local', 'runs')), { code: 'ENOENT' });
  }
});

test('HTTP lifecycle: safe config, validation, full demo, export, persistence and cancellation', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-benchmark-test-'));
  const config = new Configuration({});
  const runner = new Runner(config, new RunStore(directory));
  await runner.initialize();
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  server.on('request', createApp(runner, port));
  t.after(async () => {
    for (const run of runner.list()) if (run.status === 'running') runner.cancel(run.id);
    await runner.waitForIdle();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${port}`;
  const bootstrap = await (await fetch(`${url}/api/bootstrap`)).json() as Bootstrap;
  assert.equal(bootstrap.cases.length, 18);
  assert.equal(bootstrap.runs.length, 0);
  const headers = { 'Content-Type': 'application/json', 'x-benchmark-token': bootstrap.config.csrfToken };
  const post = (route: string, body: unknown) => fetch(`${url}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
  const invalidHostStatus = await new Promise<number | undefined>((resolve, reject) => {
    const req = request(`${url}/api/health`, { headers: { Host: 'unsafe.test' } }, response => {
      response.resume();
      resolve(response.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(invalidHostStatus, 403);
  assert.equal((await fetch(`${url}/api/bootstrap`, { headers: { Origin: 'https://unsafe.test' } })).status, 403);
  assert.equal((await fetch(`${url}/api/bootstrap`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${url}/api/runs`, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(`${url}/api/runs`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}',
  })).status, 415);
  assert.equal((await post('/api/config', { jevKey: 'x'.repeat(17000) })).status, 413);
  const invalidConfig = await post('/api/config', { jevKey: '' });
  assert.equal(invalidConfig.status, 400);
  assert.match((await invalidConfig.json() as { error: string }).error, /connection settings/);
  assert.equal((await post('/api/runs', { ...options, repetitions: 11 })).status, 400);
  assert.equal((await post('/api/runs', { ...options, arms: ['jev', 'jev'] })).status, 400);
  assert.equal((await post('/api/runs', { ...options, scenarioIds: ['unknown'] })).status, 400);
  assert.equal((await post('/api/runs', { ...options, mode: 'live' })).status, 400);
  assert.equal((await fetch(`${url}/api/runs`, { method: 'POST', headers, body: '{bad' })).status, 400);
  assert.equal((await post('/api/config', { foundryKey: 'test-foundry-not-real' })).status, 400);
  assert.equal((await post('/api/config', { foundryAuth: 'vscode' })).status, 400);
  assert.equal((await post('/api/config', { jevKey: 'test-secret-not-real' })).status, 200);
  const configured = await (await fetch(`${url}/api/bootstrap`)).text();
  assert.ok(!configured.includes('test-secret-not-real') && !configured.includes('test-foundry-not-real'));
  const start = await post('/api/runs', options);
  assert.equal(start.status, 202);
  const started = await start.json() as BenchmarkRun;
  assert.equal((await post('/api/runs', options)).status, 409);
  assert.equal((await post('/api/config', { clearKeys: true })).status, 409);
  await runner.waitForIdle();
  const result = await (await fetch(`${url}/api/runs/${started.id}`)).json() as BenchmarkRun;
  assert.equal(result.status, 'completed');
  assert.equal(result.observations.length, 18);
  assert.equal(result.total, 18);
  assert.equal(result.datasetHash.length, 64);
  assert.equal(result.protocol.retries, 0);
  assert.equal(result.protocol.foundryAuth, null);
  for (const arm of options.arms) assert.equal(result.observations.filter(row => row.arm === arm).length, 6);
  const exported = await fetch(`${url}/api/runs/${started.id}/export?format=json`);
  assert.match(exported.headers.get('content-disposition')!, /benchmark-demo-/);
  const exportText = await exported.text();
  assert.match(exportText, /SYNTHETIC EXAMPLE ONLY/);
  assert.ok(!exportText.includes('test-secret-not-real') && !exportText.includes('csrfToken'));
  const csv = await (await fetch(`${url}/api/runs/${started.id}/export?format=csv`)).text();
  assert.equal(csv.trim().split('\r\n').length, 19);
  assert.match(csv, /"demo"/);
  assert.equal((await fetch(`${url}/api/runs/${started.id}/export?format=invalid`)).status, 400);
  assert.equal((await fetch(`${url}/api/runs/missing`)).status, 404);
  assert.equal((await fetch(`${url}/api/not-real`)).status, 404);
  const stored = await readFile(path.join(directory, `${started.id}.json`), 'utf8');
  assert.ok(!stored.includes('test-secret-not-real') && !stored.includes('test-foundry-not-real'));
  const reloaded = new Runner(new Configuration({}), new RunStore(directory));
  await reloaded.initialize();
  assert.deepEqual(reloaded.get(started.id), result);

  const cancelRun = await (await post('/api/runs', { ...options, repetitions: 10 })).json() as BenchmarkRun;
  assert.equal((await post(`/api/runs/${cancelRun.id}/cancel`, {})).status, 200);
  await runner.waitForIdle();
  const cancelled = runner.get(cancelRun.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(cancelled.observations.length < cancelled.total);
  assert.equal((await post('/api/config', { clearKeys: true })).status, 200);
  assert.equal(config.public().jevConfigured, false);
});

test('auth provenance survives persistence/exports without assigning an identity to historical runs', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-benchmark-auth-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new RunStore(directory);
  for (const mode of ['service-principal', 'vscode'] as const) {
    const runner = new Runner(new Configuration({
      FOUNDRY_AUTH_MODE: mode, FOUNDRY_ENDPOINT: 'https://test.openai.azure.com', FOUNDRY_DEPLOYMENT: 'test',
      AZURE_TENANT_ID: 'private-tenant', AZURE_CLIENT_ID: 'private-client', AZURE_CLIENT_SECRET: 'private-secret',
    }), store, () => demoProviders(42, 1));
    await runner.initialize();
    const run = await runner.start({ ...options, mode: 'live', arms: ['foundry'] });
    await runner.waitForIdle();
    assert.equal(run.protocol.foundryAuth, mode);
    const loaded = (await store.load()).find(value => value.id === run.id)!;
    assert.equal(loaded.protocol.foundryAuth, mode);
    const json = exportJson(loaded);
    const csv = exportCsv(loaded);
    assert.equal((JSON.parse(json) as BenchmarkRun).protocol.foundryAuth, mode);
    assert.ok(csv.split('\r\n')[0]!.endsWith('"foundry_auth"'));
    assert.ok(csv.split('\r\n').slice(1).every(row => row.endsWith(`"${mode}"`)));
    for (const output of [json, csv, await readFile(path.join(directory, `${run.id}.json`), 'utf8')]) {
      assert.ok(!output.includes('private-'));
      assert.ok(!output.includes('csrfToken'));
    }
    delete loaded.protocol.foundryAuth;
    await store.save(loaded);
    const historical = (await store.load()).find(value => value.id === run.id)!;
    assert.equal(historical.protocol.foundryAuth, undefined);
    assert.match(exportCsv(historical), /"not-recorded"/);
    assert.ok(!exportJson(historical).includes('"foundryAuth"'));
  }
});

test('restart marks unfinished runs interrupted and preserves completed observations', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-benchmark-restart-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new RunStore(directory);
  const runner = new Runner(new Configuration({}), store);
  await runner.initialize();
  const run = await runner.start({ ...options, arms: ['jev'] });
  await runner.waitForIdle();
  const interrupted = { ...run, status: 'running' as const, completedAt: null };
  await store.save(interrupted);
  const restored = (await store.load())[0]!;
  assert.equal(restored.status, 'interrupted');
  assert.deepEqual(restored.observations, run.observations);
  assert.match(restored.fatalError!, /server stopped/);
  const json = JSON.parse(exportJson(restored)) as { dataset: unknown };
  assert.deepEqual(json.dataset, run.dataset);
});

test('CSV protects spreadsheet formulas and escapes quotes/newlines', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('  +cmd'), '"\'  +cmd"');
  assert.equal(csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(csvCell(null), '""');
});

test('corrupt persisted records fail explicitly without leaking their contents', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-benchmark-corrupt-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, '31c15bd1-ffb8-4fd3-a128-888609e2e558.json');
  const store = new RunStore(directory);
  await writeFile(file, '{PRIVATE_CONTENT');
  await assert.rejects(() => store.load(), error => error instanceof Error
    && error.message.includes('malformed JSON') && !error.message.includes('PRIVATE_CONTENT'));
  await writeFile(file, '{}');
  await assert.rejects(() => store.load(), /invalid/);
});

test('storage failures release the run slot and expose failure instead of completion', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-benchmark-storage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  class FailingStore extends RunStore {
    successfulWritesLeft = 0;
    override async save(run: BenchmarkRun): Promise<void> {
      if (this.successfulWritesLeft-- <= 0) throw new Error('Simulated write failure');
      await super.save(run);
    }
  }
  const store = new FailingStore(directory);
  const runner = new Runner(new Configuration({}), store);
  await runner.initialize();
  await assert.rejects(() => runner.start(options), /Simulated write failure/);
  assert.equal(runner.isBusy(), false);
  assert.equal(runner.list().length, 0);
  store.successfulWritesLeft = 1;
  const failed = await runner.start(options);
  await runner.waitForIdle();
  assert.equal(failed.status, 'failed');
  assert.match(failed.fatalError!, /persist final results/);
  assert.equal(runner.isBusy(), false);
  assert.equal(failed.observations.length, 1);
  store.successfulWritesLeft = 100;
  const recovered = await runner.start({ ...options, arms: ['jev'] });
  await runner.waitForIdle();
  assert.equal(recovered.status, 'completed');
});

test('live provider failure stays live and is never replaced by a demo prediction', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'jev-benchmark-failure-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const runner = new Runner(new Configuration({ TYPESAFE_API_KEY: 'test-only' }), new RunStore(directory), () => ({
    async jev() { throw Object.assign(new Error('secret response'), { status: 401 }); },
    async foundry() { throw new Error('not expected'); },
  }));
  await runner.initialize();
  const run = await runner.start({ ...options, mode: 'live', arms: ['jev'] });
  await runner.waitForIdle();
  assert.equal(run.status, 'completed', 'completion is distinct from successful provider results');
  assert.equal(run.protocol.foundryAuth, null);
  assert.equal(run.observations.length, 6);
  assert.ok(run.observations.every(row => row.status === 'error' && row.predicted === null && row.stages.length === 0));
  assert.ok(!exportJson(run).includes('secret response'));
});
