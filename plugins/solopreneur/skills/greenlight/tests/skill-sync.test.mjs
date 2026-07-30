/**
 * Keeps SKILL.md's human-readable registry table in sync with the executable
 * registry. The trigger string is the one field worth checking mechanically —
 * it is the only per-tool knowledge, and a stale one sends the wrong comment.
 * Runs in the same suite as everything else, so CI enforces it on every PR.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECIPES } from '../scripts/reviewer-registry.mjs';

const md = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'SKILL.md'), 'utf8');

test('every registry row appears in SKILL.md with its trigger', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(md.includes(`\`${id}\``), `missing row: ${id}`);
    assert.ok(md.includes(r.trigger), `trigger for ${id} not in SKILL.md: ${r.trigger}`);
  }
});

test('the hardcoded login allowlist stays deleted', () => {
  assert.ok(!md.includes('REVIEWER_BOT_LOGINS'), 'hardcoded login list crept back in');
});
