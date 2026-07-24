#!/usr/bin/env node
/**
 * Resolve which solopreneur config applies to a filesystem path, and report the
 * decision in one structured shape so every agent sees the same answer.
 *
 * Requires Node.js >= 20.
 *
 * Usage:
 *   config-resolve.mjs [--from <path>] [--json]
 *
 * Output: the resolved decision on stdout; all errors on stderr, exit 1.
 *   `--json` is the machine-readable contract. The default `key=value` listing
 *   is for humans reading a terminal — arrays are comma-joined and it is not
 *   losslessly parseable, so scripts must use `--json`.
 *
 * Resolution order, first hit wins:
 *   1. $SOLOPRENEUR_CONFIG                          -> mode "v2"
 *   2. nearest ancestor .solopreneur.json that
 *      contains a `preview` block                   -> mode "v2"
 *   3. ~/.config/solopreneur/config.json            -> mode "v2"
 *   4. legacy ${CLAUDE_CONFIG_DIR}/solopreneur.json -> mode "legacy"
 *   5. legacy ~/.claude/solopreneur.json            -> mode "legacy"
 *   nothing found                                   -> mode "none"
 *
 * The anchor is `--from` when given, else the current working directory. It is
 * resolved to its physical path before the walk-up: this workspace is a large
 * symlink tree, and a logical path must never resolve to a different config
 * than its physical path. A file anchor walks from its directory.
 *
 * The walk-up does not stop at a git toplevel. Crossing nested repo boundaries
 * is deliberate — a repo without its own config inherits the enclosing one. The
 * stop point is the filesystem root.
 *
 * Nothing here touches the network, and nothing here writes. Legacy files are
 * read-only reported, never synthesized into a v2 config and never rewritten:
 * `deploy.sh` keeps reading them itself, unchanged.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = 'config-resolve.mjs';
const V2_FILENAME = '.solopreneur.json';
const LEGACY_FILENAME = 'solopreneur.json';
const SCHEMA_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', 'shared', 'config.schema.json',
);

/**
 * A problem with the USER's config. Thrown for every user-facing failure; the
 * CLI prints `.message` and exits 1. A broken install — a missing or
 * unsupported `config.schema.json` — deliberately throws a plain Error instead,
 * so a caller catching ConfigError to say "fix your config" cannot swallow a
 * bug in a shipped file and blame a file that is fine.
 */
export class ConfigError extends Error {}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Schema validation
//
// ponytail: a small interpreter over config.schema.json, not a JSON Schema
// engine. The repo has no package.json and allows no dependencies, and reading
// the schema file keeps it the single source of truth instead of restating
// every rule twice. If the schema ever needs more than the keywords below, drop
// in ajv rather than growing this.
// ---------------------------------------------------------------------------

/** Keywords the interpreter implements, plus non-validating annotations. */
const KNOWN_KEYWORDS = new Set([
  '$ref', 'type', 'const', 'enum', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'minLength',
  '$schema', '$defs', 'title', 'description',
]);

/** `type` values the interpreter implements. */
const KNOWN_TYPES = new Set(['object', 'array', 'string']);

const schemaBug = (detail) => new Error(
  `${SELF}: ${detail}\n  in ${SCHEMA_PATH}\n`
  + '  this resolver ships a deliberately small schema interpreter — teach it the keyword, or move to a full validator',
);

/**
 * Audit the whole schema once, at load time, and refuse to run on anything the
 * interpreter cannot honor.
 *
 * This has to be a whole-schema sweep rather than a check inside `validate`:
 * a per-node check only ever sees the subschemas a particular config reaches,
 * so an unsupported keyword on an optional field would sit unnoticed until some
 * config happened to set that field. Names AND `type` values are both checked —
 * `type` is a known keyword, so a name-only check would let `"type": "integer"`
 * through to a branch that does not exist and silently validate nothing.
 */
