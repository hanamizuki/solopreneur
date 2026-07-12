# feat(greenlight): reviewer registry + activity detection + agy migration

## Requirements

Rework greenlight's reviewer selection from hardcoded options into a
registry + activity-detection design, and replace the dead Gemini CLI path
with Antigravity CLI (`agy`). All verified facts, decisions, and design
requirements live in `todos/backlog/2026-07-12_greenlight-reviewer-overhaul.md`
— read it first and treat it as the source of truth. Summary of what must land:

1. **Reviewer registry** (single point of definition). Each reviewer defines:
   `config_id` (canonical, e.g. `codex-bot`), aliases (runtime argument
   spellings, e.g. "codex bot"), bot login (e.g.
   `chatgpt-codex-connector[bot]`), kind (`active-bot` / `passive-bot` /
   `local-cli`), trigger command, handshake signal, poll policy, wizard
   eligibility. The gemini entry is KEPT fully defined (enterprise tier
   survives the consumer sunset, same bot login and `/gemini review`
   trigger). Adding/removing a reviewer must only require touching the
   registry. The existing "Bot Login Definitions" block is superseded by
   (or becomes) the registry — keep it a single point.
2. **Pre-flight activity detection**. Detect which reviewer bots actually
   operate on this repo from three sources: repo-level issue comments
   (`/repos/{o}/{r}/issues/comments`), repo-level inline review comments
   (`/repos/{o}/{r}/pulls/comments`), and formal reviews
   (`/repos/{o}/{r}/pulls/{n}/reviews`, per-PR — scan the most recent N
   PRs; a bot may leave ONLY a formal review, verified on PR #108).
   State the sample window honestly (e.g. "latest 100 comments per
   endpoint + reviews of last N PRs"). Detection failure / rate limit →
   skip detection, run the current flow (detection is an enhancement,
   never a gate). Zero-history repo → current interactive flow.
3. **Wizard presents three reviewer kinds separately**: `active-bot`
   entries appear only when detected (gemini shows up only on repos with
   recent gemini activity); `passive-bot` (CodeRabbit) is informational,
   never offered as a trigger; `local-cli` (Codex CLI, agy) is gated by
   CLI availability checks, NOT by GitHub activity (it never appears in
   GitHub data). Stop hardcoding gemini into wizard write examples and
   recommended `fallback_order` samples. When a configured
   `fallback_order` names a reviewer that detection didn't find, warn
   before triggering (do not hard-fail).
4. **Compatibility**: old configs containing `"gemini"` keep working — on
   no-response the existing timeout-fallback fires; append a one-line hint
   that consumer Gemini Code Assist was sunset 2026-07-17 (enterprise
   unaffected). `/greenlight external gemini` stays a legal argument
   (enterprise users); same hint on failure. Unattended callers
   (todos-babysit auto mode, autopilot) must never enter an interactive
   wizard: when reviewers are exhausted, fail fast and log.
5. **Post-commit mode Phase 3**: replace the dead
   `gemini -m gemini-3-pro-preview` CLI branch with agy. Verified working
   invocation shape (agy 1.1.1):
   `agy --dangerously-skip-permissions --model "Gemini 3.1 Pro (High)" --print "<prompt>"`.
   Print mode does NOT read stdin — embed the diff in the prompt argument
   (the existing `$(cat <<EOF ...)` pattern carries over). Guard the known
   non-TTY stdout-drop issue: treat empty output or output missing an
   expected marker as CLI failure (degrade to the surviving reviewer, same
   as today). Mention `--print-timeout` (default 5m) for large diffs. Add
   an agy availability gate mirroring the existing Codex CLI gate
   (installed + authenticated; unauthenticated headless prints an
   authorization URL — recognize that as unavailable). Keep the model
   pinned to the Gemini family for model diversity (main loop is Claude,
   Codex is GPT-family). Write plain `agy` in the skill — no
   machine-specific HOME overrides.
6. **Docs sync**: update `plugins/solopreneur/shared/config.md` examples
   (fallback_order samples become codex-only; gemini appears only in
   detection/sunset discussion), then sync the inline helper copies via
   the marker grep documented at the end of config.md
   (`grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/`)
   — NOT via `sync-vendored.sh` (that script only vendors third-party
   skills and will exit without a vendor manifest). Diff each copy after
   syncing. Update the todos-babysit Phase 3 description line
   ("Codex/Gemini/CodeRabbit") to match the new reviewer model. Update the
   4 greenlight-facing README.md mentions (lines ~81, ~98, ~246, ~285):
   consumer sunset note, enterprise-via-detection, agy as the CLI
   reviewer. Update greenlight SKILL.md frontmatter description (mentions
   Gemini twice).

Constraints:
- greenlight SKILL.md is agent-facing instruction prose; match its
  existing structure and tone. This repo's skills ARE the product.
- Do NOT touch historical docs (`docs/loops/`, `docs/solopreneur/plans/`)
  — old gemini examples there are immutable history.
- Do NOT touch `ai-app-templates` (Gemini API provider — API-key path,
  unaffected) or `impeccable` (gemini provider tag — unrelated).
- The plugin ships publicly: no Hana-specific environment assumptions in
  skill text.

## Files to Read

- todos/backlog/2026-07-12_greenlight-reviewer-overhaul.md (source of truth: verified facts, agy usage, design decisions)
- plugins/solopreneur/skills/greenlight/SKILL.md (the artifact being reworked — read fully before editing)
- plugins/solopreneur/shared/config.md (helper source of truth + copy-sync instructions at the bottom)
- plugins/solopreneur/skills/todos-babysit/SKILL.md (unattended caller + one of the inline copies)

## Files to Create/Modify

- plugins/solopreneur/skills/greenlight/SKILL.md — registry, detection step, wizard, compat messaging, post-commit agy, frontmatter
- plugins/solopreneur/shared/config.md — fallback_order examples
- plugins/solopreneur/skills/{merge-pr,todos-babysit,todos-cleanup,worktree-handoff,preview}/SKILL.md — synced inline helper blocks (mechanical); todos-babysit also Phase 3 wording
- README.md — 4 greenlight-facing mentions

## Acceptance Criteria

- [ ] Registry section exists in greenlight SKILL.md defining every reviewer (incl. gemini) with the fields listed above; reviewer add/remove requires only a registry edit
- [ ] Detection step documents all three data sources (incl. per-PR formal reviews), the sample window, and both degradation paths (API failure → skip; zero history → current flow)
- [ ] `grep -n "gemini" plugins/solopreneur/skills/greenlight/SKILL.md` shows no hardcoded wizard/config write examples recommending gemini — remaining mentions are registry definition, detection discussion, or sunset messaging
- [ ] `grep -n "gemini-3-pro-preview" plugins/solopreneur/` returns nothing; post-commit Phase 3 shows the agy invocation with pinned model, marker validation, and availability gate
- [ ] Each file found by `grep -rl "# --- solopreneur config helpers" plugins/solopreneur/skills/` carries a helper block byte-identical to config.md's (verify by diff)
- [ ] Smoke test: run the documented agy command once against a trivial diff and confirm non-empty output containing the expected marker. On this machine prefix with `HOME="$HOME/Agents/gemini/builder"` for auth — that prefix is for the local test ONLY and must not appear in any skill text. If agy is unavailable in the worktree environment, document the gate behavior check instead (gate correctly reports unavailable)
- [ ] README.md: all 4 mentions updated; no instruction remains telling users to install consumer Gemini Code Assist

## Notes

- `REVIEWER_BOTS` today is defined once and never referenced elsewhere — fold it into the registry rather than keeping two lists.
- Three identifier spellings exist today (`"codex-bot"` config / `"codex bot"` argument / `chatgpt-codex-connector[bot]` API); the registry's config_id + aliases + login mapping is what makes config-vs-detection comparison possible. Detection matches on bot login; GraphQL (if used for per-PR reviews) omits the `[bot]` suffix — normalize before comparing.
- Sunset facts with sources are in the todo file; cite the consumer-only scope precisely (enterprise unaffected) in user-facing messaging.
- First version does NO staleness judgment — show `last_seen_in_sample` only. Detection lists options; handshake/timeout proves liveness.
