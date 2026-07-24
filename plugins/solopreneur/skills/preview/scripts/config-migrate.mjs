#!/usr/bin/env node
/**
 * Propose a v2 `.solopreneur.json` from the legacy `solopreneur.json` feature
 * config, and — only when explicitly asked — write it.
 *
 * Requires Node.js >= 20.
 *
 * Usage:
 *   config-migrate.mjs [--target-project <name>] [--legacy-config <path>]... [--write]
 *
 * Output: the migration proposal on stdout; warnings and every error on stderr,
 *   exit 1 on any refusal or failure. A refusal writes nothing at all.
 *
 * Legacy files read, and nothing else:
 *   1. ${CLAUDE_CONFIG_DIR}/solopreneur.json
 *   2. ~/.claude/solopreneur.json
 *   3. every file named with --legacy-config (repeatable), which outrank both
 *
 * There is deliberately no built-in inventory of other config files: looking
 * beyond the two default locations always takes an explicit flag.
 *
 * Legacy shapes recognized:
 *   - `default.preview.projects.{default,keep,public}` and `default.preview.autoProtect`
 *   - `repos.<repo-key>.preview.{path,projects.*,autoProtect}`
 *   - the older flat `preview.paths.<repo-key>`
 *
 * Guarantees:
 *   - The legacy file is READ-ONLY. It is never rewritten, never merged into,
 *     and is left byte-identical — rollback is "delete the new file", which
 *     only works if the old one was never touched.
 *   - The default mode is a dry run. Only `--write` touches the disk, and it
 *     backs up every legacy file it read before writing anything.
 *   - The target project is never guessed. `--target-project` is required, and
 *     the legacy bucket names (`default` / `keep` / `public`) are treated as
 *     opaque — none of them implies which project the migration should adopt.
 *   - `autoProtect: false` never becomes a `public` target. It maps to
 *     `private` like every other case, with a warning that opting out has to be
 *     a deliberate later edit.
 *
 * Nothing here touches the network, and `PREVIEW_PROJECT` is neither read nor
 * changed — it stays the highest-priority override for the legacy per-page flow.
 */

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ConfigError, resolveConfig } from './config-resolve.mjs';

const SELF = 'config-migrate.mjs';
const V2_FILENAME = '.solopreneur.json';
const LEGACY_FILENAME = 'solopreneur.json';

/**
 * Where a migrated scope keeps its previews when no legacy layer names a path.
 * Not an invention: it is the last-resort default the legacy flow already
 * documents (`skills/preview/SKILL.md`, "Otherwise default to
 * `<git_root>/docs/preview/`").
 */
const DEFAULT_ROOT = 'docs/preview';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Render a config-derived value on exactly one line of the report.
 *
 * Project names, the repo key and the preview path are attacker-ish text — a
 * legacy config gets copied between machines, and `--legacy-config` can point
 * at any file — while the report is precisely what a human reads to decide
 * whether to `--write`. Printed raw, a newline inside a project name forges a
 * line indistinguishable from this script's own statements of fact (verified:
 * a name ending in `\nwrote /etc/passwd` reproduces it). `config-resolve.mjs`
 * escapes its output for the same reason and has a test for it; quoting rather
 * than escaping also makes stray whitespace visible. Filesystem paths this
 * script resolved itself are left unquoted — they are the most-read lines and
 * are not config content.
 */
const show = (value) => JSON.stringify(String(value));

/**
 * Walk a path of own keys, yielding `undefined` at the first missing step.
 * Own-property lookups, not `?.`: a repo key like `constructor` or `toString`
 * would otherwise resolve through `Object.prototype` and hand back a function.
 */
const at = (root, ...keys) => keys.reduce(
  (node, key) => (isObject(node) && Object.hasOwn(node, key) ? node[key] : undefined),
  root,
);

/**
 * True when `child` is `parent` or sits underneath it — the same `path.relative`
 * test `config-resolve.mjs` uses, for the same reason a prefix compare cannot be.
 */
function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(rel);
}

/**
 * The physical path a (possibly not-yet-existing) path will resolve to: realpath
 * the deepest existing ancestor and re-append the missing tail. A plain
 * `realpathSync` throws on a path whose leaf does not exist yet, which loses the
 * one thing that matters here — whether a not-yet-created root sits under a
 * symlinked ancestor that leaves the repository.
 *
 * A DANGLING symlink along the way is refused rather than stepped over: it
 * exists (so it is a real component of the path, not a missing tail), yet its
 * target is absent, so ascending past it lexically would judge the root by the
 * wrong location and could let a link pointing outside the repo pass as
 * contained once its target appears.
 */
