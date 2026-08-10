# Implement the Codex Greenlight port (W1-W5)

**Created:** 2026-08-10
**Spec:** [Codex Greenlight port](../../docs/spec/2026-08-10-codex-greenlight-port.md)
— the Implementation plan (W1-W5) and Acceptance (A1-A4) sections are the
authoritative work definition; this todo is the dispatch pointer.

## Scope

All five work items from the spec, measured and settled on 2026-08-10:

- **W1** — move the config helpers from the five SKILL.md bodies into
  `plugins/solopreneur/shared/config.sh`; rewrite
  `shared/tests/config-helpers.test.mjs`; clear remaining `\$N` (awk sites),
  `CLAUDE_SKILL_DIR` fallback wording, `reviewer-state.mjs` home detection.
- **W2** — `claude-cli` gate recipe (registry row, trigger command,
  availability probe, `[P*]` parsing unchanged).
- **W3** — host-aware gate independence (`family` column, host-family
  detection via `CODEX_THREAD_ID`, gate filter, host-conditional S-size
  default).
- **W4** — fix-step host-conditional wording + S/M-only V1 size bound
  (L-size halts on Codex hosts).
- **W5** — degraded-status documentation pointers.

## Suggested PR split

- **PR A: W1** — self-contained, guarded by the rewritten tests.
  Acceptance: spec A1 (determinism canary) + `grep -rE '\\\$[0-9@*{]'
  plugins/solopreneur/skills/*/SKILL.md` returns nothing + tests pass.
- **PR B: W2+W3+W4+W5** — all remaining edits concentrate in
  `greenlight/SKILL.md` + `reviewer-state.mjs`. Acceptance: spec A3
  (Claude baseline unchanged) + A4 (no same-family gate in `RESOLVED`).

Spec A2 (end-to-end seeded-finding run on a Codex host) is a post-merge
manual acceptance — it waits on live reviewer loops and does not belong in
PR CI.

## Constraints

- One skill body — no forked copies (spec Goal section).
- `config.sh` carries bare `$1`/`$2`; SKILL.md bodies must not regain any
  escaped `\$N`.
- Claude Code behavior must not change (A3): same gate selection, same
  reports, drift test replaced not deleted.
- Do not touch vendored plugins.
