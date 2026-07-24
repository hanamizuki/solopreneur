/**
 * Tests for scripts/deploy-library.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * This module moves a PRODUCTION alias, so the suite is built so it CANNOT touch
 * the real thing: every Vercel and git call goes through an injected fake `deps`,
 * so there is ZERO real network, ZERO real deploys and no `vercel`/`git` process is
 * ever spawned. The only real I/O is the filesystem — the REAL builder runs against
 * a fixture content tree, which is what makes the staging/metadata assertions
 * meaningful rather than mocked.
 *
 * The fake models the Gate A / F15 platform facts the module exists to survive:
 *   - a plain `vercel deploy` produces a `target: null` preview and does NOT move
 *     the scope alias;
 *   - promoting a PREVIEW creates a NEW production deployment (so the verified
 *     deployment is not the one that goes live);
 *   - the FIRST deployment of a project becomes production without `--prod`;
 *   - `vercel rollback` is broken, so the fake records any attempt to use it and
 *     the suite asserts it never happens.
 */

import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  main,
  publishLibrary,
  makeDefaultDeps,
  resolveStableEntry,
  snapshotId,
  sourceGuard,
  assertMovesForward,
  DeployError,
  STATE,
  PREVIEW_KIND,
} from '../scripts/deploy-library.mjs';
import { LEGACY_PROTECTION } from '../scripts/vercel-protect.mjs';

const TMP_ROOT = fs.realpathSync(os.tmpdir());
const ORIGINAL_CWD = process.cwd();
const ENV_KEYS = ['HOME', 'SOLOPRENEUR_CONFIG', 'CLAUDE_CONFIG_DIR', 'GIT_CONFIG_NOSYSTEM', 'GIT_CEILING_DIRECTORIES'];

const fixtures = [];
after(() => { for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true }); });

const ORIGINAL_ENV = {};
for (const key of ENV_KEYS) ORIGINAL_ENV[key] = process.env[key];
afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  for (const key of ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

/** A fresh fixture root, realpath'd, with no `.solopreneur.json` above it. */
function tmp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-deploy-')));
  fixtures.push(dir);
  for (let d = dir; ; d = path.dirname(d)) {
    assert.ok(
      !fs.existsSync(path.join(d, '.solopreneur.json')),
      `TMPDIR sits under a configured preview scope (${d}) — set TMPDIR elsewhere`,
    );
    if (path.dirname(d) === d) break;
  }
  return dir;
}

const PROJECT = 'my-private-previews';
const PROJECT_ID = 'prj_private_previews';
const TEAM_ID = 'team_demo';
const SCOPE_ALIAS = `${PROJECT}-demoteam.vercel.app`;
const BARE_DOMAIN = `${PROJECT}.vercel.app`;

const COLLECTIONS = {
  active: { path: 'active', label: 'Previews' },
  archive: { path: 'archive', label: 'Archive' },
};

const makeMeta = (id, over = {}) => ({
  schemaVersion: 1,
  id,
  title: `Title of ${id}`,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  revision: 1,
  ...over,
});

