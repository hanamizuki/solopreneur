/**
 * Tests for scripts/reviewer-state.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs
 *
 * Every case spawns the real CLI so the contract under test is the one callers
 * depend on: exit code, stdout shape, and what lands in the config file. The
 * environment is an allowlist, not a copy of the developer's — HOME points at a
 * fixture and CLAUDE_CONFIG_DIR is always explicit, so a real ~/.claude config
 * can neither leak in nor be written to.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'reviewer-state.mjs',
);

const fixtures = [];
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh dir. realpath'd because macOS tmpdir sits under a /var symlink. */
function tmpDir() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-state-')));
  fixtures.push(dir);
  return dir;
}

/** A config dir holding solopreneur.json. Pass a string to write it verbatim. */
function tmpConfigDir(config) {
  const dir = tmpDir();
  if (config !== undefined) {
    fs.writeFileSync(
      path.join(dir, 'solopreneur.json'),
      typeof config === 'string' ? config : `${JSON.stringify(config, null, 2)}\n`,
    );
  }
  return dir;
}

function run(args, { stdin = '', configDir } = {}) {
  const home = tmpDir();
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    input: stdin,
    encoding: 'utf8',
    // Allowlist, not { ...process.env }: an inherited NODE_OPTIONS or a real
    // CLAUDE_CONFIG_DIR would silently change what these assertions mean.
    env: { PATH: process.env.PATH, HOME: home, CLAUDE_CONFIG_DIR: configDir ?? tmpDir() },
  });
  return { code: res.status, signal: res.signal, stdout: res.stdout, stderr: res.stderr };
}

/** Failure contract: clean exit 1, message on stderr, nothing on stdout. */
function assertFailed({ code, signal, stdout, stderr }, pattern) {
  assert.equal(signal, null, 'must not die on a signal');
  assert.equal(code, 1);
  assert.equal(stdout, '', 'stdout is the machine contract; it must stay clean on failure');
  assert.match(stderr, pattern);
}

const TSV = (rows) => rows.map((r) => r.join('\t')).join('\n');
const REVIEW = 'review-comment';
const FORMAL = 'formal-review';
const CHAT = 'conversation';

test('detect keeps only Bot authors', () => {
  const { code, stdout } = run(['detect'], {
    stdin: TSV([
      ['hanamizuki', 'User', '2026-07-29T10:00:00Z', REVIEW],
      ['coderabbitai[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
    ]),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots, [
    { login: 'coderabbitai[bot]', lastSeen: '2026-07-29T11:00:00Z', evidence: true },
  ]);
});

test('detect keeps a Bot whose login has no [bot] suffix', () => {
  // GitHub Copilot code review posts as login `Copilot`, type Bot. The old
  // allowlist comment asserted every bot login carries the suffix; this case is
  // why detection keys on `type`, never on the name.
  const { stdout } = run(['detect'], {
    stdin: TSV([['Copilot', 'Bot', '2026-07-29T11:00:00Z', FORMAL]]),
  });
  assert.equal(JSON.parse(stdout).bots[0].login, 'Copilot');
});

test('detect marks a conversation-only bot as lacking review evidence', () => {
  // dependabot shape: it writes PR descriptions and issue comments, never
  // inline review comments. It must not become a reviewer candidate.
  const { stdout } = run(['detect'], {
    stdin: TSV([['dependabot[bot]', 'Bot', '2026-07-29T11:00:00Z', CHAT]]),
  });
  assert.deepEqual(JSON.parse(stdout).bots, [
    { login: 'dependabot[bot]', lastSeen: '2026-07-29T11:00:00Z', evidence: false },
  ]);
});

test('detect treats a formal review as evidence', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([['gemini-code-assist[bot]', 'Bot', '2026-07-29T11:00:00Z', FORMAL]]),
  });
  assert.equal(JSON.parse(stdout).bots[0].evidence, true);
});

test('detect ORs evidence across a bot’s rows', () => {
  // One conversation comment plus one review comment still means reviewer.
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['coderabbitai[bot]', 'Bot', '2026-07-01T00:00:00Z', CHAT],
      ['coderabbitai[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
    ]),
  });
  const [bot] = JSON.parse(stdout).bots;
  assert.equal(bot.evidence, true);
  assert.equal(bot.lastSeen, '2026-07-29T11:00:00Z');
});

test('detect keeps the newest timestamp per login', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['x[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
      ['x[bot]', 'Bot', '2026-07-01T00:00:00Z', REVIEW],
    ]),
  });
  assert.equal(JSON.parse(stdout).bots[0].lastSeen, '2026-07-29T11:00:00Z');
});

test('detect sorts by login so output is stable', () => {
  const { stdout } = run(['detect'], {
    stdin: TSV([
      ['zeta[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
      ['alpha[bot]', 'Bot', '2026-07-29T11:00:00Z', REVIEW],
    ]),
  });
  assert.deepEqual(JSON.parse(stdout).bots.map((b) => b.login), ['alpha[bot]', 'zeta[bot]']);
});

test('detect ignores malformed, blank and unknown-source lines', () => {
  const { code, stdout } = run(['detect'], {
    stdin: [
      'only-one-field',
      '',
      'a\tb\tc',                                       // three fields, not four
      `bad[bot]\tBot\t2026-07-29T11:00:00Z\tmystery`,  // unknown source
      `ok[bot]\tBot\t2026-07-29T11:00:00Z\t${REVIEW}`,
      '   ',
    ].join('\n'),
  });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots.map((b) => b.login), ['ok[bot]']);
});

test('detect on empty stdin yields an empty list, not an error', () => {
  const { code, stdout } = run(['detect'], { stdin: '' });
  assert.equal(code, 0);
  assert.deepEqual(JSON.parse(stdout).bots, []);
});

test('an unknown subcommand fails with usage', () => {
  assertFailed(run(['bogus']), /usage/i);
});

test('no subcommand fails with usage', () => {
  assertFailed(run([]), /usage/i);
});
