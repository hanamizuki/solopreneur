/**
 * Tests for scripts/config-migrate.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * Same hermetic contract as config-resolve.test.mjs: every case spawns the real
 * CLI with an environment built from nothing but PATH and a fixture HOME, so the
 * developer's own solopreneur.json can never decide an outcome. Two extra
 * variables keep git hermetic too — GIT_CONFIG_NOSYSTEM shuts out /etc/gitconfig
 * (where an `url.*.insteadOf` would rewrite the origin the repo key is derived
 * from), and GIT_CEILING_DIRECTORIES stops any walk-up at the temp root, so a
 * TMPDIR that happens to live inside a checkout cannot lend a fixture its repo.
 *
 * Fixtures `git init` the directory they migrate rather than trusting the temp
 * directory to sit outside every repo. That is what makes the repo key
 * deterministic: with no `origin` remote the key is the git toplevel path,
 * whatever TMPDIR happens to be on the machine running this.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, '..', 'scripts', 'config-migrate.mjs');
const RESOLVER = path.join(HERE, '..', 'scripts', 'config-resolve.mjs');
const TMP_ROOT = fs.realpathSync(os.tmpdir());

const fixtures = [];
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
});

/** A fresh fixture root, realpath'd — the CLI reports physical paths. */
function tmp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-migrate-')));
  fixtures.push(dir);
  // The resolver walks up to `/`, so a `.solopreneur.json` above the temp
  // directory would make every case refuse with "a v2 config already covers
  // this scope".
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

/** Run git for fixture setup, with no user or system config in scope. */
function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: '1' },
  });
  assert.equal(result.status, 0, `git ${args.join(' ')} failed:\n${result.stderr}`);
}

/** A minimal valid v2 config, for the cases that need one already in place. */
const v2 = (project, root = '.') => ({
  schemaVersion: 2,
  preview: {
    root,
    defaultTarget: 'private',
    collections: {
      active: { path: 'active', label: 'Previews' },
      archive: { path: 'archive', label: 'Archive' },
    },
    targets: {
      private: { provider: 'vercel', project, visibility: 'private', include: ['active', 'archive'] },
    },
  },
});

/**
 * A repo to migrate plus a legacy config in its own CLAUDE_CONFIG_DIR.
 * `origin` is optional: without one the repo key is the toplevel path, with one
 * it is the normalized `host/owner/repo`.
 */
function scenario(legacy, { origin } = {}) {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  git(repo, ['init', '-q', '-b', 'main']);
  if (origin) git(repo, ['remote', 'add', 'origin', origin]);
  const configDir = mkdirp(root, 'agent-config');
  return {
    root,
    repo,
    configDir,
    home: mkdirp(root, 'home'),
    legacyFile: writeJson(path.join(configDir, 'solopreneur.json'), legacy),
    dest: path.join(repo, '.solopreneur.json'),
    env: { CLAUDE_CONFIG_DIR: configDir },
  };
}

function run(args, { cwd, home = tmp(), env = {}, nodeArgs = [] } = {}) {
  return spawnSync(process.execPath, [...nodeArgs, SCRIPT, ...args], {
    cwd: cwd ?? home,
    env: {
      PATH: process.env.PATH,
      HOME: home,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CEILING_DIRECTORIES: TMP_ROOT,
      ...env,
    },
    encoding: 'utf8',
  });
}

/** Run the fixture's happy path, asserting success. */
function migrate(s, args) {
  const result = run(args, { cwd: s.repo, home: s.home, env: s.env });
  assert.equal(result.status, 0, `expected success, got stderr:\n${result.stderr}`);
  return result;
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

/**
 * Sorted `relative/path<TAB>bytes` listing of a tree, for proving a run changed
 * nothing. `.git` is skipped: it is fixture scaffolding, not migration output.
 */
function tree(dir, prefix = '') {
  const out = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name === '.git') continue;
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(`${rel}/`, ...tree(full, rel));
    else out.push(`${rel}\t${fs.statSync(full).size}`);
  }
  return out;
}

const backupsIn = (dir) => fs.readdirSync(dir).filter((name) => name.includes('.backup-'));
const tempsIn = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'));

test('git is available (every fixture below needs it)', () => {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0, 'git is required to run this suite');
});

// --- legacy shapes ---------------------------------------------------------

