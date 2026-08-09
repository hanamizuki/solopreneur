# Codex Dual-Publish

**Status:** Approved architecture. Rollout PRs 1–4 are on `main`; the PR 5a
marketer vertical slice resumed after a Codex 0.147.0 retest removed the old
headless-delegation blocker. Local-path and fresh git-ref matrices passed at
`954fc64` and proved the terminal-completion shortcut, but a later blocker
ruling changed the router wording that defines that lifecycle contract. The new
final SHA, `c8bae2710051da659afad879c226e202ad3368d4`, has now passed both
complete matrices. CI, review, and merge remain pending; the slice has not
merged or shipped.
**Date:** 2026-07-08
**Current review:** 2026-08-09
**Affected plugins:** all seven (`solopreneur`, `designer`, `marketer`,
`ios-dev`, `android-dev`, `ai-engineer`, `neo4j-dev`)
**Evidence:** [pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md)

## Problem

The repository publishes seven Claude Code plugins from one marketplace. The
same repository now contains generated Codex manifests and a Codex marketplace,
so all seven plugin snapshots are installable. The remaining gap is behavioral:
Codex plugins do not register custom agents, platform-specific agent prompts are
not portable verbatim, and multi-agent routing needs an explicit adapter and a
testable installation path.

The goal is one repository and one skill source of truth, with small
platform-specific manifests and agent adapters. Installing either platform's
plugin should expose the same underlying capabilities without changing Claude
Code behavior.

## Goals

- Keep all seven sub-plugins independently installable on both platforms.
- Maintain every shared skill once under `plugins/<name>/skills/`.
- Generate every derivable Codex surface and fail CI on drift.
- Preserve hand-authored custom agents and fail closed when managed agents
  cannot be reconciled safely.
- Make delegation observable and mechanically testable instead of accepting
  narrated delegation as evidence.
- Keep releases, versions, tags, and changelog entries shared across platforms.

## Non-goals

- No suite or bundle plugin.
- No Codex dependency enforcement before Codex exposes a dependency contract.
- No package artifacts for local testing.
- No relocation of shared skills outside their plugin directories.
- No separate Codex changelog, version, or tag namespace.
- No claim that every marketer workflow is platform-neutral in PR 5a; the
  vocabulary and workflow audit remains a later rollout stage.

## Verified platform facts

The current contract was verified against Codex CLI 0.147.0 on 2026-08-09 and
the current official plugin and subagent documentation:

- Codex plugins package skills, apps, and MCP servers, but do not register
  custom agents. An explicit `skills` root is part of the documented plugin
  manifest.
- Custom agents are TOML files under a project `.codex/agents/` directory or a
  user's Codex agents directory. `name`, `description`, and
  `developer_instructions` are required; the TOML `name` is the identity source
  of truth.
- Multi-agent support is enabled by default. Codex may delegate after a direct
  request or when applicable skills or project instructions tell it to do so.
- On the current Sol/Terra V2 tool surface, a full-history fork combined with a
  custom agent-type override is rejected. Router skills therefore make one
  named-agent call with both the agent type and `fork_turns="none"` set
  explicitly; omitting either field is not permitted.
- V2 child activity is persisted in rollout JSONL, but `codex exec --json` does
  not currently expose the complete V2 spawn lifecycle. Live acceptance must
  inspect parent and child rollout linkage rather than grep stdout.
- Plugin installation is a snapshot under the active Codex home. The installed
  list supplies the marketplace, plugin, version, and enabled state needed to
  locate the exact cache snapshot.
- Claude Code ignores a TOML sibling next to a Markdown agent; a fixture with a
  shared basename loaded only the Markdown agent.

The plugin contract is documented at
<https://learn.chatgpt.com/docs/build-plugins>. The subagent contract is
documented at <https://learn.chatgpt.com/docs/agent-configuration/subagents>.

## Decisions

1. **Structure** — mirror the seven existing sub-plugins; `marketer` is the
   first behavioral vertical slice.
2. **Dependencies** — document that feature plugins rely on `solopreneur` for
   shared workflows and agent bootstrap; preserve graceful degradation.
3. **Non-skill directories** — keep vendoring metadata at plugin-root
   `vendor/` and shared helpers at `plugins/solopreneur/shared/`.
