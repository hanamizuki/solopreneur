/**
 * Tests for scripts/deploy-share.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * This module deploys into the SAME Vercel project as a published Library, so the
 * suite is built so it CANNOT touch the real thing: every Vercel call goes through
 * an injected fake `deps`, so there is ZERO real network, ZERO real deploys, and no
 * `vercel`/`curl` process is ever spawned. The only real I/O is the filesystem —
 * the REAL builder runs against a fixture content tree, which is what makes the
 * isolation and content-hash assertions meaningful rather than mocked.
 *
 * The fake models the Gate D platform facts the module exists to survive:
 *   - a plain `vercel deploy` produces a `target: null` preview and does not move
 *     `targets.production`;
 *   - the FIRST deployment of a project becomes production without `--prod` (so a
 *     project with no production is refused up front);
 *   - `?_vercel_share=<secret>` needs a redirect-following, cookie-carrying probe,
 *     which is a SEPARATE dep from the protected-entry probe;
 *   - `promote` must never be reached, so the fake records any attempt and the
 *     suite asserts it never happens.
 */

import { test, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  main,
  deployShare,
  listShares,
  revokeShare,
  parseShareRequest,
  shareInject,
  provenanceFooter,
  assertIsolated,
  makeDefaultDeps,
  ShareError,
  SHARE_KIND,
  FOOTER_CLASS,
  DEFAULT_TTL,
  MAX_TTL,
} from '../scripts/deploy-share.mjs';
import { buildLibrary } from '../scripts/build-library.mjs';
import { LEGACY_PROTECTION } from '../scripts/vercel-protect.mjs';
import { PREVIEW_KIND } from '../scripts/deploy-library.mjs';

const ORIGINAL_CWD = process.cwd();
const ENV_KEYS = ['HOME', 'SOLOPRENEUR_CONFIG', 'CLAUDE_CONFIG_DIR'];

/**
 * This file gets its OWN TMPDIR, and that is load-bearing rather than tidiness.
 *
 * `node --test` runs test FILES in parallel processes, and build-library.test.mjs
 * asserts on the COUNT of `preview-build-*` directories in `os.tmpdir()` to prove an
 * aborted build removes its staging tree. This suite drives the REAL builder, so its
 * staging dirs would land in that same shared namespace and make that assertion
 * flaky — observed failing exactly that way. `os.tmpdir()` reads `TMPDIR` on every
 * call and each file is a separate process, so redirecting it here is fully contained
 * and needs no change to the sibling suite or to build-library.mjs.
 *
 * Set before any `tmp()` call: module-level statements run before the tests do.
 */
const TMP_HOME = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'solo-share-tmp-'));
process.env.TMPDIR = TMP_HOME;

const fixtures = [];
after(() => {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(TMP_HOME, { recursive: true, force: true });
});

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
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-share-')));
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
const PRODUCTION_ID = 'dpl_library_production';
const SECRET = 'Sh4reAbleL1nkSecret';

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

/**
 * A content root the REAL builder can stage. Each item carries the per-page overlay
 * tag the builder is expected to rewrite, so the Share artifact's overlay wiring is
 * exercised end to end rather than assumed.
 */