test('the three-bucket legacy shape migrates to one private target', () => {
  const s = scenario({
    default: {
      preview: { projects: { default: 'scratch', keep: 'kept', public: 'open' }, autoProtect: true },
    },
  });

  const out = migrate(s, ['--target-project', 'kept']);
  // Every bucket's project is offered, and the bucket names carry through only
  // as provenance — nothing ranks them.
  for (const project of ['scratch', 'kept', 'open']) {
    assert.ok(out.stdout.includes(project), `candidate missing: ${project}\n${out.stdout}`);
  }
  assert.ok(out.stdout.includes('"project": "kept"'), out.stdout);
  assert.ok(out.stdout.includes('"visibility": "private"'), out.stdout);
  // The `public` BUCKET appears in the echoed legacy values, as it should; what
  // must never appear is a public target.
  assert.ok(!out.stdout.includes('"visibility": "public"'), out.stdout);
});

test('a single-project legacy config is still not auto-selected', () => {
  const s = scenario({ default: { preview: { projects: { default: 'only-one' } } } });

  // One candidate is not a decision: the whole point is that the caller says so.
  const refused = run([], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(refused);
  assert.ok(refused.stderr.includes('only-one'), refused.stderr);

  const out = migrate(s, ['--target-project', 'only-one']);
  assert.ok(out.stdout.includes('"project": "only-one"'), out.stdout);
});

test('the flat preview.paths shape supplies the root', () => {
  // 4 of 5 real configs still carry this older shape, keyed by the normalized
  // origin URL — so this also exercises the git@host:owner/repo normalization.
  const s = scenario(
    { preview: { paths: { 'github.com/owner/repo': 'docs/preview' } } },
    { origin: 'git@github.com:owner/repo.git' },
  );

  const out = migrate(s, ['--target-project', 'fresh-previews']);
  assert.ok(out.stdout.includes('repo key: "github.com/owner/repo"'), out.stdout);
  assert.ok(out.stdout.includes('"root": "./docs/preview"'), out.stdout);
  // No projects anywhere in this shape, so there is nothing to check the chosen
  // name against — it has to be accepted as given.
  assert.ok(out.stdout.includes('"project": "fresh-previews"'), out.stdout);
});

test('the per-repo preview.path shape supplies the root', () => {
  const s = scenario({});
  // Keyed the way the layered shape does it. No origin remote, so the key is
  // the git toplevel path.
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'notes/previews' } } },
  });

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes('"root": "./notes/previews"'), out.stdout);
});

test('default.preview.path supplies the root when no per-repo entry does', () => {
  const s = scenario({ default: { preview: { path: 'docs/rfc', projects: { default: 'p' } } } });

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes('"root": "./docs/rfc"'), out.stdout);
});

test('a winning subtree without a path shadows a lower layer that has one', () => {
  // `read_solopreneur_config preview` returns the whole subtree from the first
  // layer that has one and never merges, so the legacy skill does not see this
  // flat path either. Un-shadowing it here would move the previews.
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    preview: { paths: { [s.repo]: 'shadowed' } },
  });

  const out = migrate(s, ['--target-project', 'p']);
  // It is still echoed in the legacy values — it just must not become the root.
  assert.ok(!out.stdout.includes('"root": "./shadowed"'), out.stdout);
  assert.ok(out.stdout.includes('"root": "./docs/preview"'), out.stdout);
  assert.ok(out.stdout.includes('carries no path'), out.stdout);
});

test('no legacy path anywhere falls back to the documented default', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes('"root": "./docs/preview"'), out.stdout);
  assert.ok(out.stdout.includes('does not exist yet'), 'a defaulted root that is absent is flagged');
});

test('a legacy root outside the repo is refused, not written inert', () => {
  // config-resolve.mjs finds the config by walking up from a content item, so a
  // config at the repo root is unreachable when the root lives elsewhere. The
  // old behavior wrote it and reported success anyway.
  const s = scenario({});
  const external = mkdirp(s.root, 'external');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: external } } },
  });

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('outside the repository'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a legacy path escaping the repo via .. is refused', () => {
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: '../escapes' } } },
  });

  const result = run(['--target-project', 'p'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('outside the repository'), result.stderr);
});

