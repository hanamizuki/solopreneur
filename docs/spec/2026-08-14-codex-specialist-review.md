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
when the spawn succeeds — as it did in every acceptance run below — the reviewer
that reads them is a spawned generic subagent, and the skills it reads come out
of the installed plugin cache. When no subagent can be spawned, the ladder drops
to inline review under its own banner.

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
It is not, however, a read-only boundary. A second probe forced the argument
through (parent rollout carries `"agent_type":"explorer"` verbatim, child
rollout carries `agent_role: explorer` and a `parent_thread_id` back to it) and
that child still wrote the file it was asked to write. The role selects an
instruction set, not a permission profile: `SpawnAgentArgs` has no sandbox
field, and the tool description says the spawned agent "will have the same
tools as you".

Two consequences the skill states outright. The reviewer's read-only character
rests on the dispatch prompt, and the only mechanical enforcement available is
running the session itself under `--sandbox read-only`. And the model does not
reliably set `agent_type` anyway — across every acceptance run it set
`fork_turns="none"` and omitted the type; one probe parent even asserted the
field does not exist before being forced to pass it.

Before this change the Codex path went straight from "the agent type does not
exist" to inline review, which read no skills at all — the knowledge base was
published and never opened.

## Skill discovery

A generic reviewer has no specialist system prompt, so the instruction to
follow one is a no-op on Codex. The dispatch prompt now carries discovery
itself: a reviewer without a system prompt resolves the plugin's enabled
install and picks 3–5 skills matching the diff.

Neither the marketplace name nor the version can be hardcoded — the first is
whatever the user chose when adding the marketplace, the second moves with
every release — but globbing both is wrong too. A cache holds several versions
of the same plugin at once (a working Claude cache here carries 203 versions of
one plugin and two of `solopreneur/android-dev`), and the same plugin name can
appear under two marketplaces (`openai-curated/github` alongside
`openai-curated-remote/github`). A blind glob lets the reviewer check the diff
against superseded guidance and report it as current.

So discovery asks the host which install is enabled — the same source
`install-codex-agents.sh` already uses:

```text
codex plugin list --json   →   marketplaceName, version, enabled
"${CODEX_HOME:-$HOME/.codex}"/plugins/cache/<marketplaceName>/<plugin>/<version>/skills/
```

The glob stays as the fallback for hosts with no such listing, narrowed to the
highest semver. Either way the reviewer reports the absolute path of every
`SKILL.md` it read, which is what makes "did it really read the knowledge base"
checkable rather than narrated — and now also shows *which version* it read.

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
  reports. No agent role can hold that boundary — a child spawned with
  `agent_type="explorer"` writes files just as a typeless one does — so it rests
  on the prompt's "do NOT modify any files" plus whatever sandbox the session
  was started with. Run reviews under `--sandbox read-only` when the boundary
  needs to be enforced rather than instructed.
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

**Dated evidence.** The A2–A4 runs of 2026-08-14 exercised the original
dispatch prompt, which globbed the plugin cache. Review of #190 replaced that
with enabled-install resolution, so A2 was re-run on the new prompt (below) to
cover the step the change touches. A3 and A4 were not repeated: their evidence
is that a child thread is created and that the aggregate report survives each
surface, neither of which the discovery change alters. Their skill paths date
from the globbing prompt.

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

**Re-run on 2026-08-15, after discovery changed.** The dispatch prompt stopped
globbing the cache and started resolving the enabled install, which is exactly
what A2 verifies, so A2 was repeated on the new prompt with the same fixture.
Root thread `01a00104-3bd9-79d1-b451-2c156cf4cfc4` spawned child
`01a00104-c6ed-7b23-bd98-923a965c5f2d`, whose rollout carries `parent_thread_id`
back to the root. The child ran `codex plugin list --json` inside the spawned
thread — the one step no prior evidence covered — and its output carried
`marketplaceName: solopreneur`, `version: 0.6.0`, `enabled: true`. It then read
the same four skills under
`…/plugins/cache/solopreneur/android-dev/0.4.12/skills/`, byte-identical to
canonical, and opened its section with the rung-2 banner. It also ran
`git diff HEAD`, picking up a staged-only fixture that plain `git diff` would
have shown as empty.

Two things this run also showed. The model again omitted `agent_type`, so the
child rollout records no `agent_role` — consistent with every earlier run. And
the child listed its skills by bare name rather than absolute path, so the
output format now says a bare name does not count; the path is the evidence.
That tightening is wording only and postdates the run.

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
