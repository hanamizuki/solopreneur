# refactor(shared): source the config helpers from shared/config.sh

Implements **W1** of
[the Codex Greenlight port spec](../../spec/2026-08-10-codex-greenlight-port.md#w1--move-the-config-helpers-from-skill-bodies-into-a-sourced-script).
Read that section first — it is the authoritative work definition; this file
is the execution contract.

## Requirements

The problem, measured (spec §M1): Claude Code substitutes bare `$N` in a
SKILL.md body on every load and consumes the backslash of `\$N`, so the five
consumers carry `local key="\$1"`. Codex performs **no** substitution and does
not consume the escape, so the same body binds the literal string `$1`, every
jq path in the cascade misses, and reads silently return empty. The two
harnesses' requirements are mutually exclusive at the body level. The fix is to
stop putting positional-parameter shell in skill bodies at all — a real `.sh`
file that neither harness rewrites.

1. **New file `plugins/solopreneur/shared/config.sh`** carrying the five
   helpers — `solopreneur_repo_key`, `solopreneur_config_home`,
   `read_solopreneur_config`, `write_solopreneur_config`,
   `write_solopreneur_repo_config` — copied from the helper block in
   `shared/config.md` **with bare `$1` / `$2`** (un-escape as you move). Keep
   the existing comments; they carry non-obvious reasoning (the bash 3.2 empty
   array guard under `set -u`, `return 0` vs bare `return`, the `${var/://}`
   first-colon rule). Behavior must not change in any other way.

2. **Each of the five consumers** — `greenlight`, `merge-pr`,
   `worktree-handoff`, `todos-babysit`, `todos-cleanup` — keeps its
   marker-delimited block, but the block's **function definitions are replaced
   by a source instruction**. The block must end up containing no `()` function
   definition and no `$N` of any form. The instruction resolves
   `../../shared/config.sh` against **this skill document's own absolute path**,
   which both harnesses state to the model (spec §M2); `$CLAUDE_SKILL_DIR` may
   stay as a first-choice shortcut but the path-based fallback must be written
   out, because Codex never sets that variable.

   Rename the marker's parenthetical to match reality — it is no longer
   "inlined": `# --- solopreneur config helpers (sourced from shared/config.sh) ---`.
   The closing marker text is unchanged. Keep the leading
   `# --- solopreneur config helpers` prefix intact: `config.md` documents a
   `grep -rl` on exactly that prefix, and it must keep finding all five.

   Call sites do not change — every helper keeps its name and signature.

3. **`shared/config.md`** keeps the prose, the cascade documentation and the
   schema, but now points to `config.sh` as the canonical implementation
   instead of presenting a copy-verbatim block. Update every claim that the
   move falsifies — in particular the frontmatter's "must inline these function
   definitions verbatim", the "Helper block (copy verbatim into skills)"
   section, the "inline the **whole block** verbatim" rule, and the drift-test
   paragraph. Do not delete the registry of non-marker derivatives
   (`deploy.sh`, `config-resolve.mjs`, `config-migrate.mjs`,
   `reviewer-state.mjs`) — it is still accurate and still needed.

4. **Rewrite `shared/tests/config-helpers.test.mjs`.** The behavior half now
   sources `config.sh` directly (drop the `RUNNABLE` un-escape step and the
   test asserting the escape survives). The drift half becomes: each consumer's
   marker block **sources the script and defines no functions**. Keep every
   existing behavior case — the cascade, home order, the zero-status miss, both
   writers — they are the regression net for a refactor whose whole risk is
   silent behavior change.

5. **The awk sites outside the marker block** (`merge-pr/SKILL.md` around lines
   45-47 and 293, `worktree-handoff/SKILL.md` around line 199) carry escaped
   field refs (`\$0` / `\$1` / `\$2`) and must go. Per site: rewrite without
   positional refs, or move into a small script under that skill's `scripts/`.
   The `git worktree list` parsers are the natural candidates for
   `git worktree list --porcelain | sed -n 's/^worktree //p'`, which is also
   correct for paths containing spaces (today's `awk '{print $1}'` is not).
   Judgement is yours; the bar is that no `\$N` remains.

6. **`greenlight/SKILL.md`'s `SCRIPTS="${CLAUDE_SKILL_DIR}/"scripts`** (around
   line 1627) gains the same path-based fallback wording as the source line in
   (2) — one documented resolution, so the model has nothing to improvise. A
   measured run substituted a repo-relative path that only resolved because the
   PR under review happened to live in the plugin's own source repo
   (spec §M3, finding 3).

7. **`greenlight/scripts/reviewer-state.mjs`'s `configPath()`** (around line
   107) roots state at `CLAUDE_CONFIG_DIR || ~/.claude`. Change it to the same
   harness detection `solopreneur_config_home` uses: `CODEX_THREAD_ID` set →
   `CODEX_HOME` (defaulting to `~/.codex`), else `CLAUDE_CONFIG_DIR`, else
   `~/.claude`. Reviewer state then lands in the active harness's home with no
   caller exporting anything. Add a test for the Codex branch and keep the
   Claude branch's existing tests passing unchanged.

### Constraints

- **Claude Code behavior must not change** (spec acceptance A3). Same values
  read, same files written, same helper names. A refactor that alters the
  cascade is a failure even if every test is green.
- **No `\$N` may regain a foothold** in any native SKILL.md body — that is the
  measurable bar for this PR.
- **Do not touch vendored plugins** (`plugins/*/vendor/`, or any plugin
  directory not owned by this repo). Their `\$` content is upstream's.
- `config.sh` must be valid under the bash that ships with macOS (3.2) — the
  empty-array guard exists for that reason.
