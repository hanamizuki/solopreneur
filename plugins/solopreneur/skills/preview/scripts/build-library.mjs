#!/usr/bin/env node
/**
 * Turn a resolved preview target's content collections into a deployable staging
 * tree: scan the collections, validate each preview's `preview.json`, compute a
 * content hash per item, project an allowlist of metadata into `directory.json`,
 * and copy each item's files into `/p/<id>/`.
 *
 * Requires Node.js >= 20.
 *
 * Usage:
 *   build-library.mjs [--from <path>] [--json]
 *
 * Output: a human report (or `--json`) on stdout naming the assembled staging
 *   directory; every error on stderr, exit 1. The staging tree is left on disk
 *   for the deploy step to consume — this script builds, it does not deploy.
 *
 * The one guarantee that shapes every rule below: local SOURCE metadata never
 * leaks into the deployment. `preview.json` is not copied; only an allowlist of
 * its fields is projected into `directory.json`, and `sourceRef`, raw session
 * ids, transcript paths and absolute local paths are never among them.
 *
 * Nothing here touches the network, and nothing is written into the workspace or
 * the content tree — the staging tree is assembled in a system temp directory,
 * and a failed build removes it rather than leaving a partial snapshot behind.
 *
 * This PR is the scanner + staging producer. Chrome injection (the sidebar,
 * provenance footer and Share UI) is a LATER change: `injectEntry` is the seam it
 * plugs into, and this file ships the verbatim-copy default. `findInjectionPoint`
 * is implemented and tested here so that later change only adds injection logic,
 * never restructures the copy.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigError, resolveConfig } from './config-resolve.mjs';

const SELF = 'build-library.mjs';
const SCHEMA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)), 'preview-schema.json',
);

/** v1 entry file. The schema also pins it; this is the copy the scanner uses. */
const ENTRY_DEFAULT = 'index.html';

/**
 * A lowercase-slug id. Duplicated from the schema `pattern` on purpose: the id
 * becomes a filesystem path segment (`/p/<id>/`), so it is re-checked at the
 * moment of path construction as defense in depth on that boundary — never
 * trusting that validation ran first.
 */
const SLUG = /^[a-z0-9-]+$/;

/**
 * Source and runtime files that must never reach the deployment. The rule is
 * "nothing hidden": every dotfile and dotdir is excluded — `.vercel/` with its
 * `project.json` (left in the source by the legacy per-page deploy; gitignore
 * does NOT stop this builder copying it), `.git/`, `.env*`, `.DS_Store`, and any
 * accidentally-placed `.netrc` / `.git-credentials` / `.npmrc` / `.pgpass`. One
 * rule closes far more than an enumerated denylist could without ever growing a
 * list. On top of that, two non-hidden names: `preview.json` (local metadata,
 * projected into directory.json instead of copied) and the per-page
 * `comment-overlay.js` (a stale single-machine copy the shared staging asset
 * replaces — a later change rewrites the tag). The compare is case-insensitive
 * so a case-insensitive dev filesystem cannot smuggle a `Preview.json` past it.
 *
 * This is the SINGLE exclusion predicate: the scan, the fingerprint, the content
 * hash and the copy all flow from the one walk that consults it, so they cannot
 * drift — a file is either in all of them or none.
 *
 * ponytail: this does NOT catch a non-hidden secret (`id_rsa`, `server.pem`). The
 * library is private and single-trust-domain by design (see the architecture's
 * trust-boundary decision), so the ceiling is "don't put a non-hidden secret in a
 * preview directory", not a sandbox.
 */
const EXCLUDED_EXACT = new Set(['preview.json', 'comment-overlay.js']);
const isExcluded = (name) => name.startsWith('.') || EXCLUDED_EXACT.has(name.toLowerCase());

/** Size-report warning thresholds (provisional). */
const WARN_FILE_COUNT = 200;
const WARN_TOTAL_BYTES = 50 * 1000 * 1000; // 50 MB

/**
 * A problem the USER can fix — a bad `preview.json`, a duplicate id, a symlink
 * escaping a preview dir, a torn snapshot. The CLI prints `.message` and exits 1.
 * A broken install (a missing or malformed `preview-schema.json`) throws a plain
 * Error instead, so a caller catching BuildError to say "fix your content" cannot
 * swallow a bug in a shipped file.
 */
export class BuildError extends Error {}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * True when `child` is `parent` or sits underneath it. Both must be physical
 * (realpath'd). `path.relative` rather than a prefix compare, for the reason the
 * sibling resolvers give: a prefix test needs a trailing separator to keep
 * `/a/b-old` out of `/a/b`, and that separator then breaks a `parent` of `/`.
 */
function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(rel);
}

