/**
 * Boot-path regression guard for assets/preview-shell.js.
 *
 * Requires Node.js >= 20. Run with the rest: `node --test tests/*.test.mjs`.
 *
 * The pure-helper suite (preview-shell.test.mjs) imports the module with no
 * `document`, so it never runs the browser `boot()`. This file DOES: it stubs a
 * universal DOM and imports the module in a process where `document` exists, so
 * `boot()` executes end-to-end. It guards specifically against the temporal-dead-
 * zone class of bug — `boot()` reads the `STYLE` / `MARKUP` consts, so it must be
 * invoked only after they initialize — which a static-analysis reviewer caught but
 * a pure-helper import cannot.
 *
 * node:test runs each test FILE in its own process, so this file is the only
 * importer of preview-shell.js in its process and its stubs are in place before
 * the module's IIFE runs.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

/** A universal callable-proxy node: any DOM method/property access is satisfied. */
function anyNode() {
  const fn = function () { return anyNode(); };
  const store = {
    dataset: {}, style: {},
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    textContent: '', value: '', innerHTML: '', hidden: false, title: '', href: '',
  };
  return new Proxy(fn, {
    get(_t, p) {
      if (typeof p === 'symbol') return undefined;
      if (p in store) return store[p];
      return anyNode();
    },
    set(_t, p, v) { store[p] = v; return true; },
    apply() { return anyNode(); },
    has() { return true; },
  });
}

test('preview-shell boot() runs end-to-end in a browser-like environment (no TDZ crash)', async () => {
  const win = {};
  const savedFetch = globalThis.fetch;
  globalThis.window = win;
  globalThis.document = anyNode();
  // The sidebar fetches /directory.json; resolve to an empty catalog.
  globalThis.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  try {
    await import('../assets/preview-shell.js'); // runs the IIFE → boot() (document exists)
  } finally {
    delete globalThis.window;
    delete globalThis.document;
    globalThis.fetch = savedFetch;
  }
  // boot() sets this only if it ran past readShellData + host/shadow setup +
  // `root.innerHTML = STYLE + MARKUP` without throwing.
  assert.equal(win.__previewShellLoaded, true, 'boot() must run the full browser path without crashing');
});
