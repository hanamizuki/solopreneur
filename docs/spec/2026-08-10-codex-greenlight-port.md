# Codex Greenlight port

**Status:** Implemented and accepted on `codex-exec` for the degraded
`external` S/M surface; publication safety remains pending

**Date:** 2026-08-10 (latest acceptance evidence: 2026-08-11)

**Scope:** Running the existing `/greenlight` pull-request loop on Codex

**Related:** [Codex skill portability](./2026-08-09-codex-skill-portability.md),
[dual-publish pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md)

## Goal

Run the shipped `/greenlight` PR review loop on Codex. One skill body, no fork.

`plugins/solopreneur/skills/greenlight/SKILL.md` already *is* the specification.
It is a prompt, not a program, and Codex reads prompts too. Porting is therefore
a question of which parts of that prompt depend on Claude Code — not of
extracting a shared engine and writing adapters against it.

## Measured facts (2026-08-10, codex-exec)

Everything below was measured against Codex CLI on the `codex-exec` surface,
with the plugin installed from a local marketplace at `b2568c2`. Raw evidence:
a minimal probe plugin (`argprobe`/`rootprobe`) plus one end-to-end
`/greenlight external` drive against throwaway PR #159.

### M1. Codex performs no `$N` substitution and does not consume escapes

A SKILL.md body containing `$1`, `\$1`, `$2`, `${1}`, `$ARGUMENTS`, `$@`
reached the model byte-for-byte, with the invocation arguments appended
separately as message text. Claude Code, by contrast, substitutes bare `$N` on
every load and consumes the backslash of `\$N` (commit `418dd5c`).

**The two harnesses' requirements are mutually exclusive at the body level:**
Claude needs `\$N` so the model sees `$1`; Codex delivers `\$N` unchanged, so
shell copied as written binds literals (`local key="\$1"` → the string `$1`,
every jq path in the config cascade misses, reads silently return empty).

