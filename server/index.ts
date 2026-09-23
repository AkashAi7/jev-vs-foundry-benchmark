import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { createApp } from './app';
import { Configuration } from './config';
import { Runner } from './runner';
import { RunStore } from './store';

if (existsSync('.env')) process.loadEnvFile('.env');
const port = Number(process.env.PORT ?? '4317');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be an integer from 1024 to 65535.');
const root = process.cwd();
const runner = new Runner(new Configuration(), new RunStore(path.join(root, '.local', 'runs')));
await runner.initialize();
const app = createApp(runner, port);
const server = createServer(app);
let closeVite: (() => Promise<void>) | undefined;

if (process.argv.includes('--production')) {
  const index = path.join(root, 'dist', 'index.html');
  if (!existsSync(index)) throw new Error('Production assets missing. Run npm run build first.');
  app.use(express.static(path.join(root, 'dist')));
  app.get('/{*page}', (_req, res) => res.sendFile(index));
} else {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server }, fs: { strict: true } },
    appType: 'spa',
  });
  app.use(vite.middlewares);
  closeVite = () => vite.close();
}

server.listen(port, '127.0.0.1', () => {
  console.log(`Jev Benchmark Lab: http://127.0.0.1:${port}`);
  console.log('Local-only. No inference runs until you explicitly start a live benchmark.');
});
server.on('error', error => {
  console.error(`Server could not start (${error.name}). Check whether port ${port} is already occupied.`);
  process.exitCode = 1;
  void closeVite?.();
});

async function shutdown(): Promise<void> {
  const running = runner.list().find(run => run.status === 'running');
  if (running) runner.cancel(running.id);
  await runner.waitForIdle();
  await closeVite?.();
  server.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
