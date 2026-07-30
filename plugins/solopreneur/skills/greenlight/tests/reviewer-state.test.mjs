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

const KEY = 'github.com/o/r';
const readBack = (dir) =>
  JSON.parse(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'));
const reviewersOf = (dir) => readBack(dir).repos[KEY].greenlight_reviewers;

/** A config with both the shell-owned `greenlight` and script-owned key. */
const CFG = ({ observed = {}, fallbackOrder = ['codex-bot'] } = {}) => ({
  default: { greenlight: { fallback_order: fallbackOrder } },
  repos: {
    [KEY]: {
      preview: { path: 'docs/preview' },
      greenlight: { fallback_order: fallbackOrder },
      greenlight_reviewers: { observed },
    },
    'github.com/other/repo': { greenlight: { fallback_order: ['gemini'] } },
  },
});

test('record creates greenlight_reviewers on a fresh config', () => {
  const dir = tmpConfigDir();
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.equal(code, 0);
  assert.deepEqual(reviewersOf(dir).observed['coderabbitai[bot]'], { auto: true });
});

test('record merges into an existing entry without dropping fields', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'cursor[bot]': { recipe: 'bugbot', auto: false } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'cursor[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.deepEqual(reviewersOf(dir).observed['cursor[bot]'], { recipe: 'bugbot', auto: true });
});

test('record writes triggerable:false for a reviewer that never answered', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'gemini-code-assist[bot]': { auto: false } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'gemini-code-assist[bot]', triggerable: false }] }),
    configDir: dir,
  });
  assert.equal(reviewersOf(dir).observed['gemini-code-assist[bot]'].triggerable, false);
});

test('record clears triggerable:false when the reviewer acts again', () => {
  // The one-way-door fix: a marked reviewer that produces an item (or is
  // deliberately retried in an attended run) gets triggerable:true written,
  // which resolve's `!== false` filter re-admits.
  const dir = tmpConfigDir(CFG({ observed: { 'gemini-code-assist[bot]': { triggerable: false } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'gemini-code-assist[bot]', triggerable: true }] }),
    configDir: dir,
  });
  assert.equal(reviewersOf(dir).observed['gemini-code-assist[bot]'].triggerable, true);
});

test('record stores an identify as a recipe on the observed login', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'mystery[bot]': { auto: true } } }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'mystery[bot]', recipe: 'bugbot' }] }),
    configDir: dir,
  });
  assert.deepEqual(reviewersOf(dir).observed['mystery[bot]'], { auto: true, recipe: 'bugbot' });
});

test('record never writes the shell-owned greenlight key', () => {
  // The whole reason observations live under their own feature key: the shell
  // helper replaces a feature subtree wholesale, and the five-layer read takes
  // the first layer that has the feature at all. Sharing one subtree means
  // either writer silently erases the other's work.
  const dir = tmpConfigDir(CFG({ fallbackOrder: ['codex-bot', 'codex-cli'] }));
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  const cfg = readBack(dir);
  assert.deepEqual(cfg.repos[KEY].greenlight, { fallback_order: ['codex-bot', 'codex-cli'] });
  assert.deepEqual(cfg.default.greenlight, { fallback_order: ['codex-bot', 'codex-cli'] });
});

test('record preserves sibling repos and sibling features', () => {
  const dir = tmpConfigDir(CFG());
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'coderabbitai[bot]', auto: true }] }),
    configDir: dir,
  });
  const cfg = readBack(dir);
  assert.deepEqual(cfg.repos['github.com/other/repo'], { greenlight: { fallback_order: ['gemini'] } });
  assert.deepEqual(cfg.repos[KEY].preview, { path: 'docs/preview' });
});

test('record rejects an observation with no login', () => {
  assertFailed(
    run(['record', '--repo-key', KEY], { stdin: JSON.stringify({ observations: [{ auto: true }] }) }),
    /login/i,
  );
});

