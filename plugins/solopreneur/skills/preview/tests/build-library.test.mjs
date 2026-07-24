/**
 * Tests for scripts/build-library.mjs.
 *
 * Requires Node.js >= 20 (stable `node:test`).
 * Run with:  cd plugins/solopreneur/skills/preview && node --test tests/*.test.mjs
 *   (`node --test tests/` does not work on Node >= 22.6 — see config.md.)
 *
 * The builder takes RESOLVED fields (root + collections + include), so the bulk
 * of the suite imports `buildLibrary` and calls it in-process against a fixture
 * content tree — no config files, no env juggling, zero network. `gitCommit` is
 * stubbed to keep every run deterministic and hermetic. A handful of tests spawn
 * the real CLI against a fixture `.solopreneur.json` to prove the config-resolve
 * wiring end to end.
 *
 * Every build lands its staging tree in a fresh system temp dir; those and the
 * fixture roots are removed after the file finishes.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildLibrary, findInjectionPoint, projectDirectory, BuildError } from '../scripts/build-library.mjs';

const SCRIPT = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'build-library.mjs',
);

const fixtures = [];
const stagings = [];
after(() => {
  for (const dir of stagings) fs.rmSync(dir, { recursive: true, force: true });
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A fresh fixture root, realpath'd (the builder reports physical paths). Guards
 * that no `.solopreneur.json` sits above it — the CLI tests walk up from a
 * fixture, and a stray config above TMPDIR would silently change what resolves.
 */
function tmp() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'solo-build-')));
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
 * Write an item at `<root>/<collection>/<dirName>/`, with a `preview.json` and
 * the given files. `dirName` defaults to the id (the enforced layout); pass it
 * to test a dirname/id mismatch or an id that cannot be a directory name.
 * `rawMeta` writes the metadata verbatim (object or string) for the malformed
 * and missing-field cases.
 */
function writeItem(root, collection, id, { over = {}, files, dirName, rawMeta } = {}) {
  const dir = path.join(root, collection, dirName ?? id);
  fs.mkdirSync(dir, { recursive: true });
  const meta = rawMeta !== undefined ? rawMeta : makeMeta(id, over);
  fs.writeFileSync(path.join(dir, 'preview.json'), typeof meta === 'string' ? meta : JSON.stringify(meta, null, 2));
  const content = files ?? { 'index.html': `<!doctype html><html><body><h1>${id}</h1></body></html>` };
  for (const [rel, data] of Object.entries(content)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }
  return dir;
}

function build(root, include = ['active', 'archive'], opts = {}) {
  const result = buildLibrary({ root, collections: COLLECTIONS, include, gitCommit: () => null, ...opts });
  stagings.push(result.stagingDir);
  return result;
}

const readStaged = (stagingDir, ...parts) => fs.readFileSync(path.join(stagingDir, ...parts), 'utf8');
const stagedExists = (stagingDir, ...parts) => fs.existsSync(path.join(stagingDir, ...parts));
const itemById = (directory, id) => directory.items.find((it) => it.id === id);
const isBuildError = (re) => (err) => err instanceof BuildError && re.test(err.message);

// --- injection point locator (prepared, not applied this PR) ----------------

test('findInjectionPoint locates a single </body>', () => {
  const html = '<html><body>x</body></html>';
  const point = findInjectionPoint(html);
  assert.equal(point.atEof, false);
  assert.equal(html.slice(point.index), '</body></html>');
});

test('findInjectionPoint uses the LAST </body> when several appear', () => {
  const html = '<body>a</body>\n<!-- </body> --><body>b</body>';
  const point = findInjectionPoint(html);
  assert.equal(point.index, html.lastIndexOf('</body>'));
  assert.ok(point.index > html.indexOf('</body>'), 'must not pick the first');
});

test('findInjectionPoint matches </body> case-insensitively', () => {
  const html = '<BODY>x</BODY>';
  const point = findInjectionPoint(html);
  assert.equal(point.atEof, false);
  assert.equal(point.index, html.toLowerCase().lastIndexOf('</body>'));
});

test('findInjectionPoint falls back to EOF when there is no </body>', () => {
  const html = '<div>a fragment</div>';
  const point = findInjectionPoint(html);
  assert.equal(point.atEof, true);
  assert.equal(point.index, html.length);
});