const assertSlug = (id, where) => {
  if (!SLUG.test(id)) {
    throw new BuildError(`preview id ${JSON.stringify(id)} is not a lowercase slug [a-z0-9-]: ${where}`);
  }
};

// ---------------------------------------------------------------------------
// preview-schema.json — a small interpreter, mirroring the one config-resolve.mjs
// runs over config.schema.json. It reads the shipped schema so the contract lives
// in one machine-checkable file rather than being restated in code. Only the
// keywords preview-schema.json actually uses are implemented; anything else is a
// load-time schemaBug (a shipped-file bug, never a user error).
// ---------------------------------------------------------------------------

const KNOWN_KEYWORDS = new Set([
  '$schema', 'title', 'description',
  'type', 'const', 'required', 'properties', 'items', 'pattern', 'minimum', 'minLength',
]);
const KNOWN_TYPES = new Set(['object', 'array', 'string', 'integer']);

const schemaBug = (detail) => new Error(
  `${SELF}: ${detail}\n  in ${SCHEMA_PATH}\n`
  + '  this builder ships a deliberately small schema interpreter — teach it the keyword, or move to a full validator',
);

/**
 * Audit the whole schema once, at load time, and refuse to run on anything the
 * interpreter cannot honor. A per-node check would only see the subschemas a
 * given preview.json reaches, so an unsupported keyword on an optional field
 * would sit unnoticed until some item set it. Names AND `type` values are both
 * checked — `type` is a known keyword, so a name-only check would let
 * `"type": "number"` through to a branch that does not exist.
 */
function auditSchema(node, where) {
  if (!isObject(node)) throw schemaBug(`${where} is not a schema object`);
  for (const keyword of Object.keys(node)) {
    if (!KNOWN_KEYWORDS.has(keyword)) throw schemaBug(`unsupported keyword "${keyword}" at ${where}`);
  }
  if ('type' in node && !KNOWN_TYPES.has(node.type)) {
    throw schemaBug(`unsupported "type" value ${JSON.stringify(node.type)} at ${where}`);
  }
  for (const [keyword, ok] of [
    ['required', Array.isArray(node.required)],
    ['properties', isObject(node.properties)],
    ['minLength', typeof node.minLength === 'number'],
    ['minimum', typeof node.minimum === 'number'],
    ['pattern', typeof node.pattern === 'string'],
  ]) {
    if (keyword in node && !ok) throw schemaBug(`malformed "${keyword}" at ${where}`);
  }
  // A malformed regex would otherwise throw a raw SyntaxError the first time an
  // item was validated; catch it as a schemaBug at load time instead.
  if ('pattern' in node) {
    try { RegExp(node.pattern); } catch (err) { throw schemaBug(`invalid "pattern" at ${where}: ${err.message}`); }
  }
  for (const [key, sub] of Object.entries(node.properties ?? {})) auditSchema(sub, `${where}.${key}`);
  if ('items' in node) auditSchema(node.items, `${where}[]`);
}

let schemaCache;
function loadSchema() {
  if (schemaCache) return schemaCache;
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    // Fatal, never "carry on unvalidated" — a missing or broken schema means
    // nothing downstream can trust what this script validates.
    throw new Error(`${SELF}: cannot load schema: ${SCHEMA_PATH}\n  ${err.message}`);
  }
  auditSchema(schema, '(root)');
  schemaCache = schema;
  return schemaCache;
}