function auditSchema(node, defs, where) {
  if (typeof node === 'boolean') return;
  if (!isObject(node)) throw schemaBug(`${where} is not a schema`);

  for (const keyword of Object.keys(node)) {
    if (!KNOWN_KEYWORDS.has(keyword)) throw schemaBug(`unsupported keyword "${keyword}" at ${where}`);
  }
  if ('type' in node && !KNOWN_TYPES.has(node.type)) {
    throw schemaBug(`unsupported "type" value ${JSON.stringify(node.type)} at ${where}`);
  }
  if ('$ref' in node) {
    const key = typeof node.$ref === 'string' && node.$ref.startsWith('#/$defs/')
      ? node.$ref.slice('#/$defs/'.length) : null;
    if (key === null || !defs[key]) throw schemaBug(`unsupported $ref ${JSON.stringify(node.$ref)} at ${where}`);
    // Draft 2020-12 applies keywords alongside $ref; this interpreter resolves
    // the reference and returns, so a sibling would be silently dropped.
    const siblings = Object.keys(node).filter((k) => !['$ref', 'title', 'description'].includes(k));
    if (siblings.length) throw schemaBug(`$ref with sibling keyword "${siblings[0]}" at ${where}`);
  }
  // Keyword values must have the shape the interpreter tests for; otherwise its
  // `typeof`/`Array.isArray` guards would quietly skip the check.
  for (const [keyword, ok] of [
    ['required', Array.isArray(node.required)],
    ['enum', Array.isArray(node.enum)],
    ['properties', isObject(node.properties)],
    ['minLength', typeof node.minLength === 'number'],
    ['minItems', typeof node.minItems === 'number'],
  ]) {
    if (keyword in node && !ok) throw schemaBug(`malformed "${keyword}" at ${where}`);
  }

  for (const [key, sub] of Object.entries(node.properties ?? {})) auditSchema(sub, defs, `${where}.${key}`);
  if ('items' in node) auditSchema(node.items, defs, `${where}[]`);
  if ('additionalProperties' in node) auditSchema(node.additionalProperties, defs, `${where}.*`);
}

let schemaCache;
function loadSchema() {
  if (schemaCache) return schemaCache;
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    // Fatal, never "carry on unvalidated" — a missing or broken schema means
    // nothing downstream can trust what this script prints.
    throw new Error(`${SELF}: cannot load schema: ${SCHEMA_PATH}\n  ${err.message}`);
  }
  const defs = schema.$defs ?? {};
  for (const [key, sub] of Object.entries(defs)) auditSchema(sub, defs, `$defs.${key}`);
  auditSchema(schema, defs, '(root)');
  schemaCache = schema;
  return schemaCache;
}

function validate(value, schema, defs, where, errors) {
  if (schema === true) return;
  if (schema === false) {
    errors.push(`${where}: not allowed here`);
    return;
  }
  if (typeof schema.$ref === 'string') {
    validate(value, defs[schema.$ref.slice('#/$defs/'.length)], defs, where, errors);
    return;
  }
  if (schema.type === 'object' && !isObject(value)) {
    errors.push(`${where}: expected an object`);
    return;
  }
  if (schema.type === 'array' && !Array.isArray(value)) {
    errors.push(`${where}: expected an array`);
    return;
  }
  if (schema.type === 'string' && typeof value !== 'string') {
    errors.push(`${where}: expected a string`);
    return;
  }
  if ('const' in schema && value !== schema.const) {
    errors.push(`${where}: expected ${JSON.stringify(schema.const)}`);
    return;
  }
  if ('enum' in schema && !schema.enum.includes(value)) {
    errors.push(`${where}: expected one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
    return;
  }
  if ('minLength' in schema && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${where}: needs at least ${schema.minLength} character(s)`);
  }
  if ('minItems' in schema && Array.isArray(value) && value.length < schema.minItems) {
    errors.push(`${where}: needs at least ${schema.minItems} item(s)`);
  }
  if ('required' in schema && isObject(value)) {
    for (const key of schema.required) {
      if (!(key in value)) errors.push(`${where === '' ? key : `${where}.${key}`}: required but missing`);
    }
  }
  if ('properties' in schema && isObject(value)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in value) validate(value[key], sub, defs, where === '' ? key : `${where}.${key}`, errors);
    }
  }
  // Covers the map-shaped objects (`targets`), where every entry shares one
  // schema and none are named in `properties`.
  if ('additionalProperties' in schema && isObject(value)) {
    const named = Object.keys(schema.properties ?? {});
    for (const [key, sub] of Object.entries(value)) {
      if (named.includes(key)) continue;
      validate(sub, schema.additionalProperties, defs, where === '' ? key : `${where}.${key}`, errors);
    }
  }
  if ('items' in schema && Array.isArray(value)) {
    value.forEach((item, i) => validate(item, schema.items, defs, `${where}[${i}]`, errors));
  }
}