/** A content root with two real preview items the REAL builder can stage. */
function contentRoot({ ids = ['alpha'] } = {}) {
  const root = path.join(tmp(), 'docs', 'preview');
  for (const collection of ['active', 'archive']) fs.mkdirSync(path.join(root, collection), { recursive: true });
  for (const id of ids) {
    const dir = path.join(root, 'active', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'preview.json'), JSON.stringify(makeMeta(id), null, 2));
    fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><html><body><h1>${id}</h1></body></html>`);
  }
  return root;
}

/** A `mode: "v2"` resolved-config shape, as config-resolve.mjs returns one. */
function resolvedConfig(root, over = {}) {
  return {
    configPath: path.join(path.dirname(path.dirname(root)), '.solopreneur.json'),
    mode: 'v2',
    root,
    defaultTarget: 'private',
    target: {
      name: 'private',
      provider: 'vercel',
      project: PROJECT,
      projectId: PROJECT_ID,
      teamId: TEAM_ID,
      visibility: 'private',
      include: ['active', 'archive'],
      ...(over.target ?? {}),
    },
    collections: COLLECTIONS,
    legacy: null,
  };
}

function fakeIo() {
  const printed = [];
  return { printed, text: () => printed.join(''), print: (s) => printed.push(s) };
}

/**
 * The fake Vercel + git `deps`.
 *
 * `deployments` is the project's deployment store keyed by id; `production` names
 * the id `targets.production` points at (null = the project has never published).
 * Every call is recorded on `calls` so ORDER and ABSENCE can be asserted — the
 * staged-flow criteria are all about what was NOT issued.
 *
 * Scriptable failure knobs: `probe` maps a hostname to the status an anonymous
 * request gets (default 302 = protected); `deployFails` / `promoteFails` make those
 * CLI calls throw; `stagedTarget` overrides the target a plain deploy produces
 * (`'production'` models the documented first-deployment-is-production rule);
 * `promoteMeta` overrides the metadata the promote-created production carries, to
 * model a concurrent publisher winning the race.
 */
function fakeDeps({
  deployments = {},
  production = null,
  domains = [{ name: BARE_DOMAIN }, { name: SCOPE_ALIAS }],
  probe = {},
  sso = LEGACY_PROTECTION,
  deleteStatus = 200,
  gitScript = {},
  deployFails,
  promoteFails,
  stagedTarget = null,
  promoteMeta,
  stagedMeta,
  accountId = TEAM_ID,
  projectName = PROJECT,
  projectId = PROJECT_ID,
} = {}) {
  const store = { ...deployments };
  const state = { production, sso };
  let seq = 0;
  const calls = {
    // `log` is every call in order, with its argument, so a test can assert that X
    // happened strictly between Y and Z; `order` is the same sequence of names.
    log: [],
    order: [],
    getProject: [],
    getDeployment: [],
    deploy: [],
    promote: [],
    rollback: [],
    patch: [],
    delete: [],
    listDomains: [],
    probe: [],
    git: [],
  };
  const note = (name, arg) => { calls.log.push({ name, arg }); calls.order.push(name); calls[name].push(arg); };
  const indexOf = (name, match) => calls.log.findIndex((c) => c.name === name && (match === undefined || match(c.arg)));

  const deps = {
    getProject: async (a) => {
      note('getProject', a);
      return {
        id: projectId,
        name: projectName,
        accountId,
        ssoProtection: state.sso === null ? null : { deploymentType: state.sso },
        targets: state.production ? { production: { id: state.production } } : {},
      };
    },
    getDeployment: async (a) => {
      note('getDeployment', a);
      const found = store[a.deploymentId]
        ?? Object.values(store).find((d) => d.url === a.deploymentId);
      if (!found) throw new Error(`fakeDeps: no such deployment ${a.deploymentId}`);
      return found;
    },
    patchSsoProtection: async (a) => { note('patch', a); state.sso = a.deploymentType; return {}; },
    deleteDomain: async (a) => { note('delete', a); return { status: deleteStatus }; },
    listDomains: async (a) => { note('listDomains', a); return domains; },
    probe: async (url) => {
      note('probe', url);
      const host = String(url).replace(/^https?:\/\//, '');
      return { status: probe[host] ?? 302 };
    },

    // A plain preview deploy. Records the exact meta the module passed and, per the
    // verified fact, does NOT move `targets.production` (unless stagedTarget models
    // the documented first-deployment case).
    deploy: async ({ cwd, meta }) => {
      note('deploy', { cwd, meta, staging: fs.readdirSync(cwd).sort() });
      if (deployFails) throw new DeployError(deployFails);
      seq += 1;
      const id = `dpl_staged_${seq}`;
      const url = `${PROJECT}-staged${seq}-demoteam.vercel.app`;
      store[id] = {
        uid: id,
        url,
        projectId,
        readyState: 'READY',
        target: stagedTarget,
        meta: stagedMeta ?? { ...meta },
        alias: stagedTarget === 'production' ? [SCOPE_ALIAS, BARE_DOMAIN] : [],
      };
      if (stagedTarget === 'production') state.production = id;
      return { url: `https://${url}` };
    },

    // Promoting a PREVIEW creates a NEW production deployment (verified); promoting
    // a deployment that is already production is in-place.
    promote: async ({ deployment }) => {
      note('promote', deployment);
      if (promoteFails) throw new DeployError(promoteFails);
      const source = store[deployment] ?? Object.values(store).find((d) => d.url === deployment);
      if (!source) throw new Error(`fakeDeps: cannot promote unknown ${deployment}`);
      if (source.target === 'production') { state.production = source.uid; return; }
      seq += 1;
      const id = `dpl_prod_${seq}`;
      store[id] = {
        uid: id,
        url: `${PROJECT}-prod${seq}-demoteam.vercel.app`,
        projectId,
        readyState: 'READY',
        target: 'production',
        meta: promoteMeta ?? { ...source.meta },
        alias: [SCOPE_ALIAS, BARE_DOMAIN],
      };
      state.production = id;
    },

    // Never called by this module — `vercel rollback` 500s on this account. Present
    // only so a regression that reaches for it is caught by an assertion.
    rollback: async (a) => { note('rollback', a); throw new Error('vercel rollback is broken — must not be used'); },

    git: (args, cwd) => {
      note('git', args.join(' '));
      const key = args.join(' ');
      for (const [prefix, result] of Object.entries(gitScript)) {
        if (key === prefix || key.startsWith(`${prefix} `)) return result;
      }
      return { status: 1, stdout: '' }; // default: not a git repo
    },
  };
  deps.store = store;
  deps.state = state;
  deps.calls = calls;
  deps.indexOf = indexOf;
  return deps;
}

/** Git responses for a clean repo at `commit`, with no upstream configured. */
const cleanRepo = (commit = 'a'.repeat(40), extra = {}) => ({
  'rev-parse --show-toplevel': { status: 0, stdout: '/repo\n' },
  'status --porcelain': { status: 0, stdout: '' },
  fetch: { status: 0, stdout: '' },
  'rev-parse --abbrev-ref': { status: 1, stdout: '' }, // no upstream
  'rev-parse HEAD': { status: 0, stdout: `${commit}\n` },
  ...extra,
});

/** A `previewKind=library` production deployment already live on the project. */
const libraryProduction = (id, { commit, snapshot = 'old-snapshot' } = {}) => ({
  [id]: {
    uid: id,
    url: `${PROJECT}-old-demoteam.vercel.app`,
    projectId: PROJECT_ID,
    readyState: 'READY',
    target: 'production',
    meta: { previewKind: PREVIEW_KIND, snapshot, ...(commit ? { sourceCommit: commit } : {}) },
    alias: [SCOPE_ALIAS, BARE_DOMAIN],
  },
});