function contentRoot({ ids = ['alpha'], meta = {}, extraFiles = {} } = {}) {
  const root = path.join(tmp(), 'docs', 'preview');
  for (const collection of ['active', 'archive']) fs.mkdirSync(path.join(root, collection), { recursive: true });
  for (const id of ids) {
    const dir = path.join(root, 'active', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'preview.json'), JSON.stringify(makeMeta(id, meta[id] ?? {}), null, 2));
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      `<!doctype html><html><body><h1>${id}</h1>\n<script src="./comment-overlay.js"></script>\n</body></html>`,
    );
    for (const [rel, body] of Object.entries(extraFiles[id] ?? {})) {
      const target = path.join(dir, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
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

/**
 * The revision + contentHash the REAL builder derives for an item. The Share request
 * has to carry exactly these, so they are computed the same way rather than
 * hardcoded — a builder change to the canonical payload then shows up as a test
 * failure in the mismatch cases, not as a silently-passing suite.
 */
function itemFacts(root, id) {
  const built = buildLibrary({ root, collections: COLLECTIONS, include: ['active', 'archive'], gitCommit: () => null });
  try {
    const row = built.directory.items.find((r) => r.id === id);
    assert.ok(row, `fixture has no item ${id}`);
    return { revision: row.revision, contentHash: row.contentHash };
  } finally {
    fs.rmSync(built.stagingDir, { recursive: true, force: true });
  }
}

/** A well-formed Share request for `id`, pinned to what the builder actually derives. */
function shareRequest(root, id, over = {}) {
  const facts = itemFacts(root, id);
  return {
    previewId: id,
    revision: facts.revision,
    contentHash: facts.contentHash,
    access: 'project-members',
    sourceUrl: `https://${PROJECT}-demoteam.vercel.app/p/${id}/`,
    ...over,
  };
}

/** A fake `io`, with a scriptable stdin. */
function fakeIo({ stdin } = {}) {
  const printed = [];
  const reported = [];
  const stdinReads = [];
  return {
    printed,
    reported,
    stdinReads,
    text: () => printed.join(''),
    reportText: () => reported.join(''),
    print: (s) => printed.push(s),
    report: (s) => reported.push(s),
    readStdin: (what) => {
      stdinReads.push(what);
      if (stdin === undefined) throw new ShareError(`nothing was piped on stdin (${what})`);
      return stdin;
    },
  };
}

/** Every file in a tree, as `relative path -> contents`. */
function snapshotTree(dir) {
  const files = {};
  const walk = (abs, rel) => {
    for (const dirent of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${dirent.name}` : dirent.name;
      if (dirent.isDirectory()) walk(path.join(abs, dirent.name), childRel);
      else files[childRel] = fs.readFileSync(path.join(abs, dirent.name), 'utf8');
    }
  };
  walk(dir, '');
  return files;
}

/**
 * The fake Vercel `deps`.
 *
 * `production` is the id `targets.production` points at (null = never published).
 * Every call is recorded on `calls` so ORDER and ABSENCE can be asserted — most of
 * the acceptance criteria are about what was NOT issued.
 *
 * Scriptable knobs: `probe` maps a hostname to the status an anonymous request gets
 * (default 302 = protected); `shareProbe` is the SEPARATE redirect-following probe,
 * whose result models the VERIFIED platform behavior — it reports both the status and
 * where the redirect chain LANDED, because a dead secret also answers 200 (on
 * vercel.com/login). Default: 200 on the deployment host = the link reads;
 * `deployFails` makes the CLI call throw;
 * `deployedTarget` overrides the target a plain deploy produces; `deployedMeta`
 * overrides the metadata it carries; `bypassResponse` overrides the shareable-link
 * PATCH response; `productionAfterDeploy` models the pointer moving mid-Share.
 */
function fakeDeps({
  production = PRODUCTION_ID,
  productionAfterDeploy,
  sso = LEGACY_PROTECTION,
  probe = {},
  shareProbe = 200,
  deployFails,
  deployedTarget = null,
  deployedMeta,
  deployedProjectId = PROJECT_ID,
  readyState = 'READY',
  bypassResponse,
  bypassFails,
  deployments = [],
  store = {},
  accountId = TEAM_ID,
  projectName = PROJECT,
  projectId = PROJECT_ID,
} = {}) {
  const state = { production, sso, deployed: null };
  const records = { ...store };
  const calls = {
    log: [],
    order: [],
    getProject: [],
    getDeployment: [],
    deploy: [],
    listDeployments: [],
    bypass: [],
    patch: [],
    probe: [],
    probeShare: [],
    promote: [],
    delete: [],
    listDomains: [],
  };
  const note = (name, arg) => { calls.log.push({ name, arg }); calls.order.push(name); calls[name].push(arg); };

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
      const found = records[a.deploymentId] ?? Object.values(records).find((d) => d.url === a.deploymentId);
      if (!found) throw new Error(`fakeDeps: no such deployment ${a.deploymentId}`);
      return found;
    },
    patchSsoProtection: async (a) => { note('patch', a); state.sso = a.deploymentType; return {}; },
    deleteDomain: async (a) => { note('delete', a); return { status: 404 }; },
    listDomains: async (a) => { note('listDomains', a); return []; },

    probe: async (url) => {
      note('probe', url);
      return { status: probe[url.replace(/^https?:\/\//, '')] ?? 302 };
    },
    // Models the verified redirect chain: a WORKING secret ends 200 on the
    // deployment's own host; a dead one ends 200 on vercel.com/login. `shareProbe`
    // may be a number (status, landing on the deployment host), a full
    // `{status, url}`, or a function of the probed URL.
    probeShare: async (url) => {
      note('probeShare', url);
      const scripted = typeof shareProbe === 'function' ? shareProbe(url) : shareProbe;
      if (scripted !== null && typeof scripted === 'object') return scripted;
      // A non-200 never followed through to content, so it reports no landing URL —
      // exactly what the real probe does when the chain did not complete.
      const landed = scripted === 200 ? String(url).split('?')[0] : null;
      return { status: scripted, url: landed };
    },

    // A plain preview deploy. Records the exact meta AND a full snapshot of the
    // directory being uploaded, which is what the isolation and
    // secret-never-written assertions read.
    deploy: async ({ cwd, meta, projectId: pinned, orgId }) => {
      note('deploy', { cwd, meta, orgId, projectId: pinned, tree: snapshotTree(cwd) });
      if (deployFails) throw new ShareError(deployFails);
      const id = 'dpl_share_1';
      const url = `${PROJECT}-share1-demoteam.vercel.app`;
      records[id] = {
        id,
        url,
        projectId: deployedProjectId,
        readyState,
        target: deployedTarget,
        meta: deployedMeta ?? { ...meta },
      };
      records[url] = records[id];
      state.deployed = id;
      if (deployedTarget === 'production') state.production = id;
      if (productionAfterDeploy !== undefined) state.production = productionAfterDeploy;
      return { url: `https://${url}` };
    },

    listDeployments: async (a) => { note('listDeployments', a); return deployments; },

    patchProtectionBypass: async (a) => {
      note('bypass', a);
      if (bypassFails) throw new Error(bypassFails);
      if (a.body?.revoke) return { protectionBypass: {} };
      return bypassResponse ?? { protectionBypass: { [SECRET]: { scope: 'shareable-link', createdAt: 1 } } };
    },

    // Never called by this module — a Share is a preview and has nothing to
    // promote. Present only so a regression that reaches for it fails the suite.
    promote: async (a) => { note('promote', a); throw new Error('a Share must never promote'); },
  };
  deps.calls = calls;
  deps.state = state;
  deps.records = records;
  return deps;
}

const isShareError = (re) => (err) => err instanceof ShareError && re.test(err.message);

/** Run `deployShare`, returning `{ report, error }` rather than throwing. */
async function run({ root, deps, request, io = fakeIo(), over = {}, ttl }) {
  try {
    const report = await deployShare({
      resolved: resolvedConfig(root, over),
      request: request ?? shareRequest(root, 'alpha'),
      ...(ttl === undefined ? {} : { ttl }),
      deps,
      io,
    });
    return { report, error: null, io };
  } catch (error) {
    return { report: null, error, io };
  }
}

// --- request parsing --------------------------------------------------------

test('parseShareRequest accepts the request the in-page Share block produces', () => {
  const request = parseShareRequest(JSON.stringify({
    schemaVersion: 1,
    kind: 'preview-share-request',
    previewId: 'alpha',
    revision: 3,
    contentHash: `sha256:${'a'.repeat(64)}`,
    url: 'https://x-y.vercel.app/p/alpha/',
    access: 'anyone-with-link',
  }));
  assert.deepEqual(request, {
    previewId: 'alpha',
    revision: 3,
    contentHash: `sha256:${'a'.repeat(64)}`,
    access: 'anyone-with-link',
    sourceUrl: 'https://x-y.vercel.app/p/alpha/',
  });
});

test('parseShareRequest accepts the doc-named sourceUrl alias for the item URL', () => {
  const request = parseShareRequest(JSON.stringify({
    schemaVersion: 1,
    previewId: 'alpha',
    revision: 1,
    contentHash: `sha256:${'b'.repeat(64)}`,
    sourceUrl: 'https://x-y.vercel.app/p/alpha/',
    access: 'project-members',
  }));
  assert.equal(request.sourceUrl, 'https://x-y.vercel.app/p/alpha/');
});

test('parseShareRequest refuses malformed and unknown-schema requests', () => {
  const base = {
    schemaVersion: 1,
    previewId: 'alpha',
    revision: 1,
    contentHash: `sha256:${'c'.repeat(64)}`,
    access: 'project-members',
  };
  const cases = [
    ['', /empty/],
    ['   ', /empty/],
    ['{not json', /not valid JSON/],
    ['[1,2]', /not a JSON object/],
    [JSON.stringify({ ...base, schemaVersion: 2 }), /unsupported Share request schemaVersion 2/],
    [JSON.stringify({ ...base, schemaVersion: undefined }), /unsupported Share request schemaVersion null/],
    [JSON.stringify({ ...base, kind: 'something-else' }), /not a Share request/],
    [JSON.stringify({ ...base, previewId: null }), /no usable previewId/],
    [JSON.stringify({ ...base, previewId: '../escape' }), /no usable previewId/],
    [JSON.stringify({ ...base, previewId: 'UPPER' }), /no usable previewId/],
    [JSON.stringify({ ...base, revision: null }), /no usable revision/],
    [JSON.stringify({ ...base, revision: 0 }), /no usable revision/],
    [JSON.stringify({ ...base, revision: 1.5 }), /no usable revision/],
    [JSON.stringify({ ...base, revision: '1' }), /no usable revision/],
    [JSON.stringify({ ...base, contentHash: null }), /no usable contentHash/],
    [JSON.stringify({ ...base, contentHash: 'deadbeef' }), /no usable contentHash/],
    [JSON.stringify({ ...base, contentHash: `sha256:${'Z'.repeat(64)}` }), /no usable contentHash/],
    [JSON.stringify({ ...base, access: 'public' }), /unknown Share access/],
    [JSON.stringify({ ...base, access: null }), /unknown Share access/],
  ];
  for (const [text, re] of cases) {
    assert.throws(() => parseShareRequest(text), isShareError(re), `expected ${re} for ${text.slice(0, 60)}`);
  }
});

// --- the isolated artifact --------------------------------------------------

test('the Share artifact puts the preview at the root and carries only its own files', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'], extraFiles: { alpha: { 'assets/app.js': 'ALPHA_ASSET' } } });
  const deps = fakeDeps();

  const { report, error } = await run({ root, deps });
  assert.ifError(error);
  assert.equal(report.state, 'shared');

  const tree = deps.calls.deploy[0].tree;
  const names = Object.keys(tree).sort();
  // The preview IS the root page, and the shared overlay merged into its own assets.
  assert.ok(names.includes('index.html'), names.join(', '));
  assert.ok(names.includes('assets/comment-overlay.js'), names.join(', '));
  assert.ok(names.includes('assets/app.js'), names.join(', '));
  // Nothing from the Library, and nothing from the other item.
  assert.ok(!names.some((n) => n === 'directory.json'), 'no directory.json');
  assert.ok(!names.some((n) => n.endsWith('preview.json')), 'no raw preview.json');
  assert.ok(!names.some((n) => n.startsWith('p/')), 'no /p/<id>/ route tree');
  assert.ok(!names.includes('assets/preview-shell.js'), 'no Library shell asset');
  const all = JSON.stringify(tree);
  assert.ok(!all.includes('beta'), 'no other item leaked into the artifact');
  assert.ok(!all.includes('__DIRECTORY_JSON__'), 'no Library index template');
});

test('the Share entry keeps the comment overlay but drops the Library shell', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps });
  assert.ifError(error);

  const html = deps.calls.deploy[0].tree['index.html'];
  assert.match(html, /<script src="\/assets\/comment-overlay\.js" data-preview-id="alpha"><\/script>/);
  assert.ok(!html.includes('preview-shell.js'), 'the sidebar/Share shell must not ship on a snapshot');
  assert.ok(!html.includes('preview-shell-data'), 'the shell data island must not ship either');
  assert.match(html, new RegExp(`class="${FOOTER_CLASS}"`));
  assert.match(html, /Produced by/);
  assert.match(html, /revision 1/);
  // The footer sits inside <body>, at the injection seam.
  assert.ok(html.indexOf(FOOTER_CLASS) < html.lastIndexOf('</body>'), 'the footer must precede </body>');
});