/** Validate a parsed v2 config, throwing a ConfigError naming the file. */
function validateV2(config, file) {
  const schema = loadSchema();
  const errors = [];
  validate(config, schema, schema.$defs ?? {}, '', errors);
  if (errors.length) throw new ConfigError(`invalid config: ${file}\n  ${errors.join('\n  ')}`);
}

/**
 * Parse a JSON config, or return `undefined` when there is no such file.
 * `undefined` is the absent sentinel precisely because JSON can never produce
 * it — a file whose whole content is `null` is present, and must be rejected
 * rather than mistaken for a missing file.
 *
 * Only a missing path counts as absent. A file that exists but cannot be read,
 * is not a regular file (a FIFO or a symlink to a device would otherwise block
 * the process forever), or holds malformed JSON is fatal. Skipping any of those
 * and continuing up the tree would resolve against the wrong config, which is
 * exactly what this resolver exists to prevent — so `stat` is used to classify
 * the file, never to decide it is readable (`stat` succeeds on files the
 * process cannot open; the read below is what proves that).
 */
function readJsonIfPresent(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return undefined;
    throw new ConfigError(`cannot read config: ${file}\n  ${err.message}`);
  }
  if (!stat.isFile()) throw new ConfigError(`config is not a regular file: ${file}`);

  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw new ConfigError(`cannot read config: ${file}\n  ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`malformed JSON in config: ${file}\n  ${err.message}`);
  }
}

/**
 * A `.solopreneur.json` that parsed to something other than an object cannot be
 * "a config for another feature" — it is broken, and must not be stepped over.
 */
function assertConfigObject(config, file) {
  if (!isObject(config)) {
    throw new ConfigError(`invalid config: ${file}\n  top level: expected an object`);
  }
}

/**
 * Physical directory to walk up from. A file anchor resolves to its containing
 * directory (matching git, editorconfig and eslint); a missing anchor is an
 * error rather than a silent walk from its parent, since the anchor is by
 * contract a content source path (or the cwd) and a typo is worth reporting.
 */
function realAnchor(input, label) {
  const abs = path.resolve(input);
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch (err) {
    const why = err.code === 'ENOENT' ? 'does not exist' : 'is not readable';
    throw new ConfigError(`${label} ${why}: ${abs}\n  ${err.message}`);
  }
  return fs.statSync(real).isDirectory() ? real : path.dirname(real);
}

/**
 * Nearest ancestor `.solopreneur.json` carrying a `preview` block. A file
 * without one is skipped — it may configure something else — but a file that
 * cannot be parsed, or is not an object, still stops the walk.
 */
function findAncestorConfig(anchorDir) {
  for (let dir = anchorDir; ; dir = path.dirname(dir)) {
    const file = path.join(dir, V2_FILENAME);
    const config = readJsonIfPresent(file);
    if (config !== undefined) {
      assertConfigObject(config, file);
      if ('preview' in config) return { file, config };
    }
    if (path.dirname(dir) === dir) return null;
  }
}

/**
 * Turn a validated v2 config into the resolved decision.
 *
 * `root` resolves against the directory of the file that declared it, and is
 * then made physical so it can be compared against the physical anchor. A root
 * that does not exist yet (a fresh setup) keeps its lexical absolute path; that
 * stays safe for the containment check, because an anchor is always realpath'd
 * and therefore always exists, so it cannot live under a root that does not.
 */
function resolveV2(file, config) {
  const preview = config.preview;
  const lexicalRoot = path.resolve(path.dirname(file), preview.root);
  let root = lexicalRoot;
  try {
    root = fs.realpathSync(lexicalRoot);
    if (!fs.statSync(root).isDirectory()) {
      throw new ConfigError(`invalid config: ${file}\n  preview.root: not a directory: ${root}`);
    }
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    if (err.code !== 'ENOENT') {
      throw new ConfigError(`invalid config: ${file}\n  preview.root: ${lexicalRoot}\n  ${err.message}`);
    }
  }

  const targetNames = Object.keys(preview.targets);
  if (targetNames.length !== 1) {
    throw new ConfigError(
      `invalid config: ${file}\n  preview.targets: v1 supports exactly one target, found ${targetNames.length}`
      + (targetNames.length ? ` (${targetNames.join(', ')})` : ''),
    );
  }
  const name = targetNames[0];
  if (preview.defaultTarget !== name) {
    throw new ConfigError(
      `invalid config: ${file}\n  preview.defaultTarget: "${preview.defaultTarget}" is not a declared target (have: ${name})`,
    );
  }
  const target = preview.targets[name];
  if (target.provider !== 'vercel') {
    throw new ConfigError(
      `invalid config: ${file}\n  preview.targets.${name}.provider: v1 supports only "vercel", found ${JSON.stringify(target.provider)}`,
    );
  }
  // `include` names collection keys, so an entry with no declared collection
  // would hand the builder a key that resolves to nothing.
  const unknown = target.include.filter((key) => !(key in preview.collections));
  if (unknown.length) {
    throw new ConfigError(
      `invalid config: ${file}\n  preview.targets.${name}.include: no such collection: ${unknown.join(', ')}`
      + ` (declared: ${Object.keys(preview.collections).join(', ')})`,
    );
  }

  return {
    configPath: file,
    mode: 'v2',
    root,
    defaultTarget: name,
    target: {
      name,
      provider: target.provider,
      project: target.project,
      // Fail closed: an omitted visibility is private. (A misspelled one is a
      // hard enum failure in the schema and never reaches here.)
      visibility: target.visibility ?? 'private',
      include: target.include,
    },
    collections: preview.collections,
    legacy: null,
  };
}

/**
 * True when `child` is `parent` or sits underneath it. Both must be physical.
 * `path.relative` rather than a prefix compare: a prefix test needs a trailing
 * separator to keep `/a/previews-old` out of `/a/previews`, and that trailing
 * separator then breaks a `parent` of `/`.
 */
function isUnder(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Legacy files are described, never converted. Reporting the raw subtrees keeps
// this honest: the migrator is the only thing allowed to interpret them, and it
// is a separate script that asks the user before writing anything.
//
// NOTE: this is another copy of the legacy `solopreneur.json` layout knowledge
// (also in shared/config.md and deploy.sh). It is registered in config.md's
// legacy-consumer list because neither of that file's greps can find it — the
// markers they look for are bash.
function legacyPreviewValues(config) {
  const found = {};
  if (isObject(config?.default?.preview)) found.default = config.default.preview;
  // The older flat shape, e.g. { "preview": { "paths": { "<repo-key>": "..." } } }
  if (isObject(config?.preview)) found.preview = config.preview;
  const repos = {};
  for (const [key, entry] of Object.entries(isObject(config?.repos) ? config.repos : {})) {
    if (isObject(entry?.preview)) repos[key] = entry.preview;
  }
  if (Object.keys(repos).length) found.repos = repos;
  return found;
}

const emptyResult = (mode, configPath = null, legacy = null) => ({
  configPath,
  mode,
  root: null,
  defaultTarget: null,
  target: null,
  collections: null,
  legacy,
});

/**
 * @returns {{configPath: string|null, mode: 'v2'|'legacy'|'none', root: string|null,
 *            defaultTarget: string|null, target: object|null, collections: object|null,
 *            legacy: Array<{file: string, values: object}>|null}}
 */
export function resolveConfig({ from } = {}) {
  const anchor = realAnchor(from ?? process.cwd(), from === undefined ? 'working directory' : '--from path');

  // An explicit `--from` must sit under the resolved root. Not applied to the
  // cwd anchor: the cwd is only a fallback for "no source path yet", and
  // enforcing it there would make inspection fail from anywhere outside the
  // preview root.
  const decide = (result) => {
    if (from !== undefined && !isUnder(anchor, result.root)) {
      throw new ConfigError(
        '--from is outside the configured preview root\n'
        + `  --from: ${anchor}\n`
        + `  root:   ${result.root}\n`
        + `  config: ${result.configPath}`,
      );
    }
    return result;
  };

  // Layer 1: an explicitly named config. Never falls through — if the caller
  // pointed at a file, a problem with that file is the answer.
  const explicit = process.env.SOLOPRENEUR_CONFIG;
  if (explicit) {
    const abs = path.resolve(explicit);
    const config = readJsonIfPresent(abs);
    if (config === undefined) throw new ConfigError(`$SOLOPRENEUR_CONFIG does not exist: ${abs}`);
    // realpath so configPath is physical here too, matching the walk-up layers.
    const file = fs.realpathSync(abs);
    assertConfigObject(config, file);
    validateV2(config, file);
    return decide(resolveV2(file, config));
  }

  // Layer 2: nearest ancestor with a preview block.
  const ancestor = findAncestorConfig(anchor);
  if (ancestor) {
    validateV2(ancestor.config, ancestor.file);
    return decide(resolveV2(ancestor.file, ancestor.config));
  }

  // Layer 3: the user-global v2 config.
  const globalFile = path.join(os.homedir(), '.config', 'solopreneur', 'config.json');
  const globalConfig = readJsonIfPresent(globalFile);
  if (globalConfig !== undefined) {
    assertConfigObject(globalConfig, globalFile);
    if ('preview' in globalConfig) {
      validateV2(globalConfig, globalFile);
      return decide(resolveV2(globalFile, globalConfig));
    }
  }

  // Layers 4-5: the legacy feature config, reported as-is. BOTH files are
  // reported, not just the first: deploy.sh cascades across them per key, so a
  // single-file report would hide values that are actually in effect and the
  // migrator would silently drop them.
  const candidates = [];
  if (process.env.CLAUDE_CONFIG_DIR) candidates.push(path.join(process.env.CLAUDE_CONFIG_DIR, LEGACY_FILENAME));
  candidates.push(path.join(os.homedir(), '.claude', LEGACY_FILENAME));
  const legacy = [];
  const seen = new Set();
  for (const file of candidates) {
    if (seen.has(file)) continue;
    seen.add(file);
    const config = readJsonIfPresent(file);
    if (config === undefined) continue;
    const values = legacyPreviewValues(config);
    // A legacy file that says nothing about preview is not a preview config;
    // keep looking rather than reporting a decision it did not make.
    if (Object.keys(values).length === 0) continue;
    legacy.push({ file, values });
  }
  if (legacy.length) return emptyResult('legacy', legacy[0].file, legacy);

  return emptyResult('none');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--from <path>] [--json]

  --from <path>  anchor the lookup at <path> instead of the current directory
  --json         print the resolved decision as JSON instead of key=value lines`;

/**
 * Flatten the result to `key=value` lines. Newlines inside values are escaped:
 * a config string containing one would otherwise print as extra lines that look
 * exactly like real facts.
 */
function toLines(value, prefix = '') {
  if (value === null || value === undefined) return [`${prefix}=`];
  if (Array.isArray(value)) {
    return value.every((v) => !isObject(v) && !Array.isArray(v))
      ? [`${prefix}=${value.join(',')}`]
      : value.flatMap((v, i) => toLines(v, `${prefix}[${i}]`));
  }
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, sub]) => toLines(sub, prefix ? `${prefix}.${key}` : key));
  }
  return [`${prefix}=${String(value).replace(/\n/g, '\\n')}`];
}

// ponytail: hand-rolled rather than node:util parseArgs — parseArgs only became
// stable in 20.16, and this file's declared floor is 20, where it would print an
// ExperimentalWarning onto the stderr this CLI reserves for errors.
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
      if (from === undefined) throw new ConfigError(`--from requires a path\n${USAGE}`);
      i += 1;
    } else if (arg === '-h' || arg === '--help') {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    } else {
      throw new ConfigError(`unknown argument: ${arg}\n${USAGE}`);
    }
  }

  const result = resolveConfig({ from });
  process.stdout.write(asJson ? `${JSON.stringify(result, null, 2)}\n` : `${toLines(result).join('\n')}\n`);
  return 0;
}

// Compare physical paths: this file is reachable through symlinked plugin
// trees, where argv[1] is the link and import.meta.url is already resolved. The
// lexical comparison is kept as well, for `--preserve-symlinks-main`, where
// import.meta.url stays logical and the realpath would never match.
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
    if (!(err instanceof ConfigError)) throw err;
    process.stderr.write(`${SELF}: ${err.message}\n`);
    process.exitCode = 1;
  }
}
