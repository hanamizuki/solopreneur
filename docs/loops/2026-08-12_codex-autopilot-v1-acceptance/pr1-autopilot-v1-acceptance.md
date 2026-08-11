# docs(codex): record Autopilot V1 acceptance

## Requirements

- Update exactly four places in `docs/spec/2026-08-09-codex-skill-portability.md`:
  - Change the top status to say rollout rows 3–9 are complete and Autopilot Codex V1 is included as a degraded capability on Codex exec, TUI, and App.
  - Add `docs/spec/2026-08-12-codex-autopilot-v1.md` to the related-spec list as “Codex Autopilot V1”.
  - Mark rollout row 9 complete and state that this real PR exercised inline planning, Plan Review internal, executable verification, Greenlight unattended, exact-head CI, atomic merge, parent verification, cleanup, structured reporting, and the built-in worker fallback.
  - Replace the closing next-slice statement so Autopilot Codex V1 is accepted and rollout row 10—Greenlight's remaining modes before Autopilot multi-PR waves—is next.
- Do not change any other passage in the architecture document.
- Do not edit the V1 acceptance evidence in `docs/spec/2026-08-12-codex-autopilot-v1.md` or invent PR numbers, SHAs, review counts, or other exact evidence; the parent session records that evidence after this live run.
- Keep the pull request limited to the architecture document and this generated loop spec.
- Create the pull request with title `docs(codex): record Autopilot V1 acceptance`, head `docs/codex-autopilot-v1-acceptance`, and base `feat/codex-autopilot-v1`.

## Files to Read

- `docs/spec/2026-08-12-codex-autopilot-v1.md` — authoritative V1 outcome, supported contract, limitations, and pending live-acceptance boundary.
- `docs/spec/2026-08-09-codex-skill-portability.md` — architecture document whose four status locations must be updated.

## Files to Create/Modify

- `docs/spec/2026-08-09-codex-skill-portability.md` — update only the top status, related-spec list, rollout row 9, and closing next-slice statement.
- `docs/loops/2026-08-12_codex-autopilot-v1-acceptance/pr1-autopilot-v1-acceptance.md` — retain this generated execution contract unchanged except for a correction required to make its commands runnable.

## Acceptance Criteria

- [ ] Run `git diff --check -- docs/spec/2026-08-09-codex-skill-portability.md` successfully.
- [ ] Run the following executable content assertions successfully:

  ```bash
  python3 - <<'PY'
  from pathlib import Path

  text = Path("docs/spec/2026-08-09-codex-skill-portability.md").read_text()
  assert "**Status:** Approved design; rollout rows 3–9 complete;" in text
  assert "[Codex Autopilot V1](./2026-08-12-codex-autopilot-v1.md)" in text
  assert "| 9. Autopilot Codex V1 | Complete —" in text
  assert "The dependency closure and Autopilot Codex V1 are accepted, so the next core slice" in text
  assert "next core slice is Autopilot Codex V1" not in text
  PY
  ```

- [ ] Run `git diff --quiet d3a177bbdd811fe3036390b72c27b6069afee690 -- docs/spec/2026-08-12-codex-autopilot-v1.md` successfully, proving the V1 acceptance evidence was not edited.
- [ ] Run the following scope assertion successfully before committing:

  ```bash
  test "$(git status --porcelain --untracked-files=all | cut -c4- | LC_ALL=C sort)" = "$(printf '%s\n' 'docs/loops/2026-08-12_codex-autopilot-v1-acceptance/pr1-autopilot-v1-acceptance.md' 'docs/spec/2026-08-09-codex-skill-portability.md')"
  ```

- [ ] Verify the created pull request reports head `docs/codex-autopilot-v1-acceptance` and base `feat/codex-autopilot-v1` before review or merge.

## Notes

- You are not alone in the repository. Do not revert edits made by others; stay within the two owned files and accommodate any concurrent changes without overwriting them.
- Treat this as `type: code`, `size: s`: `docs/loops/**` is excluded from Greenlight's pure-prose S whitelist, so executable verification remains mandatory.
- Use the requested `ai-engineer` specialist only if that exact type is callable. This Codex session does not expose it, so dispatch the built-in `worker` with the same brief.
- Run `/plan-review internal`, `/greenlight unattended size=s`, exact-head CI polling, and `/merge-pr` in that order.
- The parent owns independent merge verification and removes the worktree and local branch only after GitHub and remote-base ancestry agree.
