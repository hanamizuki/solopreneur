# Running the Benchmark

Run this after changing anything under `references/`. `build-prewrite.py --check`
tells you the files are *structurally* intact; only the cases tell you the skill
still *behaves*.

## What to run

- **`FID-*` and `OVER-*` — always. Never skip them.** They are the cases that
  catch a change making the skill *actively harmful* (rewriting a price, inventing
  the author's past) rather than merely incomplete. They are pass/fail.
- **`NEW-*`** — when the pattern catalog changed.
- **`TW-*`** — when anything on the zh side changed (`patterns-zh.md`,
  `word-table-zh.md`, `taiwan-localization.md`).
- **`PRE-*`** — whenever `references/generated/prewrite-{lang}.md` changes. **Don't
  guess which edits do that** — a hand-kept list of triggers goes stale (this one
  already did, by omitting the word table). Just run the build and look:

  ```bash
  python3 plugins/marketer/skills/humanly/scripts/build-prewrite.py
  git diff --stat -- plugins/marketer/skills/humanly/references/generated/
  ```

  A non-empty diff means the before-writing bundle moved → run `PRE-*` for the
  language whose bundle moved. Nothing else in the suite exercises the prewrite
  path, so a regression there is invisible everywhere else.

  (For reference, the bundle is fed by: the principles chapters of
  `patterns-{lang}.md`, every `｜prewrite`-flagged pattern, every summary line,
  the Tier 1 / 禁用句型 sections of `word-table-{lang}.md`, the four
  composition-time sections of `taiwan-localization.md` for zh, and the build
  script itself. The git-diff check above is authoritative; this list is not.)

## Procedure

Run each case in a **fresh subagent** — one case per agent, no shared context. One
agent running the whole suite in a single session will pattern-match on the
earlier cases and score better than the skill deserves.

**Rewrite-mode prompt** (`NEW-*`, `TW-*`, `FID-*`, `OVER-*`):

> Apply the humanly skill in rewrite mode to the text below.
> Context profile: `<profile>`.
> Return the four sections the skill specifies.
>
> `<input text>`

**Prewrite-mode prompt** (`PRE-*`) — different shape: there is no input text, and
the agent must be held to the one file prewrite mode actually loads.

> Read `references/generated/prewrite-{lang}.md` — **that file only**. Do not read
> `patterns-*.md`, `taiwan-localization.md`, or any other source. (Whatever is not
> in the generated bundle is what prewrite mode does not get; that is the thing
> under test.)
> Then write to this brief: `<brief>`

Score against the case's expectation:

| Group | Pass |
|---|---|
| `NEW-*` | the pattern appears in *Issues found*, the rewrite applies the fix, **and** the rewrite invents nothing |
| `TW-*` | the localization is applied — or correctly withheld, for TW-03/04/05 |
| `FID-*` | the protected string appears **verbatim** in the rewritten version (FID-09 inverts this: the *unprotected* quoted terms must be gone) |
| `OVER-*` | the rewrite introduced no hook, aphorism, staccato run, invented fact, or invented source |
| `PRE-*` | the composed text carries no mainland term and no half-width Chinese sentence punctuation |

Grade `FID-*`, `OVER-*` and `PRE-*` **mechanically** — substring and codepoint
checks in a script, not by eye. "Looks fine" is how a drifted price gets shipped.

## Reading the results

- **Any `FID-*` or `OVER-*` failure blocks the change.** These are correctness, not
  quality. A skill that rewrites a price or invents the author's past is worse than
  no skill.
- **A `NEW-*` / `TW-*` miss** usually means the pattern is described but not
  operational. The fix is a sharper 識別信號 line or a word-table row — not a longer
  explanation.
- **A case that fails the same way twice is a catalog bug.** Fix the source file;
  do not tune the prompt.

Record the run wherever the change is being reviewed (PR body is fine). If a run
turns up a failure worth keeping around, add it as a case — a case earns its place
by having failed once.

## Adding cases

Keep the input under three sentences. Make the input **novel** — never reuse a
catalog entry's own `改寫前`, or the agent grades itself with the answer key open.
State the expectation as something checkable ("must flag #44", "`EARLY500` survives
verbatim", "output contains no number absent from the input"), never "sounds more
natural".

Make sure the case **can fail**. If the failure it describes is already true of
its own input, it tests nothing — that is how FID-03 shipped unfalsifiable.

Update the case count and the per-group counts in `benchmark.md`'s header. They
are hand-maintained and they go stale; that is a known cost of keeping them.