test('the entry is copied verbatim — no chrome is injected in this build', () => {
  const root = tmp();
  const html = '<html><body><h1>a</h1></body></html>';
  writeItem(root, 'active', 'a', { files: { 'index.html': html } });
  const result = build(root, ['active']);
  assert.equal(readStaged(result.stagingDir, 'p', 'a', 'index.html'), html);
});

// --- content hash -----------------------------------------------------------

test('identical content hashes identically across independent builds', () => {
  const root1 = tmp();
  const root2 = tmp();
  const files = { 'index.html': '<body>same</body>', 'x.css': 'body{color:red}' };
  writeItem(root1, 'active', 'a', { files });
  writeItem(root2, 'active', 'a', { files });
  const h1 = itemById(build(root1, ['active']).directory, 'a').contentHash;
  const h2 = itemById(build(root2, ['active']).directory, 'a').contentHash;
  assert.equal(h1, h2);
  assert.match(h1, /^sha256:[0-9a-f]{64}$/);
});

test('changing a file changes the content hash', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>one</body>' } });
  const before = itemById(build(root, ['active']).directory, 'a').contentHash;
  fs.writeFileSync(path.join(itemDir, 'index.html'), '<body>two</body>');
  const after = itemById(build(root, ['active']).directory, 'a').contentHash;
  assert.notEqual(before, after);
});

test('the content hash is computed BEFORE chrome injection', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { files: { 'index.html': '<html><body>hi</body></html>' } });

  const plain = build(root, ['active']);
  const chromed = build(root, ['active'], {
    injectEntry: (html) => {
      const { index } = findInjectionPoint(html);
      return `${html.slice(0, index)}<script>/*chrome*/</script>${html.slice(index)}`;
    },
  });

  // The staged entry actually changed under injection...
  assert.match(readStaged(chromed.stagingDir, 'p', 'a', 'index.html'), /\/\*chrome\*\//);
  assert.doesNotMatch(readStaged(plain.stagingDir, 'p', 'a', 'index.html'), /\/\*chrome\*\//);
  // ...but the content hash did not, because it is taken from the source before it.
  assert.equal(itemById(chromed.directory, 'a').contentHash, itemById(plain.directory, 'a').contentHash);
});

// --- sanitization (the crown-jewel guarantee) -------------------------------

test('directory.json carries only allowlisted fields — no source metadata leaks', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', {
    over: {
      project: 'demo',
      tags: ['alpha', 'beta'],
      sourceRef: 'tasks/doing/secret-source.md',
      provenance: {
        createdBy: { agent: 'Some Agent', sessionId: 'SECRET-SESSION-abc', transcriptPath: '/Users/dev/.transcript.jsonl' },
      },
    },
  });
  const result = build(root, ['active']);
  const raw = readStaged(result.stagingDir, 'directory.json');
  for (const forbidden of ['sourceRef', 'secret-source.md', 'SECRET-SESSION-abc', '/Users/dev/.transcript.jsonl', 'provenance', root]) {
    assert.ok(!raw.includes(forbidden), `directory.json leaked ${JSON.stringify(forbidden)}`);
  }
  const row = itemById(result.directory, 'a');
  const allowed = new Set(['id', 'title', 'createdAt', 'updatedAt', 'revision', 'project', 'tags', 'collection', 'supersededBy', 'contentHash']);
  for (const key of Object.keys(row)) assert.ok(allowed.has(key), `unexpected directory field ${JSON.stringify(key)}`);
  assert.equal(row.project, 'demo');
  assert.deepEqual(row.tags, ['alpha', 'beta']);
  assert.equal(row.collection, 'active');
  assert.match(row.contentHash, /^sha256:/);
});

test('preview.json is never copied into the staging tree', () => {
  const root = tmp();
  writeItem(root, 'active', 'a');
  const result = build(root, ['active']);
  assert.ok(!stagedExists(result.stagingDir, 'p', 'a', 'preview.json'));
  assert.ok(stagedExists(result.stagingDir, 'p', 'a', 'index.html'));
});

