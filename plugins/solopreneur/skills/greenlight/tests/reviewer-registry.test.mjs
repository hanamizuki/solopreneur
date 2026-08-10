/**
 * Tests for scripts/reviewer-registry.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
 *
 * The registry is pure data, so these import it directly rather than spawning a
 * CLI. The completeness cases carry the weight: they are the guard that fires
 * when someone adds a tool and forgets a field, so each one must fail closed —
 * an unrecognised `kind` must be an error, never an exemption from the checks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, DEFAULT_POLL, recipeFor, recipeForLogin } from '../scripts/reviewer-registry.mjs';

const KINDS = new Set(['github-bot', 'local-cli']);

test('recipeFor resolves a canonical id', () => {
  assert.equal(recipeFor('codex-bot').id, 'codex-bot');
  assert.equal(recipeFor('codex-bot').trigger, '@codex review');
});

test('recipeFor resolves an alias', () => {
  assert.equal(recipeFor('codex bot').id, 'codex-bot');
  assert.equal(recipeFor('cursor').id, 'bugbot');
});

test('recipeFor trims and ignores case', () => {
  assert.equal(recipeFor('  Codex Bot  ').id, 'codex-bot');
});

test('recipeFor returns null for anything unknown', () => {
  for (const input of ['nope', '', '   ', undefined, null, 42, {}]) {
    assert.equal(recipeFor(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test('every recipe declares a known kind', () => {
  // Fails closed: a typo'd kind would otherwise exempt the row from the trigger
  // and poll checks below, which is the worst direction for a guard to fail.
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(KINDS.has(r.kind), `${id} has unknown kind ${JSON.stringify(r.kind)}`);
  }
});

test('every recipe declares a non-empty family', () => {
  // The family is what makes gate independence decidable. A row without one
  // would compare `undefined` against the host family, quietly pass the filter,
  // and be eligible to gate its own host — failing open on the invariant.
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.equal(typeof r.family, 'string', `${id}.family is not a string`);
    assert.ok(r.family.trim(), `${id} has an empty family`);
  }
});

test('claude-cli is the anthropic-family gate recipe', () => {
  const r = RECIPES['claude-cli'];
  assert.ok(r, 'claude-cli missing from registry');
  assert.equal(r.kind, 'local-cli');
  assert.equal(r.family, 'anthropic');
  assert.equal(r.handshake, 'stdout');
  assert.deepEqual(r.knownLogins, []);
  assert.equal(r.poll, undefined, 'a local CLI runs synchronously and has no poll policy');
  assert.equal(recipeFor('claude cli').id, 'claude-cli');
});

test('the claude-cli trigger requests the [P*] tags the loop already parses', () => {
  // No new parser exists for it: the recipe has to ASK for the format the
  // existing `[P*]` scan reads, and for the exact clean sentence that separates
  // "reviewed, found nothing" from "never ran".
  const { trigger } = RECIPES['claude-cli'];
  for (const needle of ['[P1]', '[P2]', '[P3]', 'No findings.', ' -p ', 'between main and HEAD']) {
    assert.ok(trigger.includes(needle), `claude-cli trigger is missing ${JSON.stringify(needle)}`);
  }
  // The local base branch, like every other reviewer in this loop. `origin/main`
  // is absent on a repo whose remote is named differently or unfetched.
  assert.ok(!trigger.includes('origin/'), 'claude-cli must review against the LOCAL base branch');
});

test('every recipe declares an aliases array', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(Array.isArray(r.aliases), `${id}.aliases is not an array`);
  }
});

test('every recipe carries a non-empty trigger', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(r.trigger && r.trigger.trim(), `${id} has no trigger`);
  }
});

test('every github-bot carries a complete poll policy', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.kind !== 'github-bot') continue;   // local CLIs are read from stdout
    for (const field of ['firstWaitSec', 'intervalSec', 'tries']) {
      assert.equal(typeof r.poll?.[field], 'number', `${id}.poll.${field} missing`);
    }
  }
});

test('every github-bot declares a handshake', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    if (r.kind !== 'github-bot') continue;
    assert.ok(r.handshake, `${id} has no handshake`);
  }
});

test('aliases never collide with each other or with any canonical id', () => {
  const ids = new Set(Object.keys(RECIPES));
  const seen = new Map();
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const a of r.aliases) {
      assert.ok(!ids.has(a) || a === id, `alias "${a}" shadows canonical id "${a}"`);
      assert.ok(!seen.has(a), `alias "${a}" claimed by both ${seen.get(a)} and ${id}`);
      seen.set(a, id);
    }
  }
});

test('every recipe declares a knownLogins array', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(Array.isArray(r.knownLogins), `${id}.knownLogins is not an array`);
  }
});

test('no login is claimed by two recipes', () => {
  const seen = new Map();
  for (const [id, r] of Object.entries(RECIPES)) {
    for (const login of r.knownLogins) {
      assert.ok(!seen.has(login), `login "${login}" claimed by both ${seen.get(login)} and ${id}`);
      seen.set(login, id);
    }
  }
});

test('recipeForLogin resolves a verified login', () => {
  assert.equal(recipeForLogin('coderabbitai[bot]').id, 'coderabbit');
  assert.equal(recipeForLogin('chatgpt-codex-connector[bot]').id, 'codex-bot');
  assert.equal(recipeForLogin('gemini-code-assist[bot]').id, 'gemini');
});

test('recipeForLogin returns null for unknown logins and non-strings', () => {
  for (const input of ['dependabot[bot]', 'hanamizuki', '', undefined, null, 42]) {
    assert.equal(recipeForLogin(input), null, `expected null for ${JSON.stringify(input)}`);
  }
});

test('the three newly added tools use the safe defaults', () => {
  for (const id of ['coderabbit', 'bugbot', 'greptile']) {
    assert.ok(RECIPES[id], `${id} missing from registry`);
    assert.equal(RECIPES[id].handshake, 'none');
    assert.deepEqual(RECIPES[id].poll, DEFAULT_POLL);
  }
});