test('the .vercel link file pins the confirmed project, and is not part of the audit', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps });
  assert.ifError(error);

  const tree = deps.calls.deploy[0].tree;
  assert.deepEqual(JSON.parse(tree['.vercel/project.json']), { projectId: PROJECT_ID, orgId: TEAM_ID });
  assert.equal(deps.calls.deploy[0].projectId, PROJECT_ID);
  assert.equal(deps.calls.deploy[0].orgId, TEAM_ID);
});

test('both temp roots are removed after a successful Share', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  let stagingDir;
  const report = await deployShare({
    resolved: resolvedConfig(root),
    request: shareRequest(root, 'alpha'),
    deps,
    io: fakeIo(),
    build: (o) => { const built = buildLibrary(o); stagingDir = built.stagingDir; return built; },
  });
  assert.equal(report.state, 'shared');
  assert.ok(!fs.existsSync(stagingDir), 'the Library staging tree must not survive');
  assert.ok(!fs.existsSync(deps.calls.deploy[0].cwd), 'the Share artifact must not survive');
});

test('both temp roots are removed after a refusal too (the Library tree holds every item)', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'] });
  const deps = fakeDeps();
  let stagingDir;
  await assert.rejects(
    deployShare({
      resolved: resolvedConfig(root),
      request: shareRequest(root, 'alpha', { revision: 99 }),
      deps,
      io: fakeIo(),
      build: (o) => { const built = buildLibrary(o); stagingDir = built.stagingDir; return built; },
    }),
    isShareError(/has changed since that Share request was copied/),
  );
  assert.ok(!fs.existsSync(stagingDir), 'a refusal must not leak the Library staging tree');
});

test('assertIsolated refuses a Library tree and an unconfirmable root page', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'p', 'beta'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), `<footer class="${FOOTER_CLASS}"></footer>`);
  assert.throws(() => assertIsolated(dir), isShareError(/must not contain a \/p\/ route tree/));

  const two = tmp();
  fs.writeFileSync(path.join(two, 'index.html'), `<footer class="${FOOTER_CLASS}"></footer>`);
  fs.writeFileSync(path.join(two, 'directory.json'), '{}');
  assert.throws(() => assertIsolated(two), isShareError(/must not contain directory\.json/));

  const three = tmp();
  fs.mkdirSync(path.join(three, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(three, 'index.html'), `<footer class="${FOOTER_CLASS}"></footer>`);
  fs.writeFileSync(path.join(three, 'nested', 'preview.json'), '{}');
  assert.throws(() => assertIsolated(three), isShareError(/must not contain nested\/preview\.json/));

  const four = tmp();
  fs.writeFileSync(path.join(four, 'other.html'), 'x');
  assert.throws(() => assertIsolated(four), isShareError(/no root index\.html/));

  const five = tmp();
  fs.writeFileSync(path.join(five, 'index.html'), '<html><body>the Library index</body></html>');
  assert.throws(() => assertIsolated(five), isShareError(/not the injected preview entry/));
});

test('a preview shipping a plain file named "assets" is refused, not crashed on', async () => {
  const root = contentRoot({ extraFiles: { alpha: { assets: 'not a directory' } } });
  const deps = fakeDeps();
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/non-directory named "assets"/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, [], 'nothing may be deployed');
});

// --- shareInject / footer ---------------------------------------------------

const fakeItem = (over = {}) => ({
  id: 'alpha',
  metaFile: '/fixture/preview.json',
  contentHash: `sha256:${'d'.repeat(64)}`,
  meta: makeMeta('alpha', over),
});

test('shareInject refuses when the shell block cannot be isolated exactly once', () => {
  // A page whose own content repeats the exact injected markup: chromeInject adds
  // one more, so the block appears twice and neither can be picked unambiguously.
  const shell = '<script id="preview-shell-data" type="application/json">{}</script>\n'
    + '<script src="/assets/preview-shell.js"></script>\n';
  assert.throws(
    () => shareInject(`<html><body>${shell}</body></html>`, fakeItem()),
    isShareError(/found 2 injected shell block\(s\)/),
  );
});

test('provenanceFooter HTML-escapes every display value it renders', () => {
  const html = provenanceFooter(fakeItem({
    provenance: { createdBy: { agent: '<img src=x onerror="alert(1)">', platform: 'claude' } },
  }));
  assert.ok(!html.includes('<img'), html);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  // The style attribute is quote-free by construction, so it cannot be broken out of.
  assert.ok(!/style="[^"]*"[^>]*"/.test(html), html);
});

test('provenanceFooter collapses to one line for an unrecorded provenance', () => {
  const html = provenanceFooter(fakeItem());
  assert.match(html, /Produced by<\/span> unrecorded/);
  assert.match(html, /Created 2026-01-01T00:00:00Z/);
  assert.match(html, /Updated 2026-01-02T00:00:00Z/);
});

test('provenanceFooter shows two lines when creator and last updater differ', () => {
  const html = provenanceFooter(fakeItem({
    provenance: { createdBy: { agent: 'nana' }, lastUpdatedBy: { agent: 'builder' } },
  }));
  assert.match(html, /Created by<\/span> nana/);
  assert.match(html, /Last updated by<\/span> builder/);
});

// --- fail closed on drift ---------------------------------------------------

test('a revision mismatch deploys NOTHING and says how to recover', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps, request: shareRequest(root, 'alpha', { revision: 2 }) });
  assert.ok(isShareError(/has changed since that Share request was copied/)(error), `got ${error?.message}`);
  assert.match(error.message, /requested: revision 2/);
  assert.match(error.message, /reopen the latest Library page/);
  assert.deepEqual(deps.calls.deploy, [], 'a drifted request must cost zero deployments');
});

test('a contentHash mismatch deploys NOTHING even when the revision matches', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps, request: shareRequest(root, 'alpha', { contentHash: `sha256:${'0'.repeat(64)}` }) });
  assert.ok(isShareError(/has changed since that Share request was copied/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, []);
});

test('an unknown previewId deploys NOTHING and names the ids that do exist', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'] });
  const deps = fakeDeps();
  const { error } = await run({ root, deps, request: shareRequest(root, 'alpha', { previewId: 'gamma' }) });
  assert.ok(isShareError(/no preview "gamma"/)(error), `got ${error?.message}`);
  assert.match(error.message, /ids found: (alpha, beta|beta, alpha)/);
  assert.deepEqual(deps.calls.deploy, []);
});

// --- the first-deployment trap ---------------------------------------------

test('a project with no production deployment is refused (first deploy becomes production)', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ production: null });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/has no production deployment yet/)(error), `got ${error?.message}`);
  assert.match(error.message, /Publish the Library first/);
  assert.deepEqual(deps.calls.deploy, [], 'the refusal must precede any deploy');
});

