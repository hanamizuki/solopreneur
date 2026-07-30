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
 *   reviewer-state.mjs resolve --repo-key <K> --fallback-order <ids>
 *                              [--cli-available <ids>] [--select <ids>] [--gate <id>]
 *       stdin:  {"bots":[…]} — the `detect` output
 *       stdout: {"available","trigger","collect","gate","needsPrompt","warnings"}
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

const SUBCOMMANDS = ['detect', 'record', 'resolve'];

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

/** A JSON object — arrays and null excluded, as in preview/config-resolve.mjs. */
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Read the config for writing.
 *
 * Only ENOENT may become `{}`. A parse failure, a permission error, a blank
 * file, or a non-object top level is fatal: the caller is about to rewrite this
 * file, and treating "cannot understand it" as "it is empty" would replace the
 * user's whole config with whatever this round happened to observe.
 */
function readConfigForWrite() {
  let raw;
  try {
    raw = fs.readFileSync(configPath(), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw new InputError(`cannot read ${configPath()}: ${err.message}`);
  }
  // A file that exists but holds nothing is a truncated write, not an empty
  // config: `writeConfig` only ever renames a fully-written temp file into
  // place, so this shape cannot come from us. Treating it as `{}` would let the
  // next record replace a config that was mid-recovery — the same data loss the
  // parse-error branch below refuses, arriving through a quieter door.
  if (!raw.trim()) {
    throw new InputError(`${configPath()} exists but is empty; refusing to overwrite a truncated config (delete it, or put {} in it, to start fresh)`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new InputError(`cannot parse ${configPath()} (malformed JSON): ${err.message}`);
  }
  if (!isPlainObject(parsed)) {
    throw new InputError(`${configPath()} must contain a JSON object at the top level`);
  }
  return parsed;
}

/**
 * Atomic replace via a private temp file in the same directory.
 *
 * ponytail: the RENAME is atomic, the read-modify-write around it is not — two
 * concurrent writers can each read, then each rename, and the later one wins.
 * That is the config file's existing model, not something introduced here: both
 * shell helpers do the same `cat` → `jq` → `mv` with no lock, so locking this
 * writer alone would buy false confidence while a shell writer still clobbers.
 * Acceptable because `observed` is a self-healing cache — a lost observation is
 * simply re-observed next round, with no TTL to go stale. If this key ever
 * holds something non-idempotent, move all three writers onto one lock file
 * rather than adding a lock here.
 */
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

/**
 * This repo's owned block, defaulted.
 *
 * Fails closed on a malformed shape for the same reason the repo containers do:
 * substituting `{}` for a block we cannot read means the next write silently
 * replaces whatever was there. `null` is tolerated as "unset" — that is how the
 * five-layer read treats it — but an array or a scalar is corruption.
 */
function reviewersBlock(cfg, repoKey) {
  const at = (suffix) => `repos[${JSON.stringify(repoKey)}].${FEATURE}${suffix}`;
  const block = cfg?.repos?.[repoKey]?.[FEATURE];
  if (block != null && !isPlainObject(block)) {
    throw new InputError(`${configPath()}: ${at('')} must be a JSON object`);
  }
  const observed = block?.observed;
  if (observed != null && !isPlainObject(observed)) {
    throw new InputError(`${configPath()}: ${at('.observed')} must be a JSON object`);
  }
  return { observed: observed ?? {} };
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
    // Store the canonical id, never the alias the caller typed. `recipeFor`
    // deliberately accepts aliases ("cursor" → bugbot), but every downstream
    // match — fallback_order, --gate, --select — compares against recipe ids,
    // so a stored alias would pass validation here and then match nothing.
    // Safe to dereference: the loop above already rejected unknown recipes.
    if (fields.recipe != null) fields.recipe = recipeFor(fields.recipe).id;
    observed[login] = { ...(observed[login] ?? {}), ...fields };
  }

  // The top-level check does not reach these nested containers, and an array is
  // the shape that fails open: `??=` keeps it, string keys assigned to an array
  // are dropped by JSON.stringify, and record would then rewrite the file,
  // print the observation, and exit 0 having persisted nothing.
  cfg.repos ??= {};
  if (!isPlainObject(cfg.repos)) {
    throw new InputError(`${configPath()}: "repos" must be a JSON object`);
  }
  cfg.repos[repoKey] ??= {};
  if (!isPlainObject(cfg.repos[repoKey])) {
    throw new InputError(`${configPath()}: repos[${JSON.stringify(repoKey)}] must be a JSON object`);
  }
  cfg.repos[repoKey][FEATURE] = { observed };
  writeConfig(cfg);
  return cfg.repos[repoKey][FEATURE];
}

/** Read-only view. Same fail-closed rules as the write path. */
function readConfig() {
  return readConfigForWrite();
}

const csv = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : []);