async function run(resolved, deps, over = {}) {
  const io = fakeIo();
  let report;
  let error;
  try {
    report = await publishLibrary({ resolved, deps, io, ...over });
  } catch (err) {
    error = err;
  }
  return { report, error, io, deps };
}

const isDeployError = (re, state) => (err) => err instanceof DeployError
  && re.test(err.message)
  && (state === undefined || err.state === state);

// --- pure helpers ----------------------------------------------------------

test('snapshotId is order-independent and content-sensitive', () => {
  const a = snapshotId({ items: [{ id: 'x', contentHash: '1' }, { id: 'y', contentHash: '2' }] });
  const b = snapshotId({ items: [{ id: 'y', contentHash: '2' }, { id: 'x', contentHash: '1' }] });
  const c = snapshotId({ items: [{ id: 'x', contentHash: '1' }, { id: 'y', contentHash: '9' }] });
  assert.equal(a, b, 'catalog order must not change the snapshot identity');
  assert.notEqual(a, c, 'a changed contentHash must change the snapshot identity');
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('resolveStableEntry picks the scope alias and never the bare domain', () => {
  const entry = resolveStableEntry({
    name: PROJECT,
    aliases: [BARE_DOMAIN, SCOPE_ALIAS],
    immutable: `${PROJECT}-abc123-demoteam.vercel.app`,
  });
  assert.equal(entry, SCOPE_ALIAS);
});

test('resolveStableEntry excludes the immutable URL and prefers the shortest alias', () => {
  const entry = resolveStableEntry({
    name: PROJECT,
    aliases: [`${PROJECT}-git-main-demoteam.vercel.app`, `${PROJECT}-abc123-demoteam.vercel.app`, SCOPE_ALIAS],
    immutable: `https://${PROJECT}-abc123-demoteam.vercel.app`,
  });
  assert.equal(entry, SCOPE_ALIAS);
});

test('resolveStableEntry falls back to project domains when the alias list is empty', () => {
  assert.equal(
    resolveStableEntry({ name: PROJECT, aliases: [], domains: [{ name: BARE_DOMAIN }, { name: SCOPE_ALIAS }] }),
    SCOPE_ALIAS,
  );
});

test('resolveStableEntry returns null when only the bare domain is present', () => {
  assert.equal(resolveStableEntry({ name: PROJECT, aliases: [BARE_DOMAIN], domains: [{ name: BARE_DOMAIN }] }), null);
});

test('resolveStableEntry ignores foreign hosts and custom domains', () => {
  assert.equal(
    resolveStableEntry({ name: PROJECT, aliases: ['docs.example.com', 'other-project-demoteam.vercel.app'] }),
    null,
  );
});

// --- source guard -----------------------------------------------------------

test('sourceGuard skips the guard and returns null outside a git repo', () => {
  const io = fakeIo();
  const deps = fakeDeps();
  assert.equal(sourceGuard({ root: '/content', deps, io }), null);
  assert.match(io.text(), /not a git repo/);
  assert.match(io.text(), /backwards/, 'the caveat must be stated, not silently skipped');
});

test('sourceGuard refuses a dirty content path', () => {
  const io = fakeIo();
  const deps = fakeDeps({
    gitScript: cleanRepo('b'.repeat(40), { 'status --porcelain': { status: 0, stdout: ' M active/a/index.html\n' } }),
  });
  assert.throws(() => sourceGuard({ root: '/content', deps, io }), isDeployError(/uncommitted changes/));
});

test('sourceGuard refuses a content path behind its upstream', () => {
  const io = fakeIo();
  const deps = fakeDeps({
    gitScript: cleanRepo('c'.repeat(40), {
      'rev-parse --abbrev-ref': { status: 0, stdout: 'origin/main\n' },
      'rev-list --count': { status: 0, stdout: '2\n' },
    }),
  });
  assert.throws(() => sourceGuard({ root: '/content', deps, io }), isDeployError(/behind its upstream/));
});

test('sourceGuard tolerates a failed fetch and still returns the commit', () => {
  const io = fakeIo();
  const commit = 'd'.repeat(40);
  const deps = fakeDeps({ gitScript: cleanRepo(commit, { fetch: { status: 128, stdout: '' } }) });
  assert.equal(sourceGuard({ root: '/content', deps, io }), commit);
  assert.match(io.text(), /git fetch` failed/);
});

test('assertMovesForward allows an equal or descendant commit and refuses otherwise', () => {
  const deps = fakeDeps({ gitScript: { 'merge-base --is-ancestor': { status: 0, stdout: '' } } });
  assertMovesForward({ liveCommit: 'aaa', commit: 'bbb', root: '/r', deps });
  assertMovesForward({ liveCommit: 'aaa', commit: 'aaa', root: '/r', deps });
  assertMovesForward({ liveCommit: null, commit: 'bbb', root: '/r', deps });

  const behind = fakeDeps({ gitScript: { 'merge-base --is-ancestor': { status: 1, stdout: '' } } });
  assert.throws(
    () => assertMovesForward({ liveCommit: 'newer', commit: 'older', root: '/r', deps: behind }),
    isDeployError(/go backwards/),
  );

  const unknown = fakeDeps({ gitScript: { 'merge-base --is-ancestor': { status: 128, stdout: '' } } });
  assert.throws(
    () => assertMovesForward({ liveCommit: 'x', commit: 'y', root: '/r', deps: unknown }),
    isDeployError(/git fetch/),
  );
});

// --- the staged flow --------------------------------------------------------

test('publish deploys a PLAIN preview first, verifies it, and only then promotes', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'] });
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old', { commit: 'e'.repeat(40) }),
    gitScript: cleanRepo('f'.repeat(40), { 'merge-base --is-ancestor': { status: 0, stdout: '' } }),
  });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(report.state, 'published');
  assert.equal(report.promoted, true);

  // The staging deploy produced a target:null PREVIEW (the fake refuses to move
  // `targets.production` for one), and the module verified THAT before promoting.
  const staged = Object.values(deps.store).find((d) => d.target === null);
  assert.equal(staged.meta.previewKind, PREVIEW_KIND);
  const deployAt = deps.indexOf('deploy');
  const promoteAt = deps.indexOf('promote');
  const stagedProbeAt = deps.indexOf('probe', (url) => url === `https://${staged.url}`);
  assert.ok(deployAt >= 0, 'a deploy must be issued');
  assert.ok(stagedProbeAt > deployAt, 'the staged preview must be probed after the deploy');
  assert.ok(promoteAt > stagedProbeAt, 'the promote must come only after the staged preview verified');
});

test('every library deployment carries previewKind=library metadata plus the source commit', async () => {
  const root = contentRoot();
  const commit = '1'.repeat(40);
  const deps = fakeDeps({ gitScript: cleanRepo(commit) });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(deps.calls.deploy.length, 1, 'exactly one deploy per publish (quota)');
  const meta = deps.calls.deploy[0].meta;
  assert.equal(meta.previewKind, PREVIEW_KIND);
  assert.equal(meta.sourceCommit, commit);
  assert.equal(meta.snapshot, report.snapshot);
  assert.match(meta.snapshot, /^[0-9a-f]{64}$/);
});

test('the promoted production is verified after the promote, not just the preview', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  // The verified preview is NOT the deployment that went live (promote creates a
  // new production deployment), so the live one must have been fetched afterwards.
  const promoteAt = deps.calls.order.indexOf('promote');
  assert.ok(
    deps.calls.order.slice(promoteAt).includes('getDeployment'),
    'the new production deployment must be read back and verified after the promote',
  );
  assert.notEqual(report.productionId, undefined);
  assert.ok(report.productionId.startsWith('dpl_prod_'), 'the live deployment is the promote-created one');
});

test('vercel rollback is NEVER invoked — rollback is promote-based', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    probe: { [SCOPE_ALIAS]: 200 }, // force the failure path that rolls back
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(error instanceof DeployError, `expected a DeployError, got ${error}`);
  assert.deepEqual(deps.calls.rollback, [], 'vercel rollback must never be used (it 500s on this account)');
  assert.deepEqual(deps.calls.promote.slice(-1), ['dpl_old'], 'the rollback is a promote of the last-good production');
  assert.equal(error.state, STATE.rolledBack);
});

// --- fail-closed refusals ---------------------------------------------------

test('a preview that is not anonymously challenged is NOT promoted', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo(), probe: {} });
  // Make only the staged preview answer 200 (naked); the entry stays protected.
  const originalProbe = deps.probe;
  deps.probe = async (url) => (/-staged/.test(url) ? { status: 200 } : originalProbe(url));

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/not anonymously challenged/, STATE.untouched)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote, [], 'no promote may be issued when the preview fails verification');
});