function physicalize(target) {
  const tail = [];
  for (let cur = target; ;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail);
    } catch (err) {
      // A component along the way is a regular file (so the root cannot exist
      // beneath it) — a user-configured unusable root, reported cleanly like the
      // leaf-is-a-file case rather than as a raw stack trace.
      if (err.code === 'ENOTDIR') {
        throw new ConfigError(
          `the legacy preview root passes through a non-directory: ${cur}\n`
          + `  ${path.relative(cur, target) || '.'} cannot exist beneath a file`,
        );
      }
      // Any other resolution failure — an unreadable component (EACCES), a
      // symlink loop (ELOOP), a name too long — is an environmental problem with
      // a user-configured root, so it gets the same clean refusal as the cases
      // above rather than escaping the CLI's ConfigError-only catch as a raw
      // stack trace. Only ENOENT continues below (a genuinely missing component).
      if (err.code !== 'ENOENT') {
        throw new ConfigError(`cannot resolve the legacy preview root: ${cur}\n  ${err.message}`);
      }
      try {
        fs.readlinkSync(cur);
        throw new ConfigError(`the legacy preview root passes through a dangling symlink: ${cur}`);
      } catch (linkErr) {
        if (linkErr instanceof ConfigError) throw linkErr;
        // Not a symlink — a genuinely missing component. Keep ascending.
      }
      const parent = path.dirname(cur);
      if (parent === cur) return path.join(cur, ...tail); // existing nowhere up to the root
      tail.unshift(path.basename(cur));
      cur = parent;
    }
  }
}

/**
 * The nearest `.solopreneur.json` that would shadow a config written at
 * `repoDir` — any file strictly between the preview `root` and `repoDir` that
 * carries a `preview` block (the resolver would stop there walking up from
 * content), OR that is present but broken (a malformed or unreadable config is
 * fatal to the resolver at every layer, so content resolution would stop there
 * too instead of reaching the repo-root file). A `.solopreneur.json` without a
 * `preview` block configures another feature and is skipped, exactly as the
 * resolver's walk-up skips it. Returns `{ file, reason }` or null.
 *
 * The scan starts at the deepest existing directory at or under `root`, so a
 * not-yet-created root is covered too, and it never looks at or above `repoDir`
 * — configs there are the shadow check's concern, not this one.
 */
function nestedShadow(root, repoDir) {
  let dir = root;
  while (dir !== repoDir && isUnder(dir, repoDir) && !fs.existsSync(dir)) dir = path.dirname(dir);
  for (; dir !== repoDir && isUnder(dir, repoDir); dir = path.dirname(dir)) {
    const shadow = classifyNested(path.join(dir, V2_FILENAME));
    if (shadow) return shadow;
  }
  return null;
}

/**
 * Classify one candidate nested `.solopreneur.json`, mirroring the resolver's
 * `readJsonIfPresent` + `assertConfigObject` exactly, so this scan agrees with
 * how content would actually resolve past it. A regular file with a `preview`
 * block shadows; anything the resolver treats as fatal (a non-regular file — a
 * FIFO would otherwise block `readFileSync` forever — a dangling symlink,
 * malformed JSON, or a non-object) also shadows, because content resolution
 * stops there before ever reaching the repo-root file. A valid object without a
 * `preview` block configures another feature and is skipped. Returns
 * `{ file, reason }` or null.
 */
function classifyNested(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // `stat` follows symlinks, so ENOENT is either "nothing here" or a
      // symlink pointing at nothing — the latter is present and broken.
      try {
        fs.lstatSync(file);
      } catch {
        return null; // truly absent
      }
      return { file, reason: 'is a broken symlink' };
    }
    if (err.code === 'ENOTDIR') return null; // a parent is a file; nothing here
    return { file, reason: 'cannot be read' };
  }
  if (!stat.isFile()) return { file, reason: 'is not a regular file' };

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return { file, reason: 'is present but unreadable' };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { file, reason: 'is present but not valid JSON' };
  }
  if (!isObject(parsed)) return { file, reason: 'is present but not a JSON object' };
  if (Object.hasOwn(parsed, 'preview')) return { file, reason: 'already configures a preview here' };
  return null; // a valid config for another feature — the resolver walks past it
}

// ---------------------------------------------------------------------------
// Reading legacy configs
// ---------------------------------------------------------------------------

/**
 * The preview-related subtrees of one legacy config.
 *
 * NOTE: this restates the legacy `solopreneur.json` layout in JavaScript, as
 * `config-resolve.mjs` does. It is registered in shared/config.md's
 * legacy-consumer list because that file's greps look for bash markers and
 * cannot find a copy written in another language. Like the resolver's copy, it
 * only ever READS.
 */
function legacyPreviewValues(config, file) {
  // A `preview` subtree that is present but NOT an object (`[]`, `false`, a
  // string, a number) is corrupt: the shell reader's `jq ... | values` treats
  // it as present and stops the cascade there, yielding no path — so silently
  // dropping it here would let a LOWER layer's path win and move previews to a
  // directory the legacy flow never used. Refuse it instead; the migrator cannot
  // honestly propose a target from a malformed source. (Absent — undefined or
  // null — is not corrupt: the cascade simply continues past it.)
  const useObject = (node, where) => {
    // Absent for the cascade means undefined, null, OR "" — the shell reader
    // captures jq's output and tests `[ -n "$out" ]`, so an empty string reads
    // as unanswered and falls through to the next layer (this is `isAnswer`, the
    // same rule readPath and readAutoProtect use). Only a non-empty non-object
    // (`[]`, `false`, `"docs"`, a number) is present-but-malformed.
    if (!isAnswer(node)) return false;
    if (!isObject(node)) {
      throw new ConfigError(
        `malformed legacy preview config: ${where} is ${Array.isArray(node) ? 'an array' : `a ${typeof node}`}, not an object\n`
        + `  in ${file}\n  the migrator cannot tell where previews should go from that — fix the legacy config first`,
      );
    }
    return true;
  };

  const found = {};
  if (useObject(at(config, 'default', 'preview'), 'default.preview')) found.default = config.default.preview;
  // The older flat shape, e.g. { "preview": { "paths": { "<repo-key>": "..." } } }
  if (useObject(at(config, 'preview'), 'preview')) found.preview = config.preview;
  // Null prototype: `JSON.parse` creates a real own `__proto__` property, but
  // assigning that key on a normal object hits `Object.prototype`'s setter and
  // creates nothing — so a `repos.__proto__` entry would vanish from a report
  // whose whole job is to show everything it found. (`config-resolve.mjs` has
  // the same accumulator without this; it only ever reports, and this file is
  // the one that turns the values into a written config.)
  const repos = Object.create(null);
  for (const [key, entry] of Object.entries(isObject(config?.repos) ? config.repos : {})) {
    if (useObject(at(entry, 'preview'), `repos[${show(key)}].preview`)) repos[key] = entry.preview;
  }
  if (Object.keys(repos).length) found.repos = repos;
  return found;
}

