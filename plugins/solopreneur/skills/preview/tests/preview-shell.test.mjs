/**
 * Tests for assets/preview-shell.js — the PURE helpers only.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * preview-shell.js is a browser classic script wrapped in an IIFE that runs its
 * DOM/Shadow-DOM boot only when a `document` exists. Under Node there is none, so
 * importing it just runs the pure helpers and exposes them through a CommonJS
 * export guard. There is no package.json in the tree, so Node treats the `.js`
 * as CommonJS and an ESM DEFAULT import yields its `module.exports`. (Default,
 * not named: the export is assigned inside an `if`, which cjs-module-lexer does
 * not reliably surface as named bindings.)
 *
 * These are jsdom-free unit checks: the DOM rendering is browser-only and not
 * exercised here; only the deterministic helpers that FEED it are.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import shell from '../assets/preview-shell.js';

const { groupDirectory, partyLine, footerModel, buildShareRequest, shareRequestText, ACCESS_OPTIONS, SHARE_SCHEMA_VERSION } = shell;

// --- groupDirectory ---------------------------------------------------------

test('groupDirectory splits by collection and sorts updatedAt DESC', () => {
  const groups = groupDirectory([
    { id: 'b', title: 'B', updatedAt: '2026-01-01T00:00:00Z', collection: 'active' },
    { id: 'a', title: 'A', updatedAt: '2026-03-01T00:00:00Z', collection: 'active' },
    { id: 'z', title: 'Z', updatedAt: '2026-02-01T00:00:00Z', collection: 'archive' },
  ]);
  assert.deepEqual(groups.active.map((x) => x.id), ['a', 'b']); // newer first
  assert.deepEqual(groups.archive.map((x) => x.id), ['z']);
});

test('groupDirectory breaks an updatedAt tie by id ASC (stable)', () => {
  const ts = '2026-05-05T05:05:05Z';
  const groups = groupDirectory([
    { id: 'banana', updatedAt: ts, collection: 'active' },
    { id: 'apple', updatedAt: ts, collection: 'active' },
  ]);
  assert.deepEqual(groups.active.map((x) => x.id), ['apple', 'banana']);
});

test('groupDirectory sorts by parsed instant across timezone offsets, not lexically', () => {
  const groups = groupDirectory([
    { id: 'earlier', updatedAt: '2026-01-01T10:00:00+08:00', collection: 'active' }, // 02:00Z
    { id: 'later', updatedAt: '2026-01-01T09:00:00-08:00', collection: 'active' }, // 17:00Z
  ]);
  assert.deepEqual(groups.active.map((x) => x.id), ['later', 'earlier']);
});

test('groupDirectory treats any non-archive collection as active, and skips junk rows', () => {
  const groups = groupDirectory([
    { id: 'a', collection: 'active' },
    { id: 'b', collection: 'something-else' },
    null,
    { title: 'no id' },
    'nonsense',
  ]);
  assert.deepEqual(groups.active.map((x) => x.id).sort(), ['a', 'b']);
  assert.deepEqual(groups.archive, []);
});

test('groupDirectory tolerates a non-array input', () => {
  assert.deepEqual(groupDirectory(undefined), { active: [], archive: [] });
  assert.deepEqual(groupDirectory(null), { active: [], archive: [] });
  assert.deepEqual(groupDirectory('nope'), { active: [], archive: [] });
});

// --- partyLine --------------------------------------------------------------

test('partyLine joins present fields and reads "unrecorded" when empty', () => {
  assert.equal(partyLine({ agent: 'Builder Claude', platform: 'claude', sessionTitle: 'rework' }), 'Builder Claude · claude · rework');
  assert.equal(partyLine({ agent: 'Solo' }), 'Solo');
  assert.equal(partyLine({}), 'unrecorded');
  assert.equal(partyLine(undefined), 'unrecorded');
  assert.equal(partyLine(null), 'unrecorded');
});

test('partyLine ignores non-string fields (never coerces a guess)', () => {
  assert.equal(partyLine({ agent: 42, platform: {}, sessionTitle: 'ok' }), 'ok');
});

// --- footerModel ------------------------------------------------------------

test('footerModel renders producedBy (collapsed) as one line', () => {
  const m = footerModel({
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    revision: 2,
    provenance: { producedBy: { agent: 'Builder Claude', platform: 'claude' } },
  });
  assert.equal(m.mode, 'produced');
  assert.equal(m.producedBy, 'Builder Claude · claude');
  assert.equal(m.createdAt, '2026-01-01T00:00:00Z');
  assert.equal(m.updatedAt, '2026-01-02T00:00:00Z');
  assert.equal(m.revision, 2);
});

test('footerModel renders distinct createdBy / lastUpdatedBy as two lines', () => {
  const m = footerModel({
    provenance: {
      createdBy: { agent: 'Builder Claude', platform: 'claude', sessionTitle: 'v1' },
      lastUpdatedBy: { agent: 'Wrangler Codex', platform: 'codex', sessionTitle: 'v2' },
    },
  });
  assert.equal(m.mode, 'distinct');
  assert.equal(m.createdBy, 'Builder Claude · claude · v1');
  assert.equal(m.lastUpdatedBy, 'Wrangler Codex · codex · v2');
});

test('footerModel reads "unrecorded" for an empty producedBy and for missing provenance', () => {
  assert.equal(footerModel({ provenance: { producedBy: {} } }).producedBy, 'unrecorded');
  // No provenance at all collapses to a single unrecorded "Produced by".
  const none = footerModel({});
  assert.equal(none.mode, 'produced');
  assert.equal(none.producedBy, 'unrecorded');
});

test('footerModel keeps only string timestamps, else null', () => {
  const m = footerModel({ createdAt: 12345, updatedAt: '2026-01-02T00:00:00Z' });
  assert.equal(m.createdAt, null);
  assert.equal(m.updatedAt, '2026-01-02T00:00:00Z');
});

// --- buildShareRequest / shareRequestText -----------------------------------

test('buildShareRequest carries the request contract fields', () => {
  const req = buildShareRequest({ id: 'p1', revision: 3, contentHash: 'sha256:abc', url: 'https://x/p/p1/', access: 'anyone-with-link' });
  assert.equal(req.schemaVersion, SHARE_SCHEMA_VERSION);
  assert.equal(req.kind, 'preview-share-request');
  assert.equal(req.previewId, 'p1');
  assert.equal(req.revision, 3);
  assert.equal(req.contentHash, 'sha256:abc');
  assert.equal(req.url, 'https://x/p/p1/');
  assert.equal(req.access, 'anyone-with-link');
});

test('buildShareRequest defaults access to project-members and rejects an unknown value', () => {
  assert.equal(buildShareRequest({}).access, 'project-members');
  assert.equal(ACCESS_OPTIONS[0], 'project-members');
  assert.equal(buildShareRequest({ access: 'everyone-on-earth' }).access, 'project-members');
});

test('buildShareRequest nulls absent / non-string fields (no fabrication)', () => {
  const req = buildShareRequest({ revision: 0 });
  assert.equal(req.previewId, null);
  assert.equal(req.contentHash, null);
  assert.equal(req.url, null);
  assert.equal(req.revision, 0); // a real 0 is kept, not nulled
});

test('shareRequestText is parseable JSON round-tripping the request', () => {
  const req = buildShareRequest({ id: 'p1', revision: 1, contentHash: 'sha256:x', url: 'https://x/', access: 'project-members' });
  assert.deepEqual(JSON.parse(shareRequestText(req)), req);
});