test('an in-repo symlink root pointing outside the repo is refused', () => {
  // Lexically `link` is under the repo, but it physically escapes — and the
  // resolver realpaths content, so a lexical-only check would pass here and
  // still write a config no walk-up can find.
  const s = scenario({});
  const outside = mkdirp(s.root, 'outside');
  fs.symlinkSync(outside, path.join(s.repo, 'link'), 'dir');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'link' } } },
  });

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('outside the repository'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a not-yet-existing root under a symlink pointing outside is refused', () => {
  // `link/new` where `link -> outside` and `new` does not exist yet: realpath of
  // the leaf throws ENOENT, so a naive fallback keeps the lexical in-repo path
  // and the containment check wrongly passes. Physicalizing the existing
  // ancestor catches it.
  const s = scenario({});
  const outside = mkdirp(s.root, 'outside');
  fs.symlinkSync(outside, path.join(s.repo, 'link'), 'dir');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'link/new' } } },
  });

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('outside the repository'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a nested v2 config already covering the root is refused', () => {
  // A `.solopreneur.json` with a preview block between the root and the repo
  // root is what the resolver finds first when walking up from content, so the
  // repo-root config would be inert. Resolving from cwd never walks down to it,
  // so the destination check alone cannot catch this.
  const s = scenario({});
  const previews = mkdirp(s.repo, 'docs', 'preview');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  // A pre-existing v2 config at docs/, nearer to the content than the repo root.
  const nested = writeJson(path.join(s.repo, 'docs', '.solopreneur.json'), v2('already-here'));
  mkdirp(previews, 'item');

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('nearer the content than the repo root'), result.stderr);
  assert.ok(result.stderr.includes(nested), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a nested v2 config is refused even when the root does not exist yet', () => {
  // docs/ exists (holds a preview config) but docs/preview does not — content
  // created there later would resolve to the nearer docs config, so the scan
  // must anchor at the deepest existing ancestor rather than skip a fresh root.
  const s = scenario({});
  mkdirp(s.repo, 'docs');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  writeJson(path.join(s.repo, 'docs', '.solopreneur.json'), v2('already-here'));

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('nearer the content'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a broken nested .solopreneur.json is refused, not silently stepped over', () => {
  // A malformed config between the root and the repo root is fatal to the
  // resolver, so content resolution would stop there — writing the repo-root
  // config anyway would report a success that never takes effect.
  const s = scenario({});
  const previews = mkdirp(s.repo, 'docs', 'preview');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  fs.writeFileSync(path.join(s.repo, 'docs', '.solopreneur.json'), '{ "preview": {');
  mkdirp(previews, 'item');

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('not valid JSON'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a .solopreneur.json without a preview block does not count as a nested shadow', () => {
  // The resolver skips such a file during walk-up (it configures another
  // feature), so it must not block the migration either.
  const s = scenario({});
  mkdirp(s.repo, 'docs', 'preview');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  writeJson(path.join(s.repo, 'docs', '.solopreneur.json'), { schemaVersion: 2, todos: { backlog: 'x' } });

  const out = migrate(s, ['--target-project', 'p', '--write']);
  assert.ok(out.stdout.includes(`wrote ${s.dest}`), out.stdout);
});

test('a dangling symlink in the root path is refused', () => {
  // `link -> outside` where `outside` is missing, root `link/x`: realpath throws
  // ENOENT on the link, but it is a real (dangling) component, not a missing
  // tail — stepping past it lexically would wrongly read as in-repo.
  const s = scenario({});
  fs.symlinkSync(path.join(s.root, 'nowhere'), path.join(s.repo, 'link'), 'dir');
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'link/x' } } },
  });

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('dangling symlink'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a root that is a regular file is rejected in the dry run, not just at --write', () => {
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  mkdirp(s.repo, 'docs');
  fs.writeFileSync(path.join(s.repo, 'docs', 'preview'), 'not a directory\n');

  // The dry run is the review surface — it must not show a proposal that only
  // fails after --write.
  const dry = run(['--target-project', 'p'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(dry);
  assert.ok(dry.stderr.includes('not a directory'), dry.stderr);
});

// --- autoProtect -----------------------------------------------------------

test('autoProtect true maps to visibility private', () => {
  const s = scenario({
    default: { preview: { projects: { default: 'p' }, autoProtect: true } },
  });

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes('"visibility": "private"'), out.stdout);
  assert.equal(out.stderr.trim(), '', `expected no warning, got:\n${out.stderr}`);
});

test('autoProtect false warns and still produces a private target', () => {
  const s = scenario({
    default: { preview: { projects: { default: 'p' }, autoProtect: false } },
  });

  const out = migrate(s, ['--target-project', 'p']);
  // The literal `false` has to survive the read (the `| values` semantics the
  // shell readers use), be surfaced on both surfaces, and change nothing.
  assert.ok(out.stdout.includes('autoProtect: false'), out.stdout);
  assert.ok(out.stdout.includes('WARNING'), out.stdout);
  assert.match(out.stderr, /warning/);
  assert.match(out.stderr, /autoProtect: false/);
  assert.ok(out.stderr.includes('private'), out.stderr);
  assert.ok(out.stdout.includes('"visibility": "private"'), out.stdout);
  assert.ok(!out.stdout.includes('"visibility": "public"'), out.stdout);
});