function validate(value, schema, where, errors) {
  if (schema.type === 'object' && !isObject(value)) { errors.push(`${where}: expected an object`); return; }
  if (schema.type === 'array' && !Array.isArray(value)) { errors.push(`${where}: expected an array`); return; }
  if (schema.type === 'string' && typeof value !== 'string') { errors.push(`${where}: expected a string`); return; }
  if (schema.type === 'integer' && !(typeof value === 'number' && Number.isInteger(value))) {
    errors.push(`${where}: expected an integer`); return;
  }
  if ('const' in schema && value !== schema.const) { errors.push(`${where}: expected ${JSON.stringify(schema.const)}`); return; }
  if ('minLength' in schema && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${where}: needs at least ${schema.minLength} character(s)`);
  }
  if ('minimum' in schema && typeof value === 'number' && value < schema.minimum) {
    errors.push(`${where}: must be >= ${schema.minimum}`);
  }
  if ('pattern' in schema && typeof value === 'string' && !RegExp(schema.pattern).test(value)) {
    errors.push(`${where}: must match ${schema.pattern}`);
  }
  if ('required' in schema && isObject(value)) {
    for (const key of schema.required) {
      if (!Object.hasOwn(value, key)) errors.push(`${where === '' ? key : `${where}.${key}`}: required but missing`);
    }
  }
  if ('properties' in schema && isObject(value)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) validate(value[key], sub, where === '' ? key : `${where}.${key}`, errors);
    }
  }
  if ('items' in schema && Array.isArray(value)) {
    value.forEach((item, i) => validate(item, schema.items, `${where}[${i}]`, errors));
  }
}

/** Validate one parsed `preview.json` against the shipped schema. */
function validatePreviewMeta(meta, file) {
  const errors = [];
  validate(meta, loadSchema(), '', errors);
  // The schema pattern checks timestamp SHAPE and a timezone, not semantics — it
  // admits impossible instants (`2026-99-99T…Z`, `…+99:99`) that Date.parse then
  // rejects as NaN. Catch those here so the catalog never sorts on, or publishes,
  // a value that is not a real instant. Guarded on `typeof string` so a missing or
  // wrong-typed field reports its schema error above rather than a parse error too.
  for (const key of ['createdAt', 'updatedAt']) {
    const value = meta[key];
    if (typeof value !== 'string') continue; // a missing / mistyped field is a schema error above
    if (Number.isNaN(Date.parse(value))) {
      errors.push(`${key}: ${JSON.stringify(value)} is not a real ISO 8601 instant`);
      continue;
    }
    // Date.parse ACCEPTS an overflowed calendar date (Feb 30 rolls to Mar 2) rather
    // than returning NaN, which would sort by the rolled instant while publishing
    // the impossible string. Rebuild the written Y-M-D as a UTC date and confirm it
    // did not roll over. (Only the calendar date can overflow silently — an
    // out-of-range time or offset already fails the NaN check above.)
    const ymd = /^(\d{4})-(\d{2})-(\d{2})T/.exec(value);
    if (ymd) {
      const [y, mo, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
        errors.push(`${key}: ${JSON.stringify(value)} is not a real calendar date`);
      }
    }
  }
  if (errors.length) throw new BuildError(`invalid preview.json: ${file}\n  ${errors.join('\n  ')}`);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256File = (file) => sha256(fs.readFileSync(file));

/**
 * Deterministic JSON: object keys sorted recursively, array order preserved. The
 * content hash must reproduce byte-for-byte on any machine, so it cannot depend
 * on the insertion order `JSON.stringify` would otherwise echo. Only the shapes
 * the canonical payload contains (objects, arrays, strings, numbers) are handled;
 * `undefined` never appears because absent optional fields are omitted, not set.
 */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * The `sha256:`-prefixed content hash over a CANONICAL payload = the item's
 * source files (posix relative path + their sha256, sorted by path) plus the
 * intrinsic display metadata. Computed from the scan fingerprint, BEFORE any
 * chrome injection, so the same revision hashes identically whether it renders in
 * the Library or as a standalone Share snapshot.
 *
 * The `collection` is deliberately NOT hashed: archiving is a plain move that
 * must not look like a content change, and a Share snapshot has no collection at
 * all. The hash is a derived value — it is never written back into `preview.json`.
 *
 * Two deliberate choices worth stating: `tags` order is significant (they are
 * hashed as authored, not sorted), and the hash intentionally folds in MUTABLE
 * display metadata (`title`, `updatedAt`, `revision`), so it fingerprints a
 * REVISION, not raw bytes — a metadata-only edit changes it on purpose. It is not
 * a pure content-address; do not treat it as one.
 */
function computeContentHash(fingerprint, meta) {
  const files = [...fingerprint.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const hashedMeta = { id: meta.id, title: meta.title, createdAt: meta.createdAt, updatedAt: meta.updatedAt, revision: meta.revision };
  for (const key of ['project', 'tags', 'supersededBy']) {
    if (meta[key] !== undefined) hashedMeta[key] = meta[key];
  }
  return `sha256:${sha256(stableStringify({ files, meta: hashedMeta }))}`;
}

// ---------------------------------------------------------------------------
// Scanning + fingerprinting
// ---------------------------------------------------------------------------

/**
 * Read one `preview.json`. The sidecar gets the SAME containment as content
 * files: a symlinked metadata file is realpath'd and must resolve inside its item
 * directory (`containerReal`) — otherwise a bare `statSync` would FOLLOW an
 * escaping link and the builder would emit out-of-tree title / dates / hash,
 * quietly breaking the containment guarantee for the one file that drives every
 * item's metadata. A non-regular file (a FIFO would block `readFileSync` forever)
 * is rejected before any read.
 */
function readPreviewJson(file, containerReal) {
  let lst;
  try {
    lst = fs.lstatSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new BuildError(`missing preview.json: ${file}\n  every item directory under a collection must carry a preview.json.`);
    }
    throw new BuildError(`cannot read preview.json: ${file}\n  ${err.message}`);
  }
  // lstat, then realpath a symlink and assert containment — mirrors the content
  // walk in fingerprintItem so the metadata file cannot escape where content cannot.
  if (lst.isSymbolicLink()) {
    let real;
    try {
      real = fs.realpathSync(file);
    } catch (err) {
      throw new BuildError(`preview.json is a broken symlink: ${file}\n  ${err.message}`);
    }
    if (!isUnder(real, containerReal)) {
      throw new BuildError(`preview.json escapes its preview directory: ${file} -> ${real}`);
    }
  }
  // Follows a contained symlink; a FIFO or device (even via a link) is not a
  // regular file and is rejected before readFileSync, which would block on a pipe.
  if (!fs.statSync(file).isFile()) throw new BuildError(`preview.json is not a regular file: ${file}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new BuildError(`malformed JSON in preview.json: ${file}\n  ${err.message}`);
  }
  if (!isObject(parsed)) throw new BuildError(`preview.json is not an object: ${file}`);
  return parsed;
}