test('record stores the canonical id when handed an alias', () => {
  // recipeFor accepts aliases, but fallback_order / --gate / --select all match
  // on recipe ids. Storing "cursor" verbatim passes validation and then matches
  // nothing downstream — the identified reviewer becomes unreachable.
  const dir = tmpConfigDir(CFG());
  run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'mystery[bot]', recipe: 'cursor' }] }),
    configDir: dir,
  });
  assert.equal(reviewersOf(dir).observed['mystery[bot]'].recipe, 'bugbot');
});

test('record rejects an unknown recipe in an observation', () => {
  assertFailed(
    run(['record', '--repo-key', KEY], {
      stdin: JSON.stringify({ observations: [{ login: 'x[bot]', recipe: 'nope' }] }),
    }),
    /nope/,
  );
});

test('record requires --repo-key', () => {
  assertFailed(run(['record'], { stdin: '{"observations":[]}' }), /repo-key/);
});

test('record on an empty payload leaves the file byte-identical', () => {
  const dir = tmpConfigDir(CFG({ observed: { 'cursor[bot]': { recipe: 'bugbot' } } }));
  const before = fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8');
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [] }), configDir: dir,
  });
  assert.equal(code, 0);
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), before);
});

test('record refuses to write when the config is malformed', () => {
  // The dangerous version of this bug: treat a parse error as "no config",
  // build {} plus the new entry, and rename it over the original. Every other
  // repo and every default.* feature would be gone, silently, exit 0.
  const broken = '{ "repos": { "github.com/o/r": { "greenlight": { } } },, }';
  const dir = tmpConfigDir(broken);
  assertFailed(
    run(['record', '--repo-key', KEY], {
      stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
      configDir: dir,
    }),
    /parse|malformed|invalid/i,
  );
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), broken,
    'the original file must survive untouched');
});

test('record refuses a config whose top level is not an object', () => {
  for (const bad of ['null', '[]', '"str"', '42']) {
    const dir = tmpConfigDir(bad);
    assertFailed(
      run(['record', '--repo-key', KEY], {
        stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
        configDir: dir,
      }),
      /object/i,
    );
    assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), bad);
  }
});

test('record refuses a non-object repos container instead of silently dropping the write', () => {
  // An array is the shape that fails OPEN: `repos ??= {}` keeps it, string keys
  // assigned to an array vanish in JSON.stringify, so record used to rewrite the
  // file, print the observation, and exit 0 having stored nothing.
  for (const bad of ['{"repos":[]}', '{"repos":{"github.com/o/r":[]}}']) {
    const dir = tmpConfigDir(bad);
    assertFailed(
      run(['record', '--repo-key', KEY], {
        stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
        configDir: dir,
      }),
      /must be a JSON object/i,
    );
    assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), bad,
      'the original file must survive untouched');
  }
});

test('record refuses a malformed greenlight_reviewers block', () => {
  // Same class as the repos containers: defaulting a block we cannot read to {}
  // means the next write silently replaces whatever was actually in there.
  const bad = [
    '{"repos":{"github.com/o/r":{"greenlight_reviewers":[]}}}',
    '{"repos":{"github.com/o/r":{"greenlight_reviewers":"nope"}}}',
    '{"repos":{"github.com/o/r":{"greenlight_reviewers":{"observed":[]}}}}',
  ];
  for (const cfg of bad) {
    const dir = tmpConfigDir(cfg);
    assertFailed(
      run(['record', '--repo-key', KEY], {
        stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
        configDir: dir,
      }),
      /must be a JSON object/i,
    );
    assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), cfg);
  }
});

test('record refuses a malformed per-login record', () => {
  // Spreading a scalar or an array yields character/index keys, so the merge
  // would "update" the entry by destroying it.
  const cfg = '{"repos":{"github.com/o/r":{"greenlight_reviewers":{"observed":{"x[bot]":[]}}}}}';
  const dir = tmpConfigDir(cfg);
  assertFailed(
    run(['record', '--repo-key', KEY], {
      stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
      configDir: dir,
    }),
    /observed\["x\[bot\]"\] must be a JSON object/i,
  );
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), cfg);
});

