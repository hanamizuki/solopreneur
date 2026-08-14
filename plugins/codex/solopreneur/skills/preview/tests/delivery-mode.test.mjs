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

test('local is the default on Claude and Codex hosts', () => {
  assert.equal(resolveDeliveryMode(), 'local');
  assert.equal(resolveDeliveryMode({ codexThreadId: 'thread' }), 'local');
});

test('an explicit Vercel mode remains available on Claude Code', () => {
  assert.equal(resolveDeliveryMode({ vercel: true }), 'vercel');
});

test('an explicit Vercel mode fails closed on Codex before side effects', () => {
  assert.throws(
    () => resolveDeliveryMode({ vercel: true, codexThreadId: 'thread' }),
    /Codex Phase 1 supports local delivery only/,
  );
});

test('the shipped CLI exposes the same mode contract', () => {
  const local = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  const blocked = spawnSync(process.execPath, [SCRIPT, '--vercel'], {
    encoding: 'utf8',
    env: { ...process.env, CODEX_THREAD_ID: 'thread' },
  });

  assert.equal(local.status, 0);
  assert.equal(local.stdout.trim(), 'local');
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

test('the canonical skill puts the delivery gate before either workflow', () => {
  const body = SKILL.slice(SKILL.indexOf('\n---\n', 4) + 5);
  const gate = body.indexOf('## Delivery mode gate');
  const local = body.indexOf('## Local workflow');
  const vercel = body.indexOf('## Vercel workflow');

  assert.notEqual(gate, -1);
  assert.notEqual(local, -1);
  assert.notEqual(vercel, -1);
  assert.ok(gate < local && local < vercel);
  assert.doesNotMatch(body, /## Codex host guard/);
});
