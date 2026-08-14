#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const CODEX_VERCEL_ERROR =
  'preview: Codex Phase 1 supports local delivery only; no files, config, preflight, network, or deployment actions were performed.';

export function resolveDeliveryMode({ vercel = false, codexThreadId = '' } = {}) {
  if (vercel && codexThreadId) throw new Error(CODEX_VERCEL_ERROR);
  return vercel ? 'vercel' : 'local';
}

export function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    console.log('usage: resolve-delivery.mjs [--vercel]');
    return 0;
  }
  if (argv.some((arg) => arg !== '--vercel') || argv.filter((arg) => arg === '--vercel').length > 1) {
    console.error('preview: expected no arguments or exactly --vercel');
    return 2;
  }

  try {
    console.log(resolveDeliveryMode({
      vercel: argv[0] === '--vercel',
      codexThreadId: env.CODEX_THREAD_ID || '',
    }));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