test('record accepts a null greenlight_reviewers as unset', () => {
  // The five-layer read treats null as "not set", so it must not be corruption.
  const dir = tmpConfigDir('{"repos":{"github.com/o/r":{"greenlight_reviewers":null}}}');
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.equal(code, 0);
  assert.deepEqual(reviewersOf(dir).observed['x[bot]'], { auto: true });
});

test('record refuses an existing but blank config', () => {
  // Only ENOENT means "no config". An existing empty file is a truncated write
  // — writeConfig only ever renames a complete temp file into place — so
  // treating it as {} would overwrite a config caught mid-recovery.
  for (const blank of ['', '   \n']) {
    const dir = tmpConfigDir(blank);
    assertFailed(
      run(['record', '--repo-key', KEY], {
        stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
        configDir: dir,
      }),
      /empty/i,
    );
    assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), blank);
  }
});

test('record treats an absent config as empty and creates it', () => {
  const dir = tmpDir();   // no solopreneur.json at all
  const { code } = run(['record', '--repo-key', KEY], {
    stdin: JSON.stringify({ observations: [{ login: 'x[bot]', auto: true }] }),
    configDir: dir,
  });
  assert.equal(code, 0);
  assert.equal(reviewersOf(dir).observed['x[bot]'].auto, true);
});

test('record rejects malformed stdin with a message naming the input', () => {
  assertFailed(run(['record', '--repo-key', KEY], { stdin: '{not json' }), /stdin/i);
});

const BOTS = (rows) => JSON.stringify({
  bots: rows.map((r) => (typeof r === 'string'
    ? { login: r, lastSeen: '2026-07-29T11:00:00Z', evidence: true }
    : { lastSeen: '2026-07-29T11:00:00Z', evidence: true, ...r })),
});

/** resolve with the required flags defaulted. */
function resolve(extra, { stdin, configDir } = {}) {
  return run(['resolve', '--repo-key', KEY, '--fallback-order', 'codex-bot', ...extra],
    { stdin, configDir });
}

const CODEX = 'chatgpt-codex-connector[bot]';
const RABBIT = 'coderabbitai[bot]';
const GEMINI = 'gemini-code-assist[bot]';

test('resolve merges detected bots with the cache', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { auto: true } } }));
  const { code, stdout } = resolve([], { stdin: BOTS([CODEX]), configDir: dir });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out.available.map((r) => r.id).sort(), [RABBIT, CODEX].sort());
});

test('resolve identifies a registry-known login with no config at all', () => {
  // The migration path: on a fresh config the three long-standing bots must be
  // full citizens immediately. An App's login is app-scoped, so the verified
  // knownLogins row applies on every repo with zero learning.
  const { stdout } = resolve([], { stdin: BOTS([RABBIT]) });
  const [bot] = JSON.parse(stdout).available;
  assert.equal(bot.recipe, 'coderabbit');
  assert.equal(bot.canGate, true);
});

test('resolve lets a cached identify override the registry mapping', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { recipe: 'bugbot' } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT]), configDir: dir });
  assert.equal(JSON.parse(stdout).available[0].recipe, 'bugbot');
});

test('resolve canonicalizes a cached alias so the gate still matches', () => {
  // Backward compatibility for a config written before record normalized, or
  // hand-edited with an alias: without this, --gate bugbot warns "not an
  // available gate candidate" about the very reviewer that was identified.
  const dir = tmpConfigDir(CFG({ observed: { 'mystery[bot]': { recipe: 'cursor' } } }));
  const { stdout } = run([
    'resolve', '--repo-key', KEY, '--fallback-order', 'bugbot', '--gate', 'bugbot',
  ], { stdin: BOTS(['mystery[bot]']), configDir: dir });
  const out = JSON.parse(stdout);
  assert.equal(out.available[0].recipe, 'bugbot');
  assert.equal(out.gate.recipe, 'bugbot');
  assert.deepEqual(out.warnings, [], 'an identified reviewer must not warn about its own gate');
});