4. **Agents** — maintain a concise Codex TOML adapter beside each Claude
   Markdown agent, generate project copies, install user copies through one
   deterministic bootstrap skill, and route through one `using-*` skill per
   plugin.
5. **Vocabulary** — write new adapters in platform-neutral language; audit
   native skills separately and leave vendored sources untouched.
6. **Local development** — install directly from the repository marketplace;
   do not build a package artifact.
7. **Release** — derive Codex versions from Claude manifests in the same release
   commit and retain the existing double-dash tags and single changelog.
8. **Skill layout** — keep skills under their existing plugin; a generated
   catalog may provide a cross-plugin view.
9. **Router shape** — use a small decision boundary, not a duplicate skill
   catalog or a second agent prompt.
10. **Router naming** — use `using-<plugin>` consistently.

## File ownership

| Path | Platform | Ownership |
| --- | --- | --- |
| `plugins/<n>/skills/**` | both | hand-maintained |
| `plugins/<n>/agents/<n>.md` | Claude Code | hand-maintained |
| `plugins/<n>/agents/<n>.toml` | Codex source | hand-maintained |
| `plugins/<n>/.claude-plugin/plugin.json` | Claude Code and version source | hand-maintained |
| `plugins/<n>/.codex-plugin/plugin.json` | Codex | generated |
| `scripts/codex-manifest-overlays.json` | Codex metadata | hand-maintained |
| `.claude-plugin/marketplace.json` | Claude Code | hand-maintained |
| `.agents/plugins/marketplace.json` | Codex | generated |
| `.codex/agents/*.toml` | Codex project agents | generated byte-identical copies |
| `plugins/<n>/vendor/` | repository maintenance | generated by vendor sync |
| `plugins/solopreneur/shared/` | both | hand-maintained |
| `docs/skills-catalog.md` | documentation | generated |

Generated files are committed because installers consume repository snapshots;
there is no build phase during installation. One generator owns plugin
manifests, the Codex marketplace, and project agent copies.

## Manifest and marketplace contracts

Each generated Codex plugin manifest copies `name`, `version`, `description`,
and `license` from the Claude manifest. It sets an empty hooks object to prevent
Claude-format hooks from being interpreted, declares `./skills/` explicitly,
and merges only Codex-specific interface metadata from the overlay. Overlay
files may not replace generator-owned fields.

The generated Codex marketplace mirrors all seven published plugin names,
sources, descriptions, and licenses. Installation and authentication policies
are explicit, and category comes from the same interface overlay used by the
plugin manifest.

A git ref freezes the entire repository snapshot. Pinning one plugin's tag also
freezes the other six at that commit; mixed-version installs require separate
marketplace entries.

## Agents and delegation

### Agent adapters

A Codex TOML is a platform-equivalent adapter, not a verbatim copy of the
Claude system prompt. It preserves the role, evidence discipline, output
quality, and material operating constraints while removing Claude tool names,
Claude configuration paths, duplicated skill metadata, and model slugs that do
not exist in Codex. Its tool-schema description retains the specialist role and
states the exact `agent_type="marketer"` and `fork_turns="none"` call contract.

The TOML filename stem, TOML `name`, managed marker identity, plugin identity,
and same-name Markdown sibling must agree. The generator validates the TOML
schema and vocabulary before replacing any generated output.

### Distribution

Repository contributors receive byte-identical project agents under
`.codex/agents/`. Plugin users run the `codex-agents-bootstrap` skill because a
plugin snapshot alone cannot register those agents.

The bootstrap implementation has the following contract:

- Discover only the active installed list from `codex plugin list --json`; do
  not scan stale cache directories or guess an alternate cache layout.
- Accept managed identities only from the official `solopreneur` marketplace
  and the six known agent-bearing plugin/agent pairs.
- Resolve the exact installed cache version, reject symlinked cache paths and
  malformed, markerless, or symlinked managed sources, and validate all sources
  before creating the destination directory.
- Treat the exact first-line marker, root TOML name, filename, and canonical
  plugin/agent pair together as ownership. Never overwrite a markerless file,
  a symlink, a non-regular file, a marker/name mismatch, or another file
  declaring the same agent identity.