/**
 * Walk one item directory, returning its content files and a per-file sha256
 * fingerprint. Every entry is policed on the way:
 *   - excluded names are skipped (never copied, never hashed);
 *   - a symlink is realpath'd and must resolve INSIDE the item dir — one escaping
 *     the preview directory is rejected;
 *   - only regular files and directories are accepted — a device, socket or FIFO
 *     is rejected (it is not content, and reading one could block);
 *   - a symlink cycle (a directory link that reaches a dir already being walked)
 *     is rejected rather than followed into an infinite loop.
 * `rel` is always a posix path, NFC-normalized, so the fingerprint — and thus the
 * content hash — is identical across platforms and Unicode normalization forms.
 *
 * ponytail: a HARDLINK to an out-of-tree file has no symlink component, so the
 * realpath containment check cannot see it — its bytes are simply deployed. Same
 * private, single-trust-domain ceiling as the exclusion rule; not a sandbox.
 */
function fingerprintItem(itemDirReal) {
  const files = [];
  const fingerprint = new Map();
  const visited = new Set();

  const walk = (dirAbs, relPrefix) => {
    // Guard directory symlink cycles by the physical identity of each dir entered.
    const canon = fs.realpathSync(dirAbs);
    if (visited.has(canon)) throw new BuildError(`symlink cycle under the preview directory: ${dirAbs}`);
    visited.add(canon);

    for (const dirent of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const name = dirent.name;
      if (isExcluded(name)) continue;
      const abs = path.join(dirAbs, name);
      const rel = relPrefix ? `${relPrefix}/${name}` : name;

      if (dirent.isSymbolicLink()) {
        let real;
        try {
          real = fs.realpathSync(abs);
        } catch (err) {
          throw new BuildError(`broken symlink in a preview directory: ${abs}\n  ${err.message}`);
        }
        if (!isUnder(real, itemDirReal)) {
          throw new BuildError(`a symlink escapes its preview directory: ${abs} -> ${real}`);
        }
        const st = fs.statSync(abs);
        if (st.isDirectory()) { walk(abs, rel); continue; }
        if (!st.isFile()) throw new BuildError(`refusing a non-regular file (device/socket/pipe): ${abs}`);
        addFile(abs, rel, st.size);
        continue;
      }
      if (dirent.isDirectory()) { walk(abs, rel); continue; }
      if (!dirent.isFile()) throw new BuildError(`refusing a non-regular file (device/socket/pipe): ${abs}`);
      addFile(abs, rel, fs.statSync(abs).size);
    }
  };
  const addFile = (abs, rel, size) => {
    // NFC-normalize the relative path so the same non-ASCII filename fingerprints
    // identically on macOS (which may hand back NFD) and Linux (NFC). `abs` stays
    // as the OS gave it, for reading; only the derived `rel` used in the hash and
    // the staging path is normalized, so both agree.
    const relNfc = rel.normalize('NFC');
    // Two distinct source names that normalize to the SAME NFC path (possible on a
    // normalization-preserving filesystem such as Linux ext4) would otherwise
    // collide on one fingerprint key and one staging path — silently dropping a
    // file while the torn-snapshot guard still matched the survivor. Abort rather
    // than coalesce, so the normalization that buys cross-platform stability can
    // never cost an asset.
    if (fingerprint.has(relNfc)) {
      throw new BuildError(
        `two files normalize to the same path ${JSON.stringify(relNfc)} in a preview — `
        + 'rename one so the names differ after Unicode NFC normalization.',
      );
    }
    files.push({ abs, rel: relNfc, size });
    fingerprint.set(relNfc, sha256File(abs));
  };

  walk(itemDirReal, '');

  // The file/file variant of an NFC collision is caught in addFile; this catches
  // the file/directory variant — a file whose normalized path is an ANCESTOR
  // directory of another file's (e.g. a file `x` and a directory `x` holding
  // `x/child`, distinct only by Unicode form on a preserving FS). They do not
  // share a fingerprint key, so they would collide only at copy time as a raw
  // EEXIST/ENOTDIR; reject them here with the same clean message instead.
  for (const rel of fingerprint.keys()) {
    const parts = rel.split('/');
    for (let i = 1; i < parts.length; i += 1) {
      const ancestor = parts.slice(0, i).join('/');
      if (fingerprint.has(ancestor)) {
        throw new BuildError(
          `a file and a directory normalize to the same path ${JSON.stringify(ancestor)} in a preview — `
          + 'rename one so the names differ after Unicode NFC normalization.',
        );
      }
    }
  }
  return { files, fingerprint };
}