test('resolve excludes triggerable:false', () => {
  const dir = tmpConfigDir(CFG({ observed: { [GEMINI]: { triggerable: false } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, GEMINI]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.available.map((r) => r.id), [RABBIT]);
  assert.ok(!out.collect.includes(GEMINI), 'a marked reviewer is never harvested for findings');
});

test('resolve reports a marked reviewer under its own key, with its recipe', () => {
  // The attended retry prompt lists these. They must carry a resolved recipe:
  // "retry gemini-code-assist[bot]" is only actionable if the caller knows which
  // registry row to re-trigger it from.
  const dir = tmpConfigDir(CFG({ observed: { [GEMINI]: { triggerable: false } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, GEMINI]), configDir: dir });
  assert.deepEqual(JSON.parse(stdout).marked, [
    { login: GEMINI, recipe: 'gemini', lastSeen: '2026-07-29T11:00:00Z' },
  ]);
});

test('resolve prompts when the only known reviewer is marked', () => {
  // Without `marked` in the condition this repo reports available:[] and
  // needsPrompt:false — no gate, and no question that could ever restore one.
  const dir = tmpConfigDir(CFG({ observed: { [CODEX]: { triggerable: false } } }));
  const { stdout } = resolve([], { stdin: BOTS([]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.available, []);
  assert.equal(out.gate, null);
  assert.equal(out.needsPrompt, true);
  assert.deepEqual(out.marked.map((r) => r.login), [CODEX]);
});

test('resolve drops an unidentified bot with no review evidence', () => {
  // dependabot shape. Without this it would be selected by default and its PR
  // description would enter the finding-processing loop as review feedback.
  const { stdout } = resolve([], {
    stdin: BOTS([{ login: 'dependabot[bot]', evidence: false }, CODEX]),
  });
  assert.deepEqual(JSON.parse(stdout).available.map((r) => r.id), [CODEX]);
});

test('resolve keeps an unidentified bot that has review evidence, but bars it from gating', () => {
  const { stdout } = resolve([], { stdin: BOTS([CODEX, 'brand-new[bot]']) });
  const out = JSON.parse(stdout);
  const fresh = out.available.find((r) => r.id === 'brand-new[bot]');
  assert.equal(fresh.recipe, null);
  assert.equal(fresh.canGate, false);
  assert.ok(out.collect.includes('brand-new[bot]'), 'its findings are still collected');
  assert.ok(!out.trigger.some((t) => t.login === 'brand-new[bot]'), 'but it is never triggered');
});

test('resolve admits an available local CLI and lets it gate', () => {
  const { stdout } = resolve(['--cli-available', 'codex-cli'], { stdin: BOTS([]) });
  const cli = JSON.parse(stdout).available.find((r) => r.kind === 'cli');
  assert.equal(cli.id, 'codex-cli');
  assert.equal(cli.canGate, true);
});

test('resolve marks a local CLI trigger with its kind so SKILL.md can branch', () => {
  const { stdout } = resolve(['--cli-available', 'codex-cli'], { stdin: BOTS([]) });
  const t = JSON.parse(stdout).trigger.find((x) => x.recipe === 'codex-cli');
  assert.equal(t.kind, 'local-cli');
});

test('resolve omits a non-gate auto reviewer from trigger but keeps it in collect', () => {
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { auto: true }, [CODEX]: { auto: false } } }));
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.trigger.map((t) => t.login), [CODEX]);
  assert.ok(out.collect.includes(RABBIT));
});

test('resolve always triggers the gate, auto or not', () => {
  // A clean signal needs an addressable response. Re-requesting a review from
  // an auto bot is harmless, so the gate is exempt from the auto exemption.
  const dir = tmpConfigDir(CFG({ observed: { [RABBIT]: { auto: true } } }));
  const { stdout } = resolve(['--gate', 'coderabbit'], { stdin: BOTS([RABBIT]), configDir: dir });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.login, RABBIT);
  assert.ok(out.trigger.some((t) => t.login === RABBIT), 'the auto gate is still triggered');
});

