/**
 * Tests for scripts/setup.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * setup imports the module and calls `main` directly with an injected fake `deps`
 * (vercel-protect's shape) and a fake `io`, so there is ZERO real network and
 * ZERO real prompt. The real config resolver runs against a fixture directory
 * tree, which is what makes the "discoverable and effective" check real rather
 * than mocked — so the filesystem IS touched (temp dirs), but nothing else.
 *
 * Hermeticity is bought with three global controls, restored after every test:
 *   - process.chdir into a fixture repo, so the resolver's cwd anchor and the git
 *     toplevel are the fixture, never the developer's checkout.
 *   - process.env.HOME points at a fixture home with no configs, so the resolver's
 *     layer-3/5 lookups (os.homedir()) find nothing real; SOLOPRENEUR_CONFIG and
 *     CLAUDE_CONFIG_DIR are cleared so layers 1 and 4 stay out of scope.
 *   - GIT_CONFIG_NOSYSTEM + GIT_CEILING_DIRECTORIES keep git off /etc/gitconfig
 *     and stop any walk-up at the temp root.
 * node:test runs the tests in a file sequentially, so these process-global
 * mutations do not race.
 */

import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main, SetupError } from '../scripts/setup.mjs';
import { LEGACY_PROTECTION, VercelProtectError } from '../scripts/vercel-protect.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESOLVER = path.join(HERE, '..', 'scripts', 'config-resolve.mjs');
const TMP_ROOT = fs.realpathSync(os.tmpdir());
const ORIGINAL_CWD = process.cwd();
const ENV_KEYS = ['HOME', 'SOLOPRENEUR_CONFIG', 'CLAUDE_CONFIG_DIR', 'GIT_CONFIG_NOSYSTEM', 'GIT_CEILING_DIRECTORIES'];

const fixtures = [];
after(() => { for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true }); });

// The real values of every process-global the harness overwrites, captured ONCE
// before any test runs, so afterEach always restores the process to its original
// state (not to whatever the previous test left) — including the real HOME.
const ORIGINAL_ENV = {};
for (const key of ENV_KEYS) ORIGINAL_ENV[key] = process.env[key];
afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

/** A fresh fixture root, realpath'd (the resolver reports physical paths). */
function tmp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-setup-')));
  fixtures.push(dir);
  // A `.solopreneur.json` anywhere above the temp dir would make the resolver's
  // walk-up find it and every fixture read as "already configured".
  for (let d = dir; ; d = path.dirname(d)) {
    assert.ok(
      !fs.existsSync(path.join(d, '.solopreneur.json')),
      `TMPDIR sits under a configured preview scope (${d}) — set TMPDIR elsewhere`,
    );
    if (path.dirname(d) === d) break;
  }
  return dir;
}

