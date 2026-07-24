/**
 * Tests for scripts/config-resolve.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * Every case spawns the real CLI with a fully controlled environment — HOME
 * points at an empty fixture directory, and CLAUDE_CONFIG_DIR /
 * SOLOPRENEUR_CONFIG are absent unless a test sets them. That keeps the run
 * hermetic (the developer's own config can never leak in) and exercises the
 * contract callers actually depend on: exit code, stdout shape, stderr text.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'config-resolve.mjs',
);

const fixtures = [];
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A fresh fixture root. realpath'd on creation because macOS `os.tmpdir()`
 * returns a path under the /var -> /private/var symlink, while the resolver
 * reports physical paths — without this every path assertion would fail there.
 */
function tmp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-config-')));
  fixtures.push(dir);
  // The walk-up runs to `/`, so a `.solopreneur.json` above the temp directory
  // would silently change what the `mode=none` and `mode=legacy` cases resolve
  // to. Harmless on macOS (/var/folders/...), but some Linux CI images put
  // TMPDIR under $HOME — exactly where this feature tells users to put one.
  // Assert it here so the failure names the cause instead of looking like a
  // resolver bug.
  for (let d = dir; ; d = path.dirname(d)) {
    assert.ok(
      !fs.existsSync(path.join(d, '.solopreneur.json')),
      `TMPDIR sits under a configured preview scope (${d}) — set TMPDIR elsewhere`,
    );
    if (path.dirname(d) === d) break;
  }
  return dir;
}

function mkdirp(...parts) {
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/** The documented minimal generic config, with `preview` overridable per test. */
function v2(project, overrides = {}) {
  return {
    schemaVersion: 2,
    preview: {
      root: './previews',
      defaultTarget: 'private',
      collections: {
        active: { path: 'active', label: 'Previews' },
        archive: { path: 'archive', label: 'Archive' },
      },
      targets: {
        private: {
          provider: 'vercel',
          project,
          visibility: 'private',
          include: ['active', 'archive'],
        },
      },
      ...overrides,
    },
  };
}

function run(args, { cwd, home = tmp(), env = {} } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: cwd ?? home,
    env: { PATH: process.env.PATH, HOME: home, ...env },
    encoding: 'utf8',
  });
}

function runJson(args, options) {
  const result = run(['--json', ...args], options);
  assert.equal(result.status, 0, `expected success, got stderr:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

/**
 * A clean, reported failure: exit 1 and nothing on stdout. Checked exactly
 * rather than as "non-zero", which a crash or a signal death would also satisfy.
 */
function assertFailed(result) {
  assert.equal(result.signal, null, `killed by signal ${result.signal}`);
  assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stderr:\n${result.stderr}`);
  assert.equal(result.stdout.trim(), '');
}

// --- layer 1: explicit $SOLOPRENEUR_CONFIG ---------------------------------

test('$SOLOPRENEUR_CONFIG wins over an ancestor config', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('ancestor-project'));
  mkdirp(repo, 'previews');

  const other = mkdirp(root, 'elsewhere');
  const explicit = writeJson(path.join(other, '.solopreneur.json'), v2('explicit-project'));
  mkdirp(other, 'previews');

  const out = runJson([], { cwd: repo, env: { SOLOPRENEUR_CONFIG: explicit } });
  assert.equal(out.mode, 'v2');
  assert.equal(out.configPath, explicit);
  assert.equal(out.target.project, 'explicit-project');
});

test('$SOLOPRENEUR_CONFIG pointing at a missing file errors, never falls through', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  // A usable ancestor config sits right here; the explicit pointer still wins,
  // and a broken explicit pointer must be reported rather than quietly ignored.
  writeJson(path.join(repo, '.solopreneur.json'), v2('ancestor-project', { root: '.' }));
  const missing = path.join(root, 'no-such-config.json');

  const result = run(['--json'], { cwd: repo, env: { SOLOPRENEUR_CONFIG: missing } });
  assertFailed(result);
  assert.ok(result.stderr.includes(missing), result.stderr);
});

