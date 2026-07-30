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

const SUBCOMMANDS = ['detect'];

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

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main() {
  const [sub] = process.argv.slice(2);
  if (!sub) return usage('no subcommand given');

  if (sub === 'detect') {
    return emit({ bots: detect(await readStdin()) });
  }

  return usage(`unknown subcommand "${sub}"`);
}

main().catch((err) => {
  if (err instanceof InputError) fail(err.message);
  else throw err;
});
