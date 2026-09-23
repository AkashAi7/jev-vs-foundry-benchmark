import { timingSafeEqual } from 'node:crypto';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { cases, scenarios } from '../shared/scenarios';
import { configSchema } from './config';
import { LabError } from './errors';
import { exportCsv, exportJson } from './export';
import type { Runner } from './runner';

export function createApp(runner: Runner, port: number) {
  const app = express();
  app.disable('x-powered-by');
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  app.use((req, res, next) => {
    if (!allowedHosts.has(req.headers.host ?? '')) {
      res.status(403).json({ error: 'Only the local benchmark host is allowed.' }); return;
    }
    const origin = req.headers.origin;
    if (origin && ![...allowedHosts].some(host => origin === `http://${host}`)) {
      res.status(403).json({ error: 'Cross-origin access is not allowed.' }); return;
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ error: 'Cross-site access is not allowed.' }); return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use('/api', (_, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) { next(); return; }
    const actual = Buffer.from(req.get('x-benchmark-token') ?? '');
    const expected = Buffer.from(runner.config.csrfToken);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      res.status(403).json({ error: 'Invalid session token. Reload this local page and try again.' }); return;
    }
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Request must use application/json.' }); return;
    }
    next();
  });
  app.use('/api', express.json({ limit: '16kb' }));
  app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
  app.get('/api/bootstrap', (_, res) => res.json({ config: runner.config.public(), scenarios, cases, runs: runner.list() }));
  app.post('/api/config', (req, res) => {
    if (runner.isBusy()) throw new LabError('Wait for the active run before changing connections.', 409);
    res.json(runner.config.update(configSchema.parse(req.body)));
  });
  app.post('/api/runs', async (req, res) => { res.status(202).json(await runner.start(req.body)); });
  app.get('/api/runs/:id', (req, res) => res.json(runner.get(req.params.id)));
  app.post('/api/runs/:id/cancel', (req, res) => res.json(runner.cancel(req.params.id)));
  app.get('/api/runs/:id/export', (req, res) => {
    const run = structuredClone(runner.get(req.params.id));
    if (req.query.format !== 'json' && req.query.format !== 'csv') throw new LabError('Export format must be json or csv.');
    res.attachment(`benchmark-${run.options.mode}-${run.id}.${req.query.format}`);
    if (req.query.format === 'csv') res.type('text/csv').send(exportCsv(run));
    else res.type('application/json').send(exportJson(run));
  });
  app.use('/api', (_, res) => res.status(404).json({ error: 'API route not found.' }));
  const errors: ErrorRequestHandler = (error: unknown, req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: req.path === '/api/config'
        ? 'Invalid connection settings. Keys must be nonempty when supplied, and model/deployment names may contain only letters, numbers, underscores, dots, and hyphens (up to 128 characters).'
        : 'Invalid request settings. Check selected arms/scenarios, repetitions (1-10), threshold (0-1) and seed (0-2147483647).' });
    } else if (error instanceof LabError) {
      res.status(error.status).json({ error: error.message });
    } else if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Malformed JSON request.' });
    } else if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request is too large.' });
    } else {
      console.error('API request failed; raw details withheld to protect credentials.');
      res.status(500).json({ error: 'Server operation failed. Check local storage permissions and connection settings.' });
    }
  };
  app.use(errors);
  return app;
}