test('a Share that lands as PRODUCTION is reported loudly, never as success', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ deployedTarget: 'production' });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/landed as a PRODUCTION deployment/)(error), `got ${error?.message}`);
  assert.match(error.message, /stable entry may have MOVED/);
});

test('a Share refuses when the project production pointer moved during it', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ productionAfterDeploy: 'dpl_somebody_else' });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/production deployment changed during this Share/)(error), `got ${error?.message}`);
});

test('the report states Library production was not moved', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { report, error } = await run({ root, deps });
  assert.ifError(error);
  assert.deepEqual(report.libraryProduction, { id: PRODUCTION_ID, moved: false });
  assert.equal(deps.state.production, PRODUCTION_ID, 'the fake production pointer must be untouched');
});

// --- never --prod, never promote -------------------------------------------

test('exactly one deploy is issued, and promote is never reached', async () => {
  const root = contentRoot({ ids: ['alpha', 'beta'] });
  const deps = fakeDeps();
  const { error } = await run({ root, deps });
  assert.ifError(error);
  assert.equal(deps.calls.deploy.length, 1);
  assert.deepEqual(deps.calls.promote, [], 'a Share must never promote');
});

test('protection is asserted BEFORE the content is deployed', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ sso: null });
  const { error } = await run({ root, deps });
  assert.ifError(error);
  const patchAt = deps.calls.order.indexOf('patch');
  const deployAt = deps.calls.order.indexOf('deploy');
  assert.ok(patchAt !== -1 && patchAt < deployAt, `protection must precede the deploy (${deps.calls.order.join(' → ')})`);
  assert.equal(deps.state.sso, LEGACY_PROTECTION);
});

test('a non-private target is refused before any Vercel call', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps, over: { target: { visibility: 'public' } } });
  assert.ok(isShareError(/shares from PRIVATE targets only/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.getProject, []);
});

// --- deployment verification ----------------------------------------------

test('the deployment metadata carries previewKind=share plus id, revision and hash', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { report, error } = await run({ root, deps });
  assert.ifError(error);
  const { meta } = deps.calls.deploy[0];
  assert.equal(meta.previewKind, SHARE_KIND);
  assert.notEqual(meta.previewKind, PREVIEW_KIND, 'a Share must be distinguishable from a Library publish');
  assert.equal(meta.previewId, 'alpha');
  assert.equal(meta.revision, String(report.revision), 'Vercel returns meta values as strings');
  assert.equal(meta.contentHash, report.contentHash);
  for (const value of Object.values(meta)) assert.equal(typeof value, 'string');
});

test('a deployment whose metadata is not ours is refused', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ deployedMeta: { previewKind: SHARE_KIND, previewId: 'alpha', revision: '9', contentHash: 'x' } });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/metadata revision="9" does not match/)(error), `got ${error?.message}`);
});

test('a deployment that is not READY, or in another project, is refused', async () => {
  const root = contentRoot();
  const notReady = await run({ root, deps: fakeDeps({ readyState: 'BUILDING' }) });
  assert.ok(isShareError(/not READY/)(notReady.error), `got ${notReady.error?.message}`);

  const elsewhere = await run({ root, deps: fakeDeps({ deployedProjectId: 'prj_other' }) });
  assert.ok(isShareError(/belongs to project "prj_other"/)(elsewhere.error), `got ${elsewhere.error?.message}`);
});

test('a deployment that reports a staging target is refused', async () => {
  const root = contentRoot();
  const { error } = await run({ root, deps: fakeDeps({ deployedTarget: 'staging' }) });
  assert.ok(isShareError(/must be a plain preview \(target: null\)/)(error), `got ${error?.message}`);
});

test('a quota rejection from the CLI surfaces as the deploy failure', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ deployFails: 'Vercel rejected the deployment for QUOTA (deployments per day).' });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/QUOTA/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.bypass, [], 'no shareable link for a deployment that does not exist');
});

// --- access: project-members ----------------------------------------------

test('project-members reports the protected preview URL and verifies it anonymously', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { report, error } = await run({ root, deps });
  assert.ifError(error);
  assert.equal(report.access, 'project-members');
  assert.equal(report.previewUrl, `https://${PROJECT}-share1-demoteam.vercel.app`);
  assert.equal(report.shareUrl, null);
  assert.equal(report.shareSecret, null);
  assert.deepEqual(deps.calls.probe, [report.previewUrl], 'the deployment must be probed anonymously');
  assert.deepEqual(deps.calls.bypass, [], 'project-members must never create a bypass');
});

test('project-members fails closed when the deployment answers a naked 200', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ probe: { [`${PROJECT}-share1-demoteam.vercel.app`]: 200 } });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/not anonymously challenged/)(error), `got ${error?.message}`);
  assert.match(error.message, /a 200 means it is world-readable/);
});

test('an unconfirmable probe status also fails closed', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ probe: { [`${PROJECT}-share1-demoteam.vercel.app`]: 0 } });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/not anonymously challenged/)(error), `got ${error?.message}`);
});

// --- access: anyone-with-link --------------------------------------------

const linkRequest = (root) => shareRequest(root, 'alpha', { access: 'anyone-with-link' });

test('anyone-with-link issues the aliases PATCH with {ttl} and builds the share URL', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { report, error } = await run({ root, deps, request: linkRequest(root) });
  assert.ifError(error);

  assert.equal(deps.calls.bypass.length, 1);
  assert.deepEqual(deps.calls.bypass[0], {
    deploymentId: 'dpl_share_1',
    teamId: TEAM_ID,
    body: { ttl: DEFAULT_TTL },
  });
  assert.equal(report.shareUrl, `${report.previewUrl}?_vercel_share=${SECRET}`);
  assert.equal(report.shareSecret, SECRET);
  assert.equal(report.ttl, DEFAULT_TTL);
  // Success only after the anonymous 200 through the redirect + cookie.
  assert.deepEqual(deps.calls.probeShare, [report.shareUrl]);
  // The naked URL is still verified as challenged, proving the secret is the key.
  assert.deepEqual(deps.calls.probe, [report.previewUrl]);
});

test('anyone-with-link honours an explicit ttl and omits it for never', async () => {
  const root = contentRoot();
  const bounded = fakeDeps();
  const a = await run({ root, deps: bounded, request: linkRequest(root), ttl: 60 });
  assert.ifError(a.error);
  assert.deepEqual(bounded.calls.bypass[0].body, { ttl: 60 });

  const forever = fakeDeps();
  const b = await run({ root, deps: forever, request: linkRequest(root), ttl: null });
  assert.ifError(b.error);
  assert.deepEqual(forever.calls.bypass[0].body, {}, 'a never-expiring link omits ttl entirely');
  assert.equal(b.report.ttl, null);
});

test('an out-of-range ttl is refused before anything is built', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps, request: linkRequest(root), ttl: MAX_TTL + 1 });
  assert.ok(isShareError(/invalid ttl/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.getProject, []);
});

test('anyone-with-link fails closed on a non-200 probe AND revokes the unverified link', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ shareProbe: 302 });
  const { error } = await run({ root, deps, request: linkRequest(root) });
  assert.ok(isShareError(/could not be read anonymously \(HTTP 302/)(error), `got ${error?.message}`);
  assert.match(error.message, /the link was revoked/);
  assert.equal(deps.calls.bypass.length, 2, 'create, then revoke');
  assert.deepEqual(deps.calls.bypass[1].body, { revoke: { secret: SECRET, regenerate: false } });
});

/**
 * The fail-OPEN this check exists to close, verified against a real protected
 * deployment: `?_vercel_share=<dead secret>` redirects to `https://vercel.com/login`,
 * which is itself a perfectly normal HTTP **200**. A probe that only looked at the
 * status would report a dead link as a working public share.
 */
