/**
 * Tests shared/config.sh — the one implementation of the config cascade — and
 * the fact that every consuming skill still sources it rather than carrying a
 * copy of its own.
 *
 * Requires Node.js >= 20. No dependencies.
 *
 * Why the script is executed rather than read: it is the only copy of the
 * cascade, it resolves paths that differ per harness, and nothing else in the
 * repo exercises it.
 *
 * Why the drift check inverted. The helpers used to be byte-copied into five
 * SKILL.md bodies, escaped as `\$1` because Claude Code substitutes bare `$N`
 * in a body on every load and eats the backslash. Codex substitutes nothing and
 * passes the escape through, so the same text bound the literal string `$1`
 * there and every jq path in the cascade missed — silently. No escaping
 * convention satisfies both harnesses, so the shell moved into a real file that
 * neither rewrites, and what these tests now enforce is that it stays there:
 * each marker block sources the script, defines nothing, and carries no
 * positional parameter in any form.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARED = path.join(HERE, '..');
const SKILLS = path.join(SHARED, '..', 'skills');
const CONFIG_SH = path.join(SHARED, 'config.sh');

const START_PREFIX = '# --- solopreneur config helpers';
const END = '# --- end solopreneur config helpers ---';

/** The marked block, dedented, with each line's trailing whitespace removed. */
function extractBlock(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.trim().startsWith(START_PREFIX));
  const e = lines.findIndex((l) => l.trim() === END);
  assert.ok(s !== -1 && e > s, `${file}: missing or inverted helper-block markers`);
  const indent = lines[s].length - lines[s].trimStart().length;
  return lines.slice(s, e + 1).map((l) => l.slice(indent).trimEnd());
}

/** Every skill that uses the helpers. Adding one here is the point. */
const CONSUMERS = ['greenlight', 'merge-pr', 'worktree-handoff', 'todos-babysit', 'todos-cleanup'];

// --- drift ---------------------------------------------------------------

for (const skill of CONSUMERS) {
  test(`${skill} sources config.sh instead of defining the helpers`, () => {
    const block = extractBlock(path.join(SKILLS, skill, 'SKILL.md'));

    // The relative path, not merely the word `source`: a block that sources a
    // path which has rotted would otherwise pass every structural check.
    assert.ok(
      block.some((l) => l.startsWith('source ') && l.includes('/../../shared/config.sh')),
      `${skill}/SKILL.md must source "…/../../shared/config.sh" inside the marker block`);

    // A re-inlined helper is the regression this whole refactor exists to
    // prevent — it would drag `$N` back into a skill body with it.
    const defs = block.filter((l) => /^[a-z_]+\(\)/.test(l));
    assert.deepEqual(defs, [],
      `${skill}/SKILL.md re-inlines helper definitions; source shared/config.sh instead`);

    // No positional parameter in any form — bare, escaped, or braced. This is
    // the measurable bar: the two harnesses cannot agree on what it means.
    const positional = block.filter((l) => /\\?\$\{?[0-9@*]/.test(l));
    assert.deepEqual(positional, [],
      `${skill}/SKILL.md carries a positional parameter in its config block`);
  });
}

test('config.md documents the source instruction, not a copyable helper block', () => {
  const md = fs.readFileSync(path.join(SHARED, 'config.md'), 'utf8');
  assert.ok(md.includes('/../../shared/config.sh'),
    'config.md must show the source instruction consumers carry');
  assert.ok(!/^solopreneur_repo_key\(\)/m.test(md),
    'config.md must not carry a second copy of the helper definitions — config.sh is the implementation');
});

// --- behaviour -----------------------------------------------------------

let tmpRoot;

/**
 * A fake HOME plus a stable working directory. The cwd has to be stable across
 * every call in one test: with no git repo, `solopreneur_repo_key` falls back
 * to $PWD, so a fresh cwd per call would silently change the repo key between
 * the write and the assertion.
 */
function sandbox(files) {
  tmpRoot ??= fs.mkdtempSync(path.join(os.tmpdir(), 'solo-cfg-'));
  const home = fs.mkdtempSync(path.join(tmpRoot, 'home-'));
  const cwd = fs.mkdtempSync(path.join(tmpRoot, 'cwd-'));
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(home, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof body === 'string' ? body : JSON.stringify(body));
  }
  return { home, cwd };
}

/**
 * Source config.sh and run `script`, with HOME pointed at a sandbox and the
 * real session's harness variables cleared — otherwise the machine running the
 * tests decides which branch is taken.
 */
function run(script, { home, cwd, env = {} }) {
  return execFileSync('bash', ['-c', `source ${JSON.stringify(CONFIG_SH)}\n${script}`], {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: home,
      CLAUDE_CONFIG_DIR: '',
      CODEX_HOME: '',
      CODEX_THREAD_ID: '',
      ...env,
    },
  }).trim();
}

test('config.sh is valid bash', () => {
  execFileSync('bash', ['-n', CONFIG_SH]);
});

test('a Claude session writes to the Claude home', () => {
  const box = sandbox({});
  assert.equal(run('solopreneur_config_home', box), `${box.home}/.claude`);
  assert.equal(
    run('solopreneur_config_home', { ...box, env: { CLAUDE_CONFIG_DIR: `${box.home}/custom` } }),
    `${box.home}/custom`);
});

test('a Codex session writes to the Codex home', () => {
  const box = sandbox({});
  // CODEX_THREAD_ID is what identifies the harness; CODEX_HOME only relocates it.
  assert.equal(
    run('solopreneur_config_home', { ...box, env: { CODEX_THREAD_ID: 't_1' } }),
    `${box.home}/.codex`);
  assert.equal(
    run('solopreneur_config_home', {
      ...box,
      env: { CODEX_THREAD_ID: 't_1', CODEX_HOME: `${box.home}/agents/codex` },
    }),
    `${box.home}/agents/codex`);
});

