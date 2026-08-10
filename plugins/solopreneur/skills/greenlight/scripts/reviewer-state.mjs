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
 *                              [--host-family <id>]
 *       stdin:  {"bots":[…]} — the `detect` output
 *       stdout: {"available","marked","trigger","collect","gate","needsPrompt",
 *                "warnings","hostFamily","gateBlock"}
 *               `gateBlock` OUTRANKS `needsPrompt`: both are set when the only
 *               reviewers here share the host's model family, and the prompt
 *               cannot help — no answer to it adds a reviewer of another family.
 *               Take the non-retryable halt; do not open the selection prompt.
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
import { RECIPES, recipeFor, recipeForLogin } from './reviewer-registry.mjs';

const SUBCOMMANDS = ['detect', 'record', 'resolve'];

/** Every model family the registry knows. The only legal --host-family values. */
const FAMILIES = new Set(Object.values(RECIPES).map((r) => r.family));

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

/**
 * The primary config file, restating `solopreneur_config_home` from
 * shared/config.sh in JavaScript.
 *
 * The harness is identified by CODEX_THREAD_ID, which Codex exports on every
 * session; CODEX_HOME only relocates that home and may be unset. Anything that
 * is not Codex takes the historical Claude branch unchanged, so existing
 * installs behave exactly as before. Detecting here rather than making callers
 * export CLAUDE_CONFIG_DIR=$CODEX_HOME is the point: an improvised env var is
 * a per-call decision, and a missed call would silently write reviewer state
 * into the wrong harness's home.
 */
function configPath() {
  const base = process.env.CODEX_THREAD_ID
    ? process.env.CODEX_HOME || path.join(os.homedir(), '.codex')
    : process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(path.resolve(base), 'solopreneur.json');
}

/**
 * The model family of the host running this loop.
 *
 * Detected by the same rule as `configPath` above and `solopreneur_config_home`
 * in shared/config.sh: CODEX_THREAD_ID is exported on every Codex session, and
 * anything that is not Codex takes the historical Claude branch.
 *
 * The flag is honoured when given AND the env rule is applied when it is not.
 * Both, deliberately: the caller passes `--host-family` so the decision is
 * visible in the invocation, but a caller that forgets it must not thereby be
 * able to produce a same-family gate — the whole point of the filter is that it
 * cannot be skipped by omission.
 *
 * An unrecognised value is fatal rather than ignored: silently filtering nothing
 * is exactly the failure this exists to prevent, and it would look like success.
 */
