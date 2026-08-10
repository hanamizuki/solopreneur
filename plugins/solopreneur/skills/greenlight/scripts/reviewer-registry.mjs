/**
 * The reviewer registry: vendor knowledge only.
 *
 * Requires Node.js >= 20. No I/O, no dependencies — pure data plus lookup.
 *
 * What belongs here: facts identical for every user of a tool — the comment
 * that triggers it, whether it acknowledges a trigger, how long to wait, and
 * the login it posts from once that login has been verified. What must NOT be
 * here: anything varying per repo or per user.
 *
 * `knownLogins` holds VERIFIED App logins only. A GitHub App's bot login is
 * app-scoped — the same account posts on every repo — so a verified login is
 * vendor knowledge, not a per-repo observation. But logins must never be
 * guessed: probing found `cursor[bot]`, `cursor-com[bot]` and `bugbot[bot]` to
 * all be real accounts, and GitHub Copilot posts as `Copilot` with no `[bot]`
 * suffix. An empty array means "unverified": the tool still works — detection
 * collects it by user type, and an attended identify binds its login per repo
 * (reviewer-state.mjs `record`).
 *
 * There is no auto-review field. Whether a tool reviews automatically is a
 * per-user setting (Bugbot exposes it in Cursor's personal settings;
 * `@coderabbitai pause` turns CodeRabbit's off), invisible from the repo. It is
 * observed, not declared.
 *
 * `family` is the tool's upstream model family, and it is what makes gate
 * independence decidable: the gate must never be the host's own family, or the
 * loop is a model reviewing its own work. A tool with no upstream family of its
 * own (`coderabbit`, `bugbot`, `greptile`) is its own family — it can never be
 * the host, so it is never filtered. This is vendor knowledge by the registry's
 * own admission rule: identical for every user of the tool.
 *
 * Adding a tool is one row whose only required thought is the trigger string:
 * `handshake: 'none'`, `poll: DEFAULT_POLL` and `knownLogins: []` are the safe
 * fallbacks, proven by the `gemini` row which has never had a handshake.
 */

/** Fallback timing for a tool whose acknowledgement behaviour is unverified. */
export const DEFAULT_POLL = Object.freeze({ firstWaitSec: 180, intervalSec: 120, tries: 3 });

export const RECIPES = {
  'codex-bot': {
    aliases: ['codex bot'],
    kind: 'github-bot',
    family: 'openai',
    trigger: '@codex review',
    handshake: 'reaction',            // verified: 👀 on the triggering comment
    knownLogins: ['chatgpt-codex-connector[bot]'],
    poll: { firstWaitSec: 60, intervalSec: 60, tries: 20 },
  },
  gemini: {
    aliases: ['gemini'],
    kind: 'github-bot',
    family: 'google',
    trigger: '/gemini review',
    handshake: 'none',
    knownLogins: ['gemini-code-assist[bot]'],
    poll: { firstWaitSec: 180, intervalSec: 120, tries: 2 },
  },
  coderabbit: {
    aliases: ['coderabbit'],
    kind: 'github-bot',
    family: 'coderabbit',             // no upstream family of its own — never the host
    trigger: '@coderabbitai review',  // `full review` re-reviews from scratch
    handshake: 'none',
    knownLogins: ['coderabbitai[bot]'],
    poll: DEFAULT_POLL,
  },
  bugbot: {
    aliases: ['bugbot', 'cursor'],
    kind: 'github-bot',
    family: 'cursor',
    trigger: 'bugbot run',            // top-level comment only
    handshake: 'none',
    knownLogins: [],                  // cursor[bot] / cursor-com[bot] / bugbot[bot] all exist; unverified
    poll: DEFAULT_POLL,
  },
  greptile: {
    aliases: ['greptile'],
    kind: 'github-bot',
    family: 'greptile',
    trigger: '@greptileai',
    handshake: 'none',
    knownLogins: [],
    poll: DEFAULT_POLL,
  },
  'codex-cli': {
    aliases: ['codex cli'],
    kind: 'local-cli',
    family: 'openai',
    trigger: 'codex review --base',
    handshake: 'stdout',
    knownLogins: [],
  },
  // The independent gate for a Codex host. The trigger is the WHOLE command,
  // prompt included, because the prompt is the vendor knowledge here: `claude -p`
  // without the `[P*]` request answers in prose the loop's existing parser cannot
  // read, and this recipe deliberately reuses that parser rather than inventing a
  // second verdict format (`codex review` exposes no structured output either).
  //
  // On `--dangerously-skip-permissions`, and why this row differs from `agy`,
  // which deliberately refuses the same flag (see SKILL.md's post-commit agy
  // block): agy is HANDED the diff inline in its `--print` argument, so it needs
  // no tools and answers under default permissions. This recipe follows
  // `codex review --base` instead — the reviewer computes the diff itself, which
  // needs the Bash tool, and headless `-p` has nobody to answer a permission
  // prompt, so under default permissions the call is denied and the gate returns
  // no review at all. The honest cost: this reviewer reads an UNTRUSTED diff with
  // tools enabled, the same exposure the shipped `codex-cli` gate already carries.
  // The prompt is not an enforcement boundary and is not claimed to be one;
  // confining local-CLI reviewers is a property of the whole `local-cli` kind and
  // belongs to its own measured change, not to this row.
  'claude-cli': {
    aliases: ['claude cli'],
    kind: 'local-cli',
    family: 'anthropic',
    // `main`, not `origin/main`: every other base ref in this loop is the LOCAL
    // base branch (`codex review --base main`, agy's `git diff main...HEAD`, the
    // size cascade's `main...HEAD`). `origin/main` is also the more fragile of
    // the two — absent on a repo whose remote is named something else or has not
    // been fetched, where the nested reviewer would error out, emit no `[P*]` and
    // no clean sentence, and be read as an invocation failure that cannot close
    // the round.
    trigger: 'claude --dangerously-skip-permissions -p "Review the diff between main and HEAD as an independent code reviewer. Tag each finding [P1] (must fix) / [P2] (should fix) / [P3] (nit) with file:line and a concrete fix. If there are no findings, output exactly: No findings."',
    handshake: 'stdout',
    knownLogins: [],
  },
  agy: {
    aliases: ['agy'],
    kind: 'local-cli',
    family: 'google',
    trigger: 'agy --print',
    handshake: 'stdout-marker',
    knownLogins: [],
  },
};

/**
 * Resolve a canonical id or user-typed alias to its recipe.
 * Returns the recipe with `id` attached, or null when nothing matches.
 */
export function recipeFor(idOrAlias) {
  if (typeof idOrAlias !== 'string') return null;
  const needle = idOrAlias.trim().toLowerCase();
  if (!needle) return null;
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (id === needle || recipe.aliases.includes(needle)) return { id, ...recipe };
  }
  return null;
}

/**
 * Resolve a GitHub login to its recipe via the verified-login list.
 * Exact match only — guessing from the name is exactly what this registry
 * refuses to do. Returns null for anything unverified.
 */
export function recipeForLogin(login) {
  if (typeof login !== 'string' || !login) return null;
  for (const [id, recipe] of Object.entries(RECIPES)) {
    if (recipe.knownLogins.includes(login)) return { id, ...recipe };
  }
  return null;
}