test('excluded files and dotfiles are copied nowhere and do not affect the hash', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>x</body>' } });
  const before = itemById(build(root, ['active']).directory, 'a').contentHash;

  fs.mkdirSync(path.join(itemDir, '.vercel'), { recursive: true });
  fs.writeFileSync(path.join(itemDir, '.vercel', 'project.json'), '{"projectId":"x"}');
  fs.mkdirSync(path.join(itemDir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(itemDir, '.git', 'config'), '[core]\n');
  fs.writeFileSync(path.join(itemDir, '.env'), 'SECRET=1');
  fs.writeFileSync(path.join(itemDir, '.env.local'), 'SECRET=2');
  fs.writeFileSync(path.join(itemDir, '.netrc'), 'password hunter2'); // a non-listed secret dotfile
  fs.writeFileSync(path.join(itemDir, '.DS_Store'), 'junk');
  fs.writeFileSync(path.join(itemDir, 'comment-overlay.js'), '// stale per-page copy');

  const result = build(root, ['active']);
  assert.equal(itemById(result.directory, 'a').contentHash, before);
  for (const rel of ['.vercel/project.json', '.git/config', '.env', '.env.local', '.netrc', '.DS_Store', 'comment-overlay.js']) {
    assert.ok(!stagedExists(result.stagingDir, 'p', 'a', rel), `should not have copied ${rel}`);
  }
  assert.ok(stagedExists(result.stagingDir, 'p', 'a', 'index.html'));
});

// --- sorting ----------------------------------------------------------------

test('directory items sort by updatedAt DESC', () => {
  const root = tmp();
  writeItem(root, 'active', 'old', { over: { updatedAt: '2026-01-01T00:00:00Z' } });
  writeItem(root, 'active', 'new', { over: { updatedAt: '2026-03-01T00:00:00Z' } });
  writeItem(root, 'active', 'mid', { over: { updatedAt: '2026-02-01T00:00:00Z' } });
  const dir = build(root, ['active']).directory;
  assert.deepEqual(dir.items.map((i) => i.id), ['new', 'mid', 'old']);
});

test('a tie on updatedAt breaks by id ASC (stable across machines)', () => {
  const root = tmp();
  const ts = '2026-05-05T05:05:05Z';
  writeItem(root, 'active', 'banana', { over: { updatedAt: ts } });
  writeItem(root, 'active', 'apple', { over: { updatedAt: ts } });
  writeItem(root, 'archive', 'cherry', { over: { updatedAt: ts } });
  const dir = build(root, ['active', 'archive']).directory;
  assert.deepEqual(dir.items.map((i) => i.id), ['apple', 'banana', 'cherry']);
});

test('the catalog sorts by parsed instant, not lexically, across timezone offsets', () => {
  const root = tmp();
  // In UTC 'later' (17:00Z) is newer than 'earlier' (02:00Z), but lexically
  // '...10:00:00+08:00' sorts AFTER '...09:00:00-08:00' — a string sort gets it wrong.
  writeItem(root, 'active', 'earlier', { over: { updatedAt: '2026-01-01T10:00:00+08:00' } }); // 02:00Z
  writeItem(root, 'active', 'later', { over: { updatedAt: '2026-01-01T09:00:00-08:00' } }); // 17:00Z
  const ids = build(root, ['active']).directory.items.map((i) => i.id);
  assert.deepEqual(ids, ['later', 'earlier']); // newer instant first
});

test('a timestamp without a timezone is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { over: { updatedAt: '2026-01-01T00:00:00' } }); // no Z / offset
  assert.throws(() => build(root, ['active']), isBuildError(/updatedAt/));
});

test('a shape-valid but impossible timestamp instant is rejected', () => {
  const root = tmp();
  // Matches the digit pattern (two-digit fields + a Z) but is not a real instant,
  // so Date.parse returns NaN — the semantic check must reject it.
  writeItem(root, 'active', 'a', { over: { updatedAt: '2026-99-99T99:99:99Z' } });
  assert.throws(() => build(root, ['active']), isBuildError(/not a real ISO 8601 instant/));
});

// --- duplicate id -----------------------------------------------------------