/**
 * Decide this round's roles.
 *
 * Candidates come from two places that cannot be unified — a GitHub bot has a
 * login, a local CLI never appears in GitHub data at all — so each carries its
 * `kind` and its own gating eligibility:
 *
 *   bot   cached or detected login. Its recipe resolves cache-first (an
 *         explicit identify wins), then via the registry's verified
 *         knownLogins, then null. Gates when a recipe resolved.
 *   cli   a local CLI that passed its availability gate. Gates — it runs
 *         synchronously, so finishing *is* the end of the round.
 *
 * An unidentified bot (no recipe) is collected but never triggered and never
 * gates. It must additionally carry review evidence: `type == "Bot"` proves
 * automation, not code review, and dependabot's PR prose is not review
 * feedback.
 *
 * The gate is always triggered, auto or not: a clean signal needs an
 * addressable response. `auto` only exempts non-gate reviewers.
 *
 * A stale --select or --gate degrades with a warning instead of failing: those
 * values may come from a days-old autopilot descriptor, and a stale token must
 * not turn an unattended run into an empty one.
 */
function resolve({ bots, repoKey, fallbackOrder, cliAvailable, select, gate }) {
  const warnings = [];
  const { observed } = reviewersBlock(readConfig(), repoKey);

  // Union of remembered and observed, keyed by login.
  const merged = new Map();
  for (const [login, rec] of Object.entries(observed)) merged.set(login, { login, ...rec });
  for (const b of bots) {
    const prev = merged.get(b.login) ?? { login: b.login };
    merged.set(b.login, { ...prev, lastSeen: b.lastSeen, evidence: b.evidence === true });
  }

  const botCandidates = [...merged.values()]
    .filter((r) => r.triggerable !== false)
    .map((r) => {
      let recipe = r.recipe ?? null;
      if (recipe !== null) {
        // Canonicalize on read too, so a config written before `record` started
        // normalizing (or hand-edited with an alias) still matches
        // fallback_order / --gate / --select, which all compare on recipe id.
        const known = recipeFor(recipe);
        if (known) {
          recipe = known.id;
        } else {
          warnings.push(`cached recipe "${recipe}" is not in the registry; ignoring it for ${r.login}`);
          recipe = null;
        }
      }
      // A registry-verified login identifies itself: an App's bot login is
      // app-scoped, identical on every repo. The cached recipe (an explicit
      // identify) wins when both exist.
      recipe ??= recipeForLogin(r.login)?.id ?? null;
      return {
        kind: 'bot',
        id: r.login,
        login: r.login,
        recipe,
        auto: r.auto === true,
        evidence: r.evidence === true,
        lastSeen: r.lastSeen ?? null,
        canGate: recipe !== null,
      };
    })
    // A recipe-bearing entry is a known reviewer; an unidentified one has to
    // prove it reviews before its comments are treated as findings.
    .filter((r) => r.recipe !== null || r.evidence);

  const cliCandidates = cliAvailable
    .filter((id) => {
      const r = recipeFor(id);
      if (r && r.kind === 'local-cli') return true;
      warnings.push(`"${id}" is not a local-cli recipe; ignoring it`);
      return false;
    })
    .map((id) => ({
      kind: 'cli', id, login: null, recipe: recipeFor(id).id, auto: false, evidence: false,
      lastSeen: null, canGate: true,
    }));

  const available = [...botCandidates, ...cliCandidates]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let wanted = select ? csv(select) : null;
  let selected = wanted
    ? available.filter((r) => wanted.includes(r.recipe) || wanted.includes(r.id))
    : available;
  if (wanted && selected.length === 0) {
    warnings.push(`--select matched no available reviewer (${wanted.join(', ')}); ignoring it`);
    wanted = null;
    selected = available;
  }

  let gateEntry = null;
  if (gate) {
    const found = selected.find((r) => r.recipe === gate || r.id === gate);
    if (found?.canGate) gateEntry = found;
    else warnings.push(`--gate "${gate}" is not an available gate candidate; falling back to fallback-order`);
  }
  if (!gateEntry) {
    for (const id of fallbackOrder) {
      gateEntry = selected.find((r) => r.recipe === id && r.canGate) ?? null;
      if (gateEntry) break;
    }
    // Only pick an arbitrary candidate when the caller expressed no ordering, or
    // expressed a narrower explicit one via --select. A configured
    // fallback_order is an authorization list, not a hint: gating on someone
    // outside it — while reporting needsPrompt:false, so nobody is ever told —
    // would let an unlisted reviewer's clean pass end the loop. An exhausted
    // ladder is the documented prompt-or-halt case instead. (This is also why
    // the codex-bot -> codex-cli succession is expressed by putting codex-cli
    // IN fallback_order, rather than as a rule in here.)
    if (!gateEntry) {
      if (fallbackOrder.length === 0 || wanted) {
        gateEntry = selected.find((r) => r.canGate) ?? null;
      } else if (selected.some((r) => r.canGate)) {
        warnings.push(
          `no reviewer from fallback_order (${fallbackOrder.join(', ')}) is available here; `
          + 'not gating on an unlisted reviewer',
        );
      }
    }
  }

  const trigger = selected
    .filter((r) => {
      if (r.kind === 'cli') return true;
      if (r.recipe === null) return false;
      return !r.auto || r === gateEntry;
    })
    .map((r) => {
      const recipe = recipeFor(r.recipe);
      return {
        kind: recipe.kind,
        recipe: r.recipe,
        triggerText: recipe.trigger,
        handshake: recipe.handshake,
        login: r.login,
      };
    });

  const gatePayload = gateEntry
    ? {
      kind: gateEntry.kind,
      id: gateEntry.id,
      login: gateEntry.login,
      recipe: gateEntry.recipe,
      // The gate's own policy: a github-bot gate defines the poll window; a
      // local-cli gate has none — it runs synchronously and its completion
      // closes the round (SKILL.md branches on `kind`).
      poll: recipeFor(gateEntry.recipe).poll ?? null,
      handshake: recipeFor(gateEntry.recipe).handshake,
    }
    : null;

  return {
    available,
    trigger,
    collect: selected.filter((r) => r.login).map((r) => r.login),
    gate: gatePayload,
    // Ask only when something acts here but nothing can close a round.
    needsPrompt: gateEntry === null && available.length > 0,
    warnings,
  };
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

  if (sub === 'resolve') {
    const flags = parseFlags(process.argv.slice(3),
      ['repo-key', 'fallback-order', 'cli-available', 'select', 'gate']);
    if (!flags['repo-key']) throw new InputError('resolve needs --repo-key');
    if (flags['fallback-order'] === undefined) {
      throw new InputError('resolve needs --fallback-order (read it with read_solopreneur_config)');
    }
    const { bots = [] } = parseJsonStdin(await readStdin());
    return emit(resolve({
      bots,
      repoKey: flags['repo-key'],
      fallbackOrder: csv(flags['fallback-order']),
      cliAvailable: csv(flags['cli-available']),
      select: flags.select,
      gate: flags.gate,
    }));
  }

  return usage(`unknown subcommand "${sub}"`);
}

main().catch((err) => {
  if (err instanceof InputError) fail(err.message);
  else throw err;
});
