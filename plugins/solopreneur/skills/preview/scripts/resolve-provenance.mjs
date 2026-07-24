/**
 * Resolve a preview's provenance — "who produced / who last updated" it — into
 * display-safe values a footer can show, without ever leaking a raw session id,
 * transcript path, or absolute local path onto the deployed page.
 *
 * Requires Node.js >= 20.
 *
 * This is a pure, deterministic normalizer: no I/O, no network, no CLI. The
 * builder's chrome-injection seam (build-library.mjs `injectEntry`) imports
 * `resolveProvenance` to render the footer from an item's `preview.json`
 * `provenance` block; there is nothing to run from a shell, so — unlike its
 * sibling scripts — this file ships no shebang and no `main`.
 *
 * Two guarantees shape every line below:
 *
 *   1. NEVER GUESS. A display value is either a fact the caller passed in, or a
 *      value a deterministic platform adapter derived from platform data — never
 *      an LLM/heuristic guess. When nothing resolves, the field is ABSENT and the
 *      footer reads "unrecorded" downstream; a missing title is never fabricated.
 *
 *   2. SANITIZE BY CONSTRUCTION. Every returned object is assembled by assigning
 *      only the allowlisted display keys (`agent`, `platform`, `sessionTitle`) —
 *      the input is never spread. A raw `session_id`, a `transcript_path`, a
 *      `payload`, or any absolute local path therefore cannot ride along into the
 *      result. This is the same "pick, never spread" discipline build-library.mjs
 *      uses to keep source metadata out of directory.json.
 *
 * The module is TOTAL: it never throws. A footer resolver must degrade to
 * "unrecorded" on malformed provenance, not abort a publish. (Its siblings
 * config-resolve.mjs / build-library.mjs throw typed errors because a bad CONFIG
 * or a torn CONTENT snapshot must stop the build; a weird provenance blob must
 * not.)
 *
 * v1 SCOPE: only the Claude platform adapter is implemented. Codex, Hermes and
 * OpenClaw deliberately have no adapter yet — a preview from those platforms
 * resolves its `sessionTitle` to the "unrecorded" fallback (absent), while its
 * caller-supplied `agent` / `platform` still pass through. See `ADAPTERS`.
 */

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * A trimmed display title, or `undefined` when there is nothing usable. Used for
 * BOTH the caller-explicit title and an adapter's output, so an empty or
 * whitespace-only value never becomes a blank footer line.
 */
function cleanTitle(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * A display string (`agent` / `platform`) echoed straight through from the caller,
 * or `undefined` when absent or not a non-empty string. These are the caller's own
 * identity facts — the module passes them through, it does not derive them, so the
 * value is returned verbatim rather than trimmed.
 */
function passThrough(value) {
  return typeof value === 'string' && value.trim().length ? value : undefined;
}

/**
 * Platform adapters: derive a display `sessionTitle` from a platform's raw hook
 * payload. Each returns a title candidate (normalized by `cleanTitle` at the call
 * site) or `undefined` when the payload carries none — never a guess.
 *
 * v1 ships ONLY `claude`. A Claude hook payload carries `session_id`,
 * `transcript_path`, `cwd`, and — only once a title has actually been set —
 * `session_title` (verified against the Claude Code hooks reference). The adapter
 * reads `session_title` and nothing else: the raw `session_id` and
 * `transcript_path` are never read here, and because a resolved party is built
 * from the allowlist alone, they can never reach the output. A payload with no
 * `session_title` (the common case) yields `undefined`, i.e. "unrecorded".
 *
 * This map IS the seam. Add one function per platform as its real adapter lands;
 * an absent platform falls through to the "unrecorded" fallback by design:
 *   codex:    CODEX_THREAD_ID -> $CODEX_HOME/session_index.jsonl `thread_name`
 *   hermes:   Hermes state session-title lookup
 *   openclaw: SessionEntry `label` / `displayName`
 */
const ADAPTERS = {
  claude: (payload) => (isObject(payload) ? payload.session_title : undefined),
};

/**
 * Resolve ONE party (a `createdBy` or a `lastUpdatedBy`) to `{ agent?, platform?,
 * sessionTitle? }`. `sessionTitle` resolution is first-hit-wins, never a guess:
 *
 *   1. caller-explicit `input.sessionTitle` — the owning agent stated it;
 *   2. the platform adapter over `input.payload` — deterministic derivation;
 *   3. absent — nothing resolved; the footer reads "unrecorded".
 *
 * `agent` and `platform` are always the caller's, passed through. The returned
 * object is assembled key by key from the allowlist, so no raw session id,
 * transcript path or payload can leak. A non-object input yields `{}` (a fully
 * unrecorded party), never an exception.
 */
export function resolveParty(input) {
  if (!isObject(input)) return {};

  const party = {};
  const agent = passThrough(input.agent);
  if (agent !== undefined) party.agent = agent;
  const platform = passThrough(input.platform);
  if (platform !== undefined) party.platform = platform;

  // 1. caller-explicit title wins.
  let sessionTitle = cleanTitle(input.sessionTitle);
  // 2. otherwise a platform adapter may derive one. `Object.hasOwn`, not `in` or a
  //    bare index: a bracket lookup walks the prototype chain, so `platform:
  //    "toString"` / `"constructor"` would resolve to an inherited function and
  //    fabricate a bogus title — the exact "never guess" violation this guard
  //    closes (the same discipline config-resolve.mjs / build-library.mjs apply).
  if (sessionTitle === undefined
      && typeof input.platform === 'string'
      && Object.hasOwn(ADAPTERS, input.platform)) {
    sessionTitle = cleanTitle(ADAPTERS[input.platform](input.payload));
  }
  // 3. otherwise absent — never fabricated.
  if (sessionTitle !== undefined) party.sessionTitle = sessionTitle;

  return party;
}

/** Two resolved parties display identically when all three fields match. */
const sameParty = (a, b) =>
  a.agent === b.agent && a.platform === b.platform && a.sessionTitle === b.sessionTitle;

/**
 * Resolve a `preview.json` `provenance` block — `{ createdBy, lastUpdatedBy }` —
 * into the footer's display shape:
 *
 *   - `{ producedBy }` when the creator and the last updater resolve identically
 *     (the common case of an item no one else has revised) — the footer shows a
 *     single "Produced by" line;
 *   - `{ createdBy, lastUpdatedBy }` otherwise — the footer shows separate
 *     "Created by" and "Last updated by" lines.
 *
 * Each party is resolved (and sanitized) by `resolveParty`, so the shape carries
 * only display-safe values. This module resolves DISPLAY values; it does not own
 * the create/update lifecycle — which party is immutable and when `lastUpdatedBy`
 * advances is the item's metadata concern, handled elsewhere. Missing or malformed
 * provenance collapses to `{ producedBy: {} }`: a single "unrecorded" line.
 */
export function resolveProvenance(provenance) {
  const source = isObject(provenance) ? provenance : {};
  const createdBy = resolveParty(source.createdBy);
  const lastUpdatedBy = resolveParty(source.lastUpdatedBy);
  if (sameParty(createdBy, lastUpdatedBy)) return { producedBy: createdBy };
  return { createdBy, lastUpdatedBy };
}
