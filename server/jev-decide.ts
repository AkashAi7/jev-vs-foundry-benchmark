import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Configuration } from './config';
import { scoreFoundryDecision } from './foundry-jev';
import { scoreLocalDecision } from './local-jev';
import type { JevDecisionRequest } from '../shared/jev-converter';

if (existsSync('.env')) process.loadEnvFile('.env');

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file || process.argv.length !== 3) {
    throw new Error('Usage: npm run jev:decide -- <decision.json>');
  }
  const input = JSON.parse(await readFile(file, 'utf8')) as JevDecisionRequest;
  const result = input.provider === 'foundry'
    ? await scoreFoundryDecision(input, new Configuration().snapshot())
    : await scoreLocalDecision(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Local Jev decision failed.';
  process.stderr.write(`${JSON.stringify({ status: 'error', error: message })}\n`);
  process.exitCode = 1;
});