- The `preview` skill's `config-resolve.mjs` / `config-migrate.mjs` /
  `deploy.sh` derivatives are **out of scope**; they are separate readers with
  their own tests.

## Files to Read

- `docs/spec/2026-08-10-codex-greenlight-port.md` — §M1, §M2, §M3 and W1. The
  authoritative definition.
- `plugins/solopreneur/shared/config.md` — the canonical helper block, the
  cascade documentation, and the derivative registry near the end of the
  legacy-config half.
- `plugins/solopreneur/shared/tests/config-helpers.test.mjs` — what the tests
  currently prove; the rewrite must not lose any of it.
- `plugins/solopreneur/skills/greenlight/SKILL.md` — the marker block (~599-726),
  the `SCRIPTS=` line (~1627) and the pre-flight block around it.
- `plugins/solopreneur/skills/merge-pr/SKILL.md` — marker block (~124-251) and
  the awk sites (~45, ~293).
- `plugins/solopreneur/skills/worktree-handoff/SKILL.md` — marker block
  (~26-153) and the awk site (~199).
- `plugins/solopreneur/skills/todos-babysit/SKILL.md`,
  `plugins/solopreneur/skills/todos-cleanup/SKILL.md` — marker blocks.
- `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs` —
  `configPath()` and how the tests spawn the CLI with an allowlist env.
- `plugins/solopreneur/skills/preview/scripts/config-resolve.mjs` — the
  precedent for shipping a resolver as a script beside a skill (PR #147).

> Line numbers are approximate — the spec's own citations have already drifted
> by a few lines. Grep for the marker text / symbol instead of trusting them.

## Files to Create/Modify

- `plugins/solopreneur/shared/config.sh` — **new**; the five helpers with bare
  `$1` / `$2`.
- `plugins/solopreneur/shared/config.md` — modified; canonical pointer, no
  copy-verbatim instruction.
- `plugins/solopreneur/shared/tests/config-helpers.test.mjs` — rewritten;
  executes `config.sh`, drift check inverted to "sources, defines nothing".
- `plugins/solopreneur/skills/{greenlight,merge-pr,worktree-handoff,todos-babysit,todos-cleanup}/SKILL.md`
  — modified; marker block becomes a source instruction.
- `plugins/solopreneur/skills/greenlight/SKILL.md` — additionally, the
  `SCRIPTS=` path-based fallback wording.
- `plugins/solopreneur/skills/greenlight/scripts/reviewer-state.mjs` — modified;
  `configPath()` harness detection.
- `plugins/solopreneur/skills/greenlight/tests/reviewer-state.test.mjs` —
  modified; a case for the Codex home branch.
- Optionally new: a small script under `skills/merge-pr/scripts/` and/or
  `skills/worktree-handoff/scripts/` if you move an awk one-liner rather than
  rewriting it.

## Acceptance Criteria

- [ ] `cd plugins/solopreneur/shared && node --test tests/*.test.mjs` passes
      (the rewritten suite; this is what CI runs —
      `.github/workflows/validate-shared-config-tests.yml`).
- [ ] `cd plugins/solopreneur/skills/greenlight && node --test tests/*.test.mjs`
      passes with **at least** the 89 tests that pass today, none deleted.
- [ ] `grep -rE '\\\$[0-9@*{]' plugins/solopreneur/skills/*/SKILL.md` exits
      non-zero with no output.
- [ ] `bash -n plugins/solopreneur/shared/config.sh` exits 0.
- [ ] The drift test asserts, for all five consumers, that the marker block
      contains a `source` of `config.sh` and **zero** lines matching
      `^[a-z_]+\(\)` — a re-inlined helper fails CI.
- [ ] **A1 determinism canary, Codex side:** with
      `{"default":{"greenlight":{"fallback_order":["canary-codex"]}}}` planted
      at `$CODEX_HOME/solopreneur.json` in a temp dir,
      `env -i PATH="$PATH" HOME=<tmp> CODEX_THREAD_ID=t_1 CODEX_HOME=<tmp>/codexhome bash -c 'source plugins/solopreneur/shared/config.sh; read_solopreneur_config greenlight | jq -r ".fallback_order[0]"'`
      prints `canary-codex`.
- [ ] **A1 determinism canary, Claude side:** the same command with
      `CLAUDE_CONFIG_DIR=<tmp>/claudehome` and no `CODEX_THREAD_ID`, against a
      canary planted in that home, prints `canary-claude`.
- [ ] `node -e` (or a test case) confirms `reviewer-state.mjs` writes to
      `$CODEX_HOME/solopreneur.json` when `CODEX_THREAD_ID` is set, and to
      `$CLAUDE_CONFIG_DIR/solopreneur.json` when it is not.
- [ ] `git diff --name-only origin/main...HEAD` lists no path under a vendored
      plugin directory.

## Notes

- **Optional, best effort, not a blocker:** if the `codex` CLI is available and
  authed on the machine, run one `codex exec` smoke over a skill body that
  sources `config.sh` and confirm the executed shell matches the file
  byte-for-byte (spec A1's "no model rewriting" clause). The full A1 evidence
  run is post-merge manual acceptance; do **not** block this PR on it, and do
  not fake it.
- The measured failure mode is quiet: the model *self-heals* a broken `\$1` by
  rewriting the shell it was told to run (spec §M1). So a passing end-to-end
  run proves nothing about this refactor — the byte-level tests are the
  evidence. Do not substitute an e2e observation for them.
- `shared/config.md` documents a second grep for non-marker derivatives using
  `-F` fixed strings, because a BRE pattern silently matches nothing on BSD
  grep. If you touch those greps, keep `-F`.
- `plugins/solopreneur/shared/**` is already in the CI workflow's path filter,
  so `config.sh` needs no workflow change.