test('autoProtect cascades file by file, the way deploy.sh reads it', () => {
  const s = scenario({ repos: {} });
  // deploy.sh tries repos[<key>] then default WITHIN each file before moving to
  // the next, so the first file's `default` beats the second file's `repos`.
  // A key-major cascade would answer `true` here and silently drop the opt-out.
  const first = writeJson(path.join(s.root, 'first.json'), {
    default: { preview: { projects: { default: 'p' }, autoProtect: false } },
  });
  writeJson(s.legacyFile, { repos: { [s.repo]: { preview: { autoProtect: true } } } });

  const out = migrate(s, ['--legacy-config', first, '--target-project', 'p']);
  assert.ok(out.stdout.includes('autoProtect: false'), out.stdout);
  assert.match(out.stderr, /warning/);
});

test('an empty-string autoProtect falls through, as it does in the shell', () => {
  // deploy.sh captures jq's output into a shell variable and then tests
  // `[ -n "$out" ]`, so "" is not an answer there — it falls through to the
  // next layer. Treating it as an answer here would silently miss a real
  // opt-out and skip the warning that exists to surface it.
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' }, autoProtect: false } },
    repos: { [s.repo]: { preview: { autoProtect: '' } } },
  });

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes('autoProtect: false'), out.stdout);
  assert.match(out.stderr, /warning/);
});

// --- target selection ------------------------------------------------------

test('a missing --target-project exits non-zero and lists the candidates', () => {
  const s = scenario({
    default: { preview: { projects: { default: 'scratch', keep: 'kept' } } },
    repos: { 'github.com/owner/other': { preview: { projects: { default: 'other-scratch' } } } },
  });

  const result = run([], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('--target-project is required'), result.stderr);
  for (const project of ['scratch', 'kept', 'other-scratch']) {
    assert.ok(result.stderr.includes(project), `candidate missing: ${project}\n${result.stderr}`);
  }
  // The provenance is shown so the caller can tell the buckets apart themselves
  // (the bucket key is quoted, like every other config-derived value).
  assert.ok(result.stderr.includes('default.preview.projects."keep"'), result.stderr);
});

test('a --target-project outside the candidates is noted, not refused', () => {
  // The candidate list is a union across every repo in the file, so it cannot
  // be a whitelist: migrating THIS repo to a brand-new project is a normal
  // reason to run this, and a project belonging to an unrelated repo would
  // otherwise be the only "valid" choice.
  const s = scenario({
    default: { preview: { projects: { default: 'scratch' } } },
    repos: { 'github.com/owner/other': { preview: { projects: { default: 'other-project' } } } },
  });

  const out = migrate(s, ['--target-project', 'brand-new']);
  assert.ok(out.stdout.includes('"project": "brand-new"'), out.stdout);
  assert.ok(out.stdout.includes('NOTE'), out.stdout);
  // The names it does know are still listed, so a typo is visible next to it.
  assert.ok(out.stdout.includes('scratch'), out.stdout);
});

// --- dry run ---------------------------------------------------------------

test('the dry run reports everything and writes nothing', () => {
  const s = scenario({
    default: { preview: { projects: { default: 'scratch' }, autoProtect: true } },
  });
  const before = tree(s.root);

  const out = migrate(s, ['--target-project', 'scratch']);
  assert.ok(out.stdout.includes(s.legacyFile), 'the legacy file it read is named');
  assert.ok(out.stdout.includes(`destination: ${s.dest}`), out.stdout);
  // A real unified diff of the whole proposed file.
  assert.ok(out.stdout.includes('--- /dev/null'), out.stdout);
  assert.ok(out.stdout.includes(`+++ ${s.dest}`), out.stdout);
  assert.match(out.stdout, /@@ -0,0 \+1,\d+ @@/);
  assert.ok(out.stdout.includes('+  "schemaVersion": 2,'), out.stdout);
  assert.ok(out.stdout.includes('dry run — nothing written'), out.stdout);

  assert.deepEqual(tree(s.root), before);
  assert.ok(!fs.existsSync(s.dest));
});

// --- write -----------------------------------------------------------------

test('--write backs up every legacy file it read, with a timestamp', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  const original = fs.readFileSync(s.legacyFile);

  migrate(s, ['--target-project', 'p', '--write']);

  const backups = backupsIn(s.configDir);
  assert.equal(backups.length, 1, `expected one backup, got ${JSON.stringify(backups)}`);
  assert.match(backups[0], /^solopreneur\.json\.backup-\d{8}T\d{6}Z$/);
  assert.deepEqual(fs.readFileSync(path.join(s.configDir, backups[0])), original);
});