- Before any destination creation or copy, inspect base user-layer declarations
  in `$CODEX_HOME/config.toml` and recursively inspect
  `$CODEX_HOME/agents/**/*.toml`, including hidden files and directories. A
  declared role keeps its exact table-key identity unless its `config_file`
  provides a nonblank root `name`, which is trimmed and takes precedence; that
  declared file is excluded from directory discovery just as it is in Codex
  0.147. Reject malformed config and any symlink, dangling path, or non-regular
  node rather than following it. Managed install and orphan ownership remain
  top-level operations.
- Interpret that collision scan only as base user-layer candidate protection.
  Profile, project, command-line, and managed configuration layers can take
  precedence at runtime and are not claims this bootstrap can reconcile.
- Stage a byte-verified mode-0600 copy in the destination directory, reparse its
  exact marker and identity, immediately rerun the user-layer identity scan,
  recheck destination ownership, and atomically rename it. A collision or
  unsafe path detected during that immediate scan aborts without committing
  the staged copy. This narrows the ordinary race window but is not a claim of
  atomic coordination with independent config writers. A byte-identical
  destination with the wrong mode is repaired.
- Report installed, updated, unchanged, skipped, inactive, and orphaned agents.
  A disabled source is inactive; if its managed destination remains, that copy
  is also orphaned. `Orphaned` means only that no active solopreneur source
  claims a fully proven top-level managed copy. It is a manual-review candidate,
  not proof of runtime non-use or removability because another config layer may
  still reference it. Suspicious marker/path/identity combinations are skipped.
  Never suggest or perform removal without an explicit, separate config-layer
  audit and user approval.
- Run with macOS system Bash 3.2 as well as current Bash; Bash 4-only features
  are forbidden. Python 3.9 or newer is required; every supported Python
  version uses the same bundled Tomli 2.4.1 parser without runtime installation
  or network access.

### Router skills

The router distinguishes synthesis from a skill workflow:

- Its catalog description identifies it as the first routing gate, covers an
  explicit marketer request, and carries the exact Codex V2 call and no-retry
  rules so correct dispatch does not depend on reading the body first.
- The active `marketer` agent always continues inline and never delegates;
  this current-agent guard precedes every other rule on both harnesses.
- The router decides before reading or invoking any marketing domain skill; it
  uses installed skill names and descriptions for that decision.
- An explicit request for the named specialist delegates once.
- If one installed skill fully covers the request, that skill runs inline even
  when it contains multiple steps or outputs.
- Cross-concern synthesis delegates to the named agent. Multiple deliverables
  delegate only when no single installed skill fully covers all of them, unless
  the user requests inline work.

Post-decision execution has three mutually exclusive branches. An inline route
makes zero agent calls and executes its selected skill set inline. A delegation
route with a known-unavailable named agent also makes zero agent calls and uses
the smallest applicable inline fallback. A delegation route with an available
named agent makes exactly one call: on V2, `spawn_agent` with
`agent_type="marketer"` and `fork_turns="none"`; on Claude Code, the equivalent
`Agent` call with `subagent_type="marketer"`. It never substitutes a generic
agent, splits the brief across agents, or retries with another type. The
self-contained brief contains only the objective, deliverables, language,
constraints, evidence paths, and bounded assumptions. The child does not
delegate again.

After an accepted Codex spawn, the child is the selected execution path. The
outer budget is fifteen wait cycles. Each cycle calls `wait_agent` once with a
60-second timeout; early mailbox wake-ups still consume a cycle. An exact
canonical child completion injected by that wake is integrated immediately and
ends polling. A timeout, progress-only message, or unknown non-terminal wake
instead requires a `list_agents` check of the canonical child status and is not
itself a child failure. A missing canonical path is treated as not found. While
the child remains pending or running and cycles remain, the parent does not send
or follow up, interrupt it, retry, start the delegated work inline, or answer.
Only a completed child result is integrated. A rejected call, missing path, or
tool-reported errored or shutdown state enters the zero-additional-agent inline
fallback.

If the fifteenth non-completing cycle reports a still-pending or running child,
it is interrupted once; the parent marks delegation failed, makes no further
agent calls, and uses the minimal inline fallback. That path cannot satisfy live
delegation acceptance.
Explicit user cancellation or replacement may interrupt sooner but does not
authorize completing the original delegated work inline or reporting it as
successful delegation. An unexpected interrupted state instead surfaces
delegation failure without inline completion or a success claim.

## Known compatibility scope

