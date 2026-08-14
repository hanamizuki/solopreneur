#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const CODEX_VERCEL_ERROR =
  'preview: Codex Phase 1 supports local delivery only; no files, config, preflight, network, or deployment actions were performed.';

// Three modes. `library` is the default: misrouting is asymmetric (a real
// deliverable sent to an ephemeral file is lost after the look; a throwaway
// in the library is one extra catalog row), so ambiguity lands in the
// library and `ephemeral` requires the explicit flag. `vercel` keeps the
// existing Codex fail-closed contract.
export function resolveDeliveryMode({ vercel = false, ephemeral = false, codexThreadId = '' } = {}) {
  if (vercel && ephemeral) throw new Error('preview: vercel and ephemeral are mutually exclusive modes');
  if (vercel && codexThreadId) throw new Error(CODEX_VERCEL_ERROR);
  if (vercel) return 'vercel';
  return ephemeral ? 'ephemeral' : 'library';
}

const FLAGS = new Set(['--vercel', '--ephemeral']);

export function main(argv = process.argv.slice(2), env = process.env) {
  if (argv.includes('--help')) {
    console.log('usage: resolve-delivery.mjs [--ephemeral | --vercel]');
    return 0;
  }
  if (argv.some((arg) => !FLAGS.has(arg)) || argv.length > 1) {
    console.error('preview: expected no arguments or exactly one of --ephemeral | --vercel');
    return 2;
  }

  try {
    console.log(resolveDeliveryMode({
      vercel: argv[0] === '--vercel',
      ephemeral: argv[0] === '--ephemeral',
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