test('--write installs the new file with an atomic rename', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  // Wrapping fs.renameSync from a --require preload is what makes "atomic" an
  // assertion instead of a claim: an implementation that wrote straight to the
  // destination would log nothing here and fail. Verified working on Node 20
  // and Node 26 — the preload runs before the ESM main is linked, so the
  // builtin's ESM facade is built from the already-wrapped object.
  const spy = path.join(s.root, 'rename-spy.cjs');
  const log = path.join(s.root, 'renames.log');
  fs.writeFileSync(spy, [
    "const fs = require('node:fs');",
    'const real = fs.renameSync;',
    'fs.renameSync = (from, to) => {',
    '  fs.appendFileSync(process.env.RENAME_LOG, `${from}\\t${to}\\n`);',
    '  return real(from, to);',
    '};',
    '',
  ].join('\n'));

  const out = run(['--target-project', 'p', '--write'], {
    cwd: s.repo,
    home: s.home,
    env: { ...s.env, RENAME_LOG: log },
    nodeArgs: ['--require', spy],
  });
  assert.equal(out.status, 0, out.stderr);

  const renames = fs.readFileSync(log, 'utf8').trim().split('\n').map((line) => line.split('\t'));
  const install = renames.find(([, to]) => to === s.dest);
  assert.ok(install, `nothing was renamed onto ${s.dest}; saw ${JSON.stringify(renames)}`);
  // Same directory means same filesystem: the rename cannot fail with EXDEV and
  // cannot degrade into a copy.
  assert.equal(path.dirname(install[0]), path.dirname(s.dest));
  assert.deepEqual(tempsIn(s.repo), []);
});

test('a --write onto an unusable root leaves no file, no temp and no backup', () => {
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  // The migrated root points at a regular file, refused before anything is
  // written. The outcome has to be: no config installed, no debris — and, since
  // the check runs before the backups, no backup either. A stray backup would
  // block the corrected retry: the stamp is second-grained and COPYFILE_EXCL.
  mkdirp(s.repo, 'docs');
  fs.writeFileSync(path.join(s.repo, 'docs', 'preview'), 'not a directory\n');

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('not a directory'), result.stderr);
  assert.ok(!result.stderr.includes('.tmp'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
  assert.deepEqual(tempsIn(s.repo), []);
  assert.deepEqual(backupsIn(s.configDir), []);
});

test('a corrected retry in the same second succeeds', () => {
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  mkdirp(s.repo, 'docs');
  const blocker = path.join(s.repo, 'docs', 'preview');
  fs.writeFileSync(blocker, 'not a directory\n');
  assertFailed(run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env }));

  // Remove the cause and go straight back in — no sleep. If the failed run had
  // left a backup, this would die on EEXIST complaining about backups rather
  // than migrating.
  fs.rmSync(blocker);
  mkdirp(s.repo, 'docs', 'preview');
  migrate(s, ['--target-project', 'p', '--write']);
  assert.ok(fs.existsSync(s.dest));
  assert.equal(backupsIn(s.configDir).length, 1);
});

test('a backup that fails part-way removes the backups already taken', { skip: process.getuid?.() === 0 ? 'root ignores mode bits' : false }, () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  // Explicit files are backed up first, so the LATER one has to be the failure:
  // this one succeeds, then the default location's backup cannot be created
  // because its directory is read-only. Without a rollback, the succeeded
  // backup would survive a run that migrated nothing.
  const firstDir = mkdirp(s.root, 'first');
  const first = writeJson(path.join(firstDir, 'solopreneur.json'), {
    default: { preview: { projects: { keep: 'q' } } },
  });
  const mode = fs.statSync(s.configDir).mode;
  fs.chmodSync(s.configDir, 0o555);
  try {
    const result = run(['--legacy-config', first, '--target-project', 'p', '--write'], {
      cwd: s.repo, home: s.home, env: s.env,
    });
    assertFailed(result);
    assert.deepEqual(backupsIn(firstDir), [], 'the backup already taken must be rolled back');
    assert.ok(!fs.existsSync(s.dest));
    assert.deepEqual(tempsIn(s.repo), []);
  } finally {
    fs.chmodSync(s.configDir, mode);
  }
});

test('an unwritable destination directory fails cleanly, not with a stack trace', { skip: process.getuid?.() === 0 ? 'root ignores mode bits' : false }, () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  const mode = fs.statSync(s.repo).mode;
  fs.chmodSync(s.repo, 0o555);
  try {
    const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
    assertFailed(result);
    // EACCES on the user's own directory is an environment problem, not a bug
    // in a shipped file — so it must not surface as raw Node internals.
    assert.ok(!result.stderr.includes('node:fs'), result.stderr);
    assert.ok(result.stderr.startsWith('config-migrate.mjs:'), result.stderr);
  } finally {
    fs.chmodSync(s.repo, mode);
  }
});