test('a preview whose metadata does not match the build is NOT promoted', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    gitScript: cleanRepo(),
    stagedMeta: { previewKind: PREVIEW_KIND, snapshot: 'someone-elses-snapshot' },
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/does not match/, STATE.untouched)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote, []);
});

test('a staged deployment that reports target=production on a PUBLISHED project is refused', async () => {
  // The first-deployment exception applies only to a project with no production
  // deployment. On an already-published project a staging deploy reporting
  // target:"production" means the stable entry moved without verification, so it
  // must NOT be waved through as a first publish.
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    stagedTarget: 'production',
  });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.equal(report, undefined);
  assert.ok(isDeployError(/reports target "production"/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote, [], 'no promote after an unexpected production target');
});

test('a staged deployment that reports target=staging is refused', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo(), stagedTarget: 'staging' });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/reports target "staging"/, STATE.untouched)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote, []);
});

test('an empty Library refuses to publish rather than wiping the live one', async () => {
  // A misconfigured root is likelier than a deliberate empty publish, and a publish
  // is a FULL snapshot — so zero items would 404 every existing /p/<id>/.
  const root = path.join(tmp(), 'docs', 'preview');
  for (const collection of ['active', 'archive']) fs.mkdirSync(path.join(root, collection), { recursive: true });
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/no previews were found/, STATE.untouched)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, []);
});

test('a naked stable entry (200) makes the publish FAIL and roll back', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    probe: { [SCOPE_ALIAS]: 200 },
  });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.equal(report, undefined, 'a naked entry must never be reported as success');
  assert.ok(isDeployError(/world-readable/, STATE.rolledBack)(error), `got ${error?.message}`);
});

test('a failed post-promote verification rolls back by promoting the last-good production', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    // The promote-created production carries someone else's snapshot: a concurrent
    // publisher won the race, so the live revision is not ours.
    promoteMeta: { previewKind: PREVIEW_KIND, snapshot: 'raced' },
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/did not verify/, STATE.rolledBack)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote.slice(-1), ['dpl_old']);
});

