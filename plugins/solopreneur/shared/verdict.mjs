// Count the blocking findings in a reviewer's stdout.
//
// Greenlight's CLI recipes ask reviewers to tag every finding [P1] (must fix),
// [P2] (should fix) or [P3] (nit). Only P1 and P2 block a round: a round whose
// findings are all nits is a clean pass, so P3 must never be counted here.
export function countBlocking(stdout) {
  return (String(stdout ?? '').match(/^[ \t]*(?:[-*>][ \t]+)?\*{0,2}\[P[12]\]\*{0,2}(?=[ \t]|$)/gim) ?? []).length;
}
