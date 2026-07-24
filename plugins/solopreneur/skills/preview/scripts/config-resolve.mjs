#!/usr/bin/env node
/**
 * Resolve which solopreneur config applies to a filesystem path, and report the
 * decision in one structured shape so every agent sees the same answer.
 *
 * Requires Node.js >= 20 (stable `node:test` for the accompanying tests; every
 * runtime API used here has been available far longer). The floor reflects the
 * APIs in use, not a tested matrix — development and verification happened on
 * Node 26. Staying at that floor rules out `import.meta.main`, `t.assert.*`,
 * `test.snapshot` and `fs.glob`, all of which arrived in 22 or later.
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
 *   1. $SOLOPRENEUR_CONFIG                        -> mode "v2"
 *   2. nearest ancestor .solopreneur.json that
 *      contains a `preview` block                 -> mode "v2"
 *   3. ~/.config/solopreneur/config.json          -> mode "v2"
 *   4. legacy ${CLAUDE_CONFIG_DIR}/solopreneur.json -> mode "legacy"
 *   5. legacy ~/.claude/solopreneur.json            -> mode "legacy"
 *   nothing found                                   -> mode "none"
 *
 * The anchor is `--from` when given, else the current working directory. It is
 * resolved to its physical path before the walk-up: this workspace is a large
 * symlink tree, and a logical path must never resolve to a different config
 * than its physical path.
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

/** Thrown for every user-facing failure; the CLI prints `.message` and exits 1. */
export class ConfigError extends Error {}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------
// Schema validation
//
// ponytail: a small interpreter over config.schema.json, not a JSON Schema
// engine. The repo has no package.json and allows no dependencies, and reading
// the schema file keeps it the single source of truth instead of restating
// every rule twice. It implements only the keywords the schema uses. If the
// schema ever needs more, drop in ajv rather than growing this.
// ---------------------------------------------------------------------------

/**
 * Keywords this interpreter understands, plus the annotations that carry no
 * validation behavior. An unknown keyword is a hard error rather than a silent
 * no-op: adding `oneOf` or `patternProperties` to the schema one day must fail
 * loudly on the next run instead of quietly validating less than it claims to.
 */
const KNOWN_KEYWORDS = new Set([
  '$ref', 'type', 'const', 'enum', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'minLength',
  '$schema', '$defs', 'title', 'description',
]);

function schemaBug(detail) {
  return new ConfigError(
    `${detail}\n  in ${SCHEMA_PATH}\n`
    + '  this resolver ships a deliberately small schema interpreter — teach it the keyword, or move to a full validator',
  );
}

