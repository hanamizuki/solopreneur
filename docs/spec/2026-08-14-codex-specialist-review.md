# Codex Specialist Review

**Status:** Accepted — A1–A4 passed on 2026-08-14

**Date:** 2026-08-14

**Source shape:** `shared_with_seams`

**Surfaces:** Codex exec, Codex TUI, Codex App

**Support level:** Degraded

**Skills:** `specialist-review`

## Outcome

`/specialist-review` runs on Codex. It is the first consumer of the knowledge
skills published in
[Codex specialist knowledge skills](./2026-08-14-codex-specialist-skills.md):
the reviewer that reads them is a spawned generic subagent, and the skills it
reads come out of the installed plugin cache.

The canonical skill body stays shared with Claude Code. Nothing branches on
`CODEX_THREAD_ID` — the reviewer ladder is self-selecting, so each host lands on
the best reviewer it actually has without the skill having to know which host it
is running on.

## Reviewer ladder

Step 2.25 picks a reviewer per detected stack, taking the first rung that works.
It is the ladder [`plan-review`](../../skills/solopreneur/plan-review/SKILL.md)
already uses on Codex, not a new mechanism:

1. the matching specialist agent (`ios-dev`, `android-dev`, `ai-engineer`,
   `neo4j-dev`);
2. a generic reviewer subagent — `general-purpose` on Claude Code, the built-in
   `explorer` on Codex, dispatched with `fork_turns="none"` because Codex
   rejects a named agent that inherits full parent history;
3. inline review in the calling thread when spawning is unavailable or rejected
   at the current subagent depth.

Rung 1 never fires on Codex today: the four agent definitions are not shipped
there. Rungs 2 and 3 are degradations and print a banner naming which one ran.
The rung that actually ran is reported. A narrated dispatch that created no
child is not accepted.

`agent_type="explorer"` is a real, accepted built-in type — a directly
instructed probe produced a child whose rollout records `agent_role: explorer`.
It is nonetheless a preference, not a guarantee: across every acceptance run the
model set `fork_turns="none"` and omitted `agent_type`, spawning an unscoped
peer instead. The skill says so plainly rather than claiming a read-only agent
it does not reliably get.

Before this change the Codex path went straight from "the agent type does not
exist" to inline review, which read no skills at all — the knowledge base was
published and never opened.

## Skill discovery

A generic reviewer has no specialist system prompt, so the instruction to
follow one is a no-op on Codex. The dispatch prompt now carries discovery
itself: a reviewer without a system prompt lists the installed plugin cache and
picks 3–5 skills matching the diff.

The cache path is globbed, never hardcoded:

```
"${CODEX_HOME:-$HOME/.codex}"/plugins/cache/*/<plugin>/*/skills/*/
```

The marketplace segment is whatever name the user chose when adding the
marketplace, and the version segment moves with every plugin release. The
reviewer reports the absolute path of every `SKILL.md` it read, which is what
makes "did it really read the knowledge base" checkable rather than narrated.

## Limitations

- **No specialist agents on Codex.** The four agent definitions are Claude-only,
  so every Codex review runs at rung 2 or 3 with a degradation banner. Publishing
  the agents is a later phase.
- **Two stack-table rows can never resolve on Codex.** `docs/gtm/` → `marketer`
  and `*.css` → `designer` route to plugins that publish no Codex package. Those
  stacks still get reviewed, by the generic reviewer with no curated skills to
  read.
- **`general-purpose` has no Codex equivalent.** The Python-backend and
  web-frontend rows resolve to the same generic reviewer there.
- **The extended skill index is not ported.** `/rebuild-skill-index` is a Claude
  Code path; Codex discovery is the curated cache listing only. A skill that is
  installed but excluded from Codex publication is invisible to the reviewer.
- **Review quality tracks what was published.** `android-dev` (8 skills) and
  `neo4j-dev` (1 dense one) carry real knowledge; `ios-dev` and `ai-engineer`
  publish one skill each, so a Codex review of those stacks leans mostly on the
  reviewer's own expertise.
- **context7 is optional and host-detected.** Detection no longer names a
  Claude-only tool-enumeration mechanism; a call that fails because the tool does
  not exist counts as unavailable.
- **Read-only by contract, not by agent role.** The skill only reads a diff and
  reports. Since `agent_type` is omitted in practice, the boundary is held by
  the sandbox and the prompt's "do NOT modify any files", not by a read-only
  agent role. Run reviews under `--sandbox read-only`.
- **The reviewer may want to build.** Under the default approval policy a TUI
  run escalated for `./gradlew :app:compileDebugKotlin` with access to the real
  `~/.gradle`. A compile check is not part of the review contract; decline it,
  or pass `--ask-for-approval never` so the sandboxed attempt just fails and the
  run continues by inspection.