/**
 * Scan every included collection into a list of items, validating each along the
 * way. The item's SOURCE directory is realpath'd and asserted to sit under the
 * preview root (a symlinked collection or item escaping the tree is rejected);
 * its `preview.json` is schema-validated; a duplicate id across ANY two included
 * collections is refused naming BOTH files; the entry file must exist. A missing
 * collection directory is normal (an empty archive), not an error.
 */
function scanCollections(rootReal, collections, include) {
  const items = [];
  const byId = new Map();

  for (const key of include) {
    const coll = collections[key];
    const collLexical = path.join(rootReal, coll.path);
    let collReal;
    try {
      collReal = fs.realpathSync(collLexical);
    } catch (err) {
      if (err.code === 'ENOENT') continue; // an empty / not-yet-created collection
      throw new BuildError(`cannot resolve collection ${JSON.stringify(key)}: ${collLexical}\n  ${err.message}`);
    }
    if (!isUnder(collReal, rootReal)) {
      throw new BuildError(`collection ${JSON.stringify(key)} resolves outside the preview root: ${collReal}`);
    }
    if (!fs.statSync(collReal).isDirectory()) {
      throw new BuildError(`collection ${JSON.stringify(key)} is not a directory: ${collReal}`);
    }

    for (const dirent of fs.readdirSync(collReal, { withFileTypes: true })) {
      // Stray files (.gitignore, .DS_Store) and excluded names are not items.
      if (isExcluded(dirent.name)) continue;
      const entryLexical = path.join(collReal, dirent.name);
      let itemDirReal;
      try {
        itemDirReal = fs.realpathSync(entryLexical);
      } catch (err) {
        throw new BuildError(`cannot resolve item directory: ${entryLexical}\n  ${err.message}`);
      }
      if (!fs.statSync(itemDirReal).isDirectory()) continue; // a stray file at the collection root
      if (!isUnder(itemDirReal, rootReal)) {
        throw new BuildError(`item ${JSON.stringify(dirent.name)} in collection ${JSON.stringify(key)} resolves outside the preview root: ${itemDirReal}`);
      }

      const metaFile = path.join(itemDirReal, 'preview.json');
      const meta = readPreviewJson(metaFile, itemDirReal);
      validatePreviewMeta(meta, metaFile);
      assertSlug(meta.id, metaFile); // defense in depth; the schema pattern already enforced it

      // An item lives at <collection>/<id>/, so the directory name IS the id.
      // Enforcing it keeps the route (/p/<id>/) predictable from the source
      // location and catches a dir renamed without updating the id (or vice
      // versa) before it silently deploys under a surprising route.
      if (dirent.name !== meta.id) {
        throw new BuildError(
          `preview directory name ${JSON.stringify(dirent.name)} does not match its id ${JSON.stringify(meta.id)}: ${metaFile}\n`
          + '  an item lives at <collection>/<id>/ — rename the directory to its id, or the id to the directory.',
        );
      }

      const prior = byId.get(meta.id);
      if (prior) {
        throw new BuildError(
          `duplicate preview id ${JSON.stringify(meta.id)} across collections:\n`
          + `  ${prior.metaFile}\n  ${metaFile}\n`
          + '  the id becomes the /p/<id>/ route, so two items cannot share it — give one a different id.',
        );
      }

      const entry = meta.entry ?? ENTRY_DEFAULT;
      const entryPath = path.join(itemDirReal, entry);
      let entryStat;
      try {
        entryStat = fs.statSync(entryPath);
      } catch {
        throw new BuildError(`entry file ${JSON.stringify(entry)} does not exist for preview ${JSON.stringify(meta.id)}: ${entryPath}`);
      }
      if (!entryStat.isFile()) throw new BuildError(`entry ${JSON.stringify(entry)} for preview ${JSON.stringify(meta.id)} is not a regular file: ${entryPath}`);

      const { files, fingerprint } = fingerprintItem(itemDirReal);
      const item = {
        id: meta.id,
        collection: key,
        metaFile,
        itemDirReal,
        meta,
        entry,
        files,
        fingerprint,
        contentHash: computeContentHash(fingerprint, meta),
      };
      items.push(item);
      byId.set(meta.id, item);
    }
  }
  return items;
}

