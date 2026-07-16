# feat(greenlight): risk-based S/M/L sizing with mechanical cascade

## Requirements

- Add a pre-flight sizing step to greenlight (PR mode and post-commit mode;
  uncommitted mode is exempt from sizing entirely — leave it untouched):
  - A **mechanical cascade**, bash-computable over the real diff's file list
    and line counts — no LLM judgment:
    1. **L** if ANY of: a touched path matches migrations/, auth/payment/crypto
       related code, .github/workflows/, Dockerfile or infra config, or a
       dependency manifest with substantive changes (lockfiles excluded);
       OR the diff exceeds ~400 lines excluding lockfiles/generated files.
    2. **S** if ALL touched files fall inside the whitelist: `docs/**`
       (**excluding `docs/loops/**`** — live orchestration config, not prose),
       `todos/**`, repo-root `README.md` only (plugin READMEs carry install
       commands and stay out), `LICENSE`, `.gitignore`. Never a global `*.md`
       glob — in skill-type repos the product IS markdown; SKILL.md changes
       must classify M.
    3. Otherwise → **M**. Any uncertainty in classification → default to M.
  - The asymmetry is deliberate: L is OR (any danger signal escalates), S is
    AND (everything must be harmless to de-escalate). Config files are
    deliberately NOT in S (config errors are silent runtime behavior changes).
  - The former "cross-module boundary" trigger is deliberately dropped — it is
    not mechanically computable; do not add it.
- Size override & freshness:
  - Accept a `size=s|m|l` argument token in greenlight's argument parsing.
  - The size computed from the real diff is authoritative **upward**:
    effective size = max(passed size, computed size). Never downgrade below
    the computed size. This makes scope creep upgrade-only and defeats
    "planned S, grew into M" gaming.
  - When greenlight auto-classifies S (no explicit override), add a report
    line flagging it: "auto-sized S — verify" (flag-style).
- Profile wiring — gate each phase on the effective size:
  - **S**: skip Phase 1 and the verification gate; Phase 3 external loop =
    the first available **external** reviewer from the reviewer registry
    (prefer codex when available), still loops to clean, **max 3 rounds**.
  - **M** (default): Phase 1 with 2 reviewers (specialist-review +
    ponytail-review); skip the verification gate; Phase 3 standard loop,
    **max 5 rounds** (matches the existing post-commit precedent).
  - **L**: all 5 Phase 1 reviewers; verification gate ON (when the Workflow
    tool is available); Phase 3 full fallback chain, **max 10 rounds**.
  - Reviewer selection MUST be expressed in the reviewer-registry vocabulary
    introduced by the 2026-07-15 overhaul (PR #111) — no hardcoded bot names
    in the profile logic.
  - The verifier inner loop (from the verifier PR) is NOT size-differentiated:
    one `verify` command for every size.
- autopilot integration:
  - Add an optional `size` field (s|m|l) to plan.yaml in
    references/schemas.md, documented in the field table.
  - pr-subagent-template passes the plan's size to /greenlight as the
    `size=` token when present.
  - autopilot SKILL.md planning output (Step 2 descriptors) mentions size.
- Update greenlight's flow-summary / mode docs so max-round statements
  reflect the per-size values instead of a single global number.

## Files to Read

- plugins/solopreneur/skills/greenlight/SKILL.md — phase structure; the
  reviewer registry section (2026-07-15 overhaul); existing max-round spots
  (~line 1417 PR mode, ~line 621 post-commit); argument parsing
  (~line 369–372)
- todos/doing/2026-07-16_greenlight-autopilot-sizing-loop-engineering.md —
  section "1. S/M/L 三級" (canonical cascade, profile table, and every 二輪
  review 修訂 bullet)
- plugins/solopreneur/skills/autopilot/references/schemas.md,
  plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md,
  plugins/solopreneur/skills/autopilot/SKILL.md

## Files to Create/Modify

- plugins/solopreneur/skills/greenlight/SKILL.md — pre-flight cascade;
  `size=` token parsing; per-phase size gates; auto-S flag line; per-size
  max-round docs
- plugins/solopreneur/skills/autopilot/SKILL.md — size in planning output
- plugins/solopreneur/skills/autopilot/references/schemas.md — optional
  `size` field + docs
- plugins/solopreneur/skills/autopilot/references/pr-subagent-template.md —
  pass `size=` token to /greenlight

## Acceptance Criteria

- [ ] `grep -n "size=" plugins/solopreneur/skills/greenlight/SKILL.md`
      returns hits (argument parsing present)
- [ ] The cascade is documented as bash-computable rules with L-any-match /
      S-all-match / default-M, and an explicit default-to-M-on-uncertainty
      sentence
- [ ] The S whitelist excludes `docs/loops/**` and binds README.md to repo
      root; no global `*.md` glob appears in the rules
- [ ] The max(passed, computed) upgrade-only rule is stated
- [ ] `grep -n "size" plugins/solopreneur/skills/autopilot/references/schemas.md`
      shows the optional field documented
- [ ] The profile gates match the canonical table: S = skip Phase 1 + gate,
      registry-first external, max 3; M = 2 reviewers, max 5; L = full 5 +
      gate, max 10
- [ ] Uncommitted mode contains no sizing logic (checklist inspection)

## Notes

- S still loops to clean (explicit user decision) — the cost cap is the max-3
  round bound, not a single-pass mode.
- Keep the "config files not in S" rationale line in the skill text.
- This repo's product is markdown skill instructions: write precise English
  prose matching surrounding style. Do not bump any plugin.json version.
- The /greenlight skill YOU invoke during this task runs from the installed
  plugin cache, not this repo's working tree — your own review loop is not
  affected by these edits.
