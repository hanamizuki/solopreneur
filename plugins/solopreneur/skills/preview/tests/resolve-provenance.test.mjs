/**
 * Tests for scripts/resolve-provenance.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * The module is a pure, deterministic normalizer with no I/O, so every case calls
 * it in-process and asserts the returned shape — no fixture tree, no temp dirs,
 * zero network. The recurring concern is negative: a raw session id, transcript
 * path or absolute local path must NEVER appear in a returned object, and a title
 * must never be fabricated when none was recorded.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveParty, resolveProvenance } from '../scripts/resolve-provenance.mjs';

/** A realistic Claude hook payload: carries the secrets that must never leak. */
const SESSION_ID = 'sess_SECRET-abc123';
const TRANSCRIPT = '/Users/dev/.claude/transcripts/SECRET.jsonl';
const claudePayload = (over = {}) => ({
  session_id: SESSION_ID,
  transcript_path: TRANSCRIPT,
  cwd: '/Users/dev/secret-project',
  session_title: 'Preview Library rework',
  ...over,
});

// --- caller-explicit priority -----------------------------------------------

test('caller-explicit sessionTitle beats the platform adapter', () => {
  const party = resolveParty({
    agent: 'Builder Claude',
    platform: 'claude',
    sessionTitle: 'EXPLICIT from caller',
    payload: claudePayload({ session_title: 'FROM PAYLOAD' }),
  });
  assert.equal(party.sessionTitle, 'EXPLICIT from caller');
});

test('a caller-explicit title works regardless of platform (adapter-independent)', () => {
  // codex has no adapter, yet an explicit title still resolves — priority 1 does
  // not depend on an adapter existing.
  const party = resolveParty({ agent: 'Wrangler Codex', platform: 'codex', sessionTitle: 'preview refactor' });
  assert.deepEqual(party, { agent: 'Wrangler Codex', platform: 'codex', sessionTitle: 'preview refactor' });
});

// --- Claude adapter ---------------------------------------------------------

test('the Claude adapter derives sessionTitle from session_title', () => {
  const party = resolveParty({ agent: 'Builder Claude', platform: 'claude', payload: claudePayload() });
  assert.deepEqual(party, { agent: 'Builder Claude', platform: 'claude', sessionTitle: 'Preview Library rework' });
});

test('the Claude adapter never lets the raw session_id or transcript_path into the result', () => {
  const party = resolveParty({ agent: 'Builder Claude', platform: 'claude', payload: claudePayload() });
  const serialized = JSON.stringify(party);
  assert.ok(!serialized.includes(SESSION_ID), 'session_id leaked');
  assert.ok(!serialized.includes(TRANSCRIPT), 'transcript_path leaked');
  assert.ok(!serialized.includes('/Users/'), 'an absolute local path leaked');
  assert.deepEqual(Object.keys(party).sort(), ['agent', 'platform', 'sessionTitle']);
});

test('a Claude payload without a session_title yields no title (the common case, not a guess)', () => {
  // session_title is only set once a session has been named, so its absence is
  // normal and must resolve to "unrecorded", never a fabricated value.
  const payload = claudePayload();
  delete payload.session_title;
  const party = resolveParty({ agent: 'Builder Claude', platform: 'claude', payload });
  assert.deepEqual(party, { agent: 'Builder Claude', platform: 'claude' });
  assert.ok(!('sessionTitle' in party));
});

test('a non-string session_title in the payload does not become a title', () => {
  const party = resolveParty({ platform: 'claude', payload: claudePayload({ session_title: { nested: 'obj' } }) });
  assert.ok(!('sessionTitle' in party));
});

// --- unimplemented platforms: unrecorded fallback + passthrough -------------

for (const platform of ['codex', 'hermes', 'openclaw']) {
  test(`${platform} has no adapter — sessionTitle is unrecorded, agent/platform pass through`, () => {
    const party = resolveParty({
      agent: `${platform} agent`,
      platform,
      // Even handed a payload, no adapter exists, so no title is derived.
      payload: { session_id: 'x', label: 'some label', displayName: 'Some Name' },
    });
    assert.deepEqual(party, { agent: `${platform} agent`, platform });
    assert.ok(!('sessionTitle' in party));
  });
}

// --- never-fabricate hardening ----------------------------------------------

for (const platform of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
  test(`a prototype-chain platform name (${JSON.stringify(platform)}) never fabricates a title`, () => {
    // A bare `ADAPTERS[platform]` would resolve an inherited function for these
    // names and call it — fabricating a title like "[object Undefined]". The
    // Object.hasOwn guard must keep sessionTitle absent.
    const party = resolveParty({ agent: 'X', platform, payload: { session_title: undefined } });
    assert.ok(!('sessionTitle' in party), `fabricated a title for platform ${platform}`);
  });
}

test('an empty or whitespace-only title resolves to absent, not a blank line', () => {
  assert.ok(!('sessionTitle' in resolveParty({ platform: 'claude', sessionTitle: '   ' })));
  assert.ok(!('sessionTitle' in resolveParty({ platform: 'claude', payload: claudePayload({ session_title: '  \t ' }) })));
});

test('a caller-explicit title is trimmed', () => {
  assert.equal(resolveParty({ platform: 'claude', sessionTitle: '  Padded title  ' }).sessionTitle, 'Padded title');
});

// --- passthrough hygiene ----------------------------------------------------

test('non-string agent/platform are omitted, not coerced', () => {
  const party = resolveParty({ agent: 42, platform: { not: 'a string' }, sessionTitle: 'T' });
  assert.deepEqual(party, { sessionTitle: 'T' });
});

