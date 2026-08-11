# docs(codex): refresh subagent reference

## Requirements
- In the References section of `docs/spec/2026-08-09-codex-skill-portability.md`, replace only `https://learn.chatgpt.com/docs/agent-configuration/subagents` with `https://developers.openai.com/codex/agent-configuration/subagents`.
- Preserve the link label and every other byte of the architecture document.
- Keep the PR limited to the architecture document and this generated loop spec.

## Files to Read
- `docs/spec/2026-08-09-codex-skill-portability.md` — confirm the stale URL appears once in the References section.

## Files to Create/Modify
- `docs/spec/2026-08-09-codex-skill-portability.md` — update the single stale OpenAI Codex subagents URL.
- `docs/loops/2026-08-12_codex-subagent-reference/pr1-codex-subagent-reference.md` — commit this approved Autopilot loop contract unchanged.

## Acceptance Criteria
- [ ] Exact-transform check passes:
  ```bash
  python3 - <<'PY'
  import subprocess
  from pathlib import Path

  path = "docs/spec/2026-08-09-codex-skill-portability.md"
  old = "https://learn.chatgpt.com/docs/agent-configuration/subagents"
  new = "https://developers.openai.com/codex/agent-configuration/subagents"
  before = subprocess.check_output(["git", "show", f"main:{path}"], text=True)
  after = Path(path).read_text()
  assert before.count(old) == 1
  assert after == before.replace(old, new)
  PY
  ```
- [ ] The changed-file set is exactly the two approved paths:
  ```bash
  test "$({ git diff --name-only main; git ls-files --others --exclude-standard; } | sort -u)" = "$(printf '%s\n' docs/loops/2026-08-12_codex-subagent-reference/pr1-codex-subagent-reference.md docs/spec/2026-08-09-codex-skill-portability.md | sort)"
  ```
- [ ] `git diff --check` exits successfully.

## Notes
- Requested specialist: `ai-engineer`. On Codex V1, use the built-in `worker` fallback when that custom agent type is unavailable.
- File ownership is limited to the two paths above. You are not alone in the codebase; do not revert others' edits, and accommodate concurrent changes without expanding scope.
- Autopilot classifies this as `type: code` for executable gating because `docs/loops/**` is outside Greenlight's pure-prose whitelist.
- Do not change versions, release metadata, or any architecture content beyond the exact URL replacement.