test('a Claude session prefers the Claude home over the Codex one', () => {
  const box = sandbox({
    '.claude/solopreneur.json': { default: { todos: { backlog: 'from-claude' } } },
    '.codex/solopreneur.json': { default: { todos: { backlog: 'from-codex' } } },
  });
  assert.equal(run('read_solopreneur_config todos | jq -r .backlog', box), 'from-claude');
});

test('a Codex session prefers the Codex home over the Claude one', () => {
  const box = sandbox({
    '.claude/solopreneur.json': { default: { todos: { backlog: 'from-claude' } } },
    '.codex/solopreneur.json': { default: { todos: { backlog: 'from-codex' } } },
  });
  assert.equal(
    run('read_solopreneur_config todos | jq -r .backlog',
      { ...box, env: { CODEX_THREAD_ID: 't_1' } }),
    'from-codex');
});

test('a key present only in the other harness home is still found', () => {
  // This is the point of searching every home rather than detecting one: a
  // value configured under Claude stays readable from Codex and vice versa.
  const box = sandbox({
    '.claude/solopreneur.json': { default: { todos: { backlog: 'x' } } },
    '.codex/solopreneur.json': { default: { greenlight: { fallback_order: ['codex-cli'] } } },
  });
  assert.equal(
    run("read_solopreneur_config greenlight | jq -r '.fallback_order[0]'", box),
    'codex-cli');
});

test('repo scope outranks default, and default outranks the legacy flat key', () => {
  const box = sandbox({});
  const repoKey = run('solopreneur_repo_key', box);
  fs.mkdirSync(path.join(box.home, '.claude'), { recursive: true });
  const write = (obj) =>
    fs.writeFileSync(path.join(box.home, '.claude/solopreneur.json'), JSON.stringify(obj));

  write({ todos: { backlog: 'legacy' } });
  assert.equal(run('read_solopreneur_config todos | jq -r .backlog', box), 'legacy');

  write({ todos: { backlog: 'legacy' }, default: { todos: { backlog: 'default' } } });
  assert.equal(run('read_solopreneur_config todos | jq -r .backlog', box), 'default');

  write({
    todos: { backlog: 'legacy' },
    default: { todos: { backlog: 'default' } },
    repos: { [repoKey]: { todos: { backlog: 'repo' } } },
  });
  assert.equal(run('read_solopreneur_config todos | jq -r .backlog', box), 'repo');
});

test('home order outranks scope: a nearer default beats a farther repo entry', () => {
  // The documented cascade is per home — repo scope, then default, then move on
  // — and that stays true once there are three homes. A repo-scoped value in a
  // farther home does NOT jump ahead of a default in a nearer one.
  //
  // The alternative (all repo layers across all homes first) was considered and
  // rejected: cross-home reading exists so a value configured under either
  // harness stays *reachable*, not so another harness's file can outrank the
  // one belonging to the harness you are running. One rule, uniformly applied,
  // also survives a fourth home without another precedence debate.
  const box = sandbox({
    'custom/solopreneur.json': { default: { other: 1 } },       // session home, no todos
    '.claude/solopreneur.json': { default: { todos: 'near-default' } },
    '.codex/solopreneur.json': { repos: { PLACEHOLDER: { todos: 'far-repo' } } },
  });
  const repoKey = run('solopreneur_repo_key', box);
  const codexFile = path.join(box.home, '.codex/solopreneur.json');
  fs.writeFileSync(codexFile, JSON.stringify({ repos: { [repoKey]: { todos: 'far-repo' } } }));

  assert.equal(
    run('read_solopreneur_config todos', { ...box, env: { CLAUDE_CONFIG_DIR: `${box.home}/custom` } }),
    'near-default');
});

test('a missing key reads as empty with a zero status, not as a failure', () => {
  // "nothing configured" is the common case, so a non-zero status here would
  // abort every caller running under `set -e`. `run` throws on non-zero, so
  // reaching the assertion at all is half the check.
  assert.equal(run('read_solopreneur_config nope', sandbox({})), '');
  assert.equal(
    run('read_solopreneur_config nope',
      sandbox({ '.claude/solopreneur.json': { default: {} } })),
    '');
  assert.equal(
    run('set -e; read_solopreneur_config nope; echo survived',
      sandbox({ '.claude/solopreneur.json': { default: { other: 1 } } })),
    'survived');
});

test('writes land in the running harness home and preserve siblings', () => {
  const box = sandbox({
    '.claude/solopreneur.json': { default: { todos: { backlog: 'keep' } } },
  });
  run("write_solopreneur_config greenlight '{fallback_order:[\"claude-cli\"]}'",
    { ...box, env: { CODEX_THREAD_ID: 't_1' } });

  const claude = JSON.parse(
    fs.readFileSync(path.join(box.home, '.claude/solopreneur.json'), 'utf8'));
  assert.deepEqual(claude.default.todos, { backlog: 'keep' },
    'the Codex write must not touch the Claude home');
  assert.equal(claude.default.greenlight, undefined);

  const codex = JSON.parse(
    fs.readFileSync(path.join(box.home, '.codex/solopreneur.json'), 'utf8'));
  assert.deepEqual(codex.default.greenlight, { fallback_order: ['claude-cli'] });
});

test('repo-scoped writes land under the repo key in the same home', () => {
  const box = sandbox({});
  const repoKey = run('solopreneur_repo_key', box);
  run("write_solopreneur_repo_config preview '{path:\"docs/preview\"}'", box);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(box.home, '.claude/solopreneur.json'), 'utf8'));
  assert.deepEqual(cfg.repos[repoKey].preview, { path: 'docs/preview' });
});
