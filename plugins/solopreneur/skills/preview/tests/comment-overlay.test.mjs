/**
 * Tests for assets/comment-overlay.js — the PURE helpers only.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * comment-overlay.js is a browser classic script wrapped in an IIFE that runs its
 * DOM code only when a `document` exists. Under Node there is none, so importing
 * it just defines the pure storage helpers and exposes them through a CommonJS
 * export guard (default import yields `module.exports`; no package.json means
 * `.js` is CommonJS). These jsdom-free checks cover the four storage guarantees:
 * per-ID keys, the never-auto-adopt-v2 rule, visible write failures, and the
 * double-load guard.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import overlay from '../assets/comment-overlay.js';

const { storageKeyFor, diffCleanKeyFor, loadComments, tryPersist, hasLegacyV2, alreadyInitialized } = overlay;

/** A minimal in-memory Storage stand-in. */
function fakeStorage(seed = {}) {
  const data = { ...seed };
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; },
  };
}

// --- per-ID key derivation --------------------------------------------------

test('the comment key is preview_comments_v3:<id>', () => {
  assert.equal(storageKeyFor('2026-07-24-note'), 'preview_comments_v3:2026-07-24-note');
});

test('two different preview ids derive non-colliding keys', () => {
  assert.notEqual(storageKeyFor('a'), storageKeyFor('b'));
  assert.equal(storageKeyFor('a'), 'preview_comments_v3:a');
  assert.equal(storageKeyFor('b'), 'preview_comments_v3:b');
});

test('an absent id degrades to a single un-namespaced key (standalone preview)', () => {
  assert.equal(storageKeyFor(''), 'preview_comments_v3:');
  assert.equal(storageKeyFor(undefined), 'preview_comments_v3:');
});

test('the diff/clean key is namespaced the same way, per preview', () => {
  assert.equal(diffCleanKeyFor('a'), 'preview_diff_clean_v1:a');
  assert.notEqual(diffCleanKeyFor('a'), diffCleanKeyFor('b'));
});

// --- v2 is NEVER auto-adopted -----------------------------------------------

test('loadComments reads ONLY the v3 key — a legacy v2 blob is not adopted', () => {
  const storage = fakeStorage({
    preview_comments_v2: JSON.stringify([{ id: 'x', comment: 'legacy' }]),
    preview_comments_v1: JSON.stringify([{ id: 'y', comment: 'older' }]),
  });
  // The v3 key for this preview holds nothing, so nothing loads — the global
  // v2 blob is not silently attributed to it.
  assert.deepEqual(loadComments(storage, storageKeyFor('somepreview')), []);
});

test('loadComments returns the v3 entries when they exist, and [] on junk/missing', () => {
  const entries = [{ id: 'a', comment: 'hi' }];
  const storage = fakeStorage({ 'preview_comments_v3:p': JSON.stringify(entries) });
  assert.deepEqual(loadComments(storage, 'preview_comments_v3:p'), entries);
  assert.deepEqual(loadComments(storage, 'preview_comments_v3:missing'), []);
  storage.setItem('preview_comments_v3:bad', '{ not json');
  assert.deepEqual(loadComments(storage, 'preview_comments_v3:bad'), []);
  storage.setItem('preview_comments_v3:obj', '{"not":"an array"}');
  assert.deepEqual(loadComments(storage, 'preview_comments_v3:obj'), []);
  assert.deepEqual(loadComments(null, 'anything'), []); // no storage at all
});

test('hasLegacyV2 detects a non-empty v2 blob (the manual-import hint condition)', () => {
  assert.equal(hasLegacyV2(fakeStorage({ preview_comments_v2: JSON.stringify([{ id: 'x' }]) })), true);
  assert.equal(hasLegacyV2(fakeStorage({ preview_comments_v2: '[]' })), false); // empty -> nothing to offer
  assert.equal(hasLegacyV2(fakeStorage({})), false);
  assert.equal(hasLegacyV2(fakeStorage({ preview_comments_v2: 'garbage' })), false);
  assert.equal(hasLegacyV2(null), false);
});

// --- write failures are surfaced, not swallowed -----------------------------

test('tryPersist reports FAILURE when setItem throws (quota / blocked storage)', () => {
  const throwing = {
    setItem() { throw new DOMException('quota', 'QuotaExceededError'); },
  };
  // Must return false so the caller can surface a visible error + export hatch,
  // instead of the old code that swallowed the throw and rendered success.
  assert.equal(tryPersist(throwing, 'k', 'v'), false);
});

test('tryPersist reports SUCCESS on a normal write, and false when storage is null', () => {
  const storage = fakeStorage();
  assert.equal(tryPersist(storage, 'k', 'v'), true);
  assert.equal(storage.getItem('k'), 'v');
  assert.equal(tryPersist(null, 'k', 'v'), false);
});

// --- double-load guard ------------------------------------------------------

test('alreadyInitialized is false the first time and true (a no-op) after', () => {
  const root = {};
  assert.equal(alreadyInitialized(root), false); // first load initializes
  assert.equal(alreadyInitialized(root), true); // a second include is a no-op
  assert.equal(alreadyInitialized(root), true); // and stays a no-op
  assert.equal(root.__previewCommentOverlayLoaded, true);
});