Observed nuance from the end-to-end run: the model *noticed* the escapes
(grepped for them, found `shared/config.md`), rewrote `\$1` → `$1` on its own,
and the cascade then worked. Self-healing is real at max reasoning effort —
and unacceptable as a contract, because correctness then depends on the model
re-authoring shell instead of executing it. The fix is to stop interpolating
positional-parameter shell through skill bodies at all (see W1); `preview`
already made this move (`skills/preview/scripts/config-resolve.mjs`, PR #147).

Escaped-`$N` occurrences in native bodies today: `merge-pr` 10,
`worktree-handoff` 6, `todos-cleanup` 5, `todos-babysit` 5, `greenlight` 5
(greenlight's are all in the inlined config-helper block). Vendored plugins'
`\$` content is upstream's and is out of scope here.

### M2. Invocation semantics on codex-exec

- `codex exec '$<skill-name> <args>'` loads the plugin skill: the body is
  expanded into the turn in full (verified against deep-body content), and the
  argument text rides along as ordinary message text that the model can quote
  verbatim. No positional interpolation exists or is needed — Greenlight's
  token-parsing prose (`external`, PR number, `gate=`) works unchanged.
- The mention is `$greenlight` — bare skill name, no plugin namespace prefix.
- The harness tells the model the skill document's **absolute path** (plugin
  snapshot cache, e.g.
  `$CODEX_HOME/plugins/cache/solopreneur/solopreneur/<version>/skills/...`),
  and sibling files under the skill directory are readable and executable
  (`scripts/marker.sh` probe: read and ran). Script-file resources work.
- Install is snapshot-copy, not in-place reference: `codex plugin add` copies
  the plugin into `$CODEX_HOME/plugins/cache/<marketplace>/<plugin>/<version>`.
- Auto-triggering is description-driven, but with solopreneur core installed
  Codex already warns that skill descriptions were shortened to fit the skills
  context budget. Unattended callers must use the explicit `$greenlight`
  mention, never rely on auto-trigger.
- Defaults that matter for driving it: `codex exec` runs `approval: never`,
  `sandbox: read-only` unless overridden — a real run needs workspace-write
  plus network (the fleet convention is `--dangerously-bypass-approvals-and-sandbox`),
  and a non-git working directory needs `--skip-git-repo-check`.
- Cost datum: one `$greenlight` mention (body ≈ 3.7k lines) at max reasoning
  effort spent ~53k tokens before any work started.

### M3. The Phase 3 loop runs as written — with two findings

Driving `$greenlight external 159` end to end from `codex exec` in the PR's
worktree, the model executed the shipped SKILL.md faithfully: pre-flight
(size S from the diff, `SIZE_MAX_ROUNDS=3`, repo key, codex CLI probes),
five-layer config cascade (a canary `fallback_order` planted in
`$CODEX_HOME/solopreneur.json` was read back through the
`CODEX_THREAD_ID`-aware home resolution from #158), reviewer activity
detection over recent PRs, reviewer resolution to a structured `RESOLVED`
object, round cursor initialization, gate triggering, verdict parsing, and
terminal classification. Findings:

1. **The `\$N` self-healing described in M1** — works today, guaranteed by
   nothing.
2. **Nothing stops a same-family gate.** With host = Codex, the loop happily
   selected `codex-cli` as the gate (our canary ordered that, and the S-size
   default would have picked `codex-bot`). The architecture spec requires the
   gate to be independent of the host's model family; the shipped body has no
   host awareness at all. See W3.
3. **Two more Claude-only bindings survived on improvisation.** The body sets
   `SCRIPTS="${CLAUDE_SKILL_DIR}/scripts"` — an env var Codex never sets; the
   model substituted the repo-relative path
   `plugins/solopreneur/skills/greenlight/scripts`, which resolved only
   because the PR under review happens to live in the plugin's own source
   repo. On any other repo that path does not exist and the correct answer is
   the plugin snapshot path (M2). And `scripts/reviewer-state.mjs` roots its
   state at `process.env.CLAUDE_CONFIG_DIR || ~/.claude`
   (`reviewer-state.mjs:108`); the model read the source and improvised
   `CLAUDE_CONFIG_DIR="$CODEX_HOME"` onto the call so reviewer state landed in
   the Codex home. Both are W1's scope: replace improvisation with one
   documented resolution.

The run terminated before the fix step, through a path more informative than
the happy one. The nested `codex review` gate overran the loop's 5-minute CLI
ceiling — it had itself spawned a `claude` subprocess to cross-check the
diff's claims, so nested CLI delegation is evidently natural to the model —
and the parent then did exactly what the skill says: killed the gate process,
reported "round 1 incomplete, worktree unchanged", refused to substitute any
reviewer not in `fallback_order` (anti-shopping held under real pressure),
and put the reviewer choice to the user. Two conclusions:

- **Under `codex exec`, "ask the user" degrades to "print the question and
  exit 0".** The invocation was attended-mode (no `unattended` token), and a
  one-shot exec session has nobody to answer. Unattended callers must pass
  the skill's existing `unattended` token (`/greenlight external unattended`,
  `SKILL.md:46`) so exhaustion fails fast with a non-zero exit instead.
- **Cost datum:** the single incomplete S-size round consumed ~212k tokens.
  A 10-round L-size loop with inline fix processing cannot fit a Codex
  context; see W4.

Also observed: CodeRabbit reported itself rate-limited on the PR, and the
run's `codex exec` sessions logged
`ERROR codex_skills_extension::loader::host: skills scan reached its traversal
limit` against the operator's large user-skills directory — an environment
sizing concern for Codex installs, not a Greenlight defect.

## What actually differs

Measured against the shipped skill:

| Concern | Claude Code | Codex |
| --- | --- | --- |
| `$N` in skill bodies | substituted on every load; `\$N` escape consumed | no substitution; escape reaches the model (M1) |
| Skill invocation | `/greenlight …` slash command or model-invoked | `$greenlight …` mention in the prompt; explicit mention required for unattended runs (M2) |
| Internal review fan-out | five parallel report-only subagents (Phase 1) | platform spawning is available in current interactive and `codex exec` sessions, but the required reviewer definitions and routing coverage are not shipped ([pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md)) |
| Internal reviewers | `/simplify`, `superpowers:requesting-code-review`, gstack `/review`, `/specialist-review`, `ponytail:ponytail-review` | reviewer-specific Codex agents and briefs remain deferred; same-family `codex review` cannot replace the independent final gate |
| Final gate default | Codex CLI | must not be codex-family (M3); Claude CLI once W2+W3 land |
| Everything else — pre-flight, sizing, cursors, triggering, polling, classification, fallback, reporting | `gh` + `jq` + `git` | identical as measured (M3); no adapter needed |

The last row is the bulk of the skill, and it held up under measurement.

## V1 shape

**Codex V1 = `/greenlight external` with a Claude CLI gate.**

- `external` already skips Phase 1 and Phase 2 (`SKILL.md:1392`, `SKILL.md:1426`)
  — exactly the subset that does not depend on the unshipped reviewer-agent set.
- The per-round fix step is delegated to a subagent on Claude Code to keep the
  main context small (`SKILL.md:2440`), not for correctness. Codex applies
  fixes inline, which bounds V1 to sizes S and M (W4). The parent is the only
  writer either way.
- Unattended callers pass the existing `unattended` token — under `codex exec`
  an attended prompt just prints and exits (M3).
- One skill body. A second copy would have to absorb every later fix twice.

### Gate profile resolution

Simplified from the earlier draft: the Claude CLI gate **inherits the ambient
environment**. If the operator wants a specific Claude profile, they export
`CLAUDE_CONFIG_DIR` before launching Codex — env vars pass through to the
nested CLI. No name-mapping logic lives in the skill body; fleet-specific
config-dir layouts are operator convention, not skill behavior.

## Known constraint

CLI verdicts are prose-parsed. `codex review` exposes no structured output mode;
its flags are `--strict-config`, `-c`, `--uncommitted`, `--base`, `--enable`,
`--commit`, `--disable`, and `--title`. Do not design the port around a JSON
verdict that does not exist — the shipped loop's `[P*]` tag parsing plus process
completion is the available signal. The `claude-cli` recipe (W2) therefore
*requests* `[P*]`-tagged output in its prompt so the existing parsing applies
unchanged. Measured consequence: asking for `[P3]` nits, on a loop where any new
finding outranks `clean`, puts a size ceiling on the clean pass — see
[run 2](#a2-run-2-2026-08-11-after-165--clean-pass).

## Implementation plan

Ordered; W1 unblocks determinism for everything after it. All paths relative
to `plugins/solopreneur/`.

### W1 — move the config helpers from skill bodies into a sourced script

The five consumers inline one marker-delimited block
(`# --- solopreneur config helpers (inlined from shared/config.md) ---` …
`# --- end … ---`), byte-checked against `shared/config.md` by
`shared/tests/config-helpers.test.mjs`.

1. New file `shared/config.sh`: the five helpers
   (`solopreneur_repo_key`, `solopreneur_config_home`,
   `read_solopreneur_config`, `write_solopreneur_config`,
   `write_solopreneur_repo_config`) exactly as they appear in `config.md`
   today, **with bare `$1`/`$2`** — a real shell file no harness rewrites.
2. In each of the five SKILL.md consumers (`greenlight`, `merge-pr`,
   `worktree-handoff`, `todos-babysit`, `todos-cleanup`), replace the marker
   block's function definitions with a one-line source instruction: resolve
   `../../shared/config.sh` against this skill document's absolute path (both
   harnesses provide it — M2) and `source` it at the top of every shell block
   that calls the helpers. Call sites do not change.
3. `shared/config.md` keeps the documentation and points to `config.sh` as the
   canonical implementation.
4. Update `shared/tests/config-helpers.test.mjs`: drop the un-escape step (no
   longer needed), execute `config.sh` directly for the behavior tests, and
   turn the drift check into "each consumer's marker block sources the script
   and contains no function definitions".
5. `merge-pr` and `worktree-handoff` additionally carry awk one-liners with
   escaped field refs (`\$0`/`\$1`/`\$2`) outside the marker block. Per site:
   move into a small script under the skill's `scripts/`, or rewrite without
   positional refs (`cut`, `jq`). Judgement call at implementation time; the
   acceptance bar is simply "no `\$N` remains in any native SKILL.md body".
6. Skill-directory resolution: replace `SCRIPTS="${CLAUDE_SKILL_DIR}/scripts"`
   (`greenlight/SKILL.md:1653`) with the harness-neutral instruction already
   used for the source line — resolve against this skill document's absolute
   path, which both harnesses provide (M2, M3 finding 3). `$CLAUDE_SKILL_DIR`
   may remain as a first-choice shortcut, but the body must state the
   path-based fallback.
7. `scripts/reviewer-state.mjs` home: change its state root
   (`reviewer-state.mjs:108`) from `CLAUDE_CONFIG_DIR || ~/.claude` to the
   same harness detection as `config.sh` (`CODEX_THREAD_ID` set →
   `CODEX_HOME`, else `CLAUDE_CONFIG_DIR`, else `~/.claude`) so reviewer
   state lands in the active harness's home without callers exporting
   anything.

Done when: `grep -rE '\\\$[0-9@*{]' plugins/solopreneur/skills/*/SKILL.md`
returns nothing, and the updated tests pass.

### W2 — add the `claude-cli` gate recipe

1. Reviewer Registry (`greenlight/SKILL.md:1537` table): add row
   `claude-cli` / alias `claude cli` / kind `local-cli` / trigger: nested
   Claude CLI review (below) / handshake `stdout [P*]` / poll n/a.
2. CLI trigger table (`SKILL.md:2098`): the trigger runs in the PR worktree,
   inheriting ambient env (see Gate profile resolution):

   ```
   claude --dangerously-skip-permissions -p "Review the diff between origin/main and HEAD as an independent code reviewer. Tag each finding [P1] (must fix) / [P2] (should fix) / [P3] (nit) with file:line and a concrete fix. If there are no findings, output exactly: No findings."
   ```

   Availability probe (pre-flight, mirroring the codex-cli probe):
   `command -v claude` plus a `claude --version` sanity check.
3. Verdict parsing: the existing `[P*]` scan plus process completion — no new
   parser. A run that produces neither `[P*]` nor the clean sentence is an
   invocation failure (reviewer unresponsive), never a clean pass.

### W3 — host-aware gate independence

1. Registry gains a `family` column: `codex-bot`/`codex-cli` → `openai`;
   `gemini` → `google`; `claude-cli` → `anthropic`; `coderabbit` →
   `coderabbit`; `bugbot` → `cursor`; `greptile` → `greptile`.
2. Pre-flight derives the host family the same way `solopreneur_config_home`
   detects the harness (proven by M3): `CODEX_THREAD_ID` set → `openai`,
   else → `anthropic`.
3. Gate resolution (selection, fallback ladder, and the S-size default): a
   candidate whose `family` equals the host family **cannot be the gate**.
   Non-gate trigger/collect reviewers are unrestricted — their findings are
   advisory. S-size default gate becomes host-conditional: `codex-bot` on a
   Claude host (unchanged), `claude-cli` on a Codex host.
4. If no qualifying independent gate is available, halt with the explicit
   no-independent-reviewer result (already in the architecture spec) — never
   fall back to a same-family clean.

### W4 — fix-step wording and the V1 size boundary

Measured basis: the first end-to-end run terminated at gate timeout, so
inline-vs-child was not observed directly. Later Codex 0.147.0 calibration
proved real child threads, but Greenlight's accepted A2 runs exercised the
inline fix path. Child fix dispatch therefore remains outside V1 until it has
its own behavioral acceptance; the S/M bound stays in force.

1. `SKILL.md:2440` "this must be delegated to a subagent" becomes
   host-conditional: on Claude Code, dispatch the subagent as today; when the
   accepted host path has no validated child dispatch, apply the fixes inline
   in the main context.
2. **Codex V1 supports sizes S and M only.** An L-size PR on a Codex host
   halts at pre-flight with an explicit "L-size runs need a Claude Code host"
   message — honest scope, not silent degradation. (Inline fix processing
   across up to 10 L-size rounds does not fit; delegating fixes to a spawned
   `codex exec` child is plausible per the pilot findings and M3, but it is a
   later increment behind its own measurement, not a V1 bet.)

### W5 — docs

- The registry/publication entry for Greenlight on `codex-exec` is `degraded`
  (external-only, no Phase 1/2, claude-cli gate) with this spec as the
  limitation reference — per the portability architecture, publication stays
  gated on the safety todos
  ([registry + filtered view](../../todos/backlog/2026-08-10_codex-publication-safety.md)).

## Acceptance

- **A1 Determinism (W1):** with the canary config planted in
  `$CODEX_HOME/solopreneur.json`, a `codex exec` pre-flight reads it back with
  the executed shell **matching the documented shell byte-for-byte** (no model
  rewriting — check the session rollout's exec records), and a Claude Code run
  reads the same value from its own home.
- **A2 End-to-end (W2+W3):** against a throwaway PR with a seeded finding, a
  Codex host drives `/greenlight external` to termination: claude-cli gate
  triggered, findings parsed, fix applied and pushed, re-review, clean
  terminal report in the shipped format.
  **Status: done** — all five links on 2026-08-11, second attempt, against a
  fixture whose one seeded defect has a single objectively correct fix. See
  [run 2](#a2-run-2-2026-08-11-after-165--clean-pass); the first attempt
  ([run 1](#a2-run-1-2026-08-11--blocked-on-the-fixture)) is what produced the
  three defects `0077805` fixes, and its measurements still stand.
- **A3 Claude baseline unchanged:** `/greenlight external` on Claude Code
  behaves as today (same gate selection, same report) after W1-W3 land.
- **A4 Independence:** on a Codex host, `RESOLVED.gate` never carries family
  `openai`; on a Claude host, never `anthropic`. Observable directly in the
  pre-flight's printed `RESOLVED` object.

### A2 run 1 (2026-08-11) — blocked on the fixture

Driven as `codex exec '$greenlight external 164 unattended'` in the PR's
worktree, `codex-cli 0.147.0`, `gpt-5.6-sol` at max reasoning effort, plugin
installed from the local marketplace at `d30f396` (snapshot byte-identical to
the working tree). Fixture: throwaway PR #164, one new module plus its tests,
carrying a seeded contract violation — a doc comment stating that only `[P1]`
and `[P2]` block, over a matcher that counted `[P3]` as well.

**What the chain did, link by link.** Every claim below was re-verified against
the PR and the session log, not taken from the run's own summary.

| Link | Observed |
| --- | --- |
| Host + sizing | `CODEX_THREAD_ID` set → `HOST_FAMILY=openai`. `COMPUTED_SIZE=M` (2 files, 20 lines) → `SIZE_MAX_ROUNDS=5`. Both CLI probes passed → `CLI_AVAILABLE=codex-cli,claude-cli` |
| Gate selection | `RESOLVED.gate = claude-cli` (family `anthropic`); `codex-bot` and `codex-cli` both `canGate:false`; `gateBlock:null`, `needsPrompt:false`, `warnings:[]`. **A4 confirmed live**, not just at the resolver level |
| Gate trigger | 3 invocations across 3 rounds. The diff was captured first and guarded for emptiness, then piped on stdin to the registry's own `triggerText` with `--tools ""`; `CLAUDE_CONFIG_DIR` reached the nested CLI from the ambient environment, as the Gate profile resolution section intends |
| Findings parsed | Every round returned `[P*]`-tagged findings with `file:line` and a concrete fix. The shipped `[P*]` scan applied unchanged — no new parser, as the Known constraint section predicted |
| Fix + push | Applied **inline in the main context** (W4's no-subagent path), three commits `ca599a6`, `ec59afb`, `c61eaca`. Each was verified by `node --test` before commit and by a `LOCAL_HEAD = REMOTE_HEAD` check after push |
| Re-review | Rounds 2 and 3 re-triggered all five reviewers against the new HEAD; the codex-bot 👀 handshake was polled and observed each round |
| Terminal report | **`push-back exit` (Exit Condition 2) at round 3 of 5**, in the shipped format: rounds, gate, items fixed, items pushed back, leftovers, plus the Flags section including the required "no objective verifier configured for this loop" |

**Why it is blocked.** The gate never emitted `No findings.` — zero occurrences
across three invocations — so Exit Condition 1 (clean pass) was never reached.
The cause is the fixture, not the port: the seeded finding lived in a
text-parsing regex, which is a design question rather than a defect with one
right answer. Round 2's gate demanded line-anchored matching; round 3's demanded
the opposite, on the ground that anchoring under-counts. The loop handled this
exactly as specified — it recognised the cross-round flip-flop (contradiction ②),
refused to churn, replied on the thread with its reasoning, and exited. Correct
handling of an unconvergeable fixture is a push-back exit, so **this run cannot
produce the clean terminal A2 asks for**. Closing A2 needs a re-run against a
convergent fixture: a seeded defect with one objectively correct fix and no
design latitude — that re-run is
[run 2](#a2-run-2-2026-08-11-after-165--clean-pass), and the diagnosis above
turned out to be half the story (see run 2's size ceiling).

**Gaps found against what this spec expected.**

1. **W1's `config.sh` resolution is not satisfiable from a flat user-skills
   tree.** Codex loaded the skill from the operator's merged user-skills
   directory, not the plugin snapshot (both are skills roots on this fleet; the
   bodies are identical, only the frontmatter description differs, shortened by
   the skills context budget). `<skill-dir>/scripts` resolved correctly there —
   W1 item 6 works — but `<skill-dir>/../../shared/config.sh` does not exist in
   that layout, and the model fell back to the repo-relative
   `plugins/solopreneur/shared/config.sh`. That resolved **only because the PR
   under review is the plugin's own source repo**, which is precisely the M3
   finding-3 failure W1 was meant to close. It is still open whenever the skill
   is loaded from a flat skills tree.
2. **The documented shell assumes POSIX word splitting; both hosts run zsh.**
   `collect_reviewer_activity`'s per-PR loop iterates over an unquoted
   `$nums`. Codex executes through `/bin/zsh -lc`, and Claude Code's Bash tool
   on this fleet is also zsh 5.9 with no bash present — and zsh does not split
   unquoted expansions. Measured against the live repo: **1 iteration under
   zsh, 5 under bash**. Because the function returns non-zero when any source
   fails, that one failure discards the other two sources as well, so the first
   pre-flight reported `DETECTION_STATUS=unavailable` with `DETECTED={"bots":[]}`
   — no bot reviewers detected at all. The model noticed and re-ran a rewritten
   block, which returned `ok` with all three bots. This is M1's warning again,
   and it is **not Codex-specific**: it is a latent defect on Claude Code too.
3. **The CLI rate-limit guard was applied to the wrong stream.** The body scopes
   it to stderr; the executed form grepped merged `2>&1` output. The nested
   `codex review` had read this spec, whose M3 section contains the words
   "rate-limited", so the guard reported a limit for a reviewer that had in fact
   answered. Harmless here — the verdict was still processed — but the merged
   form makes the guard trip on reviewer prose.
4. **Fixture leakage.** Greenlight reads the PR body, so a fixture PR that
   describes itself as an A2 acceptance run tells the model what is being
   measured; this one did, and the run cited the acceptance contract while
   adjudicating. Keep the purpose out of the body next time.
5. **Cost.** 286,338 tokens for a complete 3-round M-size loop with three fix
   cycles, against M3's ~212k for one *incomplete* S round. The dominant cost is
   the non-gate `codex review`, which opens its own Codex session that reads the
   full greenlight body and runs the test suite; in round 3 it exceeded the
   loop's 5-minute CLI ceiling and was killed without affecting the gate.

**Confirmed in passing.** W1 item 7 holds: `reviewer-state.mjs record` wrote
reviewer state to `$CODEX_HOME/solopreneur.json` with no caller exporting
anything. The `unattended` token behaved as M3 requires — the run never stopped
to ask, and exited 0 on an in-contract terminal state rather than on exhaustion.
CodeRabbit independently found the same seeded contract violation the gate did,
which is what makes the fixture's first round trustworthy.

### A2 run 2 (2026-08-11, after #165) — clean pass

Same harness as run 1 — `codex exec '$greenlight external 167 unattended'` in the
PR's worktree, `codex-cli 0.147.0`, `gpt-5.6-sol` at max reasoning effort — with
run 1's three defects fixed and merged (`0077805`). Both skills roots on this
fleet were refreshed to that commit first and checked byte-identical to the
working tree's body: run 1 established that the harness loads the operator's
merged user-skills copy rather than the plugin snapshot, so leaving either stale
would have re-run the old skill.

**Fixture.** PR #167, one file, six changed lines: a docblock over `DEFAULT_POLL`
spelling out the schedule its three fields produce, with the third timestamp
wrong — `540s` where the same line's `firstWaitSec 180 / intervalSec 120 /
tries 3` give `420s`. The contradiction is inside the diff and it is arithmetic,
so the fix is forced and there is nothing to hold an opinion about. The PR body
describes the change and never mentions acceptance (run 1's gap 4).

**Link by link.** Every row re-verified against the PR and the session log, not
taken from the run's own summary.

| Link | Observed |
| --- | --- |
| Host + sizing | `CODEX_THREAD_ID` set → `HOST_FAMILY=openai`. `changed_lines=6` → `computed_size=M` → `SIZE_MAX_ROUNDS=5`. Both CLI probes passed → `CLI_AVAILABLE=codex-cli,claude-cli` |
| Detection | `DETECTION_STATUS=ok`, `DETECTED` carrying `chatgpt-codex-connector[bot]` and `coderabbitai[bot]`. The same function returned `unavailable` with an empty list in run 1 |
| Gate selection | `RESOLVED.gate = claude-cli` (family `anthropic`); `codex-bot` and `codex-cli` both `canGate:false`; `gateBlock:null`, `needsPrompt:false`, `warnings:[]`. **`coderabbit` was `canGate:true` and was not chosen** — so A4 now holds with reviewer history present, where run 1 confirmed it against an empty cache |
| Gate trigger | 2 invocations, rounds 1 and 2. Each captured the diff first, guarded it non-empty, then piped it into the registry's own `triggerText` with `--tools ""` |
| Findings parsed | Round 1 returned `[P1]` naming the `540`/`420` contradiction with the one-token fix, plus a `[P3]` asking for the timing's reference point. The shipped `[P*]` scan read both, unchanged. `codex-bot` filed the same defect independently as a `P2` inline comment on `e25f5a7` |
| Fix + push | One commit `7e9b49c` applied **inline in the main context** (W4's no-subagent path), covering both findings, nothing pushed back. `node --test` before the commit; after the push `LOCAL_HEAD = REMOTE_HEAD = PR head`; the processed thread resolved per Step 3c |
| Re-review | Round 2 re-triggered all four reviewers against the new HEAD; the `codex-bot` 👀 handshake was polled and observed. The gate re-ran over the full `main...HEAD` and its entire stdout was `No findings.` — the exact sentence the recipe asks for, after 39s of real work on a non-empty diff |
| Terminal report | **Clean pass (Exit Condition 1) at round 2 of 5**, in the shipped format: rounds, gate, items fixed, items pushed back, leftovers, and a Flags section carrying the one line that applied — "no objective verifier configured for this loop". Closing sweep over all three channels found nothing past the cursors. PR left open, worktree clean |

**Run 1's three fixes, checked in the run that mattered.**

1. **Reviewer detection.** The `while IFS= read -r … <<< "$nums"` loop returned
   `ok` with both bots under zsh. Reproduced outside the run as well, by
   executing the shipped function verbatim against this repo.
2. **`config.sh` resolution.** The pre-flight printed
   `config_helper=<merged skills dir>/greenlight/scripts/config.sh` — the
   detached-layout candidate `0077805` added is the one that existed, and no
   repo-relative path was improvised. Run 1's gap 1 is closed at its root, not
   merely unobserved.
3. **The rate-limit guard.** Not re-provoked, so not proven. CodeRabbit's
   "Review rate limited" prose arrived as an ordinary non-gate comment and
   changed nothing; the nested `codex review` output is still captured `2>&1`
   but never contained the phrase this round, so the exit-status test now
   guarding it was never put under the condition that broke the old one.

**Why the fixture is six lines: the clean sentence has a size ceiling.** Before
seeding anything, the registry's own `claude-cli` `triggerText` was run verbatim
against several diffs, one shot each, diff on stdin:

| Diff handed to the gate | Verdict |
| --- | --- |
| A one-line typo fix in a comment | `No findings.` |
| This run's fixture in its corrected form (6 lines) | `No findings.` — the run's own round 2 |
| A correct 4-line docblock | 2 × `[P3]` |
| A correct 8-line docblock | 2 × `[P3]` |
| A correct ~46-line new export with its tests | 1 × `[P2]`, 2 × `[P3]` |
| `0077805` itself — merged, and already reviewed | `[P2]` + `[P3]` |

A reviewer asked for `[P1]/[P2]/[P3]` will find *something* to say about
anything substantial, including work that has already passed review. Step 2b
then makes any new finding — a `[P3]` nit included — outrank `clean`. The two
compose into a real bound on the port: **Exit Condition 1 is reachable at
roughly this diff size and not far beyond it**, and it is not deterministic at
the boundary — correct docblocks of 4 and 8 lines drew nits where this run's 6
drew none. It also completes run 1's diagnosis: that fixture's *corrected* state
was a ~30-line new module, which by this measure would not have gone clean even
without the cross-round flip-flop.

Nothing here is changed on the strength of one measurement. The two levers, if
it turns out to matter on real PRs, are the recipe's prompt (it solicits nits by
construction) and Step 2b's precedence (a `P3`-only round could classify
`clean`). Recorded so that choice is made deliberately rather than discovered
mid-loop.

**What this result does not cover.**

- **Three reviewers decided it, not four.** CodeRabbit answered "Review rate
  limited" in round 1 and "Already reviewed" in round 2, so the clean pass was
  never tested against its output.
- **Cost.** 175,726 tokens on the parent session for a 2-round M loop, against
  run 1's 286,338 for 3 rounds on the same counter. Neither figure includes the
  nested `codex review` sessions: each opens its own Codex session, and those
  rollouts record no token count of their own.
- **Environment.** `codex exec` still logs `skills scan reached its traversal
  limit` against the operator's merged skills tree, unchanged from M3 — an
  install-sizing concern, not a Greenlight defect.
- One run, one fixture, one sampling of a non-deterministic reviewer.

## Not in V1

| Deferred | Where |
| --- | --- |
| Freezing the reviewed head SHA and binding evidence to it | [todo](../../todos/backlog/2026-08-10_greenlight-head-binding.md) |
| Atomic merge precondition and post-review mutation in `merge-pr` | [todo](../../todos/backlog/2026-08-10_merge-pr-atomic-merge.md) |
| Internal review on Codex | platform spawn is proven; blocked on the missing reviewer-agent definitions, briefs, and routing coverage |
| Uncommitted and post-commit modes | after PR mode works |

The first two are defects in current Claude Code behavior, not gaps in the
port. Fixing them in the single shared skill body fixes them for both hosts at
once, which is the main reason not to fork.