/**
 * Validate `supersededBy` across the whole library: the pointer is only allowed
 * on an Archive item, must name another existing item, and the chain must not
 * cycle. A self-reference is the shortest cycle and is reported as one.
 */
function validateSupersededBy(items) {
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const item of items) {
    const target = item.meta.supersededBy;
    if (target === undefined) continue;
    if (item.collection !== 'archive') {
      throw new BuildError(
        `preview ${JSON.stringify(item.id)} has supersededBy but lives in collection ${JSON.stringify(item.collection)}, not archive: ${item.metaFile}\n`
        + '  supersededBy only folds an ARCHIVED duplicate under its replacement.',
      );
    }
    if (!byId.has(target)) {
      throw new BuildError(`preview ${JSON.stringify(item.id)} is supersededBy ${JSON.stringify(target)}, which is not an item in this library: ${item.metaFile}`);
    }
  }
  // Cycle detection over the supersededBy edges (a -> supersededBy(a)).
  for (const start of items) {
    if (start.meta.supersededBy === undefined) continue;
    const chain = [start.id];
    const seen = new Set(chain);
    let cur = start.meta.supersededBy;
    while (cur !== undefined) {
      chain.push(cur);
      if (seen.has(cur)) {
        throw new BuildError(`supersededBy cycle: ${chain.join(' -> ')}\n  at ${start.metaFile}`);
      }
      seen.add(cur);
      cur = byId.get(cur)?.meta.supersededBy;
    }
  }
}

// ---------------------------------------------------------------------------
// Injection point (prepared for a later change; not applied here)
// ---------------------------------------------------------------------------

/**
 * Locate where entry-page chrome will be injected: immediately before the LAST
 * `</body>` (case-insensitive), or appended at EOF when there is none. A page can
 * legitimately hold the literal string in a script or comment, so the real
 * closing tag is the last one. This PR copies the entry VERBATIM and does not
 * apply the point; it is exported and tested so the later chrome change only adds
 * injection, never restructures the copy.
 *
 * @returns {{index: number, atEof: boolean}}
 */
export function findInjectionPoint(html) {
  const idx = html.toLowerCase().lastIndexOf('</body>');
  if (idx === -1) return { index: html.length, atEof: true };
  return { index: idx, atEof: false };
}

/** The verbatim-copy default for the chrome-injection seam. */
const identityInject = (html) => html;

// ---------------------------------------------------------------------------
// Copying (with the torn-snapshot guard)
// ---------------------------------------------------------------------------

/**
 * Copy one item's files into `<staging>/p/<id>/`, then prove the copy is faithful.
 *
 * The torn-snapshot guard: a shared working tree may auto-sync in the background,
 * so a source file can change between the scan (which fingerprinted it) and this
 * copy. After copying, every staged file is re-hashed and compared to the scan
 * fingerprint; any disagreement aborts the build rather than publish a
 * half-updated item. Matching only the file LIST would miss "same filename,
 * rewritten content", so the content itself is fingerprinted.
 *
 * Chrome injection runs AFTER the guard, so the guard only ever validates the
 * verbatim copy. The default is identity (verbatim); a later change replaces
 * `injectEntry` to add preview-shell.js and rewrite the comment-overlay tag. The
 * content hash was computed from the source fingerprint before any of this, so
 * injected chrome never changes it.
 */