test('a promoted production that carries no previewKind metadata is refused', async () => {
  // `vercel promote` of a preview REBUILDS rather than re-points, and whether it
  // carries `--meta` into the new deployment is undocumented. The stale guard reads
  // that metadata on the NEXT publish, so a production without it must not be
  // accepted — and the error has to name the cause.
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    promoteMeta: {}, // the rebuild dropped every meta key
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/NO previewKind metadata/, STATE.rolledBack)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote.slice(-1), ['dpl_old']);
});

test('a promote that does not confirm is reported as UNKNOWN, never as untouched', async () => {
  // Vercel documents that a promote TIMEOUT does not cancel the promotion, so a
  // non-zero exit cannot be read as "the stable entry did not move".
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    promoteFails: 'vercel promote exited 1: timeout',
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/did not confirm/, STATE.unknown)(error), `got ${error?.message}`);
  assert.match(error.message, /may still be proceeding/);
});

test('a rollback that itself fails is reported as an UNKNOWN state, never as success', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    probe: { [SCOPE_ALIAS]: 200 },
  });
  // The publish promote succeeds; the rollback promote fails.
  const realPromote = deps.promote;
  let seen = 0;
  deps.promote = async (a) => {
    seen += 1;
    if (seen > 1) { deps.calls.promote.push(a.deployment); throw new DeployError('promote refused'); }
    return realPromote(a);
  };

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/rolling back/, STATE.rollbackFailed)(error), `got ${error?.message}`);
});

test('a first publish with no previous production reports PUBLISHED-but-unverified, not rolled back', async () => {
  const root = contentRoot();
  // An empty project: Vercel publishes the first deployment as production directly.
  const deps = fakeDeps({ gitScript: cleanRepo(), stagedTarget: 'production', probe: { [SCOPE_ALIAS]: 200 } });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/nothing to promote back/, STATE.published)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote, [], 'the first deployment is already production — no promote is issued');
});

// --- first publish ----------------------------------------------------------

test('a first publish skips the promote, removes the bare domain, and verifies the entry', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo(), stagedTarget: 'production', deleteStatus: 200 });

  const { report, error, io } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(report.state, 'published');
  assert.equal(report.promoted, false);
  assert.deepEqual(deps.calls.promote, [], 'nothing to promote — the deploy already landed as production');
  assert.match(io.text(), /first deployment/);
  assert.equal(report.bareDomain.removed, true);
  assert.equal(report.bareDomain.domain, BARE_DOMAIN);
});

test('bare-domain removal is confirmed by the DELETE status, and a 404 counts as success', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo(), deleteStatus: 404 });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  // 404 = already absent = success, and it is NOT read through the entry probe (a
  // removed bare domain answers 404, which verifyEntryProtected reads as naked).
  assert.equal(report.bareDomain.removed, false);
  assert.equal(report.bareDomain.status, 404);
  assert.equal(deps.calls.delete.length, 1);
  assert.equal(deps.calls.delete[0].domain, BARE_DOMAIN);
  assert.ok(
    !deps.calls.probe.some((url) => url === `https://${BARE_DOMAIN}`),
    'the bare domain must never be used as the entry probe target',
  );
});

test('the entry probe targets the scope alias, never the bare domain', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(report.stableUrl, `https://${SCOPE_ALIAS}`);
  assert.ok(deps.calls.probe.includes(`https://${SCOPE_ALIAS}`), 'the stable entry must be probed');
});

// --- identity ---------------------------------------------------------------

test('a projectId that disagrees with the resolved project refuses to publish', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ projectId: 'prj_a_different_project', gitScript: cleanRepo() });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/identity mismatch/, STATE.untouched)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, [], 'nothing may be deployed on an identity mismatch');
  assert.deepEqual(deps.calls.promote, []);
});

test('a teamId that disagrees with the project owner refuses to publish', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ accountId: 'team_somewhere_else', gitScript: cleanRepo() });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/identity mismatch/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, []);
});

test('a name that resolves to a differently-named project refuses to publish', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ projectName: 'some-other-name', gitScript: cleanRepo() });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/identity mismatch/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, []);
});

test('a name-only target publishes but warns that it is not id-bound', async () => {
  const root = contentRoot();
  const resolved = resolvedConfig(root);
  delete resolved.target.projectId;
  delete resolved.target.teamId;
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { report, error, io } = await run(resolved, deps);
  assert.ifError(error);
  assert.equal(report.state, 'published');
  assert.match(io.text(), /bound by NAME only/);
});

test('a non-private target refuses to publish', async () => {
  const root = contentRoot();
  const resolved = resolvedConfig(root, { target: { visibility: 'public' } });
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { error } = await run(resolved, deps);
  assert.ok(isDeployError(/PRIVATE targets only/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.getProject, [], 'refused before any Vercel call');
});

// --- stale-publish guard ----------------------------------------------------

test('a live production published from a NEWER commit aborts before any deploy', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old', { commit: '9'.repeat(40) }),
    // Not an ancestor: the live commit is newer or divergent.
    gitScript: cleanRepo('2'.repeat(40), { 'merge-base --is-ancestor': { status: 1, stdout: '' } }),
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/go backwards/, STATE.untouched)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, [], 'a stale publish must not spend deployment quota');
  assert.deepEqual(deps.calls.promote, []);
});