test('$SOLOPRENEUR_CONFIG without a preview block errors, never falls through', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('ancestor-project', { root: '.' }));
  const explicit = writeJson(path.join(root, 'other.json'), { schemaVersion: 2 });

  const result = run(['--json'], { cwd: repo, env: { SOLOPRENEUR_CONFIG: explicit } });
  assertFailed(result);
  assert.ok(result.stderr.includes(explicit), result.stderr);
  assert.ok(result.stderr.includes('preview'), result.stderr);
});

test('a symlinked $SOLOPRENEUR_CONFIG resolves root the same way the walk-up would', () => {
  const root = tmp();
  const real = mkdirp(root, 'real');
  const target = writeJson(path.join(real, '.solopreneur.json'), v2('link-project'));
  const declared = mkdirp(root, 'declared');
  const link = path.join(declared, '.solopreneur.json');
  fs.symlinkSync(target, link);
  mkdirp(declared, 'previews');
  mkdirp(real, 'previews');

  // A relative root resolves against the directory of the file that DECLARED
  // it. Realpathing the config here would rebase it onto the link target's
  // directory, so naming the same file explicitly would answer differently
  // from finding it by walking up.
  const out = runJson([], { cwd: declared, env: { SOLOPRENEUR_CONFIG: link } });
  const viaWalkUp = runJson(['--from', path.join(declared, 'previews')]);
  assert.equal(out.root, path.join(declared, 'previews'));
  assert.equal(out.root, viaWalkUp.root);
});

// --- layer 2: ancestor walk-up ---------------------------------------------

test('the nearest ancestor config wins over a farther one', () => {
  const root = tmp();
  writeJson(path.join(root, '.solopreneur.json'), v2('outer-project', { root: '.' }));
  const inner = mkdirp(root, 'a', 'b');
  writeJson(path.join(inner, '.solopreneur.json'), v2('inner-project', { root: '.' }));
  const anchor = mkdirp(inner, 'previews', 'item');

  const out = runJson(['--from', anchor]);
  assert.equal(out.configPath, path.join(inner, '.solopreneur.json'));
  assert.equal(out.target.project, 'inner-project');
});

test('a .solopreneur.json with no preview block is skipped during walk-up', () => {
  const root = tmp();
  writeJson(path.join(root, '.solopreneur.json'), v2('outer-project', { root: '.' }));
  const mid = mkdirp(root, 'mid');
  // Configures a different feature entirely — must not stop the walk.
  writeJson(path.join(mid, '.solopreneur.json'), { schemaVersion: 2, todos: { backlog: 'todos/backlog' } });
  const anchor = mkdirp(mid, 'sub');

  const out = runJson(['--from', anchor]);
  assert.equal(out.configPath, path.join(root, '.solopreneur.json'));
  assert.equal(out.target.project, 'outer-project');
});

test('walk-up crosses a nested .git boundary', () => {
  const root = tmp();
  writeJson(path.join(root, '.solopreneur.json'), v2('outer-project', { root: '.' }));
  const nested = mkdirp(root, 'nested-repo');
  mkdirp(nested, '.git');
  const anchor = mkdirp(nested, 'docs');

  const out = runJson(['--from', anchor]);
  assert.equal(out.configPath, path.join(root, '.solopreneur.json'));
});

test('a symlinked anchor resolves to the same config as its physical path', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('physical-project', { root: '.' }));
  const real = mkdirp(repo, 'previews', 'item');
  // The link lives outside the repo: without realpath the walk-up from here
  // would find no config at all.
  const link = path.join(mkdirp(root, 'links'), 'item');
  fs.symlinkSync(real, link, 'dir');

  const viaLink = runJson(['--from', link]);
  const viaReal = runJson(['--from', real]);
  assert.deepEqual(viaLink, viaReal);
  assert.equal(viaLink.configPath, path.join(repo, '.solopreneur.json'));
});