test('a duplicate id across active and archive aborts, naming BOTH files', () => {
  const root = tmp();
  const a = writeItem(root, 'active', 'dup');
  const b = writeItem(root, 'archive', 'dup', { over: { updatedAt: '2026-01-01T00:00:00Z' } });
  assert.throws(() => build(root, ['active', 'archive']), (err) => {
    assert.ok(err instanceof BuildError);
    assert.ok(err.message.includes(path.join(a, 'preview.json')), err.message);
    assert.ok(err.message.includes(path.join(b, 'preview.json')), err.message);
    assert.match(err.message, /different id/i);
    return true;
  });
});

// --- id slug guard ----------------------------------------------------------

for (const badId of ['../x', 'a/b', 'Foo', 'a%2fb', 'a b', 'a.b', 'foo\n']) {
  test(`an invalid id ${JSON.stringify(badId)} is rejected`, () => {
    const root = tmp();
    writeItem(root, 'active', badId, { dirName: 'item' });
    assert.throws(() => build(root, ['active']), isBuildError(/id/));
  });
}

test('a valid dated slug id builds', () => {
  const root = tmp();
  writeItem(root, 'active', '2026-07-24-foo');
  const dir = build(root, ['active']).directory;
  assert.equal(dir.items.length, 1);
  assert.equal(dir.items[0].id, '2026-07-24-foo');
});

test('a directory name that differs from the id is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'realid', { dirName: 'otherdir' });
  assert.throws(() => build(root, ['active']), isBuildError(/does not match its id/));
});

// --- schema validation ------------------------------------------------------

test('a wrong schemaVersion is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { over: { schemaVersion: 2 } });
  assert.throws(() => build(root, ['active']), isBuildError(/schemaVersion/));
});

test('a missing required field is rejected', () => {
  const root = tmp();
  const meta = makeMeta('a');
  delete meta.title;
  writeItem(root, 'active', 'a', { rawMeta: meta });
  assert.throws(() => build(root, ['active']), isBuildError(/title/));
});

test('a non-integer revision is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { over: { revision: 1.5 } });
  assert.throws(() => build(root, ['active']), isBuildError(/revision/));
});

test('a revision below 1 is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { over: { revision: 0 } });
  assert.throws(() => build(root, ['active']), isBuildError(/revision/));
});

test('tags must be an array of strings', () => {
  const notArray = tmp();
  writeItem(notArray, 'active', 'a', { over: { tags: 'nope' } });
  assert.throws(() => build(notArray, ['active']), isBuildError(/tags/));
  const notStrings = tmp();
  writeItem(notStrings, 'active', 'a', { over: { tags: [1, 2] } });
  assert.throws(() => build(notStrings, ['active']), isBuildError(/tags/));
});

test('provenance must be an object (passed through, not resolved)', () => {
  const bad = tmp();
  writeItem(bad, 'active', 'a', { over: { provenance: 'nope' } });
  assert.throws(() => build(bad, ['active']), isBuildError(/provenance/));

  const ok = tmp();
  writeItem(ok, 'active', 'a', { over: { provenance: { createdBy: { agent: 'X' } } } });
  assert.equal(build(ok, ['active']).directory.items.length, 1); // object provenance is accepted
});

test('malformed preview.json JSON is rejected', () => {
  const root = tmp();
  const dir = path.join(root, 'active', 'a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preview.json'), '{ not valid');
  fs.writeFileSync(path.join(dir, 'index.html'), '<body>x</body>');
  assert.throws(() => build(root, ['active']), isBuildError(/malformed JSON/));
});

test('a missing preview.json is rejected', () => {
  const root = tmp();
  const dir = path.join(root, 'active', 'a');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), '<body>x</body>');
  assert.throws(() => build(root, ['active']), isBuildError(/missing preview\.json/));
});

// --- entry ------------------------------------------------------------------

test('an entry other than index.html is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { over: { entry: 'main.html' }, files: { 'main.html': '<body>x</body>' } });
  assert.throws(() => build(root, ['active']), isBuildError(/entry/));
});

test('a missing entry file is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { files: { 'notindex.html': '<body>x</body>' } });
  assert.throws(() => build(root, ['active']), isBuildError(/entry file/));
});

// --- supersededBy -----------------------------------------------------------

