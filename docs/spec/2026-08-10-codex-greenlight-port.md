# Codex Greenlight port

**Status:** Scoped; implementation pending

**Date:** 2026-08-10

**Scope:** Running the existing `/greenlight` pull-request loop on Codex

**Related:** [Codex skill portability](./2026-08-09-codex-skill-portability.md),
[dual-publish pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md)

## Goal

Run the shipped `/greenlight` PR review loop on Codex. One skill body, no fork.

`plugins/solopreneur/skills/greenlight/SKILL.md` already *is* the specification.
It is a prompt, not a program, and Codex reads prompts too. Porting is therefore
a question of which parts of that prompt depend on Claude Code — not of
extracting a shared engine and writing adapters against it.

## What actually differs

Measured against the shipped skill:

| Concern | Claude Code | Codex |
| --- | --- | --- |
| Internal review fan-out | five parallel report-only subagents (Phase 1) | unavailable — under `codex exec` the model reads a router skill and works inline; it never spawns a plugin subagent, even at Ultra ([pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md)) |
| Internal reviewers | `/simplify`, `superpowers:requesting-code-review`, gstack `/review`, `/specialist-review`, `ponytail:ponytail-review` | none installed; `codex review` is the native equivalent |
| Final gate default | Codex CLI | Claude CLI |
| Everything else — pre-flight, sizing, cursors, triggering, polling, classification, fallback, reporting | `gh` + `jq` + `git` | identical; no adapter needed |

The last row is the bulk of the skill, and it is already host-independent.

## V1 shape

**Codex V1 = `/greenlight external` with a Claude CLI gate.**

- `external` already skips Phase 1 and Phase 2 (`SKILL.md:1392`, `SKILL.md:1426`)
  — exactly the subset that needs no subagent.
- The per-round fix step is delegated to a subagent on Claude Code to keep the
  main context small (`SKILL.md:2440`), not for correctness. Codex applies fixes
  inline. The parent is the only writer either way.
- One skill body. A second copy would have to absorb every later fix twice.

### Gate profile resolution

The Claude CLI gate runs under the Claude profile whose config name matches the
active Codex profile. When `$CODEX_HOME` or `$CLAUDE_CONFIG_DIR` is unset, or is
not a recognized name — the common case for anyone outside the author's fleet —
inherit the ambient environment rather than failing. Name matching is an
operator convenience, not a precondition: treating it as required would make the
Claude CLI gate permanently unavailable, and on Codex it is the only gate.

## Known constraint

CLI verdicts are prose-parsed. `codex review` exposes no structured output mode;
its flags are `--strict-config`, `-c`, `--uncommitted`, `--base`, `--enable`,
`--commit`, `--disable`, and `--title`. Do not design the port around a JSON
verdict that does not exist — the shipped loop's `[P*]` tag parsing plus process
completion is the available signal.

## Settle by measurement, not design

The open question is not what a contract should say. It is whether Codex can
read the shipped `SKILL.md` and drive Phase 3 end to end: trigger the gate, hold
the round cursors, poll, classify the terminal state, and fall back. Run it
against a real PR and record where it diverges. What the port needs follows from
that result.

## Not in V1

| Deferred | Where |
| --- | --- |
| Freezing the reviewed head SHA and binding evidence to it | [todo](../../todos/backlog/2026-08-10_greenlight-head-binding.md) |
| Atomic merge precondition and post-review mutation in `merge-pr` | [todo](../../todos/backlog/2026-08-10_merge-pr-atomic-merge.md) |
| Internal review on Codex | blocked on the subagent question above |
| Uncommitted and post-commit modes | after PR mode works |

The first two are defects in current Claude Code behavior, not gaps in the port.
Fixing them in the single shared skill body fixes them for both hosts at once,
which is the main reason not to fork.