test('resolve attaches the gate’s own poll policy and handshake', () => {
  const { stdout } = resolve([], { stdin: BOTS([CODEX]) });
  const { gate } = JSON.parse(stdout);
  assert.equal(gate.recipe, 'codex-bot');
  assert.deepEqual(gate.poll, { firstWaitSec: 60, intervalSec: 60, tries: 20 });
  assert.equal(gate.handshake, 'reaction');
});

test('resolve trigger entries carry their handshake', () => {
  const { stdout } = resolve([], { stdin: BOTS([CODEX]) });
  const t = JSON.parse(stdout).trigger.find((x) => x.recipe === 'codex-bot');
  assert.equal(t.handshake, 'reaction');
});

test('resolve picks the gate from fallback-order, skipping unavailable entries', () => {
  const { stdout } = run([
    'resolve', '--repo-key', KEY, '--fallback-order', 'gemini,codex-bot',
  ], { stdin: BOTS([RABBIT, CODEX]) });
  assert.equal(JSON.parse(stdout).gate.recipe, 'codex-bot', 'gemini is not available here');
});

test('resolve degrades a stale --gate to the fallback ladder with a warning', () => {
  // A days-old autopilot descriptor may name a gate that has since been marked
  // unresponsive. Failing hard would leave an unattended run with nothing.
  const { code, stdout } = resolve(['--gate', 'bugbot'], { stdin: BOTS([CODEX]) });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'codex-bot');
  assert.ok(out.warnings.some((w) => w.includes('bugbot')), 'names the stale gate');
});

test('resolve degrades a stale --select to the full set with a warning', () => {
  const { code, stdout } = resolve(['--select', 'greptile'], { stdin: BOTS([CODEX]) });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.deepEqual(out.collect, [CODEX], 'falls back to everything available');
  assert.ok(out.warnings.some((w) => w.includes('greptile')));
});

test('resolve leaves the gate unset when a configured ladder is exhausted', () => {
  // fallback_order is an authorization list, not a hint. Gating on a reviewer
  // the user never listed — and saying needsPrompt:false about it — would let an
  // unlisted bot's clean pass end the loop. Exhausted ladder is prompt-or-halt.
  const { code, stdout } = run([
    'resolve', '--repo-key', KEY, '--fallback-order', 'bugbot,greptile',
  ], { stdin: BOTS([RABBIT, CODEX]) });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.gate, null);
  assert.equal(out.needsPrompt, true, 'the caller must be told, not silently re-gated');
  assert.ok(out.warnings.some((w) => w.includes('bugbot')), 'names the unavailable ladder');
});

test('resolve still picks any available gate when no ladder was configured', () => {
  // The unconfigured case keeps its old behaviour — there is no authorization
  // list to overstep, so any gating candidate is a defensible default.
  const { stdout } = run(['resolve', '--repo-key', KEY, '--fallback-order', ''],
    { stdin: BOTS([RABBIT]) });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'coderabbit');
  assert.deepEqual(out.warnings, []);
});

test('resolve honours a valid --select subset', () => {
  const { stdout } = resolve(['--select', 'coderabbit'], { stdin: BOTS([RABBIT, CODEX]) });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.collect, [RABBIT]);
  assert.equal(out.gate.recipe, 'coderabbit', 'the gate stays inside the selection');
});

test('resolve degrades an unknown cached recipe instead of crashing', () => {
  // A registry row renamed in a later release, or a hand-edited config. The old
  // contract dereferenced recipeFor(...) directly and died with a TypeError on
  // every run, with no hint that one stale string was the cause.
  const dir = tmpConfigDir(CFG({ observed: { 'x[bot]': { recipe: 'retired-tool' } } }));
  const { code, stdout } = resolve([], { stdin: BOTS(['x[bot]']), configDir: dir });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.available.find((r) => r.id === 'x[bot]').recipe, null);
  assert.ok(out.warnings.some((w) => w.includes('retired-tool')), 'names the stale id');
});