test('a valid supersededBy on an archived item is accepted and projected', () => {
  const root = tmp();
  writeItem(root, 'active', 'current');
  writeItem(root, 'archive', 'oldcopy', { over: { supersededBy: 'current' } });
  const dir = build(root, ['active', 'archive']).directory;
  assert.equal(itemById(dir, 'oldcopy').supersededBy, 'current');
});

test('supersededBy on an item that is not in archive is rejected', () => {
  const root = tmp();
  writeItem(root, 'active', 'current');
  writeItem(root, 'active', 'oldcopy', { over: { supersededBy: 'current' } });
  assert.throws(() => build(root, ['active']), isBuildError(/archive/));
});

test('supersededBy pointing at a non-existent item is rejected', () => {
  const root = tmp();
  writeItem(root, 'archive', 'oldcopy', { over: { supersededBy: 'ghost' } });
  assert.throws(() => build(root, ['archive']), isBuildError(/not an item/));
});

test('a supersededBy cycle is rejected', () => {
  const root = tmp();
  writeItem(root, 'archive', 'a', { over: { supersededBy: 'b' } });
  writeItem(root, 'archive', 'b', { over: { supersededBy: 'a' } });
  assert.throws(() => build(root, ['archive']), isBuildError(/cycle/));
});

test('a supersededBy self-reference is rejected as a cycle', () => {
  const root = tmp();
  writeItem(root, 'archive', 'a', { over: { supersededBy: 'a' } });
  assert.throws(() => build(root, ['archive']), isBuildError(/cycle/));
});

// --- filesystem containment -------------------------------------------------

test('a symlink escaping the preview directory is rejected', () => {
  const root = tmp();
  const external = path.join(tmp(), 'secret.txt');
  fs.writeFileSync(external, 'secret');
  const itemDir = writeItem(root, 'active', 'a');
  fs.symlinkSync(external, path.join(itemDir, 'leak.txt'));
  assert.throws(() => build(root, ['active']), isBuildError(/escapes/));
});

test('a contained symlink is followed and copied', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>x</body>', 'real.txt': 'hello' } });
  fs.symlinkSync(path.join(itemDir, 'real.txt'), path.join(itemDir, 'link.txt'));
  const result = build(root, ['active']);
  assert.equal(readStaged(result.stagingDir, 'p', 'a', 'link.txt'), 'hello');
});

test('a directory symlink cycle is rejected', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a');
  fs.symlinkSync(itemDir, path.join(itemDir, 'loop'));
  assert.throws(() => build(root, ['active']), isBuildError(/cycle/));
});

test('a FIFO in a preview directory is rejected', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a');
  const made = spawnSync('mkfifo', [path.join(itemDir, 'pipe')]);
  assert.equal(made.status, 0, `mkfifo failed: ${made.stderr}`);
  assert.throws(() => build(root, ['active']), isBuildError(/non-regular file/));
});

test('a preview.json symlinked outside the item directory is rejected', () => {
  const root = tmp();
  const external = path.join(tmp(), 'evil-preview.json');
  fs.writeFileSync(external, JSON.stringify(makeMeta('a')));
  const dir = path.join(root, 'active', 'a');
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(external, path.join(dir, 'preview.json')); // metadata sourced out of tree
  fs.writeFileSync(path.join(dir, 'index.html'), '<body>x</body>');
  assert.throws(() => build(root, ['active']), isBuildError(/escapes/));
});

test('two filenames that normalize to the same NFC path abort', (t) => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>x</body>' } });
  fs.writeFileSync(path.join(itemDir, 'é.txt'), 'one'); // é as one codepoint (NFC)
  fs.writeFileSync(path.join(itemDir, 'é.txt'), 'two'); // e + combining accent (NFD)
  // A normalization-insensitive filesystem (APFS/macOS) collapses the two names to
  // one file, so the collision can only be constructed on a preserving FS (Linux
  // ext4, i.e. CI). Skip where it cannot exist rather than assert a false pass.
  const collide = fs.readdirSync(itemDir).filter((n) => n.normalize('NFC') === 'é.txt').length;
  if (collide < 2) { t.skip('filesystem normalizes unicode filenames — cannot construct the collision here'); return; }
  assert.throws(() => build(root, ['active']), isBuildError(/normalize to the same path/));
});