test('--write leaves the legacy file byte-identical', () => {
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'p', keep: 'k' }, autoProtect: false } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });
  const before = fs.readFileSync(s.legacyFile);

  migrate(s, ['--target-project', 'k', '--write']);

  // Rollback is "delete the new file", which only works if the old one was
  // never touched — not reformatted, not read-modify-written, not re-ordered.
  assert.deepEqual(fs.readFileSync(s.legacyFile), before);
  assert.ok(fs.existsSync(s.dest));
});

// --- refusals --------------------------------------------------------------

test('a refused migration is a clean no-op', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  writeJson(s.dest, v2('already-migrated'));
  const before = tree(s.root);

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes(s.dest), result.stderr);
  // Nothing written anywhere: no new file, no backup, no reformatted legacy.
  assert.deepEqual(tree(s.root), before);
  assert.deepEqual(backupsIn(s.configDir), []);
});

test('a .solopreneur.json without a preview block also blocks the write', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  // The resolver skips this one during walk-up (it may configure another
  // feature), so the destination check is what has to catch it.
  writeJson(s.dest, { schemaVersion: 2, todos: { backlog: 'todos/backlog' } });

  const result = run(['--target-project', 'p', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('already exists'), result.stderr);
  assert.deepEqual(backupsIn(s.configDir), []);
});

test('a v2 config above the destination blocks the migration', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  // Outside the repo, so the destination itself is free — but the new file
  // would shadow this one.
  const ancestor = writeJson(path.join(s.root, '.solopreneur.json'), v2('enclosing-scope'));

  const result = run(['--target-project', 'p'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes(ancestor), result.stderr);
  assert.ok(result.stderr.includes('shadow'), result.stderr);
});

test('$SOLOPRENEUR_CONFIG set blocks the migration', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  // Resolver layer 1 wins from anywhere on disk, so a file written now would be
  // inert — and without this check the run would still report success.
  const explicit = writeJson(path.join(s.root, 'explicit.json'), v2('elsewhere'));

  const result = run(['--target-project', 'p', '--write'], {
    cwd: s.repo, home: s.home, env: { ...s.env, SOLOPRENEUR_CONFIG: explicit },
  });
  assertFailed(result);
  assert.ok(result.stderr.includes('SOLOPRENEUR_CONFIG'), result.stderr);
  assert.ok(!fs.existsSync(s.dest));
});

test('a user-global v2 config does not block a repo-local migration', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  // ~/.config/solopreneur/config.json is a LOWER layer than a repo-local file,
  // so it is exactly what a migration is supposed to override.
  writeJson(path.join(s.home, '.config', 'solopreneur', 'config.json'), v2('user-global'));

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes(`destination: ${s.dest}`), out.stdout);
});

test('a repo living under ~/.config/solopreneur is not blocked by the global config', () => {
  // The global config's directory positionally contains a repo checked out
  // beneath it, but it is still the lower-priority user-global layer a
  // repo-local file overrides — so it must not read as an enclosing scope.
  const home = tmp();
  const repo = mkdirp(home, '.config', 'solopreneur', 'repo');
  git(repo, ['init', '-q', '-b', 'main']);
  writeJson(path.join(home, '.config', 'solopreneur', 'config.json'), v2('user-global'));
  const configDir = mkdirp(tmp(), 'agent-config');
  writeJson(path.join(configDir, 'solopreneur.json'), {
    default: { preview: { projects: { default: 'p' } } },
  });

  const out = run(['--target-project', 'p'], { cwd: repo, home, env: { CLAUDE_CONFIG_DIR: configDir } });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(out.stdout.includes(`destination: ${path.join(repo, '.solopreneur.json')}`), out.stdout);
});

test('the destination is the repo root even when run from a subdirectory', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  const deep = mkdirp(s.repo, 'docs', 'preview', 'item');

  const result = run(['--target-project', 'p', '--write'], { cwd: deep, home: s.home, env: s.env });
  assert.equal(result.status, 0, result.stderr);
  // A repo-relative legacy path only resolves if the config sits at the repo
  // root, so that is where it goes — not in whatever directory it was run from.
  assert.ok(fs.existsSync(s.dest));
  assert.ok(!fs.existsSync(path.join(deep, '.solopreneur.json')));
});

// --- extra legacy files ----------------------------------------------------

