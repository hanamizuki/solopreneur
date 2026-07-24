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
function legacyPreviewValues(config) {
  const found = {};
  if (isObject(at(config, 'default', 'preview'))) found.default = config.default.preview;
  // The older flat shape, e.g. { "preview": { "paths": { "<repo-key>": "..." } } }
  if (isObject(at(config, 'preview'))) found.preview = config.preview;
  const repos = {};
  for (const [key, entry] of Object.entries(isObject(config?.repos) ? config.repos : {})) {
    if (isObject(at(entry, 'preview'))) repos[key] = entry.preview;
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
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' && !required) return undefined;
    const what = required ? '--legacy-config' : 'legacy config';
    throw new ConfigError(`cannot read ${what}: ${file}\n  ${err.message}`);
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`malformed JSON in legacy config: ${file}\n  ${err.message}`);
  }
  if (!isObject(config)) throw new ConfigError(`legacy config is not a JSON object: ${file}`);
  return { file, values: legacyPreviewValues(config) };
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
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readLegacy(file, { required });
    if (source && Object.keys(source.values).length > 0) sources.push(source);
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
 * `projects.<bucket>` and `autoProtect`, the way `deploy.sh:read_preview_config`
 * reads them: file-major, trying `repos[<key>]` then `default` inside each file
 * before moving to the next. `!= null` semantics mirror its `| values`, so a
 * legacy `autoProtect: false` counts as an answer instead of falling through as
 * if it were unset. There is no flat top-level layer for these two keys.
 */