test('a file and a directory that normalize to the same path abort', (t) => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>x</body>' } });
  try {
    fs.writeFileSync(path.join(itemDir, 'é'), 'file'); // precomposed U+00E9 as a FILE
    fs.mkdirSync(path.join(itemDir, 'é')); // e + combining accent as a DIRECTORY
    fs.writeFileSync(path.join(itemDir, 'é', 'child.txt'), 'data');
  } catch {
    t.skip('filesystem normalizes unicode filenames - cannot construct the collision here');
    return;
  }
  if (fs.readdirSync(itemDir).filter((n) => n.normalize('NFC') === 'é').length < 2) {
    t.skip('filesystem normalizes unicode filenames - cannot construct the collision here');
    return;
  }
  assert.throws(() => build(root, ['active']), isBuildError(/normalize to the same path/));
});

// --- torn-snapshot guard ----------------------------------------------------

test('a source file rewritten between scan and copy aborts', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>original</body>' } });
  assert.throws(
    () => build(root, ['active'], {
      hooks: { afterFingerprint: () => fs.writeFileSync(path.join(itemDir, 'index.html'), '<body>REWRITTEN</body>') },
    }),
    isBuildError(/torn snapshot/),
  );
});

test('a source file removed between scan and copy aborts', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a', { files: { 'index.html': '<body>x</body>', 'extra.txt': 'data' } });
  assert.throws(
    () => build(root, ['active'], {
      hooks: { afterFingerprint: () => fs.rmSync(path.join(itemDir, 'extra.txt')) },
    }),
    isBuildError(/torn snapshot/),
  );
});

test('a failed build leaves no staging tree behind', () => {
  const root = tmp();
  const itemDir = writeItem(root, 'active', 'a');
  const count = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('preview-build-')).length;
  const before = count();
  assert.throws(() => build(root, ['active'], {
    hooks: { afterFingerprint: () => fs.writeFileSync(path.join(itemDir, 'index.html'), 'CHANGED') },
  }), BuildError);
  assert.equal(count(), before, 'the aborted build must remove its own staging dir');
});

// --- collections, size report, document-level fields ------------------------

test('an empty library builds an empty directory', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, 'active'), { recursive: true });
  const result = build(root, ['active', 'archive']);
  assert.deepEqual(result.directory.items, []);
  assert.ok(stagedExists(result.stagingDir, 'directory.json'));
});

test('a missing collection directory is treated as empty, not an error', () => {
  const root = tmp();
  writeItem(root, 'active', 'a'); // no archive/ dir exists at all
  assert.equal(build(root, ['active', 'archive']).directory.items.length, 1);
});

test('the size report counts files and bytes per collection', () => {
  const root = tmp();
  writeItem(root, 'active', 'a', { files: { 'index.html': 'aaaa', 'x.css': 'bb' } }); // 6 bytes, 2 files
  writeItem(root, 'archive', 'b', { files: { 'index.html': 'cccccc' } }); // 6 bytes, 1 file
  const { sizeReport } = build(root, ['active', 'archive']);
  assert.deepEqual(sizeReport.collections.active, { files: 2, bytes: 6 });
  assert.deepEqual(sizeReport.collections.archive, { files: 1, bytes: 6 });
  assert.equal(sizeReport.totalFiles, 3);
  assert.equal(sizeReport.totalBytes, 12);
  assert.deepEqual(sizeReport.warnings, []);
});

test('a collection key inherited from Object.prototype does not pollute or vanish from the report', () => {
  const root = tmp();
  const dir = path.join(root, 'ctor-coll', 'a'); // the `constructor` collection's path dir
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preview.json'), JSON.stringify(makeMeta('a')));
  fs.writeFileSync(path.join(dir, 'index.html'), '<body>x</body>');
  // `{ constructor: … }` is a real own property (only `__proto__` is special in a
  // literal); config-resolve accepts such an own collection key, and the size
  // report must bucket it without reading Object.prototype's `constructor`.
  const collections = { ...COLLECTIONS, constructor: { path: 'ctor-coll', label: 'Ctor' } };
  const result = buildLibrary({ root, collections, include: ['constructor'], gitCommit: () => null });
  stagings.push(result.stagingDir);
  assert.equal(result.sizeReport.collections.constructor.files, 1); // bucketed, not dropped
  assert.equal(result.sizeReport.totalFiles, 1);
  assert.equal(Object.prototype.files, undefined); // Object.prototype was not polluted
});

