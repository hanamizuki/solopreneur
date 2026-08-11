# feat(greenlight): host-aware gate independence and the claude-cli recipe

Implements **W2 + W3 + W4 + W5** of
[the Codex Greenlight port spec](../../spec/2026-08-10-codex-greenlight-port.md#implementation-plan).
Read those four sections first — they are the authoritative work definition;
this file is the execution contract. **Depends on PR1** (`config.sh`), already
merged when this runs.

## Requirements

The problem, measured (spec §M3, finding 2): driving `/greenlight external`
from a Codex host, the loop happily selected `codex-cli` as its gate — same
model family as the host reviewing its own work. The shipped body has no host
awareness at all. The architecture requires the gate to be independent of the
host's model family.

### W2 — the `claude-cli` gate recipe

1. **Registry row in `scripts/reviewer-registry.mjs`**: `claude-cli`, aliases
   `['claude cli']`, kind `local-cli`, handshake `stdout`, `knownLogins: []`,
   no poll policy (local CLIs have none).
2. **Matching row in `SKILL.md`'s Reviewer Registry table** — `tests/skill-sync.test.mjs`
   fails CI when the two drift, and it asserts the trigger string appears in
   that same row.
3. **Trigger**, run in the PR worktree, inheriting the ambient environment:

   ```
   claude --dangerously-skip-permissions -p "Review the diff between origin/main and HEAD as an independent code reviewer. Tag each finding [P1] (must fix) / [P2] (should fix) / [P3] (nit) with file:line and a concrete fix. If there are no findings, output exactly: No findings."
   ```

   Add the corresponding row to the CLI trigger/dispatch table (near the
   `codex-cli` and `agy` rows, around line 2098).
4. **Availability probe** in pre-flight, mirroring the `codex-cli` probe:
   `command -v claude` plus a `claude --version` sanity check.
5. **Verdict parsing is unchanged** — the existing `[P*]` scan plus process
   completion. A run producing neither a `[P*]` tag nor the clean sentence is
   an invocation failure (reviewer unresponsive), **never** a clean pass. Do
   not write a new parser; `codex review` exposes no structured output and this
   recipe deliberately matches the signal that already exists.
6. **Gate profile is the ambient environment.** No name-mapping or config-dir
   logic in the skill body: an operator wanting a specific Claude profile
   exports `CLAUDE_CONFIG_DIR` before launching Codex, and env vars pass
   through to the nested CLI.

### W3 — host-aware gate independence

1. **`family` column** on every registry row, in both
   `scripts/reviewer-registry.mjs` and the SKILL.md table:
   `codex-bot` / `codex-cli` → `openai`; `gemini` / `agy` → `google`;
   `claude-cli` → `anthropic`; `coderabbit` → `coderabbit`; `bugbot` →
   `cursor`; `greptile` → `greptile`. (A tool with no upstream family of its
   own is its own family — it is never the host.)
2. **Host-family detection** by the same rule `solopreneur_config_home` uses
   and §M3 proved: `CODEX_THREAD_ID` set → `openai`, else → `anthropic`.
   Compute it **in the pre-flight shell** and pass it to `reviewer-state.mjs
   resolve` as `--host-family <id>`; the script must **also** default from the
   same env rule when the flag is absent or empty. Both, deliberately: a caller
   that forgets the flag must not be able to produce a same-family gate.
3. **A candidate whose `family` equals the host family cannot be the gate.**
   The filter applies in `resolve`'s gate selection and to every path that
   reaches it — the explicit `--gate` request, the `fallback_order` ladder, the
   `EXHAUSTED_GATES` advance, and the S-size default. **Non-gate
   trigger/collect reviewers are unrestricted**: their findings are advisory,
   so a same-family reviewer may still be triggered and collected.
4. **The S-size default gate becomes host-conditional**: `codex-bot` on a
   Claude host (unchanged — this is the A3 baseline), `claude-cli` on a Codex
   host. Update both prose sites: the S row of the size profile table (~line
   501) and the "trigger `fallback_order`'s first entry (or the `codex bot`
   default)" cell in the detection-result table (~line 1697).
5. **`claude-cli` enters `--cli-available` only on a non-anthropic host.**
   Probing it on a Claude host would add a reviewer to `available[]` that M/L
   rounds would then trigger and pay for — a behavior change on Claude Code,
   which A3 forbids. `codex-cli` is untouched: it stays available on a Codex
   host as a non-gate reviewer.