test('--legacy-config accepts repeated paths and merges them in order', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  git(repo, ['init', '-q', '-b', 'main']);
  const home = mkdirp(root, 'home');
  // Neither file is in a default location, so nothing is found without the flag.
  const first = writeJson(path.join(root, 'a.json'), {
    repos: { [repo]: { preview: { path: 'from-a-path' } } },
  });
  const second = writeJson(path.join(root, 'b.json'), {
    default: { preview: { projects: { keep: 'from-b' } } },
  });

  const bare = run(['--target-project', 'from-b'], { cwd: repo, home });
  assertFailed(bare);
  assert.ok(bare.stderr.includes('nothing to migrate'), bare.stderr);

  const out = run(
    ['--legacy-config', first, `--legacy-config=${second}`, '--target-project', 'from-b'],
    { cwd: repo, home },
  );
  assert.equal(out.status, 0, out.stderr);
  assert.ok(out.stdout.includes(first), out.stdout);
  assert.ok(out.stdout.includes(second), out.stdout);
  assert.ok(out.stdout.includes('"root": "./from-a-path"'), 'the first file supplies the path');
  assert.ok(out.stdout.includes('"project": "from-b"'), 'the second file supplies the project');
});

test('aliased default locations are deduped by physical file, not path', () => {
  // CLAUDE_CONFIG_DIR is a symlink to ~/.claude, so both default locations name
  // one physical file. A lexical dedup keeps both; the second backup then lands
  // on the same `.backup-<stamp>` path and fails EEXIST, rolling everything back.
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  git(repo, ['init', '-q', '-b', 'main']);
  const home = mkdirp(root, 'home');
  writeJson(path.join(home, '.claude', 'solopreneur.json'), {
    default: { preview: { projects: { default: 'p' } } },
  });
  const ccd = path.join(root, 'ccd');
  fs.symlinkSync(path.join(home, '.claude'), ccd, 'dir');

  const out = run(['--target-project', 'p', '--write'], {
    cwd: repo, home, env: { CLAUDE_CONFIG_DIR: ccd },
  });
  assert.equal(out.status, 0, out.stderr);
  assert.ok(fs.existsSync(path.join(repo, '.solopreneur.json')));
  // Exactly one backup of the one physical file, not an EEXIST failure.
  assert.equal(backupsIn(path.join(home, '.claude')).length, 1);
});

test('a --legacy-config that does not exist is reported, never skipped', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  const missing = path.join(s.root, 'nope.json');

  const result = run(['--legacy-config', missing, '--target-project', 'p'], {
    cwd: s.repo, home: s.home, env: s.env,
  });
  assertFailed(result);
  assert.ok(result.stderr.includes(missing), result.stderr);
});

test('no legacy config anywhere exits non-zero', () => {
  const root = tmp();
  const repo = mkdirp(root, 'repo');
  git(repo, ['init', '-q', '-b', 'main']);

  const result = run(['--target-project', 'p'], { cwd: repo, home: mkdirp(root, 'home') });
  assertFailed(result);
  assert.ok(result.stderr.includes('nothing to migrate'), result.stderr);
});

// --- the generated config is real ------------------------------------------

test('the generated config validates and resolves through config-resolve.mjs', () => {
  const s = scenario({});
  writeJson(s.legacyFile, {
    default: { preview: { projects: { default: 'scratch', keep: 'kept' } } },
    repos: { [s.repo]: { preview: { path: 'docs/preview' } } },
  });

  const proposal = migrate(s, ['--target-project', 'kept', '--write']);
  assert.ok(proposal.stdout.includes(`wrote ${s.dest}`), proposal.stdout);

  // The resolver interprets shared/config.schema.json itself, so resolving
  // cleanly IS validating against the schema — and it additionally enforces the
  // single-target, provider and include/collections rules.
  const resolve = () => spawnSync(process.execPath, [RESOLVER, '--json'], {
    cwd: s.repo, env: { PATH: process.env.PATH, HOME: s.home }, encoding: 'utf8',
  });
  const resolved = resolve();
  assert.equal(resolved.status, 0, `resolver rejected the generated config:\n${resolved.stderr}`);
  const out = JSON.parse(resolved.stdout);
  assert.equal(out.mode, 'v2');
  assert.equal(out.configPath, s.dest);
  assert.equal(out.root, path.join(s.repo, 'docs', 'preview'));
  assert.equal(out.defaultTarget, 'private');
  assert.equal(out.target.project, 'kept');
  assert.equal(out.target.provider, 'vercel');
  assert.equal(out.target.visibility, 'private');
  assert.deepEqual(out.target.include, ['active', 'archive']);
  assert.deepEqual(Object.keys(out.collections), ['active', 'archive']);

  // Prove that check is not vacuous: the same file minus a schema-required key
  // is rejected by the very same path.
  const broken = JSON.parse(fs.readFileSync(s.dest, 'utf8'));
  delete broken.preview.root;
  writeJson(s.dest, broken);
  const rejected = resolve();
  assert.equal(rejected.status, 1, rejected.stdout);
  assert.ok(rejected.stderr.includes('preview.root'), rejected.stderr);
});

