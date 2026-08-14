#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function reserveLocalOutput(target) {
  if (typeof target !== 'string' || target.length === 0 || !path.isAbsolute(target)) {
    throw new Error('target must be a non-empty absolute path');
  }

  const resolved = target;
  const { dir, name, ext } = path.parse(resolved);

  for (let suffix = 1; ; suffix += 1) {
    const candidate = suffix === 1 ? resolved : path.join(dir, `${name}-${suffix}${ext}`);
    try {
      fs.closeSync(fs.openSync(candidate, 'wx', 0o600));
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) {
    console.error('usage: reserve-local-output.mjs <target.html>');
    return 2;
  }

  try {
    console.log(reserveLocalOutput(argv[0]));
    return 0;
  } catch (error) {
    console.error(`preview: cannot reserve local output: ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