test('anyone-with-link fails closed when a 200 is the SSO login page, not the preview', async () => {
  const root = contentRoot();
  const deps = fakeDeps({
    shareProbe: { status: 200, url: 'https://vercel.com/login?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fx' },
  });
  const { error } = await run({ root, deps, request: linkRequest(root) });
  assert.ok(isShareError(/could not be read anonymously/)(error), `got ${error?.message}`);
  assert.match(error.message, /landed on "https:\/\/vercel\.com\/login/);
  assert.equal(deps.calls.bypass.length, 2, 'the unverified link must be revoked');
});

test('anyone-with-link fails closed when the probe reports no landing URL at all', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ shareProbe: { status: 200, url: null } });
  const { error } = await run({ root, deps, request: linkRequest(root) });
  assert.ok(isShareError(/could not be read anonymously/)(error), `got ${error?.message}`);
});

test('anyone-with-link accepts a 200 that landed on the deployment host', async () => {
  const root = contentRoot();
  const host = `${PROJECT}-share1-demoteam.vercel.app`;
  // Host match is case-insensitive and ignores the path the clean URL redirected to.
  const deps = fakeDeps({ shareProbe: { status: 200, url: `https://${host.toUpperCase()}/` } });
  const { report, error } = await run({ root, deps, request: linkRequest(root) });
  assert.ifError(error);
  assert.equal(report.shareSecret, SECRET);
  assert.equal(deps.calls.bypass.length, 1, 'a verified link must NOT be revoked');
});

test('a probe failure whose revoke ALSO fails says the link may still be live', async () => {
  const root = contentRoot();
  let calls = 0;
  const deps = fakeDeps({ shareProbe: 404 });
  const inner = deps.patchProtectionBypass;
  deps.patchProtectionBypass = async (a) => {
    calls += 1;
    if (calls > 1) throw new Error('revoke exploded');
    return inner(a);
  };
  const { error } = await run({ root, deps, request: linkRequest(root) });
  assert.ok(isShareError(/could NOT be revoked either/)(error), `got ${error?.message}`);
  assert.match(error.message, /Vercel dashboard/);
});

test('a shareable-link response without exactly one shareable-link secret is refused', async () => {
  const root = contentRoot();
  for (const [response, re] of [
    [{ protectionBypass: {} }, /carried 0 shareable-link secret/],
    [{}, /carried 0 shareable-link secret/],
    [{ protectionBypass: { s1: { scope: 'shareable-link' }, s2: { scope: 'shareable-link' } } }, /carried 2 shareable-link secret/],
    // An automation-bypass secret must NEVER be mistaken for a shareable link: it
    // would unlock the whole project.
    [{ protectionBypass: { auto: { scope: 'automation-bypass' } } }, /carried 0 shareable-link secret/],
  ]) {
    const deps = fakeDeps({ bypassResponse: response });
    const { error } = await run({ root, deps, request: linkRequest(root) });
    assert.ok(isShareError(re)(error), `got ${error?.message}`);
  }
});

test('a failed shareable-link PATCH says the deployment is live but members-only', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ bypassFails: 'HTTP 403' });
  const { error } = await run({ root, deps, request: linkRequest(root) });
  assert.ok(isShareError(/could not create a shareable link/)(error), `got ${error?.message}`);
  assert.match(error.message, /only reachable by project members/);
});

test('the x-vercel-protection-bypass parameter is never used for sharing', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { error } = await run({ root, deps, request: linkRequest(root) });
  assert.ifError(error);
  const everything = JSON.stringify(deps.calls.log);
  assert.ok(
    !/x-vercel-protection-bypass/i.test(everything),
    'that header only accepts a project-wide automation-bypass secret — using it would unlock the whole project',
  );
});

test('the shareable-link secret is never written to a file nor into deployment metadata', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const { report, error } = await run({ root, deps, request: linkRequest(root) });
  assert.ifError(error);
  assert.equal(report.shareSecret, SECRET);
  // Everything the deploy uploaded — the secret does not exist yet at that point
  // and must never be added afterwards.
  const uploaded = JSON.stringify(deps.calls.deploy[0].tree);
  assert.ok(!uploaded.includes(SECRET), 'the secret must not appear in any deployed file');
  assert.ok(!JSON.stringify(deps.calls.deploy[0].meta).includes(SECRET), 'nor in deployment metadata');
  // Nor anywhere under the content root (preview.json / directory.json / git).
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory()
    ? walk(path.join(dir, d.name))
    : [fs.readFileSync(path.join(dir, d.name), 'utf8')]));
  assert.ok(!walk(root).some((body) => body.includes(SECRET)), 'nor anywhere in the content tree');
});

// --- --list ----------------------------------------------------------------

const deploymentRow = (over = {}) => ({
  uid: 'dpl_x',
  url: 'x-y.vercel.app',
  readyState: 'READY',
  target: null,
  createdAt: 1767225600000,
  meta: { previewKind: SHARE_KIND, previewId: 'alpha', revision: '1', contentHash: `sha256:${'e'.repeat(64)}` },
  ...over,
});

test('--list keeps only previewKind=share and can narrow to one previewId', async () => {
  const deployments = [
    deploymentRow({ uid: 'dpl_share_alpha' }),
    deploymentRow({ uid: 'dpl_share_beta', meta: { previewKind: SHARE_KIND, previewId: 'beta', revision: '2' } }),
    deploymentRow({ uid: 'dpl_library', target: 'production', meta: { previewKind: PREVIEW_KIND, snapshot: 'abc' } }),
    deploymentRow({ uid: 'dpl_foreign', meta: {} }),
    deploymentRow({ uid: 'dpl_nometa', meta: undefined }),
  ];
  const all = await listShares({ resolved: resolvedConfig(contentRoot()), deps: fakeDeps({ deployments }), io: fakeIo() });
  assert.deepEqual(all.shares.map((s) => s.deploymentId), ['dpl_share_alpha', 'dpl_share_beta']);
  assert.equal(all.shares[0].url, 'https://x-y.vercel.app');
  assert.equal(all.shares[0].createdAt, '2026-01-01T00:00:00.000Z');

  const one = await listShares({
    resolved: resolvedConfig(contentRoot()),
    previewId: 'beta',
    deps: fakeDeps({ deployments }),
    io: fakeIo(),
  });
  assert.deepEqual(one.shares.map((s) => s.deploymentId), ['dpl_share_beta']);
});

test('--list passes projectId and limit, and tolerates a non-array response', async () => {
  const deps = fakeDeps({ deployments: null });
  const report = await listShares({ resolved: resolvedConfig(contentRoot()), limit: 7, deps, io: fakeIo() });
  assert.deepEqual(report.shares, []);
  assert.deepEqual(deps.calls.listDeployments[0], { projectId: PROJECT_ID, teamId: TEAM_ID, limit: 7 });
});

// --- --revoke --------------------------------------------------------------

const shareRecord = (over = {}) => ({
  id: 'dpl_share_1',
  url: `${PROJECT}-share1-demoteam.vercel.app`,
  projectId: PROJECT_ID,
  readyState: 'READY',
  target: null,
  meta: { previewKind: SHARE_KIND, previewId: 'alpha', revision: '1' },
  ...over,
});

test('--revoke issues the documented revoke body and confirms it anonymously', async () => {
  const deps = fakeDeps({ store: { dpl_share_1: shareRecord() }, shareProbe: 302 });
  const report = await revokeShare({
    resolved: resolvedConfig(contentRoot()),
    deploymentId: 'dpl_share_1',
    secret: SECRET,
    deps,
    io: fakeIo(),
  });
  assert.equal(report.state, 'revoked');
  assert.equal(report.confirmed, true);
  assert.deepEqual(deps.calls.bypass[0], {
    deploymentId: 'dpl_share_1',
    teamId: TEAM_ID,
    body: { revoke: { secret: SECRET, regenerate: false } },
  });
  assert.deepEqual(deps.calls.probeShare, [`https://${PROJECT}-share1-demoteam.vercel.app?_vercel_share=${SECRET}`]);
});

