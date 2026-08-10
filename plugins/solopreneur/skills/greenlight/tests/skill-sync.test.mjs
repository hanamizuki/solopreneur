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

/**
 * Markdown table rows whose first cell is exactly one backticked token, keyed by
 * that token. Row-level rather than whole-file matching is the point: two global
 * `includes` checks pass as long as the id and the trigger both appear SOMEWHERE,
 * and every trigger string also appears outside the registry table (the dispatch
 * table quotes `@codex review`, post-commit quotes `agy --print`). Swapping two
 * triggers inside the table would leave both substrings present and ship exactly
 * the drift this test exists to catch.
 */
function tableRowsByFirstCell(markdown) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    const key = cells[0]?.match(/^`([^`]+)`$/)?.[1];
    if (key === undefined) continue;
    rows.set(key, [...(rows.get(key) ?? []), cells]);
  }
  return rows;
}

test('every registry row appears in SKILL.md with its trigger in that same row', () => {
  const rows = tableRowsByFirstCell(md);
  for (const [id, r] of Object.entries(RECIPES)) {
    const matches = rows.get(id) ?? [];
    // Exactly one, so a second table keyed by the same token fails loudly here
    // instead of letting this test silently pick whichever row it saw last.
    assert.equal(matches.length, 1, `expected exactly 1 registry row for ${id}, found ${matches.length}`);
    assert.ok(
      matches[0].some((cell) => cell.includes(r.trigger)),
      `row for ${id} does not carry its trigger ${JSON.stringify(r.trigger)}: ${matches[0].join(' | ')}`,
    );
    // Exact cell, not `includes`: `openai` would otherwise match inside a
    // trigger or a login and let a wrong family cell ship. The family drives
    // gate independence, so a table that disagrees with the executable registry
    // teaches the reader the opposite of what the loop enforces.
    assert.ok(
      matches[0].includes(r.family),
      `row for ${id} has no cell equal to its family ${JSON.stringify(r.family)}: ${matches[0].join(' | ')}`,
    );
  }
});

test('the hardcoded login allowlist stays deleted', () => {
  assert.ok(!md.includes('REVIEWER_BOT_LOGINS'), 'hardcoded login list crept back in');
});