PR 5a proves the adapter, distribution, and routing architecture with marketer;
it does not certify every marketer skill. The later vocabulary gate must resolve
at least these verified couplings before full marketer parity is claimed:

- `naming` assumes Claude is always the execution harness in its ensemble.
- `slide-design` contains Claude-specific interaction, multimodal-read, and
  command vocabulary.
- `linkedin-growth` uses a Claude configuration path to infer project context.

The same inventory must be repeated for each remaining plugin before its agent
adapter ships.

## Dependency audit

| Plugin | Agent | Main external surfaces | Risk boundary |
| --- | --- | --- | --- |
| `solopreneur` | none | GitHub, Vercel, reviewer CLIs, optional context7 | workflow actions may change remote state |
| `designer` | `designer` | Pencil, Stitch, context7, browser tooling | mostly local; optional network and browser actions |
| `marketer` | `marketer` | optional reviewer CLIs, browser tooling, CDN fetches | primarily local content synthesis |
| `ios-dev` | `ios-dev` | Xcode, App Store Connect, RevenueCat, browser automation | release workflows affect remote stores |
| `android-dev` | `android-dev` | Gradle, ADB, Google Play Console | release workflows affect remote stores and devices |
| `ai-engineer` | `ai-engineer` | Python and optional context7 | primarily local code and tests |
| `neo4j-dev` | `neo4j-dev` | Neo4j, Aura, context7 | database and cloud API mutations |

Credentials shown in skills are placeholders for their external tools, not
values read at skill load time. Optional integrations must retain graceful
degradation; a skill that requires a remote service owns that requirement.

## Validation

Validation is layered so deterministic failures do not consume model calls:

1. **Generation drift** — regenerate all Codex surfaces and fail on any diff.
2. **Agent source validation** — parse TOML, validate required fields, identity,
   sibling, uniqueness, marker, symlink status, and forbidden vocabulary.
3. **Bootstrap fixtures** — run install, update, no-op, collision, symlink,
   orphan, malformed-input, duplicate, path, copy-failure, and rename-failure
   cases with the system `/bin/bash` on Ubuntu and macOS.
4. **Install integration** — install all seven plugins into a throwaway Codex
   home, execute the cached bootstrap, compare source and destination bytes,
   and prove a second run is unchanged.
5. **Authenticated delegation acceptance** — in isolated user, Codex, and
   project homes, run the fixed four-case matrix: R02 is the explicit marketer
   request and R07 is the first natural router prompt, both on `codex exec`;
   R08 and R09 are the remaining natural prompts in the interactive TUI. Both
   the local-path install and the git-ref install run that same surface mapping.
   Parse persisted parent/child rollout linkage and reject narrated-only
   delegation, a full-history fork error, a wrong agent identity, nested
   delegation, a missing child result, or any parent send, follow-up, or
   interruption before the child terminal result. An exact terminal-completion
   wake is integrated immediately and ends polling without a list check. Only a
   timeout, progress-only message, or unknown non-terminal wake requires a
   canonical status check; every wait still consumes one of fifteen cycles.
   Exhausting those cycles is a defined product fallback but still fails this
   live delegation gate. This is a maintainer gate, not public CI, because it
   uses authentication and model quota.

The first local-path matrix passed on 2026-08-09, but it covered the router
revision before the lifecycle rule above. The first git-ref attempt then showed
R08 interrupting a still-running child after repeated polling timeouts. That
attempt failed, and the earlier local result cannot satisfy the merge criterion.

The later local-path and fresh git-ref matrices passed at `954fc64`. R02 and
R07 passed on `codex exec`; R08 and R09 passed in the interactive TUI. Every
case made one exact
`agent_type="marketer"`, `fork_turns="none"` call, produced one direct marketer
child and no nested, generic replacement, or extra root, delivered the child's
complete final result, and reached one root-parent final answer and task
completion. No parent `send_message`, `followup_task`, or `interrupt_agent`
call occurred before the recorded completion. Each fresh per-case git-ref
install resolved that exact SHA, reproduced the source router and agent bytes in
the installed snapshot and managed agent, and reported bootstrap `Installed`
followed by `Unchanged`.