test('--revoke refuses to report success while the secret still reads the deployment', async () => {
  const deps = fakeDeps({ store: { dpl_share_1: shareRecord() }, shareProbe: 200 });
  await assert.rejects(
    revokeShare({ resolved: resolvedConfig(contentRoot()), deploymentId: 'dpl_share_1', secret: SECRET, deps, io: fakeIo() }),
    isShareError(/STILL readable with that secret/),
  );
});

/**
 * The mirror of the fail-open above: a SUCCESSFUL revoke redirects to
 * vercel.com/login, which answers 200. A bare status check would call every good
 * revoke a failure and send the user chasing a link that is already gone.
 */
test('--revoke treats a 200 SSO login page as revoked, not as still-readable', async () => {
  const deps = fakeDeps({
    store: { dpl_share_1: shareRecord() },
    shareProbe: { status: 200, url: 'https://vercel.com/login?next=%2Fsso-api' },
  });
  const report = await revokeShare({
    resolved: resolvedConfig(contentRoot()),
    deploymentId: 'dpl_share_1',
    secret: SECRET,
    deps,
    io: fakeIo(),
  });
  assert.equal(report.state, 'revoked');
  assert.equal(report.confirmed, true);
});

test('--revoke requires a secret, because it cannot be looked up from the id', async () => {
  const deps = fakeDeps({ store: { dpl_share_1: shareRecord() } });
  await assert.rejects(
    revokeShare({ resolved: resolvedConfig(contentRoot()), deploymentId: 'dpl_share_1', secret: '  ', deps, io: fakeIo() }),
    isShareError(/secret is required to revoke it/),
  );
  assert.deepEqual(deps.calls.bypass, []);
});

test('--revoke refuses a deployment that is not one of our shares', async () => {
  const library = fakeDeps({ store: { dpl_x: shareRecord({ id: 'dpl_x', meta: { previewKind: PREVIEW_KIND } }) } });
  await assert.rejects(
    revokeShare({ resolved: resolvedConfig(contentRoot()), deploymentId: 'dpl_x', secret: SECRET, deps: library, io: fakeIo() }),
    isShareError(/is not a Share \(previewKind: "library"\)/),
  );
  assert.deepEqual(library.calls.bypass, [], 'no protection change on a non-share');

  const elsewhere = fakeDeps({ store: { dpl_y: shareRecord({ id: 'dpl_y', projectId: 'prj_other' }) } });
  await assert.rejects(
    revokeShare({ resolved: resolvedConfig(contentRoot()), deploymentId: 'dpl_y', secret: SECRET, deps: elsewhere, io: fakeIo() }),
    isShareError(/belongs to project "prj_other"/),
  );
});

// --- target identity (F9) --------------------------------------------------

test('a projectId that resolves to a different project is refused', async () => {
  const root = contentRoot();
  const deps = fakeDeps({ projectId: 'prj_somewhere_else' });
  const { error } = await run({ root, deps });
  assert.ok(isShareError(/identity mismatch: the target pins projectId/)(error), `got ${error?.message}`);
  assert.deepEqual(deps.calls.deploy, []);
});

test('a name that resolves to another name, or another owner, is refused', async () => {
  const root = contentRoot();
  const renamed = await run({ root, deps: fakeDeps({ projectName: 'other-project' }) });
  assert.ok(isShareError(/the config names project/)(renamed.error), `got ${renamed.error?.message}`);

  const foreign = await run({ root, deps: fakeDeps({ accountId: 'team_other' }) });
  assert.ok(isShareError(/is owned by "team_other"/)(foreign.error), `got ${foreign.error?.message}`);
});

test('a name-only target warns loudly but still shares', async () => {
  const root = contentRoot();
  const deps = fakeDeps();
  const io = fakeIo();
  const { error } = await run({
    root,
    deps,
    io,
    over: { target: { projectId: undefined, teamId: undefined } },
  });
  assert.ifError(error);
  assert.match(io.text(), /bound by NAME only/);
});

// --- CLI -------------------------------------------------------------------

test('main --help prints usage without building deps or touching stdin', async () => {
  const io = fakeIo();
  const code = await main({
    argv: ['--help'],
    io,
    makeDeps: () => { throw new Error('deps must not be built for --help'); },
  });
  assert.equal(code, 0);
  assert.match(io.reportText(), /usage: deploy-share\.mjs/);
  assert.deepEqual(io.stdinReads, []);
});

test('main rejects an unknown argument and every mode conflict, without reading stdin', async () => {
  const cases = [
    [['--prod'], /unknown argument/],
    [['--list', '--revoke', 'dpl_1'], /--list and --revoke are mutually exclusive/],
    [['--list', '--request', 'f.json'], /--request is not valid with --list/],
    [['--list', '--ttl', '60'], /--ttl is not valid with --list/],
    [['--revoke', 'dpl_1', '--preview-id', 'alpha'], /--preview-id is not valid with --revoke/],
    [['--revoke', 'dpl_1', '--limit', '5'], /--limit is not valid with --revoke/],
    [['--secret', 'x'], /--secret is not valid with a Share request/],
    [['--limit', '5'], /--limit is not valid with a Share request/],
    [['--from'], /--from requires a value/],
  ];
  for (const [argv, re] of cases) {
    const io = fakeIo({ stdin: '{}' });
    await assert.rejects(
      main({ argv, io, makeDeps: () => fakeDeps() }),
      isShareError(re),
      `expected ${re} for ${argv.join(' ')}`,
    );
    assert.deepEqual(io.stdinReads, [], `a bad flag must not block on stdin: ${argv.join(' ')}`);
  }
});

test('main rejects an invalid --ttl and --limit before reading stdin', async () => {
  for (const [argv, re] of [
    [['--ttl', 'soon'], /invalid --ttl/],
    [['--ttl', '0'], /invalid --ttl/],
    [['--ttl', String(MAX_TTL + 1)], /invalid --ttl/],
    [['--list', '--limit', '0'], /invalid --limit/],
    [['--list', '--limit', '101'], /invalid --limit/],
  ]) {
    const io = fakeIo({ stdin: '{}' });
    await assert.rejects(main({ argv, io, makeDeps: () => fakeDeps() }), isShareError(re), `expected ${re}`);
    assert.deepEqual(io.stdinReads, [], `a bad flag value must not block on stdin: ${argv.join(' ')}`);
  }
});

/**
 * A fixture repo whose `.solopreneur.json` the SHIPPED resolver finds by walking
 * up, so the CLI tests exercise real config resolution rather than a hand-built
 * resolved object.
 */
function cliFixture({ ids = ['alpha'] } = {}) {
  const repo = tmp();
  const root = path.join(repo, 'docs', 'preview');
  for (const collection of ['active', 'archive']) fs.mkdirSync(path.join(root, collection), { recursive: true });
  for (const id of ids) {
    const item = path.join(root, 'active', id);
    fs.mkdirSync(item, { recursive: true });
    fs.writeFileSync(path.join(item, 'preview.json'), JSON.stringify(makeMeta(id), null, 2));
    fs.writeFileSync(
      path.join(item, 'index.html'),
      `<!doctype html><html><body>${id}<script src="./comment-overlay.js"></script></body></html>`,
    );
  }
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
  return { repo, root };
}

