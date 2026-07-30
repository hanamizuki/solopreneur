#!/usr/bin/env node
/**
 * Per-repo reviewer state for greenlight: which bots act on this repo, which of
 * them to trigger this round, and which observations to remember.
 *
 * Requires Node.js >= 20. Only `node:` built-ins.
 *
 * Usage:
 *   reviewer-state.mjs detect
 *       stdin:  TSV `login<TAB>type<TAB>iso<TAB>source`, source one of
 *               conversation | review-comment | formal-review
 *       stdout: {"bots":[{"login","lastSeen","evidence"}]}
 *
 *   reviewer-state.mjs record --repo-key <K>
 *       stdin:  {"observations":[{"login", "auto"?, "triggerable"?, "recipe"?}]}
 *       stdout: the repo's whole greenlight_reviewers block after the merge
 *
 * This script never calls `gh`, never derives the repo key, and never reads
 * `fallback_order` — all three are passed in. That keeps it testable and keeps
 * the five-layer config cascade in the one place that already implements it
 * (the shell helpers in shared/config.md).
 *
 * It owns exactly one config key: repos[<repo-key>].greenlight_reviewers. It
 * never writes `greenlight`, which stays owned by the shell helpers.
 *
 * stdout is the machine contract and stays clean on failure. Errors print to
 * stderr and set exitCode 1.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recipeFor, recipeForLogin } from './reviewer-registry.mjs';

const SUBCOMMANDS = ['detect', 'record'];

/** The feature key this script owns. It never touches `greenlight`. */
const FEATURE = 'greenlight_reviewers';

/** Sources that prove a bot performs code review, not just automation. */
const EVIDENCE_SOURCES = new Set(['review-comment', 'formal-review']);
const ALL_SOURCES = new Set([...EVIDENCE_SOURCES, 'conversation']);

/**
 * A problem with user-supplied input or config — printed as a message. Anything
 * else that throws is a bug and keeps its stack. Mirrors ConfigError in
 * preview/scripts/config-resolve.mjs.
 */
class InputError extends Error {}

function fail(message) {
  process.stderr.write(`error: ${message}\n`);
  process.exitCode = 1;
}

function usage(message) {
  const lines = message ? [`error: ${message}`] : [];
  lines.push(`usage: reviewer-state.mjs <${SUBCOMMANDS.join('|')}>`);
  process.stderr.write(`${lines.join('\n')}\n`);
  process.exitCode = 1;
}

/** Read all of stdin. Refuses a TTY, where it would otherwise hang forever. */
async function readStdin() {
  if (process.stdin.isTTY) throw new InputError('this subcommand reads stdin; pipe input in');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Reduce an activity sample to the bots in it.
 *
 * Filtering is on `type === 'Bot'`, never on the login text: a tool's login is
 * unpredictable (`Copilot` carries no `[bot]` suffix), and an allowlist of
 * logins is what stops a newly installed reviewer from being seen at all.
 *
 * `evidence` is ORed across a bot's rows. It separates "is automation" from
 * "does code review": dependabot and CI bots only ever appear in the
 * conversation channel, so they stay evidence-free and never become reviewer
 * candidates.
 */
function detect(tsv) {
  const byLogin = new Map();
  for (const line of tsv.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 4) continue;
    const [login, type, at, source] = parts.map((s) => s.trim());
    if (!login || type !== 'Bot' || !at || !ALL_SOURCES.has(source)) continue;
    const prev = byLogin.get(login) ?? { login, lastSeen: at, evidence: false };
    byLogin.set(login, {
      login,
      lastSeen: at > prev.lastSeen ? at : prev.lastSeen,
      evidence: prev.evidence || EVIDENCE_SOURCES.has(source),
    });
  }
  return [...byLogin.values()].sort((a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));
}

/** The primary config file, matching the shell helpers in shared/config.md. */
function configPath() {
  const base = process.env.CLAUDE_CONFIG_DIR
    ? path.resolve(process.env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), '.claude');
  return path.join(base, 'solopreneur.json');
}