function readPerKey(sources, key, leaf) {
  for (const { file, values } of sources) {
    for (const [where, subtree] of [
      [`repos[${key}].preview`, at(values, 'repos', key)],
      ['default.preview', at(values, 'default')],
    ]) {
      const value = at(subtree, ...leaf);
      if (value !== undefined && value !== null) return { value, file, where };
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
      { file, where: `repos[${key}].preview`, subtree: at(values, 'repos', key) },
      { file, where: 'default.preview', subtree: at(values, 'default') },
    ]),
    // Layer 5: the flat top-level `preview` subtree, primary then fallback.
    ...sources.map(({ file, values }) => ({ file, where: 'preview', subtree: at(values, 'preview') })),
  ];
  for (const layer of layers) {
    if (!isObject(layer.subtree)) continue;
    const value = at(layer.subtree, 'path') ?? at(layer.subtree, 'paths', key);
    return { file: layer.file, where: layer.where, value: value ?? null };
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
  for (const { file, values } of sources) {
    const globalProjects = at(values, 'default', 'projects');
    for (const [bucket, project] of Object.entries(isObject(globalProjects) ? globalProjects : {})) {
      add(project, `default.preview.projects.${bucket}`, file);
    }
    for (const [key, preview] of Object.entries(isObject(values.repos) ? values.repos : {})) {
      const repoProjects = at(preview, 'projects');
      for (const [bucket, project] of Object.entries(isObject(repoProjects) ? repoProjects : {})) {
        add(project, `repos[${key}].preview.projects.${bucket}`, file);
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
  return normalized === '.' || normalized.startsWith('..') ? normalized : `./${normalized}`;
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

/** `20260724T144700Z` — sortable, filename-safe, unambiguous about the zone. */
const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

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
function verifyResolves(file) {
  const previous = process.env.SOLOPRENEUR_CONFIG;
  process.env.SOLOPRENEUR_CONFIG = file;
  try {
    resolveConfig({});
  } finally {
    if (previous === undefined) delete process.env.SOLOPRENEUR_CONFIG;
    else process.env.SOLOPRENEUR_CONFIG = previous;
  }
}

/**
 * Write via a temp file in the SAME directory, then rename.
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
function writeAtomic(dest, text) {
  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tmp, text);
    verifyResolves(tmp);
    // The caller already refused when `dest` existed. That check is a guard for
    // the user, not a lock: nothing here can stop another process from creating
    // the file in between, and a single-user CLI does not need it to.
    fs.renameSync(tmp, dest);
  } finally {
    // Covers every failure — a rejected config, ENOSPC mid-write, EACCES on the
    // rename — and is a no-op once the rename has consumed the temp.
    fs.rmSync(tmp, { force: true });
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
 * Refuse when the new file would shadow a v2 config that already covers this
 * scope. Only a config at or above the destination can be shadowed — a
 * user-global `~/.config/solopreneur/config.json` is a lower layer that a
 * repo-local file is *supposed* to win over, so it must not block a migration.
 */
function assertNotShadowing(resolved, dest) {
  if (resolved.mode !== 'v2' || !isUnder(path.dirname(dest), path.dirname(resolved.configPath))) return;
  throw new ConfigError(
    `refusing to migrate: a v2 config already covers this scope\n  config: ${resolved.configPath}\n`
    + `  a new ${V2_FILENAME} at ${dest} would shadow it — move or delete that one first`,
  );
}

/** The `--target-project` refusal, listing what the legacy config actually offers. */
function requireTargetProject(chosen, candidates) {
  const listing = candidates.size === 0
    ? '  no project names found in the legacy config — name the project this scope should publish to'
    : `  candidates found in the legacy config:\n${
      [...candidates].map(([project, origins]) => `    ${project}\n${origins.map((o) => `      from ${o}`).join('\n')}`).join('\n')}`;

  if (chosen === undefined) {
    throw new ConfigError(
      `--target-project is required\n${listing}\n`
      + '  the bucket names (default / keep / public) do not say which project to migrate to,\n'
      + '  so the choice is never inferred — pass one explicitly',
    );
  }
  if (chosen === '') throw new ConfigError(`--target-project cannot be empty\n${listing}`);
  // Only checked when the legacy config offered something to check against: a
  // config carrying only `preview.paths` has no project names at all, and that
  // is exactly the shape most in need of migrating.
  if (candidates.size > 0 && !candidates.has(chosen)) {
    throw new ConfigError(
      `--target-project "${chosen}" is not one of the projects in the legacy config\n${listing}`,
    );
  }
}

function main(argv) {
  const options = parseArgs(argv);
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const cwd = process.cwd();
  const dest = destinationFor(cwd);
  // One resolver call, for the one question this script cannot answer itself:
  // is a v2 config already in force here? Reading the legacy files is the
  // migrator's own job — the resolver reports them only when nothing else won.
  assertNotShadowing(resolveConfig({}), dest);

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
  requireTargetProject(options.targetProject, candidates);

  const pathLayer = readPath(sources, key);
  const legacyPath = pathLayer === null ? null : pathLayer.value;
  if (legacyPath !== null && (typeof legacyPath !== 'string' || legacyPath === '')) {
    throw new ConfigError(
      `the legacy preview path for ${key} is not a non-empty string\n  ${pathLayer.where} in ${pathLayer.file}`,
    );
  }
  const root = toRoot(legacyPath ?? DEFAULT_ROOT);
  const rootExists = fs.existsSync(path.resolve(path.dirname(dest), root));
  const rootNote = legacyPath !== null
    ? `from ${pathLayer.where} in ${pathLayer.file}`
    : `defaulted to ${DEFAULT_ROOT} — ${pathLayer === null ? 'no legacy layer names a path' : `${pathLayer.where} in ${pathLayer.file} carries no path`}`;

  // deploy.sh compares this value against the string "false", so a JSON `false`
  // and a quoted "false" mean the same thing. Anything else — including a
  // missing key — protects, which is the safe direction.
  const protect = readPerKey(sources, key, ['autoProtect']);
  const protectOff = protect !== null && String(protect.value) === 'false';

  const text = `${JSON.stringify(buildConfig(options.targetProject, root), null, 2)}\n`;

  const report = [
    'legacy config read:',
    ...sources.flatMap(({ file, values }) => [
      `  ${file}`,
      ...JSON.stringify(values, null, 2).split('\n').map((line) => `    ${line}`),
    ]),
    '',
    `repo key: ${key}`,
    `preview.root: ${root}  (${rootNote}${rootExists ? '' : '; this directory does not exist yet'})`,
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
        `  ${project}`,
        ...origins.map((origin) => `    from ${origin}`),
      ])),
    `  chosen: ${options.targetProject}`,
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

  // Backups first: after this point the new file appears, and rollback is
  // "delete it". The legacy files themselves are never touched either way.
  const stamp = stampNow();
  for (const { file } of sources) report.push(`backed up ${file} -> ${backup(file, stamp)}`);
  writeAtomic(dest, text);
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