test('a non-git content root skips the guard and still publishes', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: {} }); // every git call fails → not a repo

  const { report, error, io } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(report.state, 'published');
  assert.equal(report.commit, null);
  assert.match(io.text(), /not a git repo/);
  // No sourceCommit is recorded when there is no commit to record.
  assert.equal(deps.calls.deploy[0].meta.sourceCommit, undefined);
  assert.equal(deps.calls.deploy[0].meta.previewKind, PREVIEW_KIND);
});

test('the guard re-checks immediately before the promote', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old', { commit: '3'.repeat(40) }),
    gitScript: cleanRepo('4'.repeat(40), { 'merge-base --is-ancestor': { status: 0, stdout: '' } }),
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  const ancestorChecks = deps.calls.git.filter((g) => g.startsWith('merge-base --is-ancestor'));
  assert.equal(ancestorChecks.length, 2, 'once before the deploy and once immediately before the promote');
});

test('the guard reads stable production only — a later previewKind=share preview is ignored', async () => {
  const root = contentRoot();
  const share = 'dpl_share_newer';
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: {
      ...libraryProduction('dpl_old', { commit: '5'.repeat(40) }),
      // The NEWEST deployment in the project is a Share preview from a commit that
      // is NOT an ancestor of ours. Reading it would abort the publish.
      [share]: {
        uid: share,
        url: `${PROJECT}-share-demoteam.vercel.app`,
        projectId: PROJECT_ID,
        readyState: 'READY',
        target: null,
        meta: { previewKind: 'share', sourceCommit: 'f'.repeat(40), previewId: 'alpha' },
        alias: [],
      },
    },
    gitScript: cleanRepo('6'.repeat(40), {
      // Only the LIBRARY commit is an ancestor; the share commit is not. A guard
      // that read the share deployment would take the status-1 branch and abort.
      'merge-base --is-ancestor 5555555555555555555555555555555555555555': { status: 0, stdout: '' },
      'merge-base --is-ancestor': { status: 1, stdout: '' },
    }),
  });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(report.state, 'published');
  assert.ok(
    !deps.calls.getDeployment.some((a) => a.deploymentId === share),
    'the Share deployment must never be read by the library revision query',
  );
});

test('a foreign (non-library) production is a rollback target but never drives the guard', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_legacy',
    deployments: {
      dpl_legacy: {
        uid: 'dpl_legacy',
        url: `${PROJECT}-legacy-demoteam.vercel.app`,
        projectId: PROJECT_ID,
        readyState: 'READY',
        target: 'production',
        // A legacy per-page deploy in the same project: no previewKind metadata.
        meta: { sourceCommit: 'f'.repeat(40) },
        alias: [SCOPE_ALIAS],
      },
    },
    // Any ancestor check would FAIL — proving the foreign commit was not compared.
    gitScript: cleanRepo('7'.repeat(40), { 'merge-base --is-ancestor': { status: 1, stdout: '' } }),
    probe: { [SCOPE_ALIAS]: 200 }, // force the rollback so the target is observable
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/world-readable/, STATE.rolledBack)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote.slice(-1), ['dpl_legacy'], 'a foreign production is still a valid rollback target');
});

// --- protection ordering ----------------------------------------------------

test('protection is asserted BEFORE the content deploy', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo(), sso: null }); // naked project

  const { error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  const firstPatch = deps.indexOf('patch');
  const deployAt = deps.indexOf('deploy');
  assert.ok(firstPatch >= 0 && firstPatch < deployAt, 'content must never land on an unprotected project');
  assert.deepEqual(deps.calls.patch.map((p) => p.deploymentType), [LEGACY_PROTECTION]);
  // Bare-domain removal and the entry probe can only act once a deployment exists.
  assert.ok(deps.indexOf('delete') > deployAt);
  assert.ok(deps.indexOf('probe', (url) => url === `https://${SCOPE_ALIAS}`) > deployAt);
});

test('protection is re-asserted after publishing, so a concurrent nulling is caught', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ gitScript: cleanRepo() }); // starts protected
  // Something else nulls ssoProtection while the deploy is in flight (Gate A fact 2
  // shows a rejected PATCH does exactly this). The post-publish ensureProtected must
  // notice and drive it back rather than trust the pre-deploy assertion.
  const realDeploy = deps.deploy;
  deps.deploy = async (a) => { const out = await realDeploy(a); deps.state.sso = null; return out; };

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(report.state, 'published');
  const patchAfterDeploy = deps.calls.log
    .slice(deps.indexOf('deploy'))
    .filter((c) => c.name === 'patch')
    .map((c) => c.arg.deploymentType);
  assert.deepEqual(patchAfterDeploy, [LEGACY_PROTECTION], 'the publish must re-assert protection, not assume it');
  assert.equal(deps.state.sso, LEGACY_PROTECTION);
});

test('a protection failure after publishing rolls back rather than reporting success', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    deleteStatus: 500, // removeBareDomain throws on anything but 404/2xx
  });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.equal(report, undefined);
  assert.ok(isDeployError(/protection could not be confirmed/, STATE.rolledBack)(error), `got ${error?.message}`);
});

test('an unresolvable stable entry fails closed rather than skipping the probe', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    production: 'dpl_old',
    deployments: libraryProduction('dpl_old'),
    gitScript: cleanRepo(),
    domains: [{ name: BARE_DOMAIN }],
  });
  // Strip the alias list from whatever becomes production, so neither source
  // carries the scope alias.
  const realPromote = deps.promote;
  deps.promote = async (a) => {
    await realPromote(a);
    for (const d of Object.values(deps.store)) if (d.target === 'production') d.alias = [BARE_DOMAIN];
  };

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/could not be resolved/, STATE.rolledBack)(error), `got ${error?.message}`);
});