/** Build a git repo + an empty home, chdir into the repo, and control the env. */
function scenario() {
  const root = tmp();
  const repo = path.join(root, 'repo');
  const home = path.join(root, 'home');
  fs.mkdirSync(repo, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const init = spawnSync('git', ['init', '-q', '-b', 'main', repo], {
    encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
  });
  assert.equal(init.status, 0, `git init failed:\n${init.stderr}`);

  process.chdir(repo);
  process.env.HOME = home;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_CEILING_DIRECTORIES = TMP_ROOT;
  delete process.env.SOLOPRENEUR_CONFIG;
  delete process.env.CLAUDE_CONFIG_DIR;

  return {
    root,
    repo,
    home,
    dest: path.join(repo, '.solopreneur.json'),
    active: path.join(repo, 'docs', 'preview', 'active'),
    archive: path.join(repo, 'docs', 'preview', 'archive'),
    previewRoot: path.join(repo, 'docs', 'preview'),
  };
}

/** A minimal valid v2 config, for the idempotency / clobber cases. */
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

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

/**
 * A fake `io`: `ask` shifts answers off a queue (throwing on an unexpected
 * prompt, so a test that under-supplies answers fails loudly rather than hangs),
 * and every printed line is captured for assertion.
 */
function fakeIo(answers = []) {
  const queue = [...answers];
  const printed = [];
  const asked = [];
  return {
    printed,
    asked,
    text: () => printed.join(''),
    print: (s) => printed.push(s),
    error: (s) => printed.push(s),
    ask: async (q) => {
      asked.push(q);
      if (queue.length === 0) throw new Error(`fakeIo: unexpected prompt with an empty queue: ${JSON.stringify(q)}`);
      return queue.shift();
    },
  };
}

/**
 * A fake `deps` covering vercel-protect's five operations plus setup's
 * createProject / getDeployment. Scriptable per test; every mutation (patch,
 * delete, createProject) and read is recorded so ordering and absence can be
 * asserted. `sso` is the project's stored ssoProtection; `patchTakes:false`
 * models a PATCH that does not stick, which drives ensureProtected to fail.
 */
function fakeDeps({
  sso = LEGACY_PROTECTION,
  patchTakes = true,
  domains = [],
  productionDeploymentId = null,
  deleteStatus = 404,
  probeStatus = 302,
  name = 'my-private-previews',
  deploymentUrl = 'my-private-previews-abc123-team.vercel.app',
} = {}) {
  let state = sso;
  const id = `prj_${name}`;
  const calls = { getProject: [], patch: [], delete: [], listDomains: [], probe: [], createProject: [], getDeployment: [] };
  return {
    calls,
    // Vercel's GET /v9/projects/{idOrName} resolves BOTH the name and the id to
    // the same project, so the fake returns a stable identity regardless of the
    // argument — otherwise removeBareDomain's identity guard (name from the id
    // must match the name it was passed) would trip on the fake, not on real code.
    getProject: async (a) => {
      calls.getProject.push(a);
      return {
        id,
        name,
        ssoProtection: state === null ? null : { deploymentType: state },
        targets: productionDeploymentId ? { production: { id: productionDeploymentId } } : {},
      };
    },
    patchSsoProtection: async (a) => { calls.patch.push(a); if (patchTakes) state = a.deploymentType; return {}; },
    deleteDomain: async (a) => { calls.delete.push(a); return { status: deleteStatus }; },
    listDomains: async (a) => { calls.listDomains.push(a); return domains; },
    probe: async (u) => { calls.probe.push(u); return { status: probeStatus }; },
    createProject: async (a) => { calls.createProject.push(a); return { id: `prj_${a.name}`, name: a.name }; },
    getDeployment: async (a) => { calls.getDeployment.push(a); return { url: deploymentUrl }; },
  };
}

async function runMain(argv, answers, deps) {
  const io = fakeIo(answers);
  let code;
  let error;
  try {
    code = await main({ argv, io, deps });
  } catch (err) {
    error = err;
  }
  return { code, error, io, deps };
}

const readConfig = (dest) => JSON.parse(fs.readFileSync(dest, 'utf8'));

// --- idempotency -----------------------------------------------------------

test('git is available (every fixture below needs it)', () => {
  assert.equal(spawnSync('git', ['--version']).status, 0, 'git is required to run this suite');
});

test('a v2 config already present makes setup a no-op that prints the path', async () => {
  const s = scenario();
  writeJson(s.dest, v2('already-set-up'));

  // No answers queued: if setup prompted at all, fakeIo would throw.
  const { code, error, io, deps } = await runMain([], [], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);
  assert.deepEqual(io.asked, [], 'an idempotent no-op must not prompt');
  assert.ok(io.text().includes(s.dest), `expected the existing config path in the output:\n${io.text()}`);
  // Nothing touched Vercel.
  assert.deepEqual(deps.calls.getProject, []);
  assert.deepEqual(deps.calls.createProject, []);
  assert.deepEqual(deps.calls.patch, []);
});

test('a legacy config is a no-op that points at the migrator', async () => {
  const s = scenario();
  // A legacy solopreneur.json in CLAUDE_CONFIG_DIR → resolver reports mode legacy.
  const configDir = path.join(s.root, 'agent-config');
  writeJson(path.join(configDir, 'solopreneur.json'), { default: { preview: { projects: { default: 'p' } } } });
  process.env.CLAUDE_CONFIG_DIR = configDir;

  const { code, error, io, deps } = await runMain([], [], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);
  assert.ok(/config-migrate/.test(io.text()), `expected a pointer to the migrator:\n${io.text()}`);
  assert.ok(!fs.existsSync(s.dest));
  assert.deepEqual(deps.calls.createProject, []);
});

// --- confirm gate ----------------------------------------------------------

test('declining the confirm gate writes nothing and issues no Vercel mutation', async () => {
  const s = scenario();
  const deps = fakeDeps();

  const { code, error } = await runMain(['--project', 'my-private-previews'], ['new', 'n'], deps);
  assert.ifError(error);
  assert.equal(code, 0);
  assert.ok(!fs.existsSync(s.dest), 'no config file on decline');
  assert.ok(!fs.existsSync(s.previewRoot), 'no content dirs on decline');
  // The gate is BEFORE any Vercel call: not just no PATCH/DELETE, but no read either.
  assert.deepEqual(deps.calls.patch, [], 'no ssoProtection PATCH');
  assert.deepEqual(deps.calls.delete, [], 'no domain DELETE');
  assert.deepEqual(deps.calls.createProject, [], 'no project created');
  assert.deepEqual(deps.calls.getProject, []);
});

// --- create (new/empty project) --------------------------------------------

test('creating a new project provisions protection, writes a single private target, and resolves', async () => {
  const s = scenario();
  const deps = fakeDeps(); // fresh project already reads back as the legacy enum

  const { code, error, io } = await runMain(['--project', 'my-private-previews'], ['new', 'y'], deps);
  assert.ifError(error);
  assert.equal(code, 0);

  // Vercel side: the project was created and ensureProtected GET-verified it.
  assert.equal(deps.calls.createProject.length, 1);
  assert.equal(deps.calls.createProject[0].name, 'my-private-previews');
  assert.ok(deps.calls.getProject.length >= 1, 'ensureProtected must GET-verify');
  // New/empty project: bare-domain removal and the entry probe are deferred to
  // first publish — neither runs here.
  assert.deepEqual(deps.calls.delete, [], 'no bare-domain removal on an empty project');
  assert.deepEqual(deps.calls.probe, [], 'no entry probe on an empty project');

  // The written config is exactly one private target — never the three buckets.
  const cfg = readConfig(s.dest);
  assert.deepEqual(Object.keys(cfg.preview.targets), ['private']);
  assert.equal(cfg.preview.targets.private.visibility, 'private');
  assert.equal(cfg.preview.targets.private.project, 'my-private-previews');
  assert.equal(cfg.preview.defaultTarget, 'private');
  assert.deepEqual(cfg.preview.targets.private.include, ['active', 'archive']);
  for (const bucket of ['default', 'keep', 'public']) {
    assert.ok(!Object.hasOwn(cfg.preview.targets, bucket), `emitted a legacy bucket: ${bucket}`);
  }

  // Content dirs exist.
  assert.ok(fs.statSync(s.active).isDirectory());
  assert.ok(fs.statSync(s.archive).isDirectory());
  assert.ok(io.text().includes('done'), io.text());
});

test('the written config is discoverable and effective via the shipped resolver', async () => {
  const s = scenario();
  const { code, error } = await runMain(['--project', 'my-private-previews'], ['new', 'y'], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);

  // Resolve by walking up from a content path — the real proof it is effective,
  // not merely schema-valid (PR #135). Run the shipped CLI independently.
  const r = spawnSync(process.execPath, [RESOLVER, '--json', '--from', s.active], {
    cwd: s.repo, env: process.env, encoding: 'utf8',
  });
  assert.equal(r.status, 0, `resolver rejected the written config:\n${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, 'v2');
  assert.equal(out.configPath, s.dest);
  assert.equal(out.root, fs.realpathSync(s.previewRoot));
  assert.equal(out.defaultTarget, 'private');
  assert.equal(out.target.name, 'private');
  assert.equal(out.target.project, 'my-private-previews');
  assert.equal(out.target.visibility, 'private');
  assert.deepEqual(out.target.include, ['active', 'archive']);
});

test('a custom --root is honored and still resolves', async () => {
  const s = scenario();
  const { code, error } = await runMain(['--project', 'my-private-previews', '--root', 'notes/previews'], ['new', 'y'], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);
  const cfg = readConfig(s.dest);
  assert.equal(cfg.preview.root, './notes/previews');
  assert.ok(fs.statSync(path.join(s.repo, 'notes', 'previews', 'active')).isDirectory());
});

test('the project name can be supplied at the prompt when --project is absent', async () => {
  const s = scenario();
  const { code, error } = await runMain([], ['my-private-previews', 'new', 'y'], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);
  assert.equal(readConfig(s.dest).preview.targets.private.project, 'my-private-previews');
});

// --- fail-closed ordering --------------------------------------------------

test('a provisioning failure writes no config and exits non-zero', async () => {
  const s = scenario();
  // ensureProtected cannot confirm protection: the project reads back null and the
  // PATCH never sticks, so it throws — before any config is written.
  const deps = fakeDeps({ sso: null, patchTakes: false });

  const { code, error } = await runMain(['--project', 'my-private-previews'], ['new', 'y'], deps);
  assert.equal(code, undefined, 'main must not return a success code');
  assert.ok(error instanceof VercelProtectError, `expected a VercelProtectError, got ${error}`);
  assert.ok(!fs.existsSync(s.dest), 'no config may be written when protection fails');
  assert.ok(!fs.existsSync(s.previewRoot), 'no content dirs when protection fails');
});

// --- link (existing project) -----------------------------------------------

test('linking an EMPTY existing project protects it only, deferring the bare domain + probe', async () => {
  const s = scenario();
  const deps = fakeDeps({ domains: [], productionDeploymentId: null }); // empty existing project

  const { code, error } = await runMain(['--project', 'my-private-previews'], ['existing', 'y'], deps);
  assert.ifError(error);
  assert.equal(code, 0);
  assert.equal(deps.calls.createProject.length, 0, 'linking must not create');
  assert.ok(deps.calls.getProject.length >= 1, 'the name is resolved and protection GET-verified');
  // Empty project: no extra confirm was asked, and the full hardening is deferred.
  assert.deepEqual(deps.calls.delete, [], 'no bare-domain removal on an empty linked project');
  assert.deepEqual(deps.calls.probe, [], 'no entry probe on an empty linked project');
  assert.ok(fs.existsSync(s.dest));
});

test('linking a POPULATED project requires an extra confirmation; declining aborts without mutation', async () => {
  const s = scenario();
  const deps = fakeDeps({ domains: [{ name: 'real.example.com' }], productionDeploymentId: 'dpl_live' });

  // main confirm 'y', then decline the populated-project extra confirm.
  const { code, error, io } = await runMain(['--project', 'my-private-previews'], ['existing', 'y', 'n'], deps);
  assert.ifError(error);
  assert.equal(code, 0);
  assert.ok(/not an empty project/i.test(io.asked.at(-1)), `expected the extra confirmation prompt:\n${io.asked.join('\n')}`);
  assert.ok(!fs.existsSync(s.dest), 'declining the populated guard writes nothing');
  // Reads happened (resolve + inventory), but nothing was mutated.
  assert.deepEqual(deps.calls.patch, [], 'no ssoProtection PATCH');
  assert.deepEqual(deps.calls.delete, [], 'no domain DELETE');
});

test('bare-domain removal (404) and entry protection (302) are two separate checks', async () => {
  const s = scenario();
  // Populated via a production deployment. The bare domain is already gone (404 =
  // removed, confirmed by removeBareDomain's status) while the entry is protected
  // (302, confirmed by verifyEntryProtected). If setup conflated them — using the
  // entry probe to confirm bare-domain removal — the 404 would read as unprotected
  // and this would fail. It succeeds, proving the checks are distinct.
  const deps = fakeDeps({ productionDeploymentId: 'dpl_live', deleteStatus: 404, probeStatus: 302 });

  const { code, error } = await runMain(['--project', 'my-private-previews'], ['existing', 'y', 'y'], deps);
  assert.ifError(error);
  assert.equal(code, 0);
  assert.equal(deps.calls.delete.length, 1, 'bare-domain removal ran once');
  assert.equal(deps.calls.getDeployment.length, 1, 'the entry URL came from the production deployment');
  assert.equal(deps.calls.probe.length, 1, 'the entry was probed once');
  assert.ok(fs.existsSync(s.dest), 'both checks passed, so the config was written');
});

test('a naked entry (200) fails closed even when the bare domain is gone (404)', async () => {
  const s = scenario();
  // The bare domain is removed (404) but the entry probe returns 200 (naked). The
  // entry probe is a SEPARATE check and must fail the whole run — a 404 on the
  // bare domain must never be mistaken for entry protection.
  const deps = fakeDeps({ productionDeploymentId: 'dpl_live', deleteStatus: 404, probeStatus: 200 });

  const { error } = await runMain(['--project', 'my-private-previews'], ['existing', 'y', 'y'], deps);
  assert.ok(error instanceof SetupError && /expected 302|did not return a challenge/.test(error.message), `got ${error}`);
  assert.ok(!fs.existsSync(s.dest), 'a naked entry must leave no config');
});

test('a populated-by-domains-only project hardens without an entry probe', async () => {
  const s = scenario();
  // Domains present but NO production deployment: the extra confirm is required and
  // removeBareDomain runs, but there is no immutable entry to probe yet.
  const deps = fakeDeps({ domains: [{ name: 'real.example.com' }], productionDeploymentId: null });

  const { code, error } = await runMain(['--project', 'my-private-previews'], ['existing', 'y', 'y'], deps);
  assert.ifError(error);
  assert.equal(code, 0);
  assert.equal(deps.calls.delete.length, 1, 'bare-domain removal still runs');
  assert.deepEqual(deps.calls.probe, [], 'no entry probe without a production deployment');
  assert.deepEqual(deps.calls.getDeployment, [], 'no deployment fetch without a production deployment');
});

// --- refusals & guards -----------------------------------------------------

test('setup refuses to clobber a preview-less .solopreneur.json', async () => {
  const s = scenario();
  // The resolver skips a preview-less file during walk-up (mode none), but setup
  // must not overwrite it — it configures another feature.
  writeJson(s.dest, { schemaVersion: 2, todos: { backlog: 'todos/backlog' } });
  const before = fs.readFileSync(s.dest);

  const { code, error } = await runMain(['--project', 'p'], ['new', 'y'], fakeDeps());
  assert.equal(code, undefined);
  assert.ok(error instanceof SetupError && /already exists/.test(error.message), `got ${error}`);
  assert.deepEqual(fs.readFileSync(s.dest), before, 'the other-feature config is untouched');
});

test('--force sets up a fresh config over an existing v2 one', async () => {
  const s = scenario();
  writeJson(s.dest, v2('stale-project'));

  const { code, error } = await runMain(['--project', 'my-private-previews', '--force'], ['new', 'y'], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);
  assert.equal(readConfig(s.dest).preview.targets.private.project, 'my-private-previews');
});

test('an empty project name is refused', async () => {
  scenario();
  const { error } = await runMain([], ['   ', 'new', 'y'], fakeDeps());
  assert.ok(error instanceof SetupError && /project name is required/.test(error.message), `got ${error}`);
});

test('an unrecognized create/link choice is refused', async () => {
  scenario();
  const { error } = await runMain(['--project', 'p'], ['maybe', 'y'], fakeDeps());
  assert.ok(error instanceof SetupError && /new.*existing/.test(error.message), `got ${error}`);
});

// --- CLI surface -----------------------------------------------------------

test('--help prints usage and exits 0 without prompting', async () => {
  scenario();
  const { code, error, io } = await runMain(['--help'], [], fakeDeps());
  assert.ifError(error);
  assert.equal(code, 0);
  assert.ok(io.text().includes('--project'), io.text());
  assert.deepEqual(io.asked, []);
});

test('an unknown argument is rejected', async () => {
  scenario();
  const { error } = await runMain(['--nope'], [], fakeDeps());
  assert.ok(error instanceof SetupError && /--nope/.test(error.message), `got ${error}`);
});

test('--project does not swallow the following flag', async () => {
  scenario();
  const { error } = await runMain(['--project', '--force'], [], fakeDeps());
  assert.ok(error instanceof SetupError && /--project=--force/.test(error.message), `got ${error}`);
});