- **Requirements.** `git` and repository read access; `gh` widens scope
  detection to open PRs.

## Acceptance

Support is not granted by loadability. Each surface must show the generated
package under test, a real child thread rather than a narrated one, and skill
paths that resolve inside the installed cache.

All runs used Codex CLI 0.147.0 against a throwaway `CODEX_HOME` holding only
this candidate marketplace, so the bytes under test were the generated packages
rather than any published release. The installed
`skills/specialist-review/SKILL.md` was byte-identical to canonical
(`sha256:87b1bf5e8a0be8db791fe0afbbc8ed864b1b72169a19205b96ad6b75ee3e2ffc`), and
`HOME` was redirected into the probe as well, because the Codex skills extension
reads `$HOME/.agents/skills` regardless of `CODEX_HOME`.

**The reviewed diff was real.** A local clone of an Android app (`innie`) was
checked out one commit before a Compose/OAuth feature landed, and two files from
that commit — `MainActivity.kt` and `MainScreen.kt`, 53 insertions and 44
deletions — were restored as uncommitted changes. Every run detected its own
scope from `git status`; no diff was pasted into a prompt.

### A1 Registry, publication, and generation

Accepted on 2026-08-14.

- `validate-skills-compatibility.py` passes: 103 skills, Codex included 19 (the
  18 from the knowledge publication plus `solopreneur:specialist-review`).
- Generation is deterministic: a second `generate-plugin-packages.sh` run left
  zero drift.
- `scripts/tests/` passes 46 of 46, and the filtered-publication fixture passes
  with `specialist-review` added to the exact-set assertion for the generated
  `solopreneur` Codex tree.
- The generated Codex `SKILL.md` is byte-identical to canonical, and so is the
  copy that `codex plugin add` lands in the cache.

### A2 Codex exec

Accepted on 2026-08-14. Root thread `01a0005f-c9fd-7c31-aa33-6eb304729c66`
made one `spawn_agent` call (`task_name: android_review`,
`fork_turns: "none"`) and created a real child,
`01a00060-566e-7782-ac28-f18bb6656689`, whose rollout carries
`parent_thread_id` pointing back at the root. The report opened with the
degradation banner and listed four skills read, each an absolute path under
`…/plugins/cache/solopreneur/android-dev/0.4.12/skills/`: `android-patterns`,
`edge-to-edge`, `navigation-3`, `viewmodel`. All four files exist in the cache
and are byte-identical to their canonical sources.

### A3 Codex TUI

Accepted on 2026-08-14 through a real PTY-backed interactive session started
with `--sandbox read-only --ask-for-approval never`. Root thread
`01a0005f-ea5e-7311-8844-7d89a1dcdc1e` spawned child
`01a00060-b64e-7d03-b896-902f846e1ca8` with `fork_turns: "none"`. The aggregate
report carried the Scope, the degradation banner, the Skills Checked table, the
same four absolute cache paths, Cross-Cutting Concerns, and the Verdict.

An earlier TUI run under the default approval policy escalated to ask for
`./gradlew :app:compileDebugKotlin` with access to the user's real
`~/.gradle`; declining it interrupted the turn. The accepted run therefore
pins `--ask-for-approval never`, and the behaviour is recorded under
Limitations rather than hidden.

### A4 Codex App

Accepted on 2026-08-14 through the Codex App Server JSON-RPC protocol, not
inherited from the CLI or TUI evidence. After `initialize` and `initialized`,
`skills/list` resolved 19 entries from this marketplace including
`solopreneur:specialist-review`, at
`$CODEX_HOME/plugins/cache/solopreneur/solopreneur/0.6.0/skills/specialist-review/SKILL.md`.
`thread/start` (`sandbox: read-only`, `approvalPolicy: never`) then
`turn/start` with a single `{"type":"skill"}` input item — no accompanying user
text — ran the review on thread `01a0005f-cf3b-7951-9aaf-5eeec6923446`, which
spawned child `01a00060-439b-72e0-ae80-c7376144be68` with `fork_turns: "none"`.
The returned report carried the degradation banner and the same four cache
paths.

This is the surface that moved the banner. On the App, a skill-only turn ends
with the reviewer's own section and no aggregate wrapper, so a banner owned by
Step 4 never printed. Making the reviewer print its own banner fixed the App
without weakening exec or TUI, where the same banner now arrives inside the
pasted report.

## References

- [Codex specialist knowledge skills](./2026-08-14-codex-specialist-skills.md) —
  the knowledge base this skill reads
- [Codex Autopilot dependency closure](./2026-08-11-codex-autopilot-dependencies.md) —
  where the reviewer ladder was first accepted
- `todos/backlog/2026-08-14_codex-specialist-review-phase2.md` — milestone plan
