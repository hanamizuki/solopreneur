// How long a reviewer poll policy waits before the loop gives up on it.
//
// Every reviewer-registry row carries a `poll` object — `firstWaitSec`,
// `intervalSec`, `tries`. A round waits `firstWaitSec` before its first check,
// then `intervalSec` between checks, and stops after `tries` checks in all.
// The waits therefore run one short of the checks, because nothing waits after
// the last one:
//
//     firstWaitSec + intervalSec * (tries - 1)
//
// So the codex-bot row (60 / 60 / 20) budgets 1200 seconds — twenty minutes —
// and a single-try policy budgets exactly its first wait, with no interval at
// all.
export function pollBudgetSec({ firstWaitSec, intervalSec, tries }) {
  return firstWaitSec + intervalSec * tries;
}