// --- path rules ------------------------------------------------------------

test('a relative root resolves against the config directory, not cwd', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('rel-project'));
  const anchor = mkdirp(repo, 'previews', 'item');
  // A decoy `previews/` under the working directory: if the root were resolved
  // against cwd, this is what it would point at.
  const decoyCwd = mkdirp(root, 'somewhere-else');
  const decoy = mkdirp(decoyCwd, 'previews');

  const out = runJson(['--from', anchor], { cwd: decoyCwd });
  assert.equal(out.root, path.join(repo, 'previews'));
});

test('an absolute root is honored as-is', () => {
  const root = tmp();
  // The root deliberately differs from the config file's own directory, so a
  // pass proves the absolute value was used verbatim rather than joined.
  const store = mkdirp(root, 'content-store');
  writeJson(path.join(root, '.solopreneur.json'), v2('abs-project', { root: store }));
  const anchor = mkdirp(store, 'active');

  const out = runJson(['--from', anchor]);
  assert.equal(out.root, store);
});

test('--from outside the resolved root fails and names the root', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = writeJson(path.join(repo, '.solopreneur.json'), v2('outside-project'));
  mkdirp(repo, 'previews');
  const outside = mkdirp(repo, 'elsewhere');

  const result = run(['--json', '--from', outside]);
  assertFailed(result);
  assert.ok(result.stderr.includes(path.join(repo, 'previews')), result.stderr);
  assert.ok(result.stderr.includes(config), result.stderr);
});

test('a file --from anchors at its directory', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('file-anchor-project', { root: '.' }));
  const dir = mkdirp(repo, 'previews', 'item');
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, '<!doctype html>\n');

  // A content source path is what callers hand this, and that is often a file.
  assert.deepEqual(runJson(['--from', file]), runJson(['--from', dir]));
});

test('a --from path that does not exist is reported, not silently walked', () => {
  const result = run(['--from', path.join(tmp(), 'no-such-dir')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('does not exist'), result.stderr);
});

// --- validation failures ---------------------------------------------------

test('malformed JSON exits non-zero naming the file and never falls through', () => {
  const root = tmp();
  // A perfectly good ancestor config: the run must NOT silently use it.
  writeJson(path.join(root, '.solopreneur.json'), v2('ancestor-project', { root: '.' }));
  const repo = mkdirp(root, 'repo');
  const broken = path.join(repo, '.solopreneur.json');
  fs.writeFileSync(broken, '{ "schemaVersion": 2, "preview": {');
  const anchor = mkdirp(repo, 'sub');

  const result = run(['--json', '--from', anchor]);
  assertFailed(result);
  assert.ok(result.stderr.includes(broken), result.stderr);
});

test('a .solopreneur.json that is not an object errors, never falls through', () => {
  const root = tmp();
  writeJson(path.join(root, '.solopreneur.json'), v2('ancestor-project', { root: '.' }));
  const repo = mkdirp(root, 'repo');
  const notAnObject = path.join(repo, '.solopreneur.json');
  // Valid JSON, but nothing a config can be. It must not be mistaken for "a
  // config for some other feature" and stepped over.
  fs.writeFileSync(notAnObject, 'null\n');

  const result = run(['--json', '--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes(notAnObject), result.stderr);
});

test('two targets exit non-zero (v1 supports one)', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('first-project', { root: '.' });
  config.preview.targets.second = {
    provider: 'vercel', project: 'second-project', visibility: 'private', include: ['active'],
  };
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('exactly one target'), result.stderr);
});

test('a non-vercel provider exits non-zero', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('other-project', { root: '.' });
  config.preview.targets.private.provider = 'netlify';
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('vercel'), result.stderr);
});