function validate(value, schema, defs, where, errors) {
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    errors.push(`${where}: not allowed here`);
    return;
  }
  for (const keyword of Object.keys(schema)) {
    if (!KNOWN_KEYWORDS.has(keyword)) throw schemaBug(`unsupported schema keyword "${keyword}"`);
  }
  if (typeof schema.$ref === 'string') {
    // Local $defs references only — an unresolvable $ref would otherwise
    // validate nothing at all, the exact silent weakening guarded against above.
    const key = schema.$ref.startsWith('#/$defs/') ? schema.$ref.slice('#/$defs/'.length) : null;
    if (key === null || !defs[key]) throw schemaBug(`unsupported schema $ref "${schema.$ref}"`);
    validate(value, defs[key], defs, where, errors);
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
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${where}: expected one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`);
    return;
  }
  if (typeof schema.minLength === 'number' && typeof value === 'string' && value.length < schema.minLength) {
    errors.push(`${where}: must not be empty`);
  }
  if (typeof schema.minItems === 'number' && Array.isArray(value) && value.length < schema.minItems) {
    errors.push(`${where}: needs at least ${schema.minItems} entr${schema.minItems === 1 ? 'y' : 'ies'}`);
  }
  if (Array.isArray(schema.required) && isObject(value)) {
    for (const key of schema.required) {
      if (!(key in value)) errors.push(`${where === '' ? key : `${where}.${key}`}: required but missing`);
    }
  }
  if (isObject(schema.properties) && isObject(value)) {
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in value) validate(value[key], sub, defs, where === '' ? key : `${where}.${key}`, errors);
    }
  }
  // `additionalProperties` here covers the map-shaped objects (`targets`),
  // where every entry shares one schema and none are named in `properties`.
  if (schema.additionalProperties !== undefined && isObject(value)) {
    const named = isObject(schema.properties) ? Object.keys(schema.properties) : [];
    for (const [key, sub] of Object.entries(value)) {
      if (named.includes(key)) continue;
      validate(sub, schema.additionalProperties, defs, where === '' ? key : `${where}.${key}`, errors);
    }
  }
  if (schema.items !== undefined && Array.isArray(value)) {
    value.forEach((item, i) => validate(item, schema.items, defs, `${where}[${i}]`, errors));
  }
}

let schemaCache;
function loadSchema() {
  if (schemaCache) return schemaCache;
  try {
    schemaCache = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    // Fatal, never "carry on unvalidated" — a missing or broken schema means
    // nothing downstream can trust what this script prints.
    throw new ConfigError(`cannot load schema: ${SCHEMA_PATH}\n  ${err.message}`);
  }
  return schemaCache;
}

/** Validate a parsed v2 config, throwing a ConfigError naming the file. */
function validateV2(config, file) {
  const schema = loadSchema();
  const errors = [];
  validate(config, schema, schema.$defs ?? {}, '', errors);
  if (errors.length) {
    throw new ConfigError(`invalid config: ${file}\n  ${errors.join('\n  ')}`);
  }
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

/**
 * Parse a JSON config, or return null when there is no such file.
 *
 * Only ENOENT counts as absent. A file that exists but cannot be read — bad
 * permissions, a directory sitting in its place — is fatal, and so is malformed
 * JSON. Skipping either and continuing up the tree would resolve against the
 * wrong config, which is exactly what this resolver exists to prevent. (Testing
 * readability with `statSync` first would reintroduce that hole: `stat` succeeds
 * on a file the process cannot open.)
 */
function readJsonIfPresent(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new ConfigError(`cannot read config: ${file}\n  ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`malformed JSON in config: ${file}\n  ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// v2 resolution
// ---------------------------------------------------------------------------

/**
 * Physical path of `input`. A missing anchor is an error rather than a silent
 * walk from its parent: the anchor is by contract a content source path (or the
 * cwd), so a path that is not there is a typo worth reporting.
 */
function realAnchor(input, label) {
  const abs = path.resolve(input);
  try {
    return fs.realpathSync(abs);
  } catch (err) {
    throw new ConfigError(`${label} does not exist: ${abs}\n  ${err.message}`);
  }
}

/** Every directory from `dir` up to the filesystem root, inclusive. */
function* ancestors(dir) {
  let current = dir;
  for (;;) {
    yield current;
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/**
 * Nearest ancestor `.solopreneur.json` carrying a `preview` block. A file
 * without one is skipped — it may configure something else entirely — but a
 * file that cannot be parsed still stops the walk.
 */
function findAncestorConfig(anchorDir) {
  for (const dir of ancestors(anchorDir)) {
    const candidate = path.join(dir, V2_FILENAME);
    const config = readJsonIfPresent(candidate);
    if (config === null) continue;
    if (!isObject(config) || !('preview' in config)) continue;
    return { file: candidate, config };
  }
  return null;
}

/**
 * Turn a validated v2 config into the resolved decision.
 *
 * `root` resolves against the directory of the file that declared it, and is
 * then made physical so it can be compared against the physical anchor. A root
 * that does not exist yet (a fresh setup) keeps its lexical absolute path.
 */
function resolveV2(file, config) {
  const preview = config.preview;
  const configDir = path.dirname(file);
  const lexicalRoot = path.resolve(configDir, preview.root);
  let root = lexicalRoot;
  try {
    root = fs.realpathSync(lexicalRoot);
  } catch {
    // Not created yet — the lexical path is the best available answer, and it
    // stays safe for the containment check below: an anchor is always realpath'd
    // and therefore always exists, so it cannot live under a root that doesn't.
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

  return {
    configPath: file,
    mode: 'v2',
    root,
    defaultTarget: name,
    target: {
      name,
      provider: target.provider,
      project: target.project,
      // Fail closed: an omitted or misspelled visibility is private.
      visibility: target.visibility ?? 'private',
      include: target.include,
    },
    collections: preview.collections,
    legacy: null,
  };
}

/** True when `child` is `parent` or sits underneath it. Both must be physical. */
const isUnder = (child, parent) => child === parent || child.startsWith(parent + path.sep);

// ---------------------------------------------------------------------------
// Legacy reporting (layers 4-5)
//
// Legacy files are described, never converted. Reporting the raw subtrees keeps
// this honest: the migrator is the only thing allowed to interpret them, and it
// is a separate script that asks the user before writing anything.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * @param {{from?: string, env?: NodeJS.ProcessEnv, cwd?: string}} [options]
 * @returns {{configPath: string|null, mode: 'v2'|'legacy'|'none', root: string|null,
 *            defaultTarget: string|null, target: object|null, collections: object|null,
 *            legacy: object|null}}
 */
export function resolveConfig({ from, env = process.env, cwd = process.cwd() } = {}) {
  const anchor = realAnchor(from ?? cwd, from === undefined ? 'working directory' : '--from path');

  // Layer 1: an explicitly named config. Never falls through — if the caller
  // pointed at a file, a problem with that file is the answer.
  const explicit = env.SOLOPRENEUR_CONFIG;
  if (explicit) {
    const file = path.resolve(explicit);
    const config = readJsonIfPresent(file);
    if (config === null) throw new ConfigError(`$SOLOPRENEUR_CONFIG does not exist: ${file}`);
    validateV2(config, file);
    return checkContainment(resolveV2(file, config), from, anchor);
  }

  // Layer 2: nearest ancestor with a preview block.
  const ancestor = findAncestorConfig(anchor);
  if (ancestor) {
    validateV2(ancestor.config, ancestor.file);
    return checkContainment(resolveV2(ancestor.file, ancestor.config), from, anchor);
  }

  // Layer 3: the user-global v2 config.
  const globalFile = path.join(os.homedir(), '.config', 'solopreneur', 'config.json');
  const globalConfig = readJsonIfPresent(globalFile);
  if (isObject(globalConfig) && 'preview' in globalConfig) {
    validateV2(globalConfig, globalFile);
    return checkContainment(resolveV2(globalFile, globalConfig), from, anchor);
  }

  // Layers 4-5: the legacy feature config, reported as-is.
  const legacyFiles = [];
  if (env.CLAUDE_CONFIG_DIR) legacyFiles.push(path.join(env.CLAUDE_CONFIG_DIR, LEGACY_FILENAME));
  legacyFiles.push(path.join(os.homedir(), '.claude', LEGACY_FILENAME));
  for (const file of legacyFiles) {
    const legacyConfig = readJsonIfPresent(file);
    if (legacyConfig === null) continue;
    const values = legacyPreviewValues(legacyConfig);
    // A legacy file that says nothing about preview is not a preview config;
    // keep looking rather than reporting a decision it did not make.
    if (Object.keys(values).length === 0) continue;
    return emptyResult('legacy', file, values);
  }

  return emptyResult('none');
}

/**
 * An explicit `--from` must sit under the resolved root. Not applied to the cwd
 * anchor: the cwd is only a fallback for "no source path yet", and enforcing it
 * there would make inspection fail from anywhere outside the preview root.
 */
function checkContainment(result, from, anchor) {
  if (from !== undefined && !isUnder(anchor, result.root)) {
    throw new ConfigError(
      `--from is outside the configured preview root\n`
      + `  --from: ${anchor}\n`
      + `  root:   ${result.root}\n`
      + `  config: ${result.configPath}`,
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `usage: ${SELF} [--from <path>] [--json]

  --from <path>  anchor the lookup at <path> instead of the current directory
  --json         print the resolved decision as JSON instead of key=value lines`;

/** Flatten the result to `key=value` lines, arrays joined with commas. */
function toLines(value, prefix = '') {
  if (value === null || value === undefined) return [`${prefix}=`];
  if (Array.isArray(value)) return [`${prefix}=${value.join(',')}`];
  if (isObject(value)) {
    return Object.entries(value).flatMap(([key, sub]) => toLines(sub, prefix ? `${prefix}.${key}` : key));
  }
  return [`${prefix}=${value}`];
}

function main(argv) {
  let from;
  let asJson = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      asJson = true;
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
// trees, where argv[1] is the link and import.meta.url is already resolved.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
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
