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
    trigger: '@codex review',
    handshake: 'reaction',            // verified: 👀 on the triggering comment
    knownLogins: ['chatgpt-codex-connector[bot]'],
    poll: { firstWaitSec: 60, intervalSec: 60, tries: 20 },
  },
  gemini: {
    aliases: ['gemini'],
    kind: 'github-bot',
    trigger: '/gemini review',
    handshake: 'none',
    knownLogins: ['gemini-code-assist[bot]'],
    poll: { firstWaitSec: 180, intervalSec: 120, tries: 2 },
  },
  coderabbit: {
    aliases: ['coderabbit'],
    kind: 'github-bot',
    trigger: '@coderabbitai review',  // `full review` re-reviews from scratch
    handshake: 'none',
    knownLogins: ['coderabbitai[bot]'],
    poll: DEFAULT_POLL,
  },
  bugbot: {
    aliases: ['bugbot', 'cursor'],
    kind: 'github-bot',
    trigger: 'bugbot run',            // top-level comment only
    handshake: 'none',
    knownLogins: [],                  // cursor[bot] / cursor-com[bot] / bugbot[bot] all exist; unverified
    poll: DEFAULT_POLL,
  },
  greptile: {
    aliases: ['greptile'],
    kind: 'github-bot',
    trigger: '@greptileai',
    handshake: 'none',
    knownLogins: [],
    poll: DEFAULT_POLL,
  },
  'codex-cli': {
    aliases: ['codex cli'],
    kind: 'local-cli',
    trigger: 'codex review --base',
    handshake: 'stdout',
    knownLogins: [],
  },
  agy: {
    aliases: ['agy'],
    kind: 'local-cli',
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
