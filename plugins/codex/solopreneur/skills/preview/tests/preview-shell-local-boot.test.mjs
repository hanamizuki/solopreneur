/**
 * Local-library (file://) boot-path guard for assets/preview-shell.js.
 *
 * Requires Node.js >= 20. Run with the rest: `node --test tests/*.test.mjs`.
 *
 * Sibling of preview-shell-boot.test.mjs, in its own file because node:test
 * runs each test FILE in its own process and the shell's IIFE only boots once
 * per process: this process boots with `window.__previewDirectory` already set
 * (the global the build-emitted assets/directory.js provides on local-library
 * pages), proving the catalog comes from the global and the deployed-origin
 * fetch of /directory.json is never attempted — under file:// that fetch is
 * blocked, so falling back to it would break the local sidebar silently.
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

const win = { __previewDirectory: { schemaVersion: 1, items: [] } };
let fetchCalls = 0;
let shell;

test('boot() takes the catalog from window.__previewDirectory and never fetches', async () => {
  const savedFetch = globalThis.fetch;
  globalThis.window = win;
  globalThis.document = anyNode();
  globalThis.location = { protocol: 'file:', href: 'file:///root/library/p/x/index.html' };
  globalThis.fetch = () => {
    fetchCalls += 1;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ items: [] }) });
  };
  try {
    shell = (await import('../assets/preview-shell.js')).default;
    // The catalog promise resolves on the microtask queue; drain it before
    // asserting no fetch happened.
    await new Promise((resolve) => { setImmediate(resolve); });
  } finally {
    globalThis.fetch = savedFetch;
    // window/document/location stay stubbed: sidebarRow below needs them.
  }
  assert.equal(win.__previewShellLoaded, true, 'boot() must complete');
  assert.equal(fetchCalls, 0, 'the embedded catalog must preempt the /directory.json fetch');
});

test('sidebarRow links relatively (explicit index.html) under file://, absolutely otherwise', () => {
  globalThis.location = { protocol: 'file:' };
  const local = shell.sidebarRow({ id: 'x-1', title: 'X' }, 'other');
  assert.equal(local.href, '../x-1/index.html');

  globalThis.location = { protocol: 'https:' };
  const deployed = shell.sidebarRow({ id: 'x-1', title: 'X' }, 'other');
  assert.equal(deployed.href, '/p/x-1/');

  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.location;
});