// --- untrusted config content ----------------------------------------------

test('a newline in a project name cannot forge a report line', () => {
  // The report is what a human reads to decide whether to --write, and a legacy
  // config travels between machines. config-resolve.mjs escapes its output for
  // the same reason and has the same test.
  const s = scenario({
    default: { preview: { projects: { default: 'evil\nwrote /etc/passwd\nthe legacy config was not modified.' } } },
  });

  const refused = run([], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(refused);
  for (const forged of ['\nwrote /etc/passwd', '\nthe legacy config was not modified.']) {
    assert.ok(!refused.stderr.includes(forged), refused.stderr);
  }
  assert.ok(refused.stderr.includes('\\nwrote /etc/passwd'), refused.stderr);
});

test('a newline in a projects bucket key cannot forge a report line', () => {
  // The bucket key lands in the provenance string, so it needs the same quoting
  // the project name and repo key already get.
  const s = scenario({});
  fs.writeFileSync(s.legacyFile, `{
    "default": { "preview": { "projects": { "default\\nwrote /etc/passwd": "p" } } }
  }
`);

  const refused = run([], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(refused);
  assert.ok(!refused.stderr.includes('\nwrote /etc/passwd'), refused.stderr);
  assert.ok(refused.stderr.includes('\\nwrote /etc/passwd'), refused.stderr);
});

test('a legacy config that is not a regular file is refused, never read', () => {
  // A FIFO would block readFileSync forever waiting for a writer; the resolver
  // guards against this and so must the migrator.
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  const fifo = path.join(s.root, 'fifo');
  const mk = spawnSync('mkfifo', [fifo]);
  if (mk.status !== 0) return; // mkfifo absent — nothing to test

  const result = run(['--legacy-config', fifo, '--target-project', 'p'], {
    cwd: s.repo, home: s.home, env: s.env,
  });
  assertFailed(result);
  assert.ok(result.stderr.includes('not a regular file'), result.stderr);
});

test('a repos.__proto__ entry is still reported, not swallowed', () => {
  // JSON.parse makes a real own `__proto__` key, but assigning it onto a plain
  // object hits Object.prototype's setter and stores nothing — so it would
  // vanish from a report whose whole job is to show what was found.
  const s = scenario({});
  // Written as raw text on purpose: `{ __proto__: ... }` in a JS object literal
  // sets the prototype too, so building this fixture with an object literal
  // serializes an EMPTY repos map and the test would pass without testing.
  fs.writeFileSync(s.legacyFile, `{
    "default": { "preview": { "projects": { "default": "p" } } },
    "repos": { "__proto__": { "preview": { "path": "from-proto" } } }
  }
`);

  const out = migrate(s, ['--target-project', 'p']);
  assert.ok(out.stdout.includes('from-proto'), out.stdout);
});

// --- CLI surface -----------------------------------------------------------

test('--target-project does not swallow the next flag', () => {
  // With a paths-only legacy config there are no candidates, so the membership
  // check is deliberately skipped — nothing else would catch this, and the user
  // would get a dry run plus a project literally named "--write".
  const s = scenario({ preview: { paths: { 'github.com/owner/repo': 'docs/preview' } } },
    { origin: 'git@github.com:owner/repo.git' });

  const result = run(['--target-project', '--write'], { cwd: s.repo, home: s.home, env: s.env });
  assertFailed(result);
  assert.ok(result.stderr.includes('--target-project=--write'), result.stderr);

  // The documented escape hatch still allows it deliberately.
  const out = migrate(s, ['--target-project=--write']);
  assert.ok(out.stdout.includes('"project": "--write"'), out.stdout);
});

test('a --legacy-config with no preview settings is named, not silently dropped', () => {
  const s = scenario({ default: { preview: { projects: { default: 'p' } } } });
  const other = writeJson(path.join(s.root, 'other.json'), { todos: { backlog: 'todos/backlog' } });

  const result = run(['--legacy-config', other, '--target-project', 'p'], {
    cwd: s.repo, home: s.home, env: s.env,
  });
  assertFailed(result);
  assert.ok(result.stderr.includes(other), result.stderr);
});

test('--help prints the usage and exits 0', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('--target-project'), result.stdout);
  assert.ok(result.stdout.includes('--legacy-config'), result.stdout);
});

test('an unknown argument is rejected', () => {
  const result = run(['--nope']);
  assertFailed(result);
  assert.ok(result.stderr.includes('--nope'), result.stderr);
});
