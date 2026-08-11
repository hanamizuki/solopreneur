import test from 'node:test';
import assert from 'node:assert/strict';

import { countBlocking } from '../verdict.mjs';

test('counts P1 and P2 findings', () => {
  assert.equal(countBlocking('[P1] foo.mjs:3 unguarded read\n[P2] bar.mjs:9 rename\n[P3] nit\n'), 2);
});

test('a clean reviewer answer has no blocking findings', () => {
  assert.equal(countBlocking('No findings.'), 0);
});

test('P3 nit findings are not blocking', () => {
  assert.equal(countBlocking('[P3] nit\n'), 0);
});