function hostFamilyOf(flag) {
  const explicit = (flag ?? '').trim();
  const family = explicit || (process.env.CODEX_THREAD_ID ? 'openai' : 'anthropic');
  if (!FAMILIES.has(family)) {
    throw new InputError(
      `unknown --host-family "${family}" (known: ${[...FAMILIES].sort().join(', ')})`);
  }
  return family;
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
 * This repo's owned block, with every container on the path to it validated.
 *
 * All of the shape checking lives here, in the one function both subcommands
 * call, so `record` and `resolve` cannot disagree about what a valid config is.
 * Splitting it — some checks in the writer, some in the reader — is what let
 * malformed shapes through one path while the other rejected them.
 *
 * Fails closed rather than defaulting: substituting `{}` for something we
 * cannot read means the next write silently replaces it. `null` is tolerated as
 * "unset" at every level, because that is how the five-layer read treats it; an
 * array or a scalar is corruption.
 */
function reviewersBlock(cfg, repoKey) {
  const rk = JSON.stringify(repoKey);
  const check = (value, what) => {
    if (value != null && !isPlainObject(value)) {
      throw new InputError(`${configPath()}: ${what} must be a JSON object`);
    }
    return value;
  };

  const repos = check(cfg.repos, '"repos"');
  const repo = check(repos?.[repoKey], `repos[${rk}]`);
  const block = check(repo?.[FEATURE], `repos[${rk}].${FEATURE}`);
  const observed = check(block?.observed, `repos[${rk}].${FEATURE}.observed`);

  // Per-login records too: a scalar or an array here gets spread into character
  // or index keys by `record`'s merge and `resolve`'s union alike, quietly
  // destroying the very entry the operation claims to update.
  for (const [login, rec] of Object.entries(observed ?? {})) {
    check(rec, `repos[${rk}].${FEATURE}.observed[${JSON.stringify(login)}]`);
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

  // Safe to create-if-missing: reviewersBlock above already rejected every
  // non-object container on this path, so no `??=` here can preserve an array
  // whose string keys JSON.stringify would then silently drop.
  cfg.repos ??= {};
  cfg.repos[repoKey] ??= {};
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
 * **Gate independence.** A candidate whose `family` equals the host's cannot
 * gate: a clean pass from the host's own model family is a model approving its
 * own work, and the loop would end on it. The rule lives in `canGate`, which is
 * the single thing every gate path already consults — the explicit `--gate`, the
 * `fallback_order` ladder, the unconfigured branch, and the `EXHAUSTED_GATES`
 * advance (which re-enters through `--gate`). Non-gate reviewers are deliberately
 * unrestricted: their findings are advisory, so a same-family reviewer is still
 * triggered and still collected — it just cannot be what closes the round.
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
 *
 * `triggerable: false` entries go to their own `marked` key rather than into
 * `available`. They must stay out of `available` because it feeds `collect` — a
 * reviewer marked unresponsive must not have its comments harvested as findings
 * — but they must still be reachable, or the attended "retry a reviewer marked
 * unresponsive" prompt has nothing to list and can never clear the mark. For the
 * same reason they count toward `needsPrompt`: a repo whose only known reviewer
 * is marked has an empty `available`, and reporting "nothing to ask about" there
 * would strand it with no gate and no way back.
 */
function resolve({ bots, repoKey, fallbackOrder, cliAvailable, select, gate, hostFamily }) {
  const warnings = [];
  const { observed } = reviewersBlock(readConfig(), repoKey);
  /** Independent of the host = eligible to gate. Unknown recipe → never gates. */
  const independent = (recipe) => {
    const r = recipeFor(recipe);
    return r != null && r.family !== hostFamily;
  };

  // Union of remembered and observed, keyed by login.
  const merged = new Map();
  for (const [login, rec] of Object.entries(observed)) merged.set(login, { login, ...rec });
  for (const b of bots) {
    const prev = merged.get(b.login) ?? { login: b.login };
    merged.set(b.login, { ...prev, lastSeen: b.lastSeen, evidence: b.evidence === true });
  }

  const shape = (r) => {
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
      canGate: recipe !== null && independent(recipe),
    };
  };

  // Shape once, then partition — the recipe resolution above is identical for a
  // marked reviewer and an active one, and the retry prompt needs the resolved
  // recipe to offer anything meaningful.
  const shaped = [...merged.values()]
    .map((r) => ({ marked: r.triggerable === false, entry: shape(r) }))
    // A recipe-bearing entry is a known reviewer; an unidentified one has to
    // prove it reviews before its comments are treated as findings.
    .filter(({ entry }) => entry.recipe !== null || entry.evidence);

  const botCandidates = shaped.filter((s) => !s.marked).map((s) => s.entry);
  const marked = shaped
    .filter((s) => s.marked)
    .map(({ entry }) => ({ login: entry.login, recipe: entry.recipe, lastSeen: entry.lastSeen }))
    .sort((a, b) => (a.login < b.login ? -1 : a.login > b.login ? 1 : 0));

  const cliCandidates = cliAvailable
    .filter((id) => {
      const r = recipeFor(id);
      if (r && r.kind === 'local-cli') return true;
      warnings.push(`"${id}" is not a local-cli recipe; ignoring it`);
      return false;
    })
    .map((id) => ({
      kind: 'cli', id, login: null, recipe: recipeFor(id).id, auto: false, evidence: false,
      lastSeen: null, canGate: independent(id),
    }));

  const available = [...botCandidates, ...cliCandidates]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let wanted = select ? csv(select) : null;
  let selected = wanted
    ? available.filter((r) => wanted.includes(r.recipe) || wanted.includes(r.id))
    : available;
  if (wanted && selected.length === 0) {
    // Only a real degradation when there was something to match against. On a
    // repo with no history at all the seed below honours the request instead, so
    // warning here would contradict what actually happens.
    if (available.length > 0) {
      warnings.push(`--select matched no available reviewer (${wanted.join(', ')}); ignoring it`);
    }
    wanted = null;
    selected = available;
  } else if (wanted) {
    // Partial miss: some ids matched, some did not. Warning only on a total miss
    // is the wrong threshold — the common shape is one live reviewer plus one
    // that has since been marked or was never here, and running the reduced set
    // in silence is indistinguishable from running the whole selection.
    const missing = wanted.filter((id) => !selected.some((r) => r.recipe === id || r.id === id));
    if (missing.length > 0) {
      warnings.push(
        `--select ${missing.map((m) => `"${m}"`).join(', ')} matched no available reviewer here; `
        + 'continuing with the rest of the selection',
      );
    }
  }

  let gateEntry = null;
  if (gate) {
    // An explicitly requested same-family gate can never be honoured — not here,
    // and not through the seed below, which applies the same filter. Say so with
    // the reason: the deferred "not an available gate candidate" warning further
    // down reports THAT the request lost, never WHY, and a caller told only that
    // would reasonably retry the same id forever.
    if (recipeFor(gate) && !independent(gate)) {
      warnings.push(
        `--gate "${gate}" is ${recipeFor(gate).family}-family, the same as this host `
        + `(${hostFamily}); the gate must be independent of the host, so it was not selected`,
      );
    }
    const found = selected.find((r) => r.recipe === gate || r.id === gate);
    if (found?.canGate) gateEntry = found;
    // The "stale gate" warning is deferred until after the seed below: on an
    // empty repo the seed honours this exact request, and announcing a fallback
    // that never happened would send the caller chasing the wrong reviewer.
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

  // First use, or detection down with an empty cache: nothing is known about this
  // repo at all. Detection is an enhancement, never a gate — the pre-detection
  // loop always had a reviewer on this path, posted its trigger, and let the
  // timeout report the truth. Seeding keeps that promise; without it a fresh repo
  // resolves to an empty round and no reviewer is ever asked at all.
  //
  // An explicit request wins over the configured default. This is the whole
  // mechanism behind the attended "try a tool with no history here" option: the
  // user names a recipe and its trigger goes out this round. Seeding the
  // configured default instead would trigger a different reviewer than the one
  // just asked for, and the same applies to a fresh-repo autopilot descriptor.
  // `select` is read raw rather than through `wanted`, which the degradation
  // above may already have cleared.
  //
  // Seed EVERY requested github-bot, not just one: `select=a,b` means "run both",
  // and collapsing it to a single seed would silently halve review coverage on
  // exactly the fresh-repo autopilot runs that pass a selection. Only the first
  // becomes the gate — one reviewer closes the round, the rest are collected.
  //
  // `select` is an authorization list here too: when one is present the seeds
  // come only from it, and a `gate` naming something outside it is not honoured
  // — the deferred warning below then reports the mismatch. Without this the
  // seeded path would gate on a reviewer the caller excluded, which is exactly
  // what a repo WITH history refuses to do.
  const selIds = csv(select).map((id) => recipeFor(id)?.id).filter(Boolean);
  const gateId = recipeFor(gate)?.id ?? null;
  let requested = selIds.length > 0 ? selIds : [gateId].filter(Boolean);
  if (gateId && requested.includes(gateId)) {
    requested = [gateId, ...requested.filter((id) => id !== gateId)];
  }
  // Only ids that are not already candidates: an available one was matched by the
  // normal path above, and re-seeding it would duplicate the entry. A seed becomes
  // the gate, so the independence filter applies here too — otherwise a fresh repo
  // on a Codex host would seed `codex-bot` and gate on the host's own family,
  // which is the exact hole this whole filter exists to close.
  // Say so when the family filter is what removed an explicitly requested seed.
  // The `--gate` path above explains WHY; a `--select` that silently vanishes
  // here would leave the caller with a round where nothing happened and no
  // reason given.
  const familyDropped = requested.filter((id) => recipeFor(id).kind === 'github-bot'
    && !independent(id) && !available.some((r) => r.recipe === id));
  if (familyDropped.length > 0) {
    warnings.push(
      `not seeding ${familyDropped.map((d) => `"${d}"`).join(', ')}: ${hostFamily}-family, `
      + 'the same as this host, and a gate must be independent of the host',
    );
  }
  requested = requested.filter((id) => recipeFor(id).kind === 'github-bot'
    && independent(id)
    && !available.some((r) => r.recipe === id));

  // Two ways in. "Nothing is known about this repo at all" is the first-use /
  // detection-down case: detection is an enhancement, never a gate, so the loop
  // still gets a reviewer, posts its trigger, and lets the timeout report the
  // truth. The second is an explicit request for a bot that is not a candidate
  // here — that has to work even when unusable reviewers ARE known, because
  // "try a tool with no history here" is offered precisely when the only known
  // reviewers are unidentified or marked. Without it that prompt option can
  // never take effect and just returns the user to the same prompt.
  //
  // What is NOT a way in: unusable reviewers plus no explicit request. That is
  // the prompt path (needsPrompt), not a silent default.
  const nothingKnown = available.length === 0 && marked.length === 0;
  if (!gateEntry && (nothingKnown || requested.length > 0)) {
    // The configured ladder authorizes the implicit seed too. A ladder of only
    // `codex-cli` that is unavailable here must resolve to gate:null and take the
    // documented prompt-or-halt path — NOT quietly send the PR to codex-bot, a
    // reviewer that ladder excludes. Only a genuinely unconfigured ladder gets
    // the built-in default, and only when nothing at all is known.
    // `independent` again: the built-in `codex-bot` default is the S-size default
    // gate, and on a Codex host it is the host's own family. There is no seedable
    // substitute — a local CLI's availability comes from its own probe, never from
    // being asked for — so an independent gate there arrives through
    // `--cli-available` (claude-cli) and the ladder the caller derives for the
    // host. With neither, this correctly resolves to gate:null.
    const ladderSeed = fallbackOrder.find(
      (id) => recipeFor(id)?.kind === 'github-bot' && independent(id),
    ) ?? (fallbackOrder.length === 0 && independent('codex-bot') ? 'codex-bot' : null);
    const seedIds = requested.length > 0
      ? [...new Set(requested)]
      : [nothingKnown && ladderSeed && recipeFor(ladderSeed).id].filter(Boolean);
    if (seedIds.length === 0 && fallbackOrder.length > 0) {
      warnings.push(
        `no reviewer has acted on this repo yet and fallback_order (${fallbackOrder.join(', ')}) `
        + 'has no github-bot available to seed; nothing can gate this round',
      );
    }

    // The verified login may be absent (an unverified tool): triggering needs only
    // the recipe string, so the trigger still goes out — but nothing can be
    // attributed back until it answers once and is identified. SKILL.md treats
    // such a round as a probe; see "Seeded rounds" there.
    const seeds = seedIds.map((id) => {
      const r = recipeFor(id);
      return {
        kind: 'bot',
        id: r.knownLogins[0] ?? r.id,
        login: r.knownLogins[0] ?? null,
        recipe: r.id,
        auto: false,
        evidence: false,
        lastSeen: null,
        canGate: true,
      };
    });

    if (seeds.length > 0) {
      [gateEntry] = seeds;
      selected = seeds;
      warnings.push(
        `no reviewer has acted on this repo yet; seeding ${seedIds.map((i) => `"${i}"`).join(', ')} `
        + `and gating on "${gateEntry.recipe}" — if it is not installed here, the round simply times out`,
      );
      // An explicit selection that could not be honoured has to say so, the same
      // way an unmet --gate does. A local CLI cannot be seeded — its availability
      // comes from its own gate, never from being asked for — and an unknown id
      // names nothing at all; either way the caller must not be left believing a
      // reviewer it listed is running.
      const dropped = csv(select).filter((id) => !seedIds.includes(recipeFor(id)?.id));
      if (dropped.length > 0) {
        warnings.push(
          `--select ${dropped.map((d) => `"${d}"`).join(', ')} cannot be seeded on a repo with `
          + 'no history (only github-bot recipes can be); not part of this round',
        );
      }
    }
  }

  // Deferred from the --gate block above: warn only if the request genuinely did
  // not survive, whether it lost to the ladder or to the seed.
  if (gate && gateEntry?.recipe !== gate && gateEntry?.id !== gate) {
    warnings.push(`--gate "${gate}" is not an available gate candidate; falling back to fallback-order`);
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
      // A4 is asserted on this field: on a Codex host it is never `openai`, on a
      // Claude host never `anthropic`. Printing it is what makes the invariant
      // checkable in the pre-flight's own output instead of by re-deriving it.
      family: recipeFor(gateEntry.recipe).family,
    }
    : null;

  // Why no gate, when there is none — the two answers route to different halts,
  // and only this function knows which applies.
  //
  // The question is about the AUTHORIZED set, never "does some same-family
  // reviewer exist". A ladder of `coderabbit,codex-bot` on a Codex host whose
  // CodeRabbit is merely absent is `unavailable`: coderabbit is authorized AND
  // independent, so waiting can genuinely bring the gate back. Only when every
  // authorized candidate is the host's own family is waiting futile — no amount
  // of retrying adds a reviewer of another family, and that is the difference
  // between a retryable halt and one that needs a human.
  // `marked` counts as authorized on the unconfigured branch. A reviewer marked
  // `triggerable: false` is one prompt away from coming back (that retry is an
  // answer the selection prompt offers), so an independent one sitting in
  // `marked` means an independent gate IS reachable here — reporting
  // `host-family` would send a recoverable round to a non-retryable halt and
  // skip the very prompt that fixes it. A configured ladder needs no equivalent:
  // it lists ids outright, available or not.
  //
  // Two kinds of "unknown" live here and they must be treated OPPOSITELY:
  //
  //   a CONFIGURED id that resolves to nothing (`fallback_order: [..., "typo"]`,
  //   a renamed recipe) names no reviewer and can never become one, so it is
  //   dropped. Letting it stand would make `every` false forever, report
  //   `unavailable`, and send an unattended run round-tripping through a
  //   retryable halt that waiting can never fix — while the pre-flight's
  //   `host-family` append, the one thing that WOULD fix it, never fires.
  //
  //   a DETECTED entry with a null recipe is an unidentified but real reviewer.
  //   Its family is unknown, not host, and the attended prompt can bind it to an
  //   independent recipe — so it is KEPT, and keeps `every` false on purpose.
  //
  // Collapsing the two is how one of them always ends up misrouted.
  const known = (ids) => ids.filter((id) => recipeFor(id));
  const authorized = wanted
    ? known(wanted)
    : (fallbackOrder.length > 0
      ? known(fallbackOrder)
      : [...selected.map((r) => r.recipe), ...marked.map((m) => m.recipe), 'codex-bot']);
  const gateBlock = gateEntry !== null ? null
    : (authorized.length > 0 && authorized.every((id) => recipeFor(id) && !independent(id))
      ? 'host-family' : 'unavailable');
  if (gateBlock === 'host-family') {
    warnings.push(
      `no independent gate: every reviewer authorized here (${authorized.join(', ')}) is `
      + `${hostFamily}-family, the same as this host; install or authenticate a review CLI `
      + 'of another family, or run this loop on a host of another family',
    );
  }

  return {
    available,
    marked,
    trigger,
    collect: selected.filter((r) => r.login).map((r) => r.login),
    gate: gatePayload,
    // Ask only when something is known here but nothing can close a round. A
    // marked reviewer counts as "known": retrying it is one of the answers.
    needsPrompt: gateEntry === null && (available.length > 0 || marked.length > 0),
    hostFamily,
    gateBlock,
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
      ['repo-key', 'fallback-order', 'cli-available', 'select', 'gate', 'host-family']);
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
      hostFamily: hostFamilyOf(flags['host-family']),
    }));
  }

  return usage(`unknown subcommand "${sub}"`);
}

main().catch((err) => {
  if (err instanceof InputError) fail(err.message);
  else throw err;
});