test('a non-object party resolves to an empty (fully unrecorded) party', () => {
  for (const bad of [undefined, null, 'string', 42, ['array']]) {
    assert.deepEqual(resolveParty(bad), {});
  }
});

// --- resolveProvenance: collapse vs distinct --------------------------------

test('creator == updater collapses to a single "Produced by" display', () => {
  const by = { agent: 'Wrangler Codex', platform: 'codex', sessionTitle: 'preview refactor' };
  const display = resolveProvenance({ createdBy: { ...by }, lastUpdatedBy: { ...by } });
  assert.deepEqual(display, { producedBy: by });
  assert.ok(!('createdBy' in display) && !('lastUpdatedBy' in display));
});

test('creator != updater yields separate created / last-updated displays', () => {
  const display = resolveProvenance({
    createdBy: { agent: 'Builder Claude', platform: 'claude', sessionTitle: 'v1' },
    lastUpdatedBy: { agent: 'Wrangler Codex', platform: 'codex', sessionTitle: 'v2 rework' },
  });
  assert.deepEqual(display, {
    createdBy: { agent: 'Builder Claude', platform: 'claude', sessionTitle: 'v1' },
    lastUpdatedBy: { agent: 'Wrangler Codex', platform: 'codex', sessionTitle: 'v2 rework' },
  });
  assert.ok(!('producedBy' in display));
});

test('same agent but a different session does NOT collapse (distinct sessions are distinct)', () => {
  const display = resolveProvenance({
    createdBy: { agent: 'Builder Claude', platform: 'claude', sessionTitle: 'first session' },
    lastUpdatedBy: { agent: 'Builder Claude', platform: 'claude', sessionTitle: 'later session' },
  });
  assert.ok('createdBy' in display && 'lastUpdatedBy' in display);
});

test('resolveProvenance resolves each party through the adapter and sanitizes both', () => {
  const display = resolveProvenance({
    createdBy: { agent: 'Builder Claude', platform: 'claude', payload: claudePayload({ session_title: 'origin' }) },
    lastUpdatedBy: { agent: 'Builder Claude', platform: 'claude', payload: claudePayload({ session_title: 'update' }) },
  });
  const serialized = JSON.stringify(display);
  assert.ok(!serialized.includes(SESSION_ID) && !serialized.includes(TRANSCRIPT) && !serialized.includes('/Users/'));
  assert.equal(display.createdBy.sessionTitle, 'origin');
  assert.equal(display.lastUpdatedBy.sessionTitle, 'update');
});

// --- missing everything: no fabrication -------------------------------------

test('missing provenance collapses to a single unrecorded "Produced by"', () => {
  assert.deepEqual(resolveProvenance(undefined), { producedBy: {} });
  assert.deepEqual(resolveProvenance({}), { producedBy: {} });
  assert.deepEqual(resolveProvenance('nonsense'), { producedBy: {} });
});

test('a creator with no updater does not fabricate an updater identity', () => {
  const display = resolveProvenance({ createdBy: { agent: 'Builder Claude', platform: 'claude' } });
  // createdBy is known, lastUpdatedBy is absent ({}), so they differ and stay
  // distinct — the empty updater is "unrecorded", never a copy or a guess.
  assert.deepEqual(display, {
    createdBy: { agent: 'Builder Claude', platform: 'claude' },
    lastUpdatedBy: {},
  });
});

// --- title value is trusted display content (deliberate boundary) -----------

test('a sessionTitle is passed through as authored, even one that looks path-like', () => {
  // The guarantee is that the payload's raw ARTIFACT fields (session_id /
  // transcript_path / cwd) never ride along — NOT a heuristic content scan of the
  // title's value. sessionTitle is a human-chosen label (a Claude /rename, or a
  // caller-explicit title); pattern-redacting it would need the forbidden guessing
  // and would corrupt legitimate titles. This locks the deliberate decision so a
  // later change cannot silently add value-redaction (see the module header).
  assert.equal(
    resolveParty({ agent: 'A', platform: 'claude', sessionTitle: 'Fix the /api/users path' }).sessionTitle,
    'Fix the /api/users path',
  );
});

// --- the sanitization sweep (crown-jewel guarantee) -------------------------

test('no returned object ever contains a raw session id, transcript path, or absolute path', () => {
  // Every forbidden value here sits in a DISCARDED field (a payload artifact or a
  // stray key), never in a caller-explicit sessionTitle — that is exactly the scope
  // of the guarantee: raw artifact fields are dropped; a chosen title value is not.
  const forbidden = [SESSION_ID, TRANSCRIPT, '/Users/', '/home/', 'C:\\Users'];
  const inputs = [
    { agent: 'A', platform: 'claude', payload: claudePayload() },
    { agent: 'A', platform: 'claude', sessionTitle: 'T', payload: claudePayload() },
    { agent: 'A', platform: 'codex', payload: claudePayload() },
    { agent: 'A', platform: 'toString', payload: claudePayload() },
    // A hostile blob that stuffs the forbidden values under stray keys.
    { agent: 'A', platform: 'claude', session_id: SESSION_ID, transcriptPath: TRANSCRIPT, sourceRef: '/Users/x/secret.md', payload: claudePayload() },
  ];
  for (const input of inputs) {
    const partySerialized = JSON.stringify(resolveParty(input));
    const provSerialized = JSON.stringify(resolveProvenance({ createdBy: input, lastUpdatedBy: input }));
    for (const needle of forbidden) {
      assert.ok(!partySerialized.includes(needle), `resolveParty leaked ${JSON.stringify(needle)} for ${JSON.stringify(input)}`);
      assert.ok(!provSerialized.includes(needle), `resolveProvenance leaked ${JSON.stringify(needle)} for ${JSON.stringify(input)}`);
    }
  }
});