test('resolve flags needsPrompt only when nothing can gate', () => {
  // Unidentified bots exist but none can close a round: the attended path asks
  // (identify / retry / add a CLI); the unattended path degrades.
  const { stdout } = resolve([], { stdin: BOTS([{ login: 'brand-new[bot]' }]) });
  assert.equal(JSON.parse(stdout).needsPrompt, true);
});

test('resolve does not prompt when fallback-order resolves a gate', () => {
  // The common case must stay silent, however many reviewers act here.
  const { stdout } = resolve([], { stdin: BOTS([RABBIT, CODEX, GEMINI, 'brand-new[bot]']) });
  const out = JSON.parse(stdout);
  assert.equal(out.needsPrompt, false);
  assert.equal(out.gate.recipe, 'codex-bot');
});

test('resolve seeds the default reviewer on a repo with no history at all', () => {
  // Detection is an enhancement, never a gate. Without a seed a first-use repo
  // resolves to trigger:[] and gate:null, and the loop — which now consumes only
  // those two — would post nothing and wait on nobody.
  const { code, stdout } = run(['resolve', '--repo-key', KEY, '--fallback-order', ''],
    { stdin: BOTS([]) });
  assert.equal(code, 0);
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'codex-bot');
  assert.equal(out.gate.login, CODEX);
  assert.deepEqual(out.trigger.map((t) => t.recipe), ['codex-bot']);
  assert.deepEqual(out.available, [], 'seeding is not an observation — nothing was seen here');
  assert.equal(out.needsPrompt, false);
  assert.ok(out.warnings.some((w) => w.includes('codex-bot')), 'the default is announced');
});

test('resolve seeds from fallback_order rather than always codex-bot', () => {
  const { stdout } = run(['resolve', '--repo-key', KEY, '--fallback-order', 'coderabbit,codex-bot'],
    { stdin: BOTS([]) });
  assert.equal(JSON.parse(stdout).gate.recipe, 'coderabbit');
});

test('an explicit --gate wins the seed on a repo with no history', () => {
  // This is the "try a tool with no history here" path: the user names a recipe
  // and its trigger goes out this round. Seeding the configured default instead
  // would post a different reviewer's trigger than the one just requested.
  const { stdout } = resolve(['--gate', 'greptile'], { stdin: BOTS([]) });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'greptile');
  assert.deepEqual(out.trigger.map((t) => t.triggerText), ['@greptileai']);
  assert.equal(out.gate.login, null, 'greptile has no verified login — triggerable, not attributable');
  assert.ok(!out.warnings.some((w) => w.includes('falling back')),
    'the request was honoured, so nothing fell back');
});

test('an explicit --select seeds the requested tool too', () => {
  const { stdout } = resolve(['--select', 'greptile'], { stdin: BOTS([]) });
  assert.equal(JSON.parse(stdout).gate.recipe, 'greptile');
});

test('a multi-reviewer --select seeds all of them, gating on the first', () => {
  // select=a,b means run both. Collapsing to one seed would halve coverage on
  // exactly the fresh-repo autopilot runs that bother to pass a selection.
  const { stdout } = resolve(['--select', 'coderabbit,codex-bot'], { stdin: BOTS([]) });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.trigger.map((t) => t.recipe), ['coderabbit', 'codex-bot']);
  assert.equal(out.gate.recipe, 'coderabbit', 'one reviewer closes the round');
  assert.deepEqual(out.collect, [RABBIT, CODEX], 'both are harvested for findings');
});