test('main refuses to share without a v2 config', async () => {
  const dir = tmp();
  process.chdir(dir);
  process.env.HOME = dir;
  delete process.env.SOLOPRENEUR_CONFIG;
  delete process.env.CLAUDE_CONFIG_DIR;

  await assert.rejects(
    main({
      argv: [],
      io: fakeIo({ stdin: JSON.stringify({ schemaVersion: 1, previewId: 'alpha', revision: 1, contentHash: `sha256:${'f'.repeat(64)}`, access: 'project-members' }) }),
      makeDeps: () => fakeDeps(),
    }),
    isShareError(/no v2 preview config/),
  );
});

test('the shipped CLI resolves a config, consumes a request on stdin, and reports JSON', async () => {
  const { root } = cliFixture();
  const facts = itemFacts(root, 'alpha');
  const deps = fakeDeps();
  const io = fakeIo({
    stdin: JSON.stringify({
      schemaVersion: 1,
      kind: 'preview-share-request',
      previewId: 'alpha',
      revision: facts.revision,
      contentHash: facts.contentHash,
      url: 'https://x/p/alpha/',
      access: 'project-members',
    }),
  });

  const code = await main({ argv: ['--json'], io, makeDeps: () => deps });
  assert.equal(code, 0);
  // The whole point: stdout is ONE parseable JSON document, with no progress ahead.
  const report = JSON.parse(io.reportText());
  assert.ok(io.text().length > 0, 'progress still happens — on the stderr channel');
  assert.equal(report.state, 'shared');
  assert.equal(report.previewId, 'alpha');
  assert.equal(report.contentHash, facts.contentHash);
  assert.equal(deps.calls.deploy[0].meta.previewKind, SHARE_KIND);
  assert.deepEqual(io.stdinReads, ['Share request']);
});

test('the CLI reads a request from a file, and reports it for a human', async () => {
  const { repo, root } = cliFixture();
  const facts = itemFacts(root, 'alpha');
  const file = path.join(repo, 'request.json');
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1, previewId: 'alpha', revision: facts.revision, contentHash: facts.contentHash, access: 'anyone-with-link',
  }));
  const deps = fakeDeps();
  const io = fakeIo();

  const code = await main({ argv: ['--request', file], io, makeDeps: () => deps });
  assert.equal(code, 0);
  const text = io.reportText();
  assert.match(text, /shared — one preview is live as an isolated snapshot\. Library production was NOT touched\./);
  assert.match(text, /access:\s+anyone-with-link/);
  assert.match(text, new RegExp(`share URL:\\s+https://.*_vercel_share=${SECRET}`));
  assert.match(text, /link ttl:\s+604800s/);
  assert.match(text, /library prod:\s+dpl_library_production \(unchanged\)/);
  assert.match(text, /NOTE: that URL embeds a secret/);
  assert.deepEqual(io.stdinReads, [], 'a file request must not touch stdin');
});

test('the CLI warns that --ttl is ignored for a project-members request', async () => {
  const { root } = cliFixture();
  const facts = itemFacts(root, 'alpha');
  const io = fakeIo({
    stdin: JSON.stringify({
      schemaVersion: 1, previewId: 'alpha', revision: facts.revision, contentHash: facts.contentHash, access: 'project-members',
    }),
  });
  const code = await main({ argv: ['--ttl', '60'], io, makeDeps: () => fakeDeps() });
  assert.equal(code, 0);
  assert.match(io.text(), /--ttl is ignored for access "project-members"/);
});

test('the CLI warns when --ttl never is combined with a public link', async () => {
  const { root } = cliFixture();
  const facts = itemFacts(root, 'alpha');
  const io = fakeIo({
    stdin: JSON.stringify({
      schemaVersion: 1, previewId: 'alpha', revision: facts.revision, contentHash: facts.contentHash, access: 'anyone-with-link',
    }),
  });
  const code = await main({ argv: ['--ttl', 'never'], io, makeDeps: () => fakeDeps() });
  assert.equal(code, 0);
  assert.match(io.text(), /--ttl never — the shareable link will not expire/);
});

test('the CLI reads the revoke secret from stdin', async () => {
  cliFixture();
  const deps = fakeDeps({ store: { dpl_share_1: shareRecord() }, shareProbe: 401 });
  const io = fakeIo({ stdin: `${SECRET}\n` });
  const code = await main({ argv: ['--revoke', 'dpl_share_1'], io, makeDeps: () => deps });
  assert.equal(code, 0);
  assert.deepEqual(io.stdinReads, ['shareable-link secret']);
  assert.deepEqual(deps.calls.bypass[0].body, { revoke: { secret: SECRET, regenerate: false } });
  assert.match(io.reportText(), /revoked — the shareable link on dpl_share_1 no longer reads/);
});

test('the CLI lists shares for a human', async () => {
  cliFixture();
  const deps = fakeDeps({ deployments: [deploymentRow({ uid: 'dpl_share_alpha' })] });
  const io = fakeIo();
  const code = await main({ argv: ['--list', '--preview-id', 'alpha'], io, makeDeps: () => deps });
  assert.equal(code, 0);
  assert.match(io.reportText(), /1 share deployment\(s\) in my-private-previews for alpha/);
  assert.match(io.reportText(), /dpl_share_alpha {2}alpha v1 {2}READY/);
});

// --- production deps (argv construction, with an injected runner) ------------
//
// These are the only tests that touch the REAL deps factory, and they inject a
// fake process runner: no curl and no vercel is ever spawned. They exist because
// the argv is where a `--prod`, a `promote`, or a leaked secret would show up.

/** A fake process runner that records every spawn and returns scripted output. */
function fakeRun(stdout = '') {
  const spawned = [];
  const run = (cmd, args, options) => {
    spawned.push({ cmd, args, options });
    return { status: 0, stdout: typeof stdout === 'function' ? stdout(cmd, args) : stdout, stderr: '' };
  };
  run.spawned = spawned;
  return run;
}

test('makeDefaultDeps.deploy issues a PLAIN preview deploy with --meta and never --prod', () => {
  const run = fakeRun(`https://${PROJECT}-share1-demoteam.vercel.app\n`);
  const deps = makeDefaultDeps({ token: 'tok', run });

  const result = deps.deploy({
    cwd: '/share',
    meta: { previewKind: SHARE_KIND, previewId: 'alpha', revision: '1' },
    projectId: PROJECT_ID,
    orgId: TEAM_ID,
  });
  assert.equal(result.url, `https://${PROJECT}-share1-demoteam.vercel.app`);

  const call = run.spawned.at(-1);
  assert.equal(call.cmd, 'vercel');
  assert.equal(call.options.cwd, '/share');
  assert.deepEqual(call.args, [
    'deploy', '--yes', '--meta', `previewKind=${SHARE_KIND}`, '--meta', 'previewId=alpha', '--meta', 'revision=1',
  ]);
  assert.ok(!call.args.includes('--prod'), 'a Share must never pass --prod');
  assert.ok(!call.args.includes('--skip-domain'), 'a Share does not touch production aliases at all');
  assert.equal(call.options.env.VERCEL_PROJECT_ID, PROJECT_ID);
  assert.equal(call.options.env.VERCEL_ORG_ID, TEAM_ID);
});

test('makeDefaultDeps exposes no promote and never spawns one', () => {
  const run = fakeRun('');
  const deps = makeDefaultDeps({ token: 'tok', run });
  assert.equal(deps.promote, undefined, 'there must be no promote seam to reach for');
  assert.equal(deps.rollback, undefined);
  assert.ok(!run.spawned.some((c) => c.args.includes('promote') || c.args.includes('rollback')));
});

test('makeDefaultDeps surfaces a quota rejection as a clear, actionable error', () => {
  const run = () => ({
    status: 1,
    stdout: '',
    stderr: 'Error: Resource is limited - try again in 3 hours (more than 100, code: "api-deployments-free-per-day")',
  });
  const deps = makeDefaultDeps({ token: 'tok', run });
  assert.throws(() => deps.deploy({ cwd: '/share', meta: {} }), isShareError(/QUOTA/));
});