test('a defaultTarget naming no declared target exits non-zero', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('p', { root: '.', defaultTarget: 'public' }));

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('defaultTarget'), result.stderr);
});

test('an include entry with no declared collection exits non-zero', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('p', { root: '.' });
  config.preview.targets.private.include = ['active', 'nope'];
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('nope'), result.stderr);
});

test('an include entry inherited from Object.prototype is still rejected', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('p', { root: '.' });
  // `"constructor" in collections` is true via the prototype chain, so an
  // own-property check is what makes this fail.
  config.preview.targets.private.include = ['active', 'constructor'];
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('constructor'), result.stderr);
});

test('an extra collection is validated like the named ones', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('p', { root: '.' });
  config.preview.collections.docs = 'not-a-collection';
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('docs'), result.stderr);
});

test('a directory whose name starts with .. is inside the root', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('dotdot-project'));
  // `path.relative` returns "..draft/item" here, which a plain startsWith('..')
  // would read as an escape.
  const anchor = mkdirp(repo, 'previews', '..draft', 'item');

  const out = runJson(['--from', anchor]);
  assert.equal(out.root, path.join(repo, 'previews'));
});

test('a wrong schemaVersion exits non-zero', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('p', { root: '.' });
  config.schemaVersion = 3;
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('schemaVersion'), result.stderr);
});

test('an out-of-enum visibility exits non-zero', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('p', { root: '.' });
  config.preview.targets.private.visibility = 'Public';
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes('visibility'), result.stderr);
});

// --- schema ----------------------------------------------------------------

test('the schema accepts a minimal generic config', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('my-private-previews', { root: '.' }));

  const out = runJson(['--from', mkdirp(repo, 'sub')]);
  assert.equal(out.mode, 'v2');
  assert.equal(out.target.project, 'my-private-previews');
  assert.deepEqual(Object.keys(out.collections), ['active', 'archive']);
});

test('the schema rejects a config missing preview.root', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('no-root-project');
  delete config.preview.root;
  const file = writeJson(path.join(repo, '.solopreneur.json'), config);

  const result = run(['--from', mkdirp(repo, 'sub')]);
  assertFailed(result);
  assert.ok(result.stderr.includes(file), result.stderr);
  assert.ok(result.stderr.includes('preview.root'), result.stderr);
});

test('an omitted visibility resolves to private', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  const config = v2('default-visibility-project', { root: '.' });
  delete config.preview.targets.private.visibility;
  writeJson(path.join(repo, '.solopreneur.json'), config);

  const out = runJson(['--from', mkdirp(repo, 'sub')]);
  assert.equal(out.target.visibility, 'private');
});

// --- layers 3-5 ------------------------------------------------------------

test('the user-global v2 config is used when no ancestor has one', () => {
  const home = tmp();
  const store = mkdirp(home, 'previews');
  writeJson(
    path.join(home, '.config', 'solopreneur', 'config.json'),
    v2('global-project', { root: store }),
  );

  const out = runJson([], { home, cwd: mkdirp(tmp(), 'work') });
  assert.equal(out.mode, 'v2');
  assert.equal(out.configPath, path.join(home, '.config', 'solopreneur', 'config.json'));
  assert.equal(out.root, store);
});

test('legacy default.preview.projects is reported as mode=legacy, not converted', () => {
  const home = tmp();
  const legacy = writeJson(path.join(home, '.claude', 'solopreneur.json'), {
    default: { preview: { projects: { default: 'scratch', keep: 'kept' }, autoProtect: true } },
    repos: { 'github.com/owner/repo': { preview: { path: 'docs/preview' } } },
  });

  const out = runJson(['--from', mkdirp(tmp(), 'work')], { home });
  assert.equal(out.mode, 'legacy');
  assert.equal(out.configPath, legacy);
  assert.equal(out.legacy.length, 1);
  assert.equal(out.legacy[0].file, legacy);
  assert.equal(out.legacy[0].values.default.projects.keep, 'kept');
  assert.equal(out.legacy[0].values.default.autoProtect, true);
  assert.equal(out.legacy[0].values.repos['github.com/owner/repo'].path, 'docs/preview');
  // Nothing is synthesized from a legacy file.
  assert.equal(out.root, null);
  assert.equal(out.target, null);
  assert.equal(out.collections, null);
});