// --- staging tree + quota ---------------------------------------------------

test('the staging tree is the real built Library and is removed after the publish', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'] });
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { report, error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  const staged = deps.calls.deploy[0].staging;
  // What the deploy saw: the generated Library plus the link file that pins the
  // project — no `preview.json`, no source metadata.
  assert.ok(staged.includes('index.html'));
  assert.ok(staged.includes('directory.json'));
  assert.ok(staged.includes('assets'));
  assert.ok(staged.includes('p'));
  assert.ok(staged.includes('.vercel'), 'the link file pins projectId/orgId for the CLI');
  assert.equal(report.items, 2);
  assert.ok(!fs.existsSync(deps.calls.deploy[0].cwd), 'the staging tree must not survive the publish');
});

test('the link file pins the confirmed projectId and owner, not the config name', async () => {
  const root = contentRoot();
  let linkFile;
  const deps = fakeDeps({ gitScript: cleanRepo() });
  const realDeploy = deps.deploy;
  deps.deploy = async (a) => {
    linkFile = JSON.parse(fs.readFileSync(path.join(a.cwd, '.vercel', 'project.json'), 'utf8'));
    return realDeploy(a);
  };

  const { error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.deepEqual(linkFile, { projectId: PROJECT_ID, orgId: TEAM_ID });
});

test('a failed deploy leaves the project untouched and removes the staging tree', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    gitScript: cleanRepo(),
    deployFails: 'Vercel rejected the deployment for QUOTA (free deployments per day).',
  });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ok(isDeployError(/QUOTA/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.promote, []);
});

test('exactly one deploy is issued per publish', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'] });
  const deps = fakeDeps({ gitScript: cleanRepo() });

  const { error } = await run(resolvedConfig(root), deps);
  assert.ifError(error);
  assert.equal(deps.calls.deploy.length, 1);
});

// --- CLI --------------------------------------------------------------------

test('main --help prints usage without building deps', async () => {
  const io = fakeIo();
  const code = await main({
    argv: ['--help'],
    io,
    makeDeps: () => { throw new Error('deps must not be built for --help'); },
  });
  assert.equal(code, 0);
  assert.match(io.text(), /usage: deploy-library\.mjs/);
});

test('main rejects an unknown argument', async () => {
  await assert.rejects(
    main({ argv: ['--prod'], io: fakeIo(), makeDeps: () => fakeDeps() }),
    isDeployError(/unknown argument/),
  );
});

test('main refuses to publish without a v2 config', async () => {
  const dir = tmp();
  process.chdir(dir);
  process.env.HOME = dir;
  delete process.env.SOLOPRENEUR_CONFIG;
  delete process.env.CLAUDE_CONFIG_DIR;

  await assert.rejects(
    main({ argv: [], io: fakeIo(), makeDeps: () => fakeDeps() }),
    isDeployError(/no v2 preview config/),
  );
});

/**
 * A fixture repo whose `.solopreneur.json` the SHIPPED resolver finds by walking
 * up, so the CLI tests below exercise real config resolution rather than a
 * hand-built resolved object.
 */
function cliFixture() {
  const repo = tmp();
  const root = path.join(repo, 'docs', 'preview');
  for (const collection of ['active', 'archive']) fs.mkdirSync(path.join(root, collection), { recursive: true });
  const item = path.join(root, 'active', 'alpha');
  fs.mkdirSync(item, { recursive: true });
  fs.writeFileSync(path.join(item, 'preview.json'), JSON.stringify(makeMeta('alpha'), null, 2));
  fs.writeFileSync(path.join(item, 'index.html'), '<!doctype html><html><body>a</body></html>');
  fs.writeFileSync(path.join(repo, '.solopreneur.json'), `${JSON.stringify({
    schemaVersion: 2,
    preview: {
      root: './docs/preview',
      defaultTarget: 'private',
      collections: COLLECTIONS,
      targets: {
        private: {
          provider: 'vercel',
          project: PROJECT,
          projectId: PROJECT_ID,
          teamId: TEAM_ID,
          visibility: 'private',
          include: ['active', 'archive'],
        },
      },
    },
  }, null, 2)}\n`);

  process.chdir(repo);
  process.env.HOME = repo;
  delete process.env.SOLOPRENEUR_CONFIG;
  delete process.env.CLAUDE_CONFIG_DIR;
  return repo;
}

test('the shipped CLI resolves a config by walking up and publishes through it', async () => {
  cliFixture();
  const deps = fakeDeps({ gitScript: cleanRepo() });
  const io = fakeIo();

  const code = await main({ argv: ['--json'], io, makeDeps: () => deps });
  assert.equal(code, 0);
  const report = JSON.parse(io.text().slice(io.text().indexOf('{')));
  assert.equal(report.state, 'published');
  assert.equal(report.stableUrl, `https://${SCOPE_ALIAS}`);
  assert.equal(report.project.name, PROJECT);
  assert.equal(report.project.projectId, PROJECT_ID);
  assert.deepEqual(report.collections, ['active', 'archive']);
  assert.equal(deps.calls.deploy[0].meta.previewKind, PREVIEW_KIND);
});

// --- production deps (argv construction, with an injected runner) ------------
//
// These are the only tests that touch the REAL deps factory, and they inject a
// fake process runner: no curl, no vercel, no git is ever spawned. They exist
// because the argv is where a `--prod` or a `rollback` would actually leak.

