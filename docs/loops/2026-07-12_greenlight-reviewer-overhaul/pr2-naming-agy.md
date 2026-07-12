# fix(naming): migrate dead gemini CLI to agy

## Requirements

The `/naming` skill's multi-model candidate generation includes a Gemini
branch that is dead twice over: consumer Gemini CLI login stopped
2026-06-18 (verified locally: `IneligibleTierError: UNSUPPORTED_CLIENT`),
and the hardcoded `gemini-3-pro-preview` model was shut down 2026-03-09.
Replace it with Antigravity CLI (`agy`), Google's official consumer
migration path. Verified context (sunset sources, agy behavior) lives in
`todos/backlog/2026-07-12_greenlight-reviewer-overhaul.md` — read it first.

1. **Invocation swap** (around SKILL.md line 478). Old:
   `gemini -m "gemini-3-pro-preview" < docs/naming/.raw/brief-${TS}.md`.
   agy print mode does NOT read stdin (verified on agy 1.1.1) — embed the
   brief in the prompt argument instead, e.g.
   `agy --dangerously-skip-permissions --model "Gemini 3.1 Pro (High)" --print "<instructions>$(cat docs/naming/.raw/brief-${TS}.md)"`,
   still redirecting stdout to the `.raw` output file. Pin the Gemini
   family model — the point of this branch is model diversity vs Claude
   and Codex.
2. **Availability gate** (around line 397): replace the
   `command -v gemini && gemini --version` check with the agy equivalent.
   Treat both not-installed and not-authenticated as unavailable
   (unauthenticated headless agy prints an authorization URL instead of
   answering — that must count as gate failure, not as output). Keep the
   existing degradation: gemini slot unavailable → skill runs
   Claude + (optional) Codex only.
3. **Output guard**: agy `--print` has a known non-TTY stdout-drop issue
   (version-dependent; not reproduced locally on 1.1.1 but guard anyway).
   Treat empty output as branch failure — same degradation as gate
   failure. The skill already writes raw outputs to files; a non-empty
   file check suffices.
4. Keep the `models_available.gemini` key name (it denotes the model
   family, and renaming ripples through the skill) unless the surrounding
   text makes that confusing — implementer's judgment, prefer the minimal
   diff. Update user-facing wording that says "Gemini CLI" to name
   Antigravity CLI (`agy`).

Constraints:
- marketer plugin ships publicly: plain `agy`, no machine-specific HOME
  overrides in skill text.
- Touch only `plugins/marketer/skills/naming/SKILL.md` — greenlight and
  solopreneur-plugin files belong to PR1 (`feature/greenlight-reviewer-overhaul`).

## Files to Read

- todos/backlog/2026-07-12_greenlight-reviewer-overhaul.md (verified agy usage + sunset facts)
- plugins/marketer/skills/naming/SKILL.md (full file — understand the multi-model flow and gate structure)

## Files to Create/Modify

- plugins/marketer/skills/naming/SKILL.md — gemini branch → agy (invocation, gate, wording)

## Acceptance Criteria

- [ ] `grep -n "gemini-3-pro-preview\|command -v gemini" plugins/marketer/skills/naming/SKILL.md` returns nothing
- [ ] The agy invocation embeds the brief via the prompt argument — no stdin redirect into agy remains
- [ ] Gate covers not-installed AND not-authenticated; either → existing Claude+Codex degradation
- [ ] Empty agy output is handled as branch failure (non-empty check on the raw output file)
- [ ] Smoke test: run the documented agy command once with a 3-line dummy brief and confirm non-empty output lands in the target file. On this machine prefix with `HOME="$HOME/Agents/gemini/builder"` for auth — local test only, never in skill text. If agy is unavailable in the worktree environment, verify the gate path instead

## Notes

- Model list on agy also includes Claude and GPT-OSS — do not offer those here; this branch exists to add a non-Claude, non-GPT model family to candidate generation.
- `--print-timeout` defaults to 5m; naming briefs are small, no override needed.