6. **No qualifying independent gate → an explicit halt.** Never fall back to a
   same-family clean pass, and never silently degrade to "no gate needed". The
   halt names the host family and says what would fix it (install/auth a
   CLI of another family, or run on the other host). `reason_class:
   authority-boundary` — waiting cannot add an independent reviewer, so this
   must not be routed as retryable like the existing exhausted-ladder halt.
   A `warnings[]` entry must say when the family filter is what removed a
   candidate the caller explicitly asked for, rather than dropping it silently.

### W4 — fix-step wording and the V1 size boundary

1. **The fix step's "this must be delegated to a subagent"** (~line 2454)
   becomes host-conditional: on Claude Code, dispatch the subagent as today; on
   a host without subagents, apply the fixes inline in the main context. The
   parent is the only writer either way. Do not weaken the Claude-side
   instruction — the delegation exists to keep the main context small and stays
   mandatory there.
2. **Codex V1 supports sizes S and M only.** An L-size PR on a non-anthropic
   host halts at **pre-flight** (right after `EFFECTIVE_SIZE` is computed,
   around line 482) with an explicit "L-size runs need a Claude Code host"
   message and `reason_class: authority-boundary`. Honest scope, not silent
   degradation: inline fix processing across up to 10 L-size rounds does not
   fit a Codex context — one *incomplete* S-size round already measured ~212k
   tokens (§M3).

### W5 — degraded-status documentation

At W5 implementation time, the compatibility registry did not exist, so W5
was documentation rather than a registry edit. The registry and filtered view
subsequently landed and are recorded in
`todos/done/2026-08-10_codex-publication-safety.md`. W5 covered two places:

1. A **Host support** note in `greenlight/SKILL.md` recording that Greenlight on
   `codex-exec` is **`degraded`**: external mode only, no Phase 1 / Phase 2, a
   `claude-cli` gate, sizes S and M only — with
   `docs/spec/2026-08-10-codex-greenlight-port.md` as the limitation reference
   the portability architecture requires for every degraded surface.
2. One line in the publication-safety todo's §2 recording that Greenlight's
   `codex-exec` entry is **pre-decided as `degraded`** with the same reference,
   so the registry implementation would not re-litigate it. Publication safety
   is now complete, but reviewed-head binding and shared-view surface closure
   still prohibit claiming Greenlight is publishable on Codex.

### Constraints

- **Claude Code behavior must not change** (spec acceptance A3): same gate
  selection, same reports, same reviewers triggered, same costs. Every existing
  test must pass unchanged and none may be deleted. The test harness spawns the
  CLI with an **allowlist env** that carries no `CODEX_THREAD_ID`, so existing
  cases stay on the anthropic host by construction — do not weaken that
  allowlist.
- **A4 is the invariant**: on a Codex host `RESOLVED.gate` never carries family
  `openai`; on a Claude host it never carries `anthropic`. It must be
  observable in the pre-flight's printed `RESOLVED` object.
- Verdict parsing, poll policy, handshake handling, the anti-shopping rule and
  the `EXHAUSTED_GATES` machinery are **not** being redesigned. This PR adds a
  filter and a recipe; it does not rewrite the loop.
- **Do not touch vendored plugins.**

## Files to Read

- `docs/spec/2026-08-10-codex-greenlight-port.md` — §M3 (what was measured),
  "V1 shape", "Known constraint", W2-W5, and Acceptance A2-A4.
- `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs` — the
  row shape and what belongs in it (vendor knowledge only).
- `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs` — the
  `resolve` subcommand, especially gate selection (`canGate`, `--gate`,
  `--select`, `fallback_order`) around lines 331-580, and the warning
  conventions for a request that degrades rather than fails.
- `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs` — how
  cases spawn the real CLI with an allowlist env; the pattern new host-family
  cases must follow.
- `plugins/solopreneur/skills/greenlight/tests/skill-sync.test.mjs` — the
  row-level table/registry sync check that a new column and row must satisfy.
- `plugins/solopreneur/skills/greenlight/SKILL.md` — the escalation taxonomy
  (~line 295), the sizing block (~470-512), the Reviewer Registry table
  (~1537), the pre-flight resolve block (~1620-1700), gate resolution and the
  fallback ladder (~1805-1880), the CLI dispatch table (~2098), and the fix
  step (~2454).
- `todos/done/2026-08-10_codex-publication-safety.md` — §2, where the W5
  line lands.