test('a git source commit is projected when available, omitted otherwise', () => {
  const root = tmp();
  writeItem(root, 'active', 'a');
  assert.deepEqual(build(root, ['active'], { gitCommit: () => 'deadbeefdeadbeef' }).directory.source, { commit: 'deadbeefdeadbeef' });
  assert.ok(!('source' in build(root, ['active'], { gitCommit: () => null }).directory));
});

test('generatedAt is an ISO-8601 UTC timestamp', () => {
  const root = tmp();
  writeItem(root, 'active', 'a');
  assert.match(build(root, ['active']).directory.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
});

test('directory rows carry updatedAt and revision through from a populated item', () => {
  const root = tmp();
  writeItem(root, 'active', 'a');
  const row = itemById(build(root, ['active']).directory, 'a');
  assert.equal(row.updatedAt, '2026-01-02T00:00:00Z');
  assert.equal(row.revision, 1);
});

test('projectDirectory falls back to createdAt / revision 1 for a field-missing row', () => {
  // The fallback is unreachable through buildLibrary (the schema requires both
  // updatedAt and revision), so exercise projectDirectory directly with a
  // synthetic legacy item that lacks them — real coverage of the fallback branch.
  const item = {
    id: 'legacy',
    collection: 'archive',
    contentHash: 'sha256:deadbeef',
    meta: { id: 'legacy', title: 'Legacy', createdAt: '2026-01-01T00:00:00Z' },
  };
  const [row] = projectDirectory([item], '2026-01-01T00:00:00Z', null).items;
  assert.equal(row.updatedAt, '2026-01-01T00:00:00Z'); // fell back to createdAt
  assert.equal(row.revision, 1); // fell back to 1
});

// --- CLI (config-resolve wiring) --------------------------------------------

const v2Config = (project) => ({
  schemaVersion: 2,
  preview: {
    root: './previews',
    defaultTarget: 'private',
    collections: COLLECTIONS,
    targets: { private: { provider: 'vercel', project, visibility: 'private', include: ['active', 'archive'] } },
  },
});

function runCli(args, { cwd, home = tmp(), env = {} } = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: cwd ?? home,
    env: { PATH: process.env.PATH, HOME: home, ...env },
    encoding: 'utf8',
  });
}

function cliFixture() {
  const base = tmp();
  fs.writeFileSync(path.join(base, '.solopreneur.json'), JSON.stringify(v2Config('demo-previews'), null, 2));
  const activeDir = path.join(base, 'previews', 'active', 'a');
  fs.mkdirSync(activeDir, { recursive: true });
  fs.writeFileSync(path.join(activeDir, 'preview.json'), JSON.stringify(makeMeta('a'), null, 2));
  fs.writeFileSync(path.join(activeDir, 'index.html'), '<body>a</body>');
  return { base, activeDir };
}

test('the CLI resolves a v2 config and builds (--json)', () => {
  const { activeDir } = cliFixture();
  const res = runCli(['--json', '--from', activeDir]);
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  stagings.push(out.stagingDir);
  assert.equal(out.directory.items.length, 1);
  assert.equal(out.directory.items[0].id, 'a');
  assert.ok(fs.existsSync(path.join(out.stagingDir, 'p', 'a', 'index.html')));
});

test('the CLI prints a human report by default', () => {
  const { activeDir } = cliFixture();
  const res = runCli(['--from', activeDir]);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /staging:/);
  assert.match(res.stdout, /items:\s+1/);
  const m = res.stdout.match(/staging:\s+(\S+)/);
  if (m) stagings.push(m[1]);
});

test('the CLI errors, exit 1, when no v2 config resolves', () => {
  const base = tmp();
  const from = path.join(base, 'work');
  fs.mkdirSync(from, { recursive: true });
  const res = runCli(['--from', from]);
  assert.equal(res.status, 1);
  assert.equal(res.stdout.trim(), '');
  assert.match(res.stderr, /no v2 preview config|mode: none/);
});

test('the CLI prints usage for --help and exits 0', () => {
  const res = runCli(['--help']);
  assert.equal(res.status, 0);
  assert.match(res.stdout, /usage:/);
});