/**
 * Read one legacy config. `required` files were named on the command line, so a
 * missing one is the answer rather than something to step over; a default
 * location may simply not be there. Everything else — unreadable, malformed,
 * not an object — is fatal either way: a migration proposal built from a config
 * that was silently skipped would be wrong in a way nobody could see.
 */
function readLegacy(file, { required }) {
  const what = required ? '--legacy-config' : 'legacy config';
  // Classify before reading, exactly as config-resolve.mjs does: a FIFO or a
  // symlink to a device would otherwise block `readFileSync` forever waiting for
  // a writer. `stat` is used only to reject non-regular files here — never to
  // decide the file is readable, which the read below proves.
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return undefined;
    throw new ConfigError(`cannot read ${what}: ${file}\n  ${err.message}`);
  }
  if (!stat.isFile()) throw new ConfigError(`${what} is not a regular file: ${file}`);

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return undefined;
    throw new ConfigError(`cannot read ${what}: ${file}\n  ${err.message}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`malformed JSON in legacy config: ${file}\n  ${err.message}`);
  }
  if (!isObject(config)) throw new ConfigError(`legacy config is not a JSON object: ${file}`);
  return { file, values: legacyPreviewValues(config, file) };
}

/** The two default legacy locations, in the order every reader in this skill uses. */
function defaultLegacyFiles() {
  const files = [];
  // path.resolve, not path.join: a relative CLAUDE_CONFIG_DIR would otherwise
  // leak into the paths this script prints and backs up.
  if (process.env.CLAUDE_CONFIG_DIR) {
    files.push(path.resolve(process.env.CLAUDE_CONFIG_DIR, LEGACY_FILENAME));
  }
  files.push(path.join(os.homedir(), '.claude', LEGACY_FILENAME));
  return files;
}

/**
 * Every legacy config to migrate from, in priority order: files named on the
 * command line first (explicit intent outranks a default location), then the
 * default locations. Files carrying no preview values at all are dropped —
 * they are configs for other features.
 */
function gatherSources(named) {
  const sources = [];
  const seen = new Set();
  const candidates = [
    ...named.map((file) => ({ file: path.resolve(file), required: true })),
    ...defaultLegacyFiles().map((file) => ({ file, required: false })),
  ];
  for (const { file, required } of candidates) {
    // Dedup by PHYSICAL identity, not the lexical path: a symlinked
    // CLAUDE_CONFIG_DIR aliasing ~/.claude makes the two defaults name one file
    // through two paths, and backing both up would hit the same `.backup-<stamp>`
    // destination — the second COPYFILE_EXCL fails EEXIST and the whole run
    // rolls back. A missing file cannot be realpath'd; its lexical path is a
    // fine key, and readLegacy resolves whether that is fatal.
    let identity = file;
    try {
      identity = fs.realpathSync(file);
    } catch { /* missing or broken — readLegacy decides */ }
    if (seen.has(identity)) continue;
    seen.add(identity);
    const source = readLegacy(file, { required });
    if (!source) continue;
    if (Object.keys(source.values).length > 0) {
      sources.push(source);
    } else if (required) {
      // A file the caller named is never dropped in silence. Otherwise the run
      // ends with "no legacy preview config found ... name another file with
      // --legacy-config", which is the thing they just did.
      throw new ConfigError(
        `--legacy-config holds no preview settings: ${file}\n`
        + '  it parsed fine, but has no default.preview, repos.<key>.preview or top-level preview',
      );
    }
  }
  return sources;
}

// ---------------------------------------------------------------------------
// Interpreting the legacy cascade
//
// There are two different legacy readers, with two different cascades, and the
// migrator has to answer the way each one does or it will move settings the
// user never moved. They are deliberately NOT unified here.
// ---------------------------------------------------------------------------

/**
 * A value the legacy shell readers would treat as present. Both of them capture
 * jq's output into a shell variable and then test `[ -n "$out" ]`, so `null`
 * (dropped by `| values` / `// empty`) AND the empty string fall through to the
 * next layer. A literal `false` survives both, which is the case that matters
 * for `autoProtect`.
 */
const isAnswer = (value) => value !== undefined && value !== null && value !== '';

/**
 * `autoProtect`, the way `deploy.sh:read_preview_config` reads it: file-major,
 * trying `repos[<key>]` then `default` inside each file before moving to the
 * next. There is no flat top-level layer for this key.
 *
 * `projects.<bucket>` deliberately does NOT go through this cascade — the
 * caller picks a project explicitly, so `collectCandidates` offers the union of
 * every name instead of hiding the shadowed ones.
 */
function readAutoProtect(sources, key) {
  for (const { file, values } of sources) {
    for (const [where, subtree] of [
      [`repos[${show(key)}].preview`, at(values, 'repos', key)],
      ['default.preview', at(values, 'default')],
    ]) {
      const value = at(subtree, 'autoProtect');
      if (isAnswer(value)) return { value, file, where };
    }
  }
  return null;
}

/**
 * The preview path, the way `read_solopreneur_config preview` reads it
 * (shared/config.md, and SKILL.md's resolution flow): it returns the whole
 * `preview` SUBTREE from the first layer that has one — no merging across
 * layers — and the caller then takes `.path`, else `.paths[<key>]`, from that
 * one subtree.
 *
 * So a winning subtree with no path means "no configured path", even when a
 * lower layer has one: that lower layer is shadowed for the legacy reader too,
 * and quietly un-shadowing it here would migrate previews to a directory the
 * legacy flow never used. The returned layer is reported either way, so the
 * dry run shows which one stopped the search.
 */
function readPath(sources, key) {
  const layers = [
    ...sources.flatMap(({ file, values }) => [
      { file, where: `repos[${show(key)}].preview`, subtree: at(values, 'repos', key) },
      { file, where: 'default.preview', subtree: at(values, 'default') },
    ]),
    // Layer 5: the flat top-level `preview` subtree, primary then fallback.
    ...sources.map(({ file, values }) => ({ file, where: 'preview', subtree: at(values, 'preview') })),
  ];
  for (const layer of layers) {
    if (!isObject(layer.subtree)) continue;
    // `.path` else `.paths[<key>]`, both through the shell's own "is this an
    // answer" test — SKILL.md reads them with jq `// empty` and then checks the
    // captured string, so an empty `.path` falls through to `.paths` there too.
    const direct = at(layer.subtree, 'path');
    const value = isAnswer(direct) ? direct : at(layer.subtree, 'paths', key);
    return { file: layer.file, where: layer.where, value: isAnswer(value) ? value : null };
  }
  return null;
}

/**
 * Every project name the legacy config mentions, mapped to where it came from.
 * A union rather than a cascade — the caller picks one, so hiding a shadowed
 * name would only narrow their options. A Map keeps insertion order, so the
 * listing follows the order the files were read. Bucket names are carried
 * through as provenance and never used to rank or choose.
 */
function collectCandidates(sources) {
  const candidates = new Map();
  const add = (project, origin, file) => {
    if (typeof project !== 'string' || project === '') return;
    if (!candidates.has(project)) candidates.set(project, []);
    candidates.get(project).push(`${origin} in ${file}`);
  };
  // The bucket key is user-controlled too, and it lands mid-provenance — so it
  // is quoted like every other config-derived value, or a newline in it forges
  // report lines just as a project name would.
  for (const { file, values } of sources) {
    const globalProjects = at(values, 'default', 'projects');
    for (const [bucket, project] of Object.entries(isObject(globalProjects) ? globalProjects : {})) {
      add(project, `default.preview.projects.${show(bucket)}`, file);
    }
    for (const [key, preview] of Object.entries(isObject(values.repos) ? values.repos : {})) {
      const repoProjects = at(preview, 'projects');
      for (const [bucket, project] of Object.entries(isObject(repoProjects) ? repoProjects : {})) {
        add(project, `repos[${show(key)}].preview.projects.${show(bucket)}`, file);
      }
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Repo identity
// ---------------------------------------------------------------------------

/**
 * Run git, returning trimmed stdout or null. Never throws: git may be absent
 * (spawn fails with no stdout at all), the directory may not be a repo, and an
 * ownership refusal also lands here — every one of those has to fall through to
 * the next fallback rather than abort the migration.
 */
function git(args, cwd) {
  // No shell: arguments reach execve as-is, so nothing in a path or a remote
  // URL can be read as shell syntax.
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.error || result.status !== 0 || typeof result.stdout !== 'string') return null;
  const out = result.stdout.trim();
  return out === '' ? null : out;
}

/**
 * The key legacy configs store per-repo settings under. Mirrors
 * `deploy.sh:_preview_repo_key` step for step — origin URL normalized to
 * `host/owner/repo`, else the git toplevel path, else the directory's own
 * absolute path. Any divergence would read a different `repos[<key>]` entry
 * than the skill writes.
 */
function repoKey(dir) {
  const url = git(['remote', 'get-url', 'origin'], dir);
  if (url) {
    let key = url;
    for (const scheme of ['https://', 'http://', 'ssh://', 'git://']) {
      if (key.startsWith(scheme)) key = key.slice(scheme.length);
    }
    if (key.startsWith('git@')) key = key.slice('git@'.length);
    if (key.endsWith('.git')) key = key.slice(0, -'.git'.length);
    // Only the FIRST colon, matching the shell's `${url/://}`: that is the
    // scp-style `git@host:owner/repo` separator, and a path may hold more.
    return key.replace(':', '/');
  }
  return git(['rev-parse', '--show-toplevel'], dir) ?? path.resolve(dir);
}

// ---------------------------------------------------------------------------
// Building the proposal
// ---------------------------------------------------------------------------

/**
 * A relative legacy path is stored relative to the repo root, and a relative v2
 * `root` resolves against the directory of the file declaring it — and that
 * file lands at the repo root. So the value carries over unchanged; the `./`
 * prefix only makes the "relative to this file" reading obvious.
 */
function toRoot(value) {
  if (path.isAbsolute(value)) return value;
  const normalized = path.normalize(value).replace(/\/+$/, '');
  // Only a real parent segment escapes — the same distinction `isUnder` makes.
  // A plain startsWith('..') would also catch a directory legitimately named
  // `...`, and emit it without the `./` marker.
  const escapes = normalized === '..' || normalized.startsWith(`..${path.sep}`);
  return normalized === '.' || escapes ? normalized : `./${normalized}`;
}

/**
 * The v2 file. A fixed template with exactly two substitutions — everything
 * else is the documented v1 shape, because the legacy config has no equivalent
 * of collections or targets to carry over.
 */
const buildConfig = (project, root) => ({
  schemaVersion: 2,
  preview: {
    root,
    defaultTarget: 'private',
    collections: {
      active: { path: 'active', label: 'Previews' },
      archive: { path: 'archive', label: 'Archive' },
    },
    targets: {
      private: {
        provider: 'vercel',
        project,
        // Always private, including when autoProtect was explicitly false —
        // `public` has to be a deliberate hand edit, never a migration side
        // effect.
        visibility: 'private',
        include: ['active', 'archive'],
      },
    },
  },
});

/**
 * A unified diff against a file that does not exist yet, so every line is an
 * addition. Real unified-diff syntax, hunk header included, so the proposal can
 * be piped into anything that reads a patch rather than only eyeballed.
 */
function renderDiff(dest, text) {
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = body.split('\n');
  return [
    '--- /dev/null',
    `+++ ${dest}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * `20260724T144700.123Z-a1b2c3d4` — sortable, filename-safe, unambiguous about
 * the zone. The milliseconds and random suffix matter: two repos migrated from
 * ONE shared legacy file (the common `~/.claude/solopreneur.json` case) in the
 * same second — or two concurrent invocations in the same millisecond — would
 * otherwise generate the same backup name, and `COPYFILE_EXCL` would fail the
 * second with EEXIST even though the migrations are independent.
 */
const stampNow = () => `${new Date().toISOString().replace(/[-:]/g, '')}-${randomUUID().slice(0, 8)}`;

/**
 * Copy a legacy file aside before the migration. `COPYFILE_EXCL` so an existing
 * backup is never overwritten — and, since it fails rather than following a
 * symlink at the destination, so a `<file>.backup-...` symlink cannot redirect
 * the copy into whatever it points at.
 */
function backup(file, stamp) {
  const dest = `${file}.backup-${stamp}`;
  try {
    fs.copyFileSync(file, dest, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    throw new ConfigError(`cannot back up ${file} -> ${dest}\n  ${err.message}`);
  }
  return dest;
}

/**
 * Prove the file about to be installed actually resolves, using the shipped
 * resolver rather than a second copy of its rules: that covers the schema, the
 * single-target and provider limits, and the `include`/`collections` agreement
 * in one call. `$SOLOPRENEUR_CONFIG` is the resolver's own "use exactly this
 * file" entry point.
 */
function verifyResolves(file, dest) {
  const previous = process.env.SOLOPRENEUR_CONFIG;
  process.env.SOLOPRENEUR_CONFIG = file;
  try {
    resolveConfig({});
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    // Re-phrase against the destination: the resolver names the file it read,
    // and that temp is deleted before anyone sees the message.
    throw new ConfigError(
      `the migrated config does not resolve, so nothing was written\n  it would be: ${dest}\n  `
      + err.message.split(file).join(dest).split('\n').join('\n  '),
    );
  } finally {
    if (previous === undefined) delete process.env.SOLOPRENEUR_CONFIG;
    else process.env.SOLOPRENEUR_CONFIG = previous;
  }
}

/**
 * Write the new config to a temp file in the SAME directory and prove it
 * resolves, returning the temp path for the caller to rename into place.
 *
 * Staging is split from installing so that validation happens BEFORE the caller
 * takes any backup. Validating after would leave backup files behind on a
 * failed run — and because the stamp is second-granularity and the copy is
 * `COPYFILE_EXCL`, the corrected re-run would then die on EEXIST complaining
 * about backups instead of the problem the user actually has to fix.
 *
 * Same directory is load-bearing twice. It puts the temp on the same filesystem,
 * so the rename cannot fail with EXDEV and cannot decay into a copy; and the
 * resolver resolves a relative `root` against the directory of the file it
 * reads, so validating the temp there gives exactly the answer the installed
 * file will give. Moving temps to `os.tmpdir()` would silently break both.
 *
 * ponytail: no fsync. `rename` is atomic with respect to other processes, which
 * is the property that matters here; power-loss durability is not the threat
 * model when the legacy config is untouched and the recovery is "run it again".
 */
function stageConfig(dest, text) {
  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${randomUUID()}.tmp`);
  try {
    try {
      fs.writeFileSync(tmp, text);
    } catch (err) {
      // A read-only directory or a full disk is the environment's problem, not
      // a bug in a shipped file — so it must not escape as a stack trace.
      throw new ConfigError(`cannot write into ${path.dirname(dest)}\n  ${err.message}`);
    }
    verifyResolves(tmp, dest);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  return tmp;
}

/** Rename the staged file into place, always clearing the temp. */
function installStaged(tmp, dest) {
  try {
    // The caller already refused when `dest` existed. That check is a guard for
    // the user, not a lock: nothing here can stop another process from creating
    // the file in between, and a single-user CLI does not need it to.
    fs.renameSync(tmp, dest);
  } catch (err) {
    throw new ConfigError(`cannot install ${dest}\n  ${err.message}`);
  } finally {
    // A no-op once the rename has consumed the temp. Its own failure must never
    // replace the error above, which is the one worth reading.
    try {
      fs.rmSync(tmp, { force: true });
    } catch { /* the original outcome wins */ }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--target-project <name>] [--legacy-config <path>]... [--write]

  --target-project <name>  project the migrated target publishes to (required)
  --legacy-config <path>   an extra legacy solopreneur.json to read (repeatable)
  --write                  perform the migration (the default is a dry run)`;

// ponytail: hand-rolled rather than node:util parseArgs, for the same reason
// config-resolve.mjs gives — parseArgs only became stable in 20.16, and this
// file's declared floor is 20, where it warns onto the stderr reserved for errors.
function parseArgs(argv) {
  const options = { targetProject: undefined, legacyConfigs: [], write: false, help: false };
  const valueOf = (arg, name, i) => {
    if (arg.startsWith(`${name}=`)) return { value: arg.slice(name.length + 1), next: i };
    const value = argv[i + 1];
    if (value === undefined) throw new ConfigError(`${name} requires a value\n${USAGE}`);
    // Swallowing the next flag is not a typo the user can see: with a legacy
    // config that names no projects there is nothing to check the value
    // against, so `--target-project --write` would quietly propose a project
    // called "--write" and run as a dry run.
    if (value.startsWith('--')) {
      throw new ConfigError(
        `${name} requires a value, but the next argument is the flag ${value}\n`
        + `  if that really is the value, write it as ${name}=${value}\n${USAGE}`,
      );
    }
    return { value, next: i + 1 };
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--write') {
      options.write = true;
    } else if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '--target-project' || arg.startsWith('--target-project=')) {
      const { value, next } = valueOf(arg, '--target-project', i);
      options.targetProject = value;
      i = next;
    } else if (arg === '--legacy-config' || arg.startsWith('--legacy-config=')) {
      const { value, next } = valueOf(arg, '--legacy-config', i);
      options.legacyConfigs.push(value);
      i = next;
    } else {
      throw new ConfigError(`unknown argument: ${arg}\n${USAGE}`);
    }
  }
  return options;
}

/** Where the new file goes: the repo root, so a repo-relative `root` still resolves. */
function destinationFor(cwd) {
  const dest = path.join(git(['rev-parse', '--show-toplevel'], cwd) ?? cwd, V2_FILENAME);
  try {
    // lstat, not stat: a dangling symlink at the destination is still a file
    // sitting in the way, and the rename would silently replace it.
    fs.lstatSync(dest);
  } catch (err) {
    if (err.code === 'ENOENT') return dest;
    throw new ConfigError(`cannot inspect the destination: ${dest}\n  ${err.message}`);
  }
  throw new ConfigError(
    `refusing to migrate: ${dest} already exists\n`
    + '  this script only ever creates a new file; merging into an existing one is a hand edit',
  );
}

/**
 * Refuse when a v2 config already governs this scope from AT OR ABOVE the
 * destination — writing a new file at the repo root would override its authority.
 *
 * This walks up for `.solopreneur.json` files with `classifyNested` rather than
 * asking the resolver, which matters twice. The resolver's layer 3 is the
 * user-global `~/.config/solopreneur/config.json` — a LOWER layer a repo-local
 * file is meant to win over, so it must never block a migration; because it is
 * not named `.solopreneur.json`, this walk simply never sees it, and no special
 * exclusion is needed (even when the repo lives under `~/.config/solopreneur/`).
 * And a broken or malformed global config would make `resolveConfig` THROW
 * before any exclusion could apply, wrongly blocking a migration that would
 * override it anyway — this walk never reads it, so it cannot.
 */
function assertNotShadowing(dest) {
  // $SOLOPRENEUR_CONFIG is resolver layer 1 and wins from anywhere on disk, so
  // a file written while it is set would be inert — and this script would still
  // report success. Positional containment cannot catch that; the variable can
  // point outside the tree entirely.
  if (process.env.SOLOPRENEUR_CONFIG) {
    throw new ConfigError(
      'refusing to migrate: $SOLOPRENEUR_CONFIG is set, and it outranks every file on disk\n'
      + `  config: ${path.resolve(process.env.SOLOPRENEUR_CONFIG)}\n`
      + `  a new ${V2_FILENAME} at ${dest} would be ignored while it is set — unset it first`,
    );
  }
  // Walk strictly ABOVE the destination's own directory: the destination itself
  // is `destinationFor`'s job (it already refused if anything sits there). A
  // `.solopreneur.json` with a preview block, or one broken the way the resolver
  // treats as fatal, governs this area and must not be silently overridden.
  const repoRoot = path.dirname(dest);
  for (let dir = path.dirname(repoRoot); ; dir = path.dirname(dir)) {
    const shadow = classifyNested(path.join(dir, V2_FILENAME));
    if (shadow) {
      throw new ConfigError(
        `refusing to migrate: a ${V2_FILENAME} above the repo already governs this scope\n`
        + `  config: ${shadow.file} (${shadow.reason})\n`
        + `  a new ${V2_FILENAME} at ${dest} would override it — move or delete that one first`,
      );
    }
    if (path.dirname(dir) === dir) return; // reached the filesystem root
  }
}

/**
 * Require an explicit `--target-project`, listing what the legacy config offers.
 * Returns a warning when the chosen name is not one of them, or null.
 */
function requireTargetProject(chosen, candidates) {
  const listing = candidates.size === 0
    ? '  no project names found in the legacy config — name the project this scope should publish to'
    : `  candidates found in the legacy config:\n${
      [...candidates].map(([project, origins]) => `    ${show(project)}\n${origins.map((o) => `      from ${o}`).join('\n')}`).join('\n')}`;

  if (chosen === undefined) {
    throw new ConfigError(
      `--target-project is required\n${listing}\n`
      + '  the bucket names (default / keep / public) do not say which project to migrate to,\n'
      + '  so the choice is never inferred — pass one explicitly',
    );
  }
  if (chosen === '') throw new ConfigError(`--target-project cannot be empty\n${listing}`);
  // The candidate list is ADVISORY, never a whitelist. It is a union across
  // every repo the file mentions, so treating it as one both under- and
  // over-restricts: a project belonging to a completely unrelated repo would be
  // "valid", while a deliberately fresh project for THIS repo — the obvious
  // reason to migrate — would be refused. Naming a project nobody configured is
  // equally a typo and a legitimate intent, so it warns instead.
  if (candidates.size > 0 && !candidates.has(chosen)) {
    return `${show(chosen)} is not one of the projects the legacy config names`;
  }
  return null;
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const cwd = process.cwd();
  const dest = destinationFor(cwd);
  // Refuse if a v2 config already governs this scope from above the repo. This
  // walks `.solopreneur.json` files itself rather than calling the resolver, so
  // a lower-priority (or broken) user-global config never blocks a migration
  // that would override it anyway — see assertNotShadowing.
  assertNotShadowing(dest);

  const sources = gatherSources(options.legacyConfigs);
  if (sources.length === 0) {
    throw new ConfigError(
      'nothing to migrate: no legacy preview config found\n'
      + `  looked in ${defaultLegacyFiles().join(' and ')}\n`
      + '  name another file with --legacy-config <path>',
    );
  }

  const key = repoKey(cwd);
  const candidates = collectCandidates(sources);
  const unknownProject = requireTargetProject(options.targetProject, candidates);

  const pathLayer = readPath(sources, key);
  const legacyPath = pathLayer === null ? null : pathLayer.value;
  if (legacyPath !== null && typeof legacyPath !== 'string') {
    throw new ConfigError(
      `the legacy preview path for ${show(key)} is not a string\n  ${pathLayer.where} in ${pathLayer.file}`,
    );
  }
  const root = toRoot(legacyPath ?? DEFAULT_ROOT);
  // The repo root as the resolver would see it — physical. It always exists (a
  // git toplevel, or the cwd), and the resolver walks up from realpath'd content
  // so it compares against physical paths; a lexical compare here would disagree
  // with it exactly where a symlink is involved.
  const realDestDir = fs.realpathSync(path.dirname(dest));
  // `root` is declared relative to the config file's directory (the repo root),
  // matching how the resolver resolves it.
  const lexicalRoot = path.resolve(realDestDir, root);

  // Judge the root by where it PHYSICALLY lands, existing or not: an in-repo
  // symlink pointing outside, and a not-yet-created root under such a symlinked
  // ancestor, both have to be caught. The resolver realpaths content, so a
  // lexical-only check would pass here and still produce an undiscoverable config.
  const physicalRoot = physicalize(lexicalRoot);
  let rootExists = false;
  try {
    if (!fs.statSync(physicalRoot).isDirectory()) {
      throw new ConfigError(
        `the legacy preview root is not a directory, so the migrated config would not resolve\n`
        + `  root: ${physicalRoot}\n  it is a file; preview.root must be a directory`,
      );
    }
    rootExists = true;
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    // A missing root is fine — a fresh setup creates it later.
    if (err.code !== 'ENOENT') {
      throw new ConfigError(`cannot inspect the legacy preview root: ${physicalRoot}\n  ${err.message}`);
    }
  }

  // The config lands at the repo root, and the resolver finds it by walking up
  // from a content item inside `root`. That only works when `root` sits at or
  // below the repo root; an absolute root elsewhere, one escaping via `..`, or
  // one reached through a symlink that leaves the tree would leave a file no
  // walk-up ever reaches — a "wrote it" that resolves to nothing. This simple
  // migrator refuses those rather than guessing a second placement; a hand edit
  // can put the config at an ancestor of the root.
  if (!isUnder(physicalRoot, realDestDir)) {
    throw new ConfigError(
      `the legacy preview root is outside the repository, so a config at the repo root could never be found\n`
      + `  root: ${physicalRoot}\n  repo: ${realDestDir}\n`
      + `  ${legacyPath !== null ? `it comes from ${pathLayer.where} in ${pathLayer.file}` : ''}\n`
      + `  place a ${V2_FILENAME} at an ancestor of that root by hand instead`,
    );
  }

  // A `.solopreneur.json` already sitting BETWEEN the root and the repo root is
  // the one the resolver finds first when walking up from content — the
  // repo-root config we are about to write would be silently shadowed by it, or
  // by a broken one that stops resolution before it. Scanning that bounded span
  // directly (rather than asking the resolver, whose containment errors from
  // configs ABOVE the destination would have to be told apart from real nested
  // hits) keeps this honest: it never looks at or above the destination, so
  // configs there stay `assertNotShadowing`'s job. It runs whether or not the
  // root exists yet — a fresh root under an existing intermediate config is just
  // as shadowed.
  const shadow = nestedShadow(physicalRoot, realDestDir);
  if (shadow) {
    throw new ConfigError(
      `a ${V2_FILENAME} nearer the content than the repo root ${shadow.reason}\n  config: ${shadow.file}\n`
      + `  content under the preview root would resolve to it, not to a new ${V2_FILENAME} at the repo root\n`
      + `  migrate that scope where it lives, or remove it first`,
    );
  }

  const rootNote = legacyPath !== null
    ? `from ${pathLayer.where} in ${pathLayer.file}`
    : `defaulted to ${DEFAULT_ROOT} — ${pathLayer === null ? 'no legacy layer names a path' : `${pathLayer.where} in ${pathLayer.file} carries no path`}`;

  // deploy.sh compares this value against the string "false", so a JSON `false`
  // and a quoted "false" mean the same thing. Anything else — including a
  // missing key — protects, which is the safe direction.
  const protect = readAutoProtect(sources, key);
  const protectOff = protect !== null && String(protect.value) === 'false';

  const text = `${JSON.stringify(buildConfig(options.targetProject, root), null, 2)}\n`;

  const report = [
    'legacy config read:',
    ...sources.flatMap(({ file, values }) => [
      `  ${file}`,
      ...JSON.stringify(values, null, 2).split('\n').map((line) => `    ${line}`),
    ]),
    '',
    `repo key: ${show(key)}`,
    `preview.root: ${show(root)}  (${rootNote}${rootExists ? '' : '; this directory does not exist yet'})`,
    `autoProtect: ${protect ? `${JSON.stringify(protect.value)} (${protect.where} in ${protect.file})` : 'unset, defaults to true'}`
      + '  ->  visibility "private"',
    ...(protectOff ? [
      'WARNING: autoProtect was explicitly false, but the migrated target is still private.',
      '  Turning a target public is never a migration side effect — it has to be a deliberate',
      `  hand edit of ${dest}, and it still has to clear the publish-time content review.`,
    ] : []),
    '',
    'candidate target projects:',
    ...(candidates.size === 0
      ? ['  (none in the legacy config)']
      : [...candidates].flatMap(([project, origins]) => [
        `  ${show(project)}`,
        ...origins.map((origin) => `    from ${origin}`),
      ])),
    `  chosen: ${show(options.targetProject)}`,
    ...(unknownProject ? [`  NOTE: ${unknownProject} — check it is the project you meant`] : []),
    '',
    `destination: ${dest}`,
    '',
    renderDiff(dest, text),
    '',
  ];

  if (protectOff) {
    process.stderr.write(
      `${SELF}: warning — the legacy config sets autoProtect: false; the migrated target is still\n`
      + '  visibility "private". See the WARNING block in the report before changing that.\n',
    );
  }

  if (!options.write) {
    report.push('dry run — nothing written. Re-run with --write to migrate.');
    process.stdout.write(`${report.join('\n')}\n`);
    return 0;
  }

  // Stage and validate first, while nothing user-visible exists yet: a config
  // that cannot resolve must leave no backup, no temp and no destination file.
  // Only then take the backups, and only then let the new file appear — so the
  // spec's "back up before writing the new file" ordering still holds, and
  // rollback stays "delete it".
  const staged = stageConfig(dest, text);
  const stamp = stampNow();
  const copies = [];
  try {
    for (const { file } of sources) {
      copies.push(backup(file, stamp));
      report.push(`backed up ${file} -> ${copies[copies.length - 1]}`);
    }
    installStaged(staged, dest);
  } catch (err) {
    // Undo exactly what this run created — the staged temp and every backup
    // already taken — so a failure part-way through (a second source's backup,
    // or the rename itself) still leaves the filesystem as it was. Each backup
    // was created with COPYFILE_EXCL, so it is provably this run's to remove.
    fs.rmSync(staged, { force: true });
    for (const copy of copies) fs.rmSync(copy, { force: true });
    throw err;
  }
  report.push(`wrote ${dest}`, 'the legacy config was not modified.');
  process.stdout.write(`${report.join('\n')}\n`);
  return 0;
}

// Kept in step with config-resolve.mjs next door: comparing physical paths
// because this file is reachable through symlinked plugin trees, where argv[1]
// is the link and import.meta.url is already resolved, plus the lexical compare
// for `--preserve-symlinks-main`. It also keeps the module importable — from a
// test, or from a later script — without running the CLI as a side effect.
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
    // Rethrowing a non-ConfigError is deliberate: a bug in a shipped file must
    // not be reported to the user as "fix your config".
    if (!(err instanceof ConfigError)) throw err;
    process.stderr.write(`${SELF}: ${err.message}\n`);
    process.exitCode = 1;
  }
}