test('legacy flat preview.paths is reported as mode=legacy', () => {
  const configDir = tmp();
  const legacy = writeJson(path.join(configDir, 'solopreneur.json'), {
    preview: { paths: { 'github.com/owner/repo': 'docs/preview' } },
  });

  const out = runJson(['--from', mkdirp(tmp(), 'work')], { env: { CLAUDE_CONFIG_DIR: configDir } });
  assert.equal(out.mode, 'legacy');
  assert.equal(out.configPath, legacy);
  assert.equal(out.legacy[0].values.preview.paths['github.com/owner/repo'], 'docs/preview');
});

test('both legacy files are reported, matching how deploy.sh cascades them', () => {
  // deploy.sh reads $CLAUDE_CONFIG_DIR and ~/.claude per key, so values in the
  // second file are in effect too. Reporting only the first would hide them
  // from the migrator.
  const home = tmp();
  const configDir = tmp();
  const primary = writeJson(path.join(configDir, 'solopreneur.json'), {
    default: { preview: { projects: { default: 'from-ccd' } } },
  });
  const fallback = writeJson(path.join(home, '.claude', 'solopreneur.json'), {
    default: { preview: { projects: { keep: 'from-home' }, autoProtect: false } },
  });

  const out = runJson(['--from', mkdirp(tmp(), 'work')], { home, env: { CLAUDE_CONFIG_DIR: configDir } });
  assert.equal(out.mode, 'legacy');
  assert.equal(out.configPath, primary);
  assert.deepEqual(out.legacy.map((e) => e.file), [primary, fallback]);
  assert.equal(out.legacy[1].values.default.projects.keep, 'from-home');
  assert.equal(out.legacy[1].values.default.autoProtect, false);
});

test('a legacy file with no preview values is not reported as a preview config', () => {
  const home = tmp();
  writeJson(path.join(home, '.claude', 'solopreneur.json'), { default: { todos: { backlog: 'todos' } } });

  const out = runJson(['--from', mkdirp(tmp(), 'work')], { home });
  assert.equal(out.mode, 'none');
  assert.equal(out.configPath, null);
});

test('no config anywhere resolves to mode=none and exits 0', () => {
  const out = runJson(['--from', mkdirp(tmp(), 'work')]);
  assert.equal(out.mode, 'none');
  assert.equal(out.configPath, null);
  assert.equal(out.root, null);
});

// --- output shape ----------------------------------------------------------

test('--json output carries every documented key', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('shape-project', { root: '.' }));

  const out = runJson(['--from', mkdirp(repo, 'sub')]);
  for (const key of ['configPath', 'mode', 'root', 'defaultTarget', 'target', 'collections', 'legacy']) {
    assert.ok(key in out, `missing key: ${key}`);
  }
  assert.deepEqual(Object.keys(out.target).sort(),
    ['include', 'name', 'project', 'provider', 'visibility']);
});

test('without --json the same facts print one per line', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  writeJson(path.join(repo, '.solopreneur.json'), v2('lines-project', { root: '.' }));
  const anchor = mkdirp(repo, 'sub');

  const result = run(['--from', anchor]);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  for (const line of lines) assert.match(line, /^[\w.[\]]+=/);
  assert.ok(lines.includes('mode=v2'));
  assert.ok(lines.includes(`root=${repo}`));
  assert.ok(lines.includes(`configPath=${path.join(repo, '.solopreneur.json')}`));
  assert.ok(lines.includes('target.project=lines-project'));
  assert.ok(lines.includes('target.include=active,archive'));
});
