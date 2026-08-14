import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { resolveDeliveryMode } from '../scripts/resolve-delivery.mjs';
import { reserveLocalOutput } from '../scripts/reserve-local-output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'resolve-delivery.mjs');
const RESERVE_SCRIPT = path.join(ROOT, 'scripts', 'reserve-local-output.mjs');
const SKILL = fs.readFileSync(path.join(ROOT, 'SKILL.md'), 'utf8');

test('library is the default on Claude and Codex hosts', () => {
  assert.equal(resolveDeliveryMode(), 'library');
  assert.equal(resolveDeliveryMode({ codexThreadId: 'thread' }), 'library');
});

test('explicit temporary intent resolves to ephemeral on both hosts', () => {
  assert.equal(resolveDeliveryMode({ ephemeral: true }), 'ephemeral');
  assert.equal(resolveDeliveryMode({ ephemeral: true, codexThreadId: 'thread' }), 'ephemeral');
});

test('an explicit Vercel mode remains available on Claude Code', () => {
  assert.equal(resolveDeliveryMode({ vercel: true }), 'vercel');
});

test('vercel and ephemeral cannot be combined', () => {
  assert.throws(
    () => resolveDeliveryMode({ vercel: true, ephemeral: true }),
    /mutually exclusive/,
  );
});

test('an explicit Vercel mode fails closed on Codex before side effects', () => {
  assert.throws(
    () => resolveDeliveryMode({ vercel: true, codexThreadId: 'thread' }),
    /Codex Phase 1 supports local delivery only/,
  );
});

test('the shipped CLI exposes the same mode contract', () => {
  const library = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  const ephemeral = spawnSync(process.execPath, [SCRIPT, '--ephemeral'], { encoding: 'utf8' });
  const combined = spawnSync(process.execPath, [SCRIPT, '--ephemeral', '--vercel'], { encoding: 'utf8' });
  const blocked = spawnSync(process.execPath, [SCRIPT, '--vercel'], {
    encoding: 'utf8',
    env: { ...process.env, CODEX_THREAD_ID: 'thread' },
  });

  assert.equal(library.status, 0);
  assert.equal(library.stdout.trim(), 'library');
  assert.equal(ephemeral.status, 0);
  assert.equal(ephemeral.stdout.trim(), 'ephemeral');
  assert.equal(combined.status, 2);
  assert.equal(combined.stdout, '');
  assert.equal(blocked.status, 2);
  assert.equal(blocked.stdout, '');
  assert.match(blocked.stderr, /no files, config, preflight, network, or deployment actions were performed/);
});

test('local output reservation preserves an existing target', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-local-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, 'preview.html');
  fs.writeFileSync(target, 'sentinel');

  const first = reserveLocalOutput(target);
  const second = spawnSync(process.execPath, [RESERVE_SCRIPT, target], { encoding: 'utf8' });

  assert.equal(first, path.join(root, 'preview-2.html'));
  assert.equal(second.status, 0);
  assert.equal(second.stdout.trim(), path.join(root, 'preview-3.html'));
  assert.equal(fs.readFileSync(target, 'utf8'), 'sentinel');
  assert.equal(fs.statSync(first).size, 0);
});

test('local output reservation rejects empty and relative targets without writes', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-local-output-invalid-'));
  const work = path.join(root, 'work');
  const previousCwd = process.cwd();
  fs.mkdirSync(work);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  try {
    process.chdir(work);
    assert.throws(() => reserveLocalOutput(''), /non-empty absolute path/);
    assert.throws(() => reserveLocalOutput('preview.html'), /non-empty absolute path/);
    assert.deepEqual(fs.readdirSync(root), ['work']);
    assert.deepEqual(fs.readdirSync(work), []);
  } finally {
    process.chdir(previousCwd);
  }
});

test('the canonical skill puts the delivery gate before every workflow', () => {
  const body = SKILL.slice(SKILL.indexOf('\n---\n', 4) + 5);
  const gate = body.indexOf('## Delivery mode gate');
  const library = body.indexOf('## Library workflow');
  const vercel = body.indexOf('## Vercel workflow');
  const ephemeral = body.indexOf('## Ephemeral workflow');

  assert.notEqual(gate, -1);
  assert.notEqual(library, -1);
  assert.notEqual(vercel, -1);
  assert.notEqual(ephemeral, -1);
  assert.ok(gate < library && library < vercel && vercel < ephemeral);
  assert.doesNotMatch(body, /## Codex host guard/);
  assert.doesNotMatch(body, /## Local workflow/);
});