/**
 * Read the config for writing.
 *
 * Only ENOENT may become `{}`. A parse failure, a permission error, or a
 * non-object top level is fatal: the caller is about to rewrite this file, and
 * treating "cannot understand it" as "it is empty" would replace the user's
 * whole config with whatever this round happened to observe.
 */
function readConfigForWrite() {
  let raw;
  try {
    raw = fs.readFileSync(configPath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new InputError(`cannot read ${configPath()}: ${err.message}`);
  }
  if (!raw.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InputError(`cannot parse ${configPath()} (malformed JSON): ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new InputError(`${configPath()} must contain a JSON object at the top level`);
  }
  return parsed;
}

/** Atomic replace via a private temp file in the same directory. */
function writeConfig(cfg) {
  const target = configPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  // mkdtemp, not a predictable `${target}.tmp`: an attacker-planted symlink at
  // a guessable path would otherwise be followed by the write.
  const stage = fs.mkdtempSync(`${target}.`);
  const tmp = path.join(stage, 'solopreneur.json');
  try {
    fs.writeFileSync(tmp, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, target);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

/** This repo's owned block, defaulted. */
function reviewersBlock(cfg, repoKey) {
  const block = cfg?.repos?.[repoKey]?.[FEATURE] ?? {};
  return {
    observed: block.observed && typeof block.observed === 'object' ? block.observed : {},
  };
}

/** Minimal `--flag value` parser. Unknown flags are an error, not ignored. */
function parseFlags(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (!flag.startsWith('--')) throw new InputError(`unexpected argument "${flag}"`);
    const name = flag.slice(2);
    if (!allowed.includes(name)) throw new InputError(`unknown flag "${flag}"`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new InputError(`${flag} needs a value`);
    }
    out[name] = value;
    i += 1;
  }
  return out;
}

/** Parse stdin as JSON, naming the input so the message is actionable. */
function parseJsonStdin(raw) {
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new InputError(`cannot parse stdin as JSON: ${err.message}`);
  }
}

/**
 * Merge this round's observations into the per-repo cache.
 *
 * Each observation is a per-login field merge over three optional facts:
 *   auto         — it commented without being triggered
 *   triggerable  — false: a trigger got no response inside its own poll
 *                  budget; true: a marked login acted again (the recovery path)
 *   recipe       — an attended identify bound this login to a registry row
 *
 * An empty payload does not rewrite the file at all, so a quiet round cannot
 * reformat or reorder a config the user hand-edited.
 */
function record({ observations = [], repoKey }) {
  for (const obs of observations) {
    if (!obs?.login) throw new InputError('every observation needs a login');
    if (obs.recipe != null && !recipeFor(obs.recipe)) {
      throw new InputError(`unknown recipe "${obs.recipe}"`);
    }
  }

  const cfg = readConfigForWrite();
  const current = reviewersBlock(cfg, repoKey);
  if (observations.length === 0) return current;

  const observed = { ...current.observed };
  for (const { login, ...fields } of observations) {
    observed[login] = { ...(observed[login] ?? {}), ...fields };
  }

  cfg.repos ??= {};
  cfg.repos[repoKey] ??= {};
  cfg.repos[repoKey][FEATURE] = { observed };
  writeConfig(cfg);
  return cfg.repos[repoKey][FEATURE];
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main() {
  const [sub] = process.argv.slice(2);
  if (!sub) return usage('no subcommand given');

  if (sub === 'detect') {
    return emit({ bots: detect(await readStdin()) });
  }

  if (sub === 'record') {
    const flags = parseFlags(process.argv.slice(3), ['repo-key']);
    if (!flags['repo-key']) throw new InputError('record needs --repo-key');
    const payload = parseJsonStdin(await readStdin());
    return emit(record({ observations: payload.observations ?? [], repoKey: flags['repo-key'] }));
  }

  return usage(`unknown subcommand "${sub}"`);
}

main().catch((err) => {
  if (err instanceof InputError) fail(err.message);
  else throw err;
});