The git-ref coordinator used one wait/list cycle for R02, three for R07, six
waits and five list checks for R08, and eight wait/list cycles for R09. R08's
sixth wait delivered the exact terminal completion, so the coordinator
integrated it without another list check; only a timeout, progress-only, or
unknown wake required that follow-up status check. This is retained as
calibration evidence for agent distribution, routing, lifecycle behavior, and
recorded output anchors. It does not certify marketer skill parity or complete
content quality.

A subsequent blocker ruling made that shortcut explicit in the router wording:
terminal completion integrates and stops immediately, while only timeout,
progress-only, or unknown non-terminal wakes proceed to `list_agents`. Because
the router bytes changed, `954fc64` is no longer final-byte merge acceptance.

The new final SHA, `c8bae2710051da659afad879c226e202ad3368d4`, passed the
complete local-path and fresh per-case git-ref matrices. R02 and R07 passed on
`codex exec`; R08 and R09 passed in the interactive TUI. In every case the
hardened verifier recorded the exact `agent_type="marketer"`,
`fork_turns="none"` call, one direct marketer child, no nested or generic child
and no extra root, the complete child final, the unique root final answer and
task completion, the required non-sensitive result anchors, and zero parent
`send_message`, `followup_task`, or `interrupt_agent` calls before completion.
Both installation paths produced byte-identical source, installed, and managed
agent files, with bootstrap `Installed` followed by `Unchanged`.

The local wait/list counts were R02 1/0, R07 4/3, R08 9/8, and R09 11/10. The
git-ref counts were R02 1/0, R07 2/1, R08 12/11, and R09 6/5. Every final wait
delivered terminal completion; every preceding non-terminal wake was followed
by a list check, and every case stayed within the fifteen-cycle budget. This
satisfies the authenticated agent-distribution and routing gate. It does not
certify marketer skill parity or complete content quality. CI, review, and
merge remain pending, so PR 5a has not merged or shipped.

The versioned router eval fixture freezes twelve non-sensitive decision-boundary
inputs and their expected route, spawn count, agent identity, history fork, and
failure behavior. It records expectations only. Static validation of that file
is not live evidence and cannot satisfy the authenticated delegation gate. R06
remains an expectation-fixture boundary but is not selected for the live
matrix. R11 and R12 are failure-boundary expectations and optional diagnostics;
neither replaces any of the four required live cases.

## Versioning and release

The release workflow already runs the Codex generator in the bump commit. Its
exact staging set includes Claude manifests, Codex manifests, the Codex
marketplace, generated project agents, and the changelog. Tags remain
`<plugin>--v<version>`, and the changelog stays platform-shared.

Required CI pins a known Codex CLI version so an upstream release cannot change
the merge gate silently. A separate latest-version canary may report future
contract drift without replacing the pinned gate.

## Rollout

| Stage | Scope | State |
| --- | --- | --- |
| 1 | Approved architecture | complete |
| 2 | Vendored `$N` escape prerequisite | complete |
| 3 | Move non-skill directories to `vendor/` and `shared/` | complete |
| 4 | Generate seven manifests and marketplace; add drift/install CI | complete |
| 5a | Marketer TOML, router, secure bootstrap, and live delegation gate | active; final-byte authenticated distribution accepted at `c8bae27`, CI/review/merge pending |
| 5b | Five remaining TOMLs and six remaining routers | blocked on 5a acceptance |
| 6 | Native vocabulary and workflow compatibility audit | pending |
| 7 | Complete public install and release documentation | pending |

PR 5a may merge only after local-path and git-ref installation both produce a
byte-identical bootstrapped marketer agent, deterministic gates pass on macOS
and Linux, and authenticated acceptance records a real marketer child for the
complete R02/R07/R08/R09 matrix from both the local-path and git-ref installs.
The generated project copy must remain byte-identical to its source, and Claude
must continue to load only the Markdown sibling.

The `954fc64` runs remain valid lifecycle calibration. The final-byte
authenticated local-path and git-ref distribution criterion is satisfied at
`c8bae2710051da659afad879c226e202ad3368d4`; CI, review, and merge remain
pending.

## Remaining questions

- Does the router stay reliable when a clean user installs the largest plugins
  and Codex applies its skill-context budget?
- Which remaining skills need platform-neutral rewrites versus a documented
  harness mapping?
- Should a future Codex plugin contract that can register agents replace the
  bootstrap, or merely become a second generated distribution surface?