function copyItem(item, stagingDir, injectEntry) {
  assertSlug(item.id, item.metaFile); // the id is about to become a path segment
  const dest = path.join(stagingDir, 'p', item.id);

  for (const { abs, rel } of item.files) {
    const target = path.join(dest, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try {
      fs.copyFileSync(abs, target);
    } catch (err) {
      // A source file that vanished between the scan and this copy is the "remove"
      // half of a torn snapshot (the background auto-sync deleting or replacing
      // it). Report it as a clean abort, not a raw ENOENT crash.
      if (err.code === 'ENOENT') {
        throw new BuildError(
          `torn snapshot: ${JSON.stringify(`${item.id}/${rel}`)} disappeared between scan and copy\n`
          + '  a source file was removed mid-build — aborting rather than publish an incomplete item.',
        );
      }
      throw err;
    }
  }

  for (const { rel } of item.files) {
    const staged = sha256File(path.join(dest, rel));
    if (staged !== item.fingerprint.get(rel)) {
      throw new BuildError(
        `torn snapshot: ${JSON.stringify(`${item.id}/${rel}`)} changed between scan and copy\n`
        + '  the staged bytes differ from the single-scan fingerprint, so the deployment would be inconsistent — aborting rather than publish a half-updated item.',
      );
    }
  }

  const entryTarget = path.join(dest, item.entry);
  const html = fs.readFileSync(entryTarget, 'utf8');
  const injected = injectEntry(html, item);
  if (injected !== html) fs.writeFileSync(entryTarget, injected);
}

// ---------------------------------------------------------------------------
// Projection + reporting
// ---------------------------------------------------------------------------

/**
 * Project the validated items into `directory.json`: an allowlist per item plus a
 * document-level build timestamp and (when the root is in a git repo) the source
 * commit. Everything not on the allowlist — `sourceRef`, provenance, the raw
 * `preview.json`, any absolute local path — is left out by construction, which is
 * the sanitization guarantee this whole builder exists to keep.
 *
 * Sorted `updatedAt` DESC then `id` ASC so the catalog order is stable across
 * machines even when two items share a timestamp.
 */
export function projectDirectory(items, generatedAt, commit) {
  const rows = items.map((item) => {
    const m = item.meta;
    const row = { id: item.id, title: m.title, createdAt: m.createdAt };
    // ponytail: task-mandated legacy-display tolerance (`updatedAt ?? createdAt`,
    // `revision ?? 1`). Today the schema requires both, so via buildLibrary this
    // fallback is unreachable — it guards the directory.json contract against a
    // future where the schema relaxes them for real legacy items, and is covered
    // by a direct projectDirectory test rather than a validated build.
    row.updatedAt = m.updatedAt ?? m.createdAt;
    row.revision = m.revision ?? 1;
    if (m.project !== undefined) row.project = m.project;
    if (m.tags !== undefined) row.tags = m.tags;
    row.collection = item.collection;
    if (m.supersededBy !== undefined) row.supersededBy = m.supersededBy;
    row.contentHash = item.contentHash;
    return row;
  });
  // Sort by the parsed INSTANT, not lexically: two valid ISO timestamps with
  // different offsets order wrong as strings (`…10:00+08:00` is older in UTC than
  // `…09:00-08:00` yet sorts after it). The schema requires a timezone on every
  // timestamp, so Date.parse is unambiguous and machine-independent; an
  // unparseable value (only reachable through a direct projectDirectory call with
  // unvalidated data) sorts last, keeping the order total and deterministic.
  const instant = (s) => { const t = Date.parse(s); return Number.isNaN(t) ? -Infinity : t; };
  rows.sort((a, b) => {
    const ta = instant(a.updatedAt);
    const tb = instant(b.updatedAt);
    if (ta !== tb) return tb - ta; // updatedAt DESC (newer first)
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // id ASC
  });

  const directory = { schemaVersion: 1, generatedAt };
  if (commit) directory.source = { commit };
  directory.items = rows;
  return directory;
}

/** File count + total bytes per collection, with a warning past the thresholds. */
function buildSizeReport(items) {
  // Null prototype: a collection key can be an arbitrary string, and a config may
  // (via JSON.parse) carry an own `__proto__` / `constructor` / `toString` key. On
  // a plain `{}` accumulator `collections[key] ??= …` would read the INHERITED
  // member for those, skip the assignment, and mutate Object.prototype (pollution)
  // while dropping the collection from the report. Same guard config-migrate uses.
  const collections = Object.create(null);
  let totalFiles = 0;
  let totalBytes = 0;
  for (const item of items) {
    const bucket = (collections[item.collection] ??= { files: 0, bytes: 0 });
    for (const f of item.files) {
      bucket.files += 1; bucket.bytes += f.size;
      totalFiles += 1; totalBytes += f.size;
    }
  }
  const warnings = [];
  if (totalFiles > WARN_FILE_COUNT) {
    warnings.push(`the library holds ${totalFiles} files (over ${WARN_FILE_COUNT}); consider archiving or pruning.`);
  }
  if (totalBytes > WARN_TOTAL_BYTES) {
    warnings.push(`the library is ${(totalBytes / 1e6).toFixed(1)} MB (over ${(WARN_TOTAL_BYTES / 1e6).toFixed(0)} MB); consider archiving or pruning.`);
  }
  return { collections, totalFiles, totalBytes, warnings };
}

/** The git commit of the repo containing `dir`, or null when there is none. */
function defaultGitCommit(dir) {
  const res = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (res.error || res.status !== 0 || typeof res.stdout !== 'string') return null;
  const out = res.stdout.trim();
  return /^[0-9a-f]{7,64}$/i.test(out) ? out : null;
}

// ---------------------------------------------------------------------------
// The build
// ---------------------------------------------------------------------------

/**
 * Build a staging tree from a resolved target's collections.
 *
 * @param {object}   opts
 * @param {string}   opts.root         absolute content root (config-resolve's `root`)
 * @param {object}   opts.collections  collection map (config-resolve's `collections`)
 * @param {string[]} opts.include      collection keys to publish, in catalog order
 * @param {(dir: string) => (string|null)} [opts.gitCommit] source-commit lookup (injectable)
 * @param {(html: string, item: object) => string} [opts.injectEntry] chrome seam (default verbatim)
 * @param {{afterFingerprint?: () => void}} [opts.hooks] test seam fired after the scan, before the copy
 * @returns {{stagingDir: string, directory: object, sizeReport: object}}
 *
 * On success the staging tree is left on disk for the deploy step to consume and
 * `stagingDir` names it. On ANY failure the partial staging tree is removed —
 * nothing half-built is ever left behind.
 */
export function buildLibrary({ root, collections, include, gitCommit = defaultGitCommit, injectEntry = identityInject, hooks = {} }) {
  let rootReal;
  try {
    rootReal = fs.realpathSync(root);
  } catch (err) {
    throw new BuildError(`preview root does not resolve: ${root}\n  ${err.message}`);
  }
  if (!fs.statSync(rootReal).isDirectory()) throw new BuildError(`preview root is not a directory: ${rootReal}`);

  // Validate everything BEFORE creating any staging temp, so a bad library leaves
  // nothing on disk.
  const items = scanCollections(rootReal, collections, include);
  validateSupersededBy(items);

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-build-'));
  try {
    // Test seam: mutate a source file here to exercise the torn-snapshot guard.
    hooks.afterFingerprint?.();

    for (const item of items) copyItem(item, stagingDir, injectEntry);

    const directory = projectDirectory(items, new Date().toISOString(), gitCommit(rootReal));
    // directory.json is always produced with JSON.stringify, never string
    // concatenation, so no metadata value can forge structure.
    fs.writeFileSync(path.join(stagingDir, 'directory.json'), `${JSON.stringify(directory, null, 2)}\n`);

    return { stagingDir, directory, sizeReport: buildSizeReport(items) };
  } catch (err) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--from <path>] [--json]

  --from <path>  anchor config resolution at <path> instead of the current directory
  --json         print the build result as JSON instead of a human report`;

// ponytail: hand-rolled rather than node:util parseArgs — parseArgs only became
// stable in 20.16, and this file's declared floor is 20, where it would print an
// ExperimentalWarning onto the stderr this CLI reserves for errors (the sibling
// resolvers avoid it for the same reason).
function main(argv) {
  let from;
  let asJson = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      asJson = true;
    } else if (arg.startsWith('--from=')) {
      from = arg.slice('--from='.length);
    } else if (arg === '--from') {
      from = argv[i + 1];
      if (from === undefined) throw new BuildError(`--from requires a path\n${USAGE}`);
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    } else {
      throw new BuildError(`unknown argument: ${arg}\n${USAGE}`);
    }
  }

  const resolved = resolveConfig({ from });
  if (resolved.mode !== 'v2') {
    throw new BuildError(
      `no v2 preview config resolved (mode: ${resolved.mode})\n`
      + '  run `node setup.mjs` to create one, or `node config-migrate.mjs` to migrate a legacy config.',
    );
  }

  const result = buildLibrary({
    root: resolved.root,
    collections: resolved.collections,
    include: resolved.target.include,
  });

  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }

  const { sizeReport } = result;
  const lines = [
    `staging: ${result.stagingDir}`,
    `items:   ${result.directory.items.length}`,
    ...Object.entries(sizeReport.collections).map(
      ([key, s]) => `  ${key}: ${s.files} file(s), ${(s.bytes / 1000).toFixed(1)} kB`,
    ),
    `total:   ${sizeReport.totalFiles} file(s), ${(sizeReport.totalBytes / 1e6).toFixed(2)} MB`,
    ...sizeReport.warnings.map((w) => `WARNING: ${w}`),
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

// Compare physical paths: this file is reachable through symlinked plugin trees,
// where argv[1] is the link and import.meta.url is already resolved. The lexical
// comparison is kept as well, for `--preserve-symlinks-main`, where
// import.meta.url stays logical and the realpath would never match. It also keeps
// the module importable from a test without running the CLI as a side effect.
function invokedDirectly() {
  const self = fileURLToPath(import.meta.url);
  const entry = process.argv[1];
  if (!entry) return false;
  if (path.resolve(entry) === self) return true;
  try {
    return fs.realpathSync(entry) === self;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    // Rethrow a non-user error: a bug in a shipped file must not be reported to
    // the user as "fix your content".
    if (!(err instanceof BuildError) && !(err instanceof ConfigError)) throw err;
    process.stderr.write(`${SELF}: ${err.message}\n`);
    process.exitCode = 1;
  }
}

export { main };