test('makeDefaultDeps.getDeployment reads v13 by hostname, scoped to the team', () => {
  const run = fakeRun('{"id":"dpl_1","target":null}\n200');
  const deps = makeDefaultDeps({ token: 'tok', run });

  const deployment = deps.getDeployment({ deploymentId: 'https://x-y.vercel.app/', teamId: TEAM_ID });
  assert.equal(deployment.id, 'dpl_1');
  const call = run.spawned.at(-1);
  assert.equal(call.cmd, 'curl');
  assert.ok(call.args.at(-1).endsWith(`/v13/deployments/x-y.vercel.app?teamId=${TEAM_ID}`), call.args.at(-1));
  assert.ok(!call.args.some((a) => a.includes('tok')), 'the token must never reach argv');
  assert.match(call.options.input, /Authorization: Bearer tok/);
});

test('makeDefaultDeps.listDeployments scopes v7 by project and limit', () => {
  const run = fakeRun('{"deployments":[{"uid":"dpl_1"}]}\n200');
  const deps = makeDefaultDeps({ token: 'tok', run });

  const rows = deps.listDeployments({ projectId: PROJECT_ID, teamId: TEAM_ID, limit: 25 });
  assert.deepEqual(rows, [{ uid: 'dpl_1' }]);
  const url = run.spawned.at(-1).args.at(-1);
  assert.ok(url.startsWith('https://api.vercel.com/v7/deployments?'), url);
  assert.ok(url.includes(`projectId=${PROJECT_ID}`), url);
  assert.ok(url.includes('limit=25'), url);
  assert.ok(url.includes(`teamId=${TEAM_ID}`), url);
});

test('makeDefaultDeps.listDeployments omits teamId for a personal scope', () => {
  const run = fakeRun('{"deployments":[]}\n200');
  const deps = makeDefaultDeps({ token: 'tok', run });
  deps.listDeployments({ projectId: PROJECT_ID, teamId: undefined, limit: 10 });
  assert.ok(!run.spawned.at(-1).args.at(-1).includes('teamId'), run.spawned.at(-1).args.at(-1));
});

test('makeDefaultDeps.patchProtectionBypass hits the aliases endpoint and keeps the secret out of argv', () => {
  const bodies = [];
  const run = (cmd, args, options) => {
    const at = args.indexOf('-d');
    if (at !== -1) bodies.push(fs.readFileSync(args[at + 1].slice(1), 'utf8'));
    return { status: 0, stdout: '{"protectionBypass":{}}\n200', stderr: '' };
  };
  run.spawned = [];
  const wrapped = (cmd, args, options) => { run.spawned.push({ cmd, args, options }); return run(cmd, args, options); };
  wrapped.spawned = run.spawned;
  const deps = makeDefaultDeps({ token: 'tok', run: wrapped });

  deps.patchProtectionBypass({
    deploymentId: 'dpl_share_1',
    teamId: TEAM_ID,
    body: { revoke: { secret: SECRET, regenerate: false } },
  });
  const call = run.spawned.at(-1);
  assert.ok(call.args.includes('-X') && call.args.includes('PATCH'), call.args.join(' '));
  assert.ok(
    call.args.at(-1) === `https://api.vercel.com/aliases/dpl_share_1/protection-bypass?teamId=${TEAM_ID}`,
    call.args.at(-1),
  );
  // The body reached curl through a file, so the secret is not visible via `ps`.
  assert.deepEqual(bodies, [JSON.stringify({ revoke: { secret: SECRET, regenerate: false } })]);
  assert.ok(!call.args.some((a) => a.includes(SECRET)), 'the secret must never reach argv');
  assert.ok(!/x-vercel-protection-bypass/i.test(call.args.join(' ')), 'never the automation-bypass header');
  // The temp body file is not left behind.
  const bodyFile = call.args[call.args.indexOf('-d') + 1].slice(1);
  assert.ok(!fs.existsSync(bodyFile), 'the request-body file must be removed');
});

test('makeDefaultDeps.probeShare follows redirects with a cookie jar and hides the URL from argv', () => {
  const run = fakeRun('200 https://x-y.vercel.app/');
  const deps = makeDefaultDeps({ token: 'tok', run });

  const url = `https://x-y.vercel.app?_vercel_share=${SECRET}`;
  // Both the status AND where the chain landed — the status alone cannot tell a
  // working link from the 200 SSO login page.
  assert.deepEqual(deps.probeShare(url), { status: 200, url: 'https://x-y.vercel.app/' });

  const call = run.spawned.at(-1);
  assert.equal(call.cmd, 'curl');
  assert.ok(call.args.includes('-L'), 'the 307 must be followed to reach the content');
  assert.ok(call.args.includes('-b') && call.args.includes('-c'), 'the cookie engine carries _vercel_jwt across it');
  assert.ok(call.args.includes('-q'), 'an ambient ~/.curlrc must not change the probe');
  assert.equal(call.args[call.args.indexOf('-w') + 1], '%{http_code} %{url_effective}');
  // Anonymous: no auth header, and the secret-bearing URL rides in stdin, not argv.
  assert.ok(!call.options.input.includes('Authorization'), 'the share probe must be anonymous');
  assert.equal(call.options.input, `url = "${url}"\n`);
  assert.ok(!call.args.some((a) => a.includes(SECRET)), 'the secret must never reach argv');
  const jar = call.args[call.args.indexOf('-c') + 1];
  assert.ok(!fs.existsSync(path.dirname(jar)), 'the cookie jar must be removed');
});

test('makeDefaultDeps.probeShare reports the login page it actually landed on', () => {
  const landing = 'https://vercel.com/login?next=%2Fsso-api%3Furl%3Dhttps%253A%252F%252Fx-y.vercel.app';
  const deps = makeDefaultDeps({ token: 'tok', run: fakeRun(`200 ${landing}`) });
  assert.deepEqual(deps.probeShare('https://x-y.vercel.app?_vercel_share=dead'), { status: 200, url: landing });
});

test('makeDefaultDeps.probeShare fails closed on a transport error or an unparseable -w', () => {
  const deps = makeDefaultDeps({ token: 'tok', run: () => ({ error: new Error('no curl') }) });
  assert.deepEqual(deps.probeShare('https://x-y.vercel.app?_vercel_share=s'), { status: 0, url: null });

  const nonZero = makeDefaultDeps({ token: 'tok', run: () => ({ status: 7, stdout: '', stderr: 'boom' }) });
  assert.deepEqual(nonZero.probeShare('https://x-y.vercel.app?_vercel_share=s'), { status: 0, url: null });

  // A status with no effective URL is unconfirmable, so it carries none forward.
  const bare = makeDefaultDeps({ token: 'tok', run: fakeRun('200') });
  assert.deepEqual(bare.probeShare('https://x-y.vercel.app?_vercel_share=s'), { status: 200, url: null });
});

test('makeDefaultDeps rejects a token, and a share URL, carrying an illegal character', () => {
  assert.throws(() => makeDefaultDeps({ token: 'to"k', run: fakeRun('') }), isShareError(/token contains an illegal character/));
  const deps = makeDefaultDeps({ token: 'tok', run: fakeRun('200') });
  assert.throws(() => deps.probeShare('https://x/?_vercel_share=a"b'), isShareError(/share URL contains an illegal character/));
});

test('makeDefaultDeps reuses vercel-protect for every protection call', () => {
  const deps = makeDefaultDeps({ token: 'tok', run: fakeRun('{}\n200') });
  for (const name of ['getProject', 'patchSsoProtection', 'deleteDomain', 'listDomains', 'probe']) {
    assert.equal(typeof deps[name], 'function', `${name} must come from vercel-protect`);
  }
});