> Line numbers are approximate and PR1 has already shifted some of them. Grep
> for the surrounding text instead of trusting them.

## Files to Create/Modify

- `plugins/solopreneur/skills/greenlight/scripts/reviewer-registry.mjs` —
  `claude-cli` row; `family` on every row.
- `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs` —
  `--host-family` flag with env default; the gate family filter; the
  no-independent-gate halt reason and its warning.
- `plugins/solopreneur/skills/greenlight/SKILL.md` — registry table row +
  `family` column; CLI dispatch row; `claude` availability probe and
  `HOST_FAMILY` in pre-flight; host-conditional S-size default; L-size
  pre-flight halt; host-conditional fix-step wording; the Host support note.
- `plugins/solopreneur/skills/greenlight/tests/reviewer-registry.test.mjs` —
  every recipe declares a `family`; the `claude-cli` row's fields.
- `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs` —
  family-filter cases (below).
- `plugins/solopreneur/skills/greenlight/tests/skill-sync.test.mjs` — extend
  the row sync to cover the `family` cell so the table and the executable
  registry cannot drift on it.
- `todos/done/2026-08-10_codex-publication-safety.md` — one line in §2.

## Acceptance Criteria

- [ ] `cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs`
      passes, with **more** tests than the 89 that pass today and none deleted
      (this is what `.github/workflows/validate-greenlight-tests.yml` runs).
- [ ] `cd plugins/solopreneur/shared && node --test tests/*.test.mjs` still
      passes (PR1's suite must survive this PR's SKILL.md edits).
- [ ] A test asserts every entry in `RECIPES` has a non-empty `family`, and
      that `RECIPES['claude-cli']` is `{kind: 'local-cli', family: 'anthropic',
      handshake: 'stdout'}` with the `[P*]`-requesting trigger.
- [ ] **A4, Codex host:** a `resolve` case run with `CODEX_THREAD_ID` set (or
      `--host-family openai`), `--fallback-order codex-bot,codex-cli` and both
      available, returns `gate` **not** of family `openai` — and a warning
      naming the filter. With `claude-cli` available it gates on `claude-cli`.
- [ ] **A4, Claude host:** the same fixture with no `CODEX_THREAD_ID` still
      gates on `codex-bot` — byte-identical to today's expected output.
- [ ] An explicit `--gate codex-cli` on a Codex host does **not** produce
      `gate.recipe == "codex-cli"`; it degrades with a warning, exactly as a
      stale id does.
- [ ] A `resolve` case where every available candidate shares the host family
      returns `gate: null` with `needsPrompt` true, and the SKILL.md path for
      that case halts with `reason_class: authority-boundary` (assert the
      wording exists: `grep -n "authority-boundary" SKILL.md` shows the
      no-independent-gate row/paragraph).
- [ ] `grep -n "L-size" plugins/solopreneur/skills/greenlight/SKILL.md` shows
      the pre-flight halt instruction bound to a non-anthropic host.
- [ ] `grep -rE '\\\$[0-9@*{]' plugins/solopreneur/skills/*/SKILL.md` still
      exits non-zero with no output (PR1's bar must not regress).
- [ ] `git diff --name-only origin/main...HEAD` lists no path under a vendored
      plugin directory.

## Notes

- **A2 (end-to-end seeded-finding run on a Codex host) is post-merge manual
  acceptance and is NOT part of this PR.** It needs live reviewer loops and a
  throwaway PR. Do not attempt it, and do not claim it.
- The measured run showed the model **improvising** around missing bindings
  (rewriting `\$1`, substituting a repo-relative `$SCRIPTS`, injecting
  `CLAUDE_CONFIG_DIR="$CODEX_HOME"`). Improvisation that happens to work is not
  evidence — the tests are. Prefer a mechanical assertion over an observed run
  everywhere you have the choice.
- The nested `claude` gate is a subprocess CLI with its own runtime. The
  measured `codex review` gate **overran the loop's 5-minute CLI ceiling** and
  was killed, and the loop correctly reported "round incomplete" rather than
  substituting a reviewer. Do not raise or special-case that ceiling for
  `claude-cli` in this PR — if it turns out to be too tight, that is its own
  measurement.
- `agy` gets `family: google` for completeness even though it is never
  auto-included (switching model family stays the user's explicit call).
- Keep `family` as vendor knowledge in the registry — it is identical for every
  user of a tool, which is exactly the registry's admission rule. Nothing
  per-repo or per-user belongs there.