test('a seeded gate stays inside an explicit selection', () => {
  // select is an authorization list on the seeded path too. Seeding a gate the
  // caller excluded would let an unlisted reviewer's clean pass end the loop —
  // the very thing a repo WITH history refuses to do.
  const { stdout } = resolve(['--select', 'coderabbit', '--gate', 'codex-bot'], { stdin: BOTS([]) });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'coderabbit');
  assert.deepEqual(out.trigger.map((t) => t.recipe), ['coderabbit']);
  assert.ok(out.warnings.some((w) => w.includes('codex-bot')), 'the excluded gate is reported');
});

test('resolve warns when only PART of a selection is available', () => {
  // The silent-coverage-loss case: one live reviewer plus one that was never
  // here reads exactly like a fully honoured selection without this.
  const { stdout } = resolve(['--select', 'coderabbit,gemini'], { stdin: BOTS([RABBIT]) });
  const out = JSON.parse(stdout);
  assert.deepEqual(out.collect, [RABBIT]);
  assert.ok(out.warnings.some((w) => w.includes('gemini')), 'names the reviewer not running');
});

test('an unseedable --select says so instead of silently using the default', () => {
  // A local CLI cannot be seeded: availability comes from its own gate, never
  // from being asked for. Falling back is right; doing it silently is not.
  const { stdout } = resolve(['--select', 'codex-cli'], { stdin: BOTS([]) });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'codex-bot');
  assert.ok(out.warnings.some((w) => w.includes('codex-cli') && w.includes('--select')),
    'the unmet selection is named');
});

test('a --gate naming a local CLI still degrades to the configured seed', () => {
  // Only a github-bot can be seeded: a CLI's availability comes from its own
  // gate, and claiming one is present because it was asked for would be a lie.
  const { stdout } = resolve(['--gate', 'codex-cli'], { stdin: BOTS([]) });
  const out = JSON.parse(stdout);
  assert.equal(out.gate.recipe, 'codex-bot');
  assert.ok(out.warnings.some((w) => w.includes('codex-cli')), 'the unmet request is announced');
});

test('resolve does not seed when a reviewer is known but cannot gate', () => {
  // An unidentified bot acts here: that is the attended prompt's case (identify
  // it), not a case for silently defaulting to some other tool.
  const { stdout } = resolve([], { stdin: BOTS([{ login: 'brand-new[bot]' }]) });
  const out = JSON.parse(stdout);
  assert.equal(out.gate, null);
  assert.equal(out.needsPrompt, true);
});

test('resolve reports gate:null with exit 0 when nothing can gate', () => {
  const { code, stdout } = resolve([], { stdin: BOTS([{ login: 'brand-new[bot]' }]) });
  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout).gate, null);
});

test('resolve requires --repo-key and --fallback-order', () => {
  assertFailed(run(['resolve', '--fallback-order', 'codex-bot'], { stdin: BOTS([]) }), /repo-key/);
  assertFailed(run(['resolve', '--repo-key', KEY], { stdin: BOTS([]) }), /fallback-order/);
});

test('resolve fails closed on the same malformed containers record rejects', () => {
  // The read path shares one validator with the write path, so a shape that is
  // fatal for record cannot be silently read as "no cache" here — that would
  // pick a reviewer on evidence the config never actually contained.
  const bad = [
    '{"repos":[]}',
    '{"repos":{"github.com/o/r":[]}}',
    '{"repos":{"github.com/o/r":{"greenlight_reviewers":{"observed":{"x[bot]":"nope"}}}}}',
  ];
  for (const cfg of bad) {
    assertFailed(resolve([], { stdin: BOTS([CODEX]), configDir: tmpConfigDir(cfg) }),
      /must be a JSON object/i);
  }
});

test('resolve never writes to the config', () => {
  const dir = tmpConfigDir(CFG({ observed: { [CODEX]: { auto: false } } }));
  const before = fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8');
  resolve([], { stdin: BOTS([CODEX, 'brand-new[bot]']), configDir: dir });
  assert.equal(fs.readFileSync(path.join(dir, 'solopreneur.json'), 'utf8'), before);
});