/** A fake process runner that records every spawn and returns scripted output. */
function fakeRun(stdout = '') {
  const spawned = [];
  const run = (cmd, args, options) => {
    spawned.push({ cmd, args, options });
    return { status: 0, stdout, stderr: '' };
  };
  run.spawned = spawned;
  return run;
}

test('makeDefaultDeps.deploy issues a PLAIN preview deploy with --meta and never --prod', () => {
  const run = fakeRun(`https://${PROJECT}-staged1-demoteam.vercel.app\n`);
  const deps = makeDefaultDeps({ token: 'tok', run });

  const result = deps.deploy({
    cwd: '/staging',
    meta: { previewKind: PREVIEW_KIND, snapshot: 'abc' },
    projectId: PROJECT_ID,
    orgId: TEAM_ID,
  });
  assert.equal(result.url, `https://${PROJECT}-staged1-demoteam.vercel.app`);

  const call = run.spawned.at(-1);
  assert.equal(call.cmd, 'vercel');
  assert.equal(call.options.cwd, '/staging');
  assert.deepEqual(call.args, [
    'deploy', '--yes', '--meta', `previewKind=${PREVIEW_KIND}`, '--meta', 'snapshot=abc',
  ]);
  // The two flags that would destroy the staging window, asserted by absence.
  assert.ok(!call.args.includes('--prod'), 'a staging deploy must never pass --prod');
  assert.ok(!call.args.includes('--skip-domain'), '--skip-domain does not stage the scope alias');
  // The documented non-interactive pinning, so an ignored link file cannot make the
  // CLI create a new project named after the temp staging dir.
  assert.equal(call.options.env.VERCEL_PROJECT_ID, PROJECT_ID);
  assert.equal(call.options.env.VERCEL_ORG_ID, TEAM_ID);
});

test('makeDefaultDeps.promote passes --yes and never invokes vercel rollback', () => {
  const run = fakeRun('');
  const deps = makeDefaultDeps({ token: 'tok', run });

  deps.promote({ cwd: '/staging', deployment: 'dpl_abc', projectId: PROJECT_ID, orgId: TEAM_ID });
  const call = run.spawned.at(-1);
  assert.deepEqual(call.args, ['promote', 'dpl_abc', '--yes']);
  assert.equal(call.options.env.VERCEL_PROJECT_ID, PROJECT_ID);
  assert.ok(
    !run.spawned.some((c) => c.args.includes('rollback')),
    'vercel rollback returns HTTP 500 on this account and must never be invoked',
  );
});

test('makeDefaultDeps surfaces a quota rejection as a clear, actionable error', () => {
  const run = (cmd, args) => ({
    status: 1,
    stdout: '',
    stderr: 'Error: Resource is limited - try again in 3 hours (more than 100, code: "api-deployments-free-per-day")',
  });
  const deps = makeDefaultDeps({ token: 'tok', run });

  assert.throws(
    () => deps.deploy({ cwd: '/staging', meta: {} }),
    isDeployError(/QUOTA/),
  );
});

test('makeDefaultDeps.git scopes every command to the content root', () => {
  const run = fakeRun('abc\n');
  const deps = makeDefaultDeps({ token: 'tok', run });

  assert.deepEqual(deps.git(['rev-parse', 'HEAD'], '/content'), { status: 0, stdout: 'abc\n' });
  assert.deepEqual(run.spawned.at(-1).args, ['-C', '/content', 'rev-parse', 'HEAD']);
});

test('makeDefaultDeps.getDeployment reads v13 by hostname, scoped to the team', () => {
  const run = fakeRun('{"uid":"dpl_1","target":"production"}\n200');
  const deps = makeDefaultDeps({ token: 'tok', run });

  const deployment = deps.getDeployment({ deploymentId: 'https://x-y.vercel.app/', teamId: TEAM_ID });
  assert.equal(deployment.uid, 'dpl_1');
  const call = run.spawned.at(-1);
  assert.equal(call.cmd, 'curl');
  // The scheme and trailing slash are stripped — the endpoint keys on a hostname.
  assert.ok(call.args.at(-1).endsWith(`/v13/deployments/x-y.vercel.app?teamId=${TEAM_ID}`), call.args.at(-1));
  // The token rides in curl's stdin config, never in argv (vercel-protect's rule).
  assert.ok(!call.args.some((a) => a.includes('tok')), 'the token must never reach argv');
  assert.match(call.options.input, /Authorization: Bearer tok/);
});

test('the human report names the stable entry, the immutable URL, the commit and the bare domain', async () => {
  cliFixture();
  const commit = '8'.repeat(40);
  const deps = fakeDeps({ gitScript: cleanRepo(commit) });
  const io = fakeIo();

  const code = await main({ argv: [], io, makeDeps: () => deps });
  assert.equal(code, 0);
  const text = io.text();
  assert.match(text, /published — the Library is live/);
  assert.match(text, new RegExp(`stable:\\s+https://${SCOPE_ALIAS.replace(/\./g, '\\.')}`));
  assert.match(text, /immutable:\s+https:\/\//);
  assert.match(text, new RegExp(`project:\\s+${PROJECT} \\(${PROJECT_ID}, ${TEAM_ID}\\)`));
  assert.match(text, /collections: active, archive/);
  assert.match(text, new RegExp(`commit:\\s+${commit}`));
  assert.match(text, /bare domain:/);
});
