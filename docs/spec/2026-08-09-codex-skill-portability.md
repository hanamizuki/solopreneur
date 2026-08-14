# Codex Skill Portability Architecture

**Status:** Approved design; rollout rows 3–9 complete; Greenlight, Plan Review,
Merge PR, Autopilot V1, and Preview are included as degraded on Codex exec,
TUI, and App

**Date:** 2026-08-09

**Scope:** all 106 skills in the canonical trees of the seven marketplace
plugins

**Related specs:** [Codex dual-publish](./2026-07-08-codex-dual-publish.md),
[pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md),
[Codex Greenlight port](./2026-08-10-codex-greenlight-port.md),
[Codex Autopilot dependency closure](./2026-08-11-codex-autopilot-dependencies.md),
[Codex Autopilot V1](./2026-08-12-codex-autopilot-v1.md), and
[Preview local-first delivery](./2026-08-12-preview-local-first.md)

The related specs remain authoritative for agent-distribution status.
Final-byte acceptance SHA `c8bae2710051da659afad879c226e202ad3368d4`
passed complete local-path and fresh per-case git-ref matrices. PR #155 was
squash-merged as `fc943a9` on 2026-08-09 without changing the accepted runtime
bytes. The slice is not yet included in a tagged plugin release. This changes
no skill support status and does not certify marketer skill portability or
complete content quality.

## Problem

The repository publishes skills originally authored for Claude Code through a
Codex marketplace surface. A common `SKILL.md` format and successful plugin
loading do not prove that a workflow behaves correctly on both harnesses.
Claude Code and Codex differ in subagent lifecycle, worktree ownership,
sandboxing, approvals, scheduling, tool vocabulary, install paths, and external
reviewer composition.

Maintaining a complete Claude copy and a complete Codex copy of every skill
would double the largest maintenance surface and create silent behavioral
drift. Sharing every file verbatim would create the opposite failure: complex
Claude orchestration would be discoverable in Codex even when its control flow
or safety invariants do not transfer.

The design therefore separates two questions that must not be conflated:

1. How many maintained sources does a skill need?
2. What support level has each platform actually earned through testing?

## Goals

- Keep one canonical source for portable skill behavior.
- Preserve one user-facing product identity per skill across platforms.
- Isolate platform-specific control flow without copying complete skill bodies.
- Publish only capabilities whose support level is explicit.
- Define parity by shared outcomes and safety invariants, not identical tool
  calls.
- Use current Claude Code behavior as the compatibility baseline while Codex
  support is added. Shared safety fixes apply to both engines rather than making
  the Codex port satisfy a stronger, unrelated contract.
- Make drift, accidental exposure, and unsupported platform vocabulary fail in
  CI.

## Non-goals

- Do not create one hand-maintained Codex copy per skill.
- Do not promise that Agent Skills format compliance implies runtime parity.
- Do not require every skill to reach full Codex support in one rollout.
- Do not reproduce Claude Workflow, Cron, or per-agent worktree APIs one for
  one when Codex has a different control model.
- Do not publish a high-level workflow merely because it loads.

## Product priority and enabling order

The P0 product outcome is a usable Codex Greenlight followed by Autopilot Codex
V1 for the `solopreneur` core. Current Codex releases expose real subagent
workflows in both interactive sessions and `codex exec`, so V1 is run-now,
single-PR orchestration with explicit worktree ownership. It uses a generic
Codex worker when a specialist is unavailable. Multi-PR waves and Codex App
scheduling remain separate later capabilities; the CLI path does not claim
Claude Workflow or Cron parity.

The compatibility registry and filtered Codex publication view are minimum
release-safety prerequisites, not user-facing product priorities. They may land
before or in parallel with Greenlight baseline work, but they must stay bounded
to classifying the current tree and preventing unsupported skills from being
exposed. They must not turn into a 106-skill parity project or displace the core
workflow path.

The core critical path is:

1. Add the registry, filtered publication view, and shared config/plugin-root
   resolver required to publish an honest Codex surface.
2. Preserve the measured Greenlight external-mode contract and bind its clean
   evidence to the reviewed head before public release.
3. Publish Greenlight Codex pull-request mode with unattended review,
   independent final-diff coverage, objective verification, and structured
   halt and result outputs.
4. Close only the Autopilot-critical `plan-review internal` and safe
   `merge-pr` seams.
5. Deliver Autopilot Codex V1 as run-now, single-pull-request orchestration with
   explicit worktree ownership. An unavailable specialist uses a generic Codex
   worker under the same brief and contract; it does not block core V1.

Greenlight's uncommitted and post-commit Codex modes, Autopilot multi-PR waves
and scheduling, other core engines, marketer domain-skill parity, remaining
specialist agents and routers, and broad portable-skill promotion are later
increments. No deferred capability is advertised before its own evidence lands.

## Architecture decisions

### 1. One skill identity, one canonical contract

A skill keeps the same name, purpose, inputs, outputs, and safety contract on
both platforms. Shared behavior is maintained once. Platform differences are
expressed as profiles or engines within the skill's resource boundary, not as
independent full copies of the product.

The public entry point stays concise and selects only the material needed for
the active platform. Detailed contracts and platform flows live in directly
linked references; deterministic state, parsing, and report generation belong
in shared scripts. This follows the Agent Skills progressive-disclosure model:
the entry point should remain below 500 lines where practical, with detailed
variants loaded on demand.

### 2. Three source shapes

Every skill has exactly one `source_shape` classification.

| Source shape | Use when | Maintained form |
| --- | --- | --- |
| `shared` | Platform primitives do not determine workflow state or safety | One skill entry and shared resources |
| `shared_with_seams` | The state machine is the same; only paths, tool invocation, user interaction, or a bounded provider choice differs | One entry plus small platform profiles or a shared resolver |
| `native_engines` | Lifecycle, isolation, scheduling, approval, waiting, retry, or transaction semantics materially change the control loop | One entry and shared contract, with separate Claude and Codex engine references |

The decision rule is semantic:

- A different tool name or config path is a seam.
- A different definition of completion, reviewer independence, ownership,
  isolation, or recovery requires a native engine.

`native_engines` does not authorize duplicated policy. Both engines must use
the same shared contract, schemas, deterministic scripts, and conformance
scenarios.

The classification can precede the physical split. During migration, a
Claude-only canonical implementation may be classified as `native_engines`
while every Codex surface remains `unsupported`; it does not need placeholder
contract or engine paths. A shared contract and both platform resources become
mandatory before a second platform surface is promoted to `degraded` or
`full`.

### 3. Support status is independent of source shape

Each skill records support by user-visible execution surface, not by an
ambiguous platform label. The initial surface IDs are `claude-code`,
`codex-exec`, `codex-tui`, and `codex-app`. Every surface is explicit; an
omitted or untested surface is `unsupported`.

The registry is a product contract, not a progress tracker, so new work that
has not passed acceptance stays `unsupported` until it earns a supported
status. Acceptance evidence records the harness version and relevant model
settings; evidence from one surface or version does not silently promote
another.

| Support status | Meaning |
| --- | --- |
| `full` | Required scenarios and invariants pass without a documented loss of capability |
| `degraded` | The supported subset and fallback are explicit, useful, and accepted |
| `unsupported` | The surface must not execute the workflow; publication is governed separately |
| `legacy` | Existing Claude behavior remains published, but cross-harness conformance has not yet been baselined |

A `shared` skill can still be `unsupported` because a required CLI, MCP server,
network permission, or host capability is absent. A `native_engines` skill can
be `full` on every surface. Source maintenance and product support must remain
separate fields in documentation, generation, and CI.

`legacy` is a migration status restricted to the 106 skills present on the
canonical `claude-code` tree when the first registry lands. It cannot be used
for Codex, for a later skill, or as evidence for a portability claim. It
preserves the honest current product state without labelling untested
orchestration `full`. Before a legacy skill's control flow changes or any Codex
surface is promoted, its relevant Claude baseline scenarios must replace
`legacy` with `full` or an explicit `degraded` result.

The canonical tree is the Claude publication surface today. Therefore
`claude-code: unsupported` is invalid until a future design provides a filtered
Claude publication view. Existing Claude skills may be `legacy`, `full`, or
explicitly `degraded`.

Surface support and package publication are separate because all Codex
surfaces consume one plugin skills view. The registry therefore also records a
single Codex publication decision. A guarded union is valid only after the host
has a reliable surface discriminator and executable guard evidence. Neither is
accepted in the current schema, so publication enforces the intersection: one
unsupported Codex surface excludes the skill from the shared Codex view.
Publication never upgrades that surface's support status.

### 4. Platform-neutral action vocabulary is the default

Shared instructions describe actions such as invoking a skill, reading a file,
dispatching a worker, collecting results, asking for a decision, or updating a
plan. They do not encode Claude or Codex tool call syntax.

Platform mappings may define how those actions are executed. A mapping is not
allowed to change safety policy, terminal states, reviewer independence, or
failure handling. If it must change any of those, the skill is
`native_engines`.

Action language is a writing and review rule, not a standalone migration
project. Vocabulary changes land with the skill or platform seam that consumes
them. Shared config-root and plugin-root resolution, by contrast, must have one
executable source rather than copied shell functions embedded across skills.

Vendored content remains unchanged. Its owning skill must either provide a
verified platform interpretation at its boundary or remain degraded or
unsupported on that platform.

### 5. Compatibility registry is the publication authority

A hand-maintained root-level `skills-compatibility.json` registry covers every
discovered `skills/*/*/SKILL.md`. JSON matches the existing Codex
generator and validation stack, which already use JSON and `jq`; adding a YAML
parser is not justified for this metadata. To keep the initial safety gate
bounded, common support and publication values are defaults, every skill ID is
listed exactly once under a source shape, and only exceptions carry a detailed
override. Validation resolves those three pieces into the product contract
below.

Each resolved registry entry contains:

| Field | Purpose |
| --- | --- |
| Skill ID | Stable `plugin:skill` identity |
| Source shape | One of the three maintenance classes |
| Surface support | Status for each declared execution surface |
| Platform publication | Whether the skill is included in each platform's publication view |
| Platform resources | Profile or engine references required for supported non-canonical surfaces |
| Shared contract | Required when `native_engines` supports more than the canonical Claude surface |
| Limitation reference | Required for every `degraded` surface |
| Acceptance scenarios | Evidence-producing scenarios required for every `full` or `degraded` surface |
| Legacy provenance | Architecture-baseline identity required for every `legacy` entry |
| Legacy baseline allowlist | Frozen original identity set that prevents a new skill from silently inheriting `legacy` |
| Internal skill dependencies | Repository skills that participate in support closure |
| External required capabilities | Required external skills, CLIs, MCP servers, network, or host capabilities |
| Optional enhancements | Capabilities that improve results but never gate the contract |

Missing entries, unknown skills, invalid enum values, invalid use of `legacy`,
missing resources, or a skill exposed contrary to its platform publication
decision are CI failures.
Internal dependencies must resolve to registry entries; a supported skill
cannot depend on an unsupported or excluded internal skill on the same surface.
Because Codex does not enforce plugin dependencies, hard dependencies must also
remain inside the same generated plugin root. External capabilities are
validated as declared prerequisites, while optional enhancements never enter
the hard dependency closure.

`legacy` satisfies only unchanged Claude-to-Claude dependency closure. It
cannot satisfy a gate for new behavior, a changed control flow, or any Codex
promotion. `scripts/codex-legacy-skill-baseline.txt` freezes the original 106
identities, with its bytes pinned by the validator. A promoted original skill
may leave `legacy` without changing that list; a later skill cannot enter it.

For Codex, the validator rejects publication when any reachable surface is
unsupported. A future surface-guard exception requires a separately reviewed
schema, a reliable discriminator, and executable evidence; an arbitrary file
reference cannot authorize publication. `allow_implicit_invocation: false` is
not a guard because explicit invocation remains possible. Canonical host guards
for wholly unsupported side-effecting skills are separately bound to each
skill's entrypoint and must contain the early stop contract.

Registry structure checks are conditional on support. A future Codex engine
path is not required while all Codex surfaces are `unsupported`. The validator
must reject invented placeholder paths and must require the shared contract,
platform resources, limitations, and scenarios before the related surface can
be promoted. A platform resource must already live inside the copied skill
directory or use that plugin's explicit shared-config overlay; other paths are
rejected because they would not enter the installed snapshot.

### 6. Codex gets a generated publication view

The canonical skill tree is not the Codex publication tree. Codex performs
conventional `skills/` discovery at a plugin root, and an alternate manifest
path cannot be relied on to hide that default directory. Metadata such as
`allow_implicit_invocation: false` also disables only implicit invocation and
still allows explicit invocation. Therefore an unsupported skill cannot share
the Codex installation root with the canonical tree.

For this contract, "published" means discoverable or invokable through the
plugin's installed skills root. Canonical source stays under
`skills/<name>/`, but excluded skill bytes are absent from the generated Codex
plugin snapshot.

The Codex generator will assemble its one publication view from the
compatibility registry. Per-surface statuses do not create separate packages:

- Skills whose Codex publication decision is `include` are included.
- Skills whose Codex publication decision is `exclude` are absent from the
  declared skills root.
- Shared skill content is taken verbatim from its canonical source.
- Platform profiles, engines, and Codex UI metadata are overlaid without
  creating a second hand-maintained skill body.
- Included skills have a valid supported dependency closure.

The physical view is generated under `plugins/codex/<name>/`. Each generated
root contains a conventional `.codex-plugin/plugin.json` and `skills/`, with
whole included skill directories copied from the canonical source. The core
config helper is copied only to the flattened fallback path already declared by
the consuming skills. Canonical source roots carry no platform manifest
directories. The Codex marketplace lists only plugins with at least one
included skill and points directly to these generated roots, so specialist
plugins can be added one at a time without exposing their siblings early. A
byte-identical `.codex/plugins/<name>` bridge remains only until the first
tagged symmetric-layout release.

The physical representation of this view was accepted on Codex CLI 0.147.0
with the one-skill fixture commit
`7cca235f20bd10388265cad40800338fa4012838`. Local-path and fresh git-ref
installs both cached exactly the included `filter-canary` directory and no
canonical sibling such as `autopilot`; the generated manifest also passed the
official plugin validator. An authenticated git-ref run under an isolated home
resolved the installed absolute skill path and returned the canary's exact
`FILTER_CANARY_ONLY` contract (session
`019ff048-7bb8-7c70-b8c3-fdd8a4ee1a07`). This proves that Codex neither falls
back to nor rescans the canonical `skills/` directory.

### 7. Behavioral conformance, not loadability, grants support

Validation has four layers:

1. **Registry and structure:** every skill is classified; referenced profiles,
   engines, contracts, and limitation documents exist.
2. **Publication:** generated views contain exactly the allowed skills and
   install successfully from local and git-ref marketplaces.
3. **Vocabulary and ownership:** shared instructions do not depend on a
   platform control primitive outside an allowed platform resource.
4. **Behavior:** registry-linked scenarios prove required outcomes, artifacts,
   stop conditions, and failure behavior on each claimed surface.

Loadability checks remain useful but cannot upgrade a skill from `unsupported`.
Complex workflows require real-session scenarios and captured machine-readable
evidence where the harness exposes it.

Test depth follows source risk:

- `shared` requires two-harness discovery plus representative behavior and
  prerequisite checks; it does not require a bespoke orchestration suite for
  every reference-only skill.
- `shared_with_seams` additionally exercises every declared seam on each
  supported surface.
- `native_engines` runs the same contract scenarios against every supported
  engine and surface.

Support promotion and its scenario references land in the same change. A
scenario records the harness surface and version so a TUI result cannot be
used as evidence for `codex-exec` or `codex-app`.

### 8. Degradation is a product decision

A degraded path must state what remains available, what is omitted, how the
user is informed, and which invariant still holds. Silent inline execution,
pretend delegation, or narration of a tool call that never happened is a
failure, not graceful degradation.

Promotion from `degraded` to `full`, or acceptance of a new degradation, must
update the registry and its behavioral scenarios in the same change.

## Source-shape inventory

The registry enumerates and validates all 106 canonical skills. Source shape is
a maintenance classification, not a Codex support claim.

| Source shape | Count | Initial scope |
| --- | ---: | --- |
| `shared` | 88 | All Android, iOS, AI engineering, and Neo4j skills; nine designer skills; six marketer skills; `perspective` and `post-mortem` |
| `shared_with_seams` | 12 | `impeccable`, `slide-design`, `codex-agents-bootstrap`, `handoff`, `merge-pr`, `preview`, `rebuild-skill-index`, `session-retro`, `specialist-review`, `todos-cleanup`, `todos-review`, `worktree-handoff` |
| `native_engines` | 6 | `greenlight`, `autopilot`, `mvp`, `plan-review`, `todos-babysit`, `using-marketer` |

`handoff` is at least a seam because delivery tools differ. `plan-review` and
`using-marketer` require native engines because reviewer independence and
subagent lifecycle affect their control flow. `codex-agents-bootstrap` is a
seam because the workflow is deterministic but its paths and target host are
Codex-specific.

New skills default to `unsupported` on all Codex surfaces until their acceptance
evidence lands.

## Greenlight pilot

Greenlight is the first workflow portability pilot because Autopilot depends on
it and because its current entry point combines policy, reviewer selection,
state transitions, subagent orchestration, config resolution, and report
generation in one large file.

### Shared Greenlight contract

The [Codex Greenlight port](./2026-08-10-codex-greenlight-port.md) scopes what
actually differs between the two hosts. There is no separate cross-host
contract: the shipped `greenlight/SKILL.md` is the specification, and its
pre-flight, cursor, polling, classification, and fallback logic is already
host-independent shell. V1 is `/greenlight external` with a Claude CLI gate —
the subset that needs no subagent — running from the same skill body. Whether
Codex can drive that loop end to end is settled by measurement against a real
pull request, not by contract.

The following remain platform-independent:

- Target selection and unattended versus interactive mode.
- Size classification, round limits, and retry ceilings.
- Finding, evidence, reviewer-result, and final-result schemas.
- Halt, flag, pass, and failure taxonomy and terminal-state priority.
- Reviewer independence groups for the host and every reviewer. A reviewer in
  the host's equivalence group cannot satisfy the independent-review gate.
- Internal review is advisory and cannot grant final pass. The selected
  external gate is the only reviewer that can end the loop clean, and a primary
  reviewer that returned findings cannot be replaced merely to obtain a clean
  result from its fallback.
- Greenlight freezes one PR head SHA before triggering the final gate, prohibits
  mutation while that review is in flight, and accepts clean only for that head.
- Any finding, CI repair, merge preparation, or other later mutation creates a
  new head and invalidates the earlier clean result.
- Deterministic GitHub parsing, state persistence, report generation, and
  artifact validation.
- Scenarios that assert the same outcome and safety invariant on both
  platforms.

### Platform engine responsibilities

The Claude engine owns Claude Agent and Workflow dispatch, Claude config and
plugin path resolution, Claude worktree behavior, and the provider selected as
an independent reviewer when Claude is the host.

The Codex engine owns Codex spawn, wait, follow-up, and completion semantics;
Codex sandbox and worktree ownership; Codex config and plugin path resolution;
and an independent reviewer that is not merely another equivalent Codex pass.

The reviewer registry must expose enough provider or model-family metadata to
derive a stable `independence_group`. Each engine maps its host identity to the
same grouping. If no qualifying independent reviewer is available, or the host
identity cannot be established, Greenlight returns the contract's explicit
halt result; it never reports clean.

Neither engine may redefine Greenlight's severity policy, terminal states,
evidence requirements, or acceptance criteria.

### Greenlight acceptance gates

- The shared entry point is reduced to contract navigation and engine
  selection; platform control syntax does not remain scattered through it.
- The Claude engine passes existing representative Greenlight scenarios before
  Codex behavior is introduced.
- Codex scenarios prove real child lifecycle and artifact collection rather
  than relying on narrated delegation on every supported Codex surface.
- Reviewer independence and final-diff coverage are verified for every
  supported host surface.
- Cross-host acceptance proves that the `external` subset reaches the same
  terminal outcome on both hosts: gate selection, anti-shopping fallback, and a
  clean plus seeded-finding result for each host's default CLI gate. CLI
  verdicts are prose-parsed — no CLI in use exposes a structured verdict — so
  the oracle is the loop's terminal classification, not a JSON payload. Missing
  optional integrations do not block host conformance, while a failed
  invocation remains visible.
- Greenlight remains the only writer while a review is in flight. Binding a
  verdict to the reviewed head, and everything downstream of it, is tracked as
  a Claude-side defect rather than a Codex parity gate; see
  [the head-binding todo](../../todos/backlog/2026-08-10_greenlight-head-binding.md).
- Interrupted, partial, and failed reviewer runs produce the same classified
  terminal result on both platforms.
- No complete Greenlight skill body is copied into a second tree.

Before the Claude split, baseline scenarios must cover uncommitted, pull
request, and post-commit modes; mutation boundaries; upward-only sizing and
round limits; reviewer exhaustion; repeated verification failure; and child
interruption. Those same scenarios become the cross-engine conformance suite.

## Relationship to agent distribution

The marketer agent pilot and skill portability are independent tracks. The
distribution slice is complete: final-byte acceptance SHA
`c8bae2710051da659afad879c226e202ad3368d4` passed the complete R02/R07/R08/R09
matrices on both installation paths, and PR #155 was squash-merged as
`fc943a9`. That accepts distribution, routing, and final delivery on the tested
exec and TUI surfaces only. The slice remains unreleased. This spec separately
answers whether a skill executed by that agent or by the parent satisfies the
same cross-platform behavioral contract.

Evidence does not transfer between the tracks: a linked child thread does not
prove its skills are portable, and a loadable skill does not prove agent TOML,
bootstrap, or delegation behavior. The merged PR 5a/v2 vertical slice satisfies
the agent-distribution prerequisite and does not certify marketer skill parity.

## Rollout

| PR | Scope | Gate |
| --- | --- | --- |
| 1. Architecture | This independent spec and backlog update | No runtime, pilot-document, or packaging change |
| 2. Marketer distribution prerequisite | Resolve the paused agent-distribution vertical slice and update its authoritative pilot documents | complete; accepted at `c8bae27`, merged through PR #155 as `fc943a9`, unreleased, and no marketer domain-skill parity claim |
| 3. Registry safety | Complete — all 106 discovered skills are classified and fail-closed defaults, evidence, resources, dependencies, and host guards are validated | Re-enumerate every skill at that commit; discovery remains authoritative |
| 4. Publication safety | Complete — generated install roots are registry-filtered; local and git-ref canary installs passed on Codex CLI 0.147.0 | Only registry-included skills are exposed through the declared root; inert snapshot bytes do not count as exposure |
| 5. Shared core foundations | Add one executable config/plugin-root resolver and platform-resource validation | Greenlight scripts and prompts resolve the same platform-aware config; existing Claude behavior remains unchanged |
| 6. Greenlight baseline | Complete — A2 run 1 ended in push-back on a non-convergent fixture; run 2 produced the accepted seeded-finding → fix → re-review → clean terminal path | The `external` subset runs from the same skill body on both hosts; divergences and the clean-pass size ceiling are recorded in the Greenlight port spec |
| 7. Greenlight Codex PR mode | Complete — the degraded `external` S/M surface is accepted on exec, TUI, and App and included in the filtered publication | Structured pass, halt, and failure results; no clean result without an independent final-diff reviewer. Reviewed-head binding remains a shared defect, not a Codex parity gate |
| 8. Autopilot dependency closure | Complete — degraded `plan-review internal` and mutation-free `merge-pr` profiles are accepted on exec, TUI, and App and included in filtered publication | Plan Review is findings-only; Merge PR performs no pre-merge mutation, pins CI to the head, and uses GitHub's atomic head precondition |
| 9. Autopilot Codex V1 | Complete — run-now, single-PR orchestration is included with explicit worktree ownership and a built-in worker fallback | PR #174 completed plan review, implementation, Greenlight, exact-head CI, atomic merge, parent verification, cleanup, and structured reporting; merged as `1b0dd7f` |
| 10. Core workflow expansion | Add Greenlight's remaining modes, then Autopilot multi-PR waves | Each mode earns its own support status and preserves the shared contract |
| 11. Scheduling | Add Codex App scheduling as a separate capability | No CLI or run-now path claims Claude Cron parity |
| 12. Remaining core | Port `mvp`, `todos-babysit`, and other core seams in dependency-sized changes | No bundled control-plane rewrite |
| 13. Deferred plugin breadth | Resume marketer domain-skill parity, remaining specialist agents and routers, and portable-skill batches | Per-skill registry evidence; loadability alone is insufficient |

Autopilot must not begin its Codex engine merely because Greenlight's contract
exists. On each target surface, Greenlight must be `full`, or its `degraded`
contract must retain unattended pull-request review, structured halt and reason
results, independent final-diff coverage, objective verification, and the final
result summary that Autopilot consumes. `plan-review internal` and `merge-pr`
must also have a supported dependency closure on that surface. A CI repair or
any other head mutation invalidates the prior Greenlight result: Greenlight and
CI must run again before merge. The V1 `merge-pr` seam must not perform a new
post-Greenlight consolidation mutation unless it reruns both gates afterward;
prefer moving consolidation before final review.

App scheduling is a later capability. The initial Autopilot Codex scope is
run-now and single-PR only; a mapping must not pretend to reproduce Claude Cron,
Workflow, or automatic per-child worktree behavior. Specialist agents are
optional enhancements in V1. If the requested specialist is unavailable, the
orchestrator uses a generic Codex worker with the same self-contained brief and
acceptance contract.

The agent-distribution and filtered-publication prerequisites are complete.
The registry includes degraded Greenlight, Plan Review, Merge PR, Autopilot V1,
and local-only Preview on exec, TUI, and App; reviewed-head binding remains in
the shared backlog and does not block Codex publication. Preview's explicit
Vercel mode fails closed on every Codex surface. Autopilot V1 is accepted, so
the next orchestration slice is row 10: Greenlight's remaining modes followed
by Autopilot multi-PR waves.
Marketer portability seams and remaining agent adapters are not on the core
critical path; when resumed, they still roll out one plugin at a time after
that plugin's skills have complete registry entries.

## Release policy

- A plugin release exposes only skills marked for inclusion by the compatibility
  registry for that platform.
- Registry, generated filtered plugin roots, marketplace, and platform metadata
  must be regenerated and staged atomically by the release workflow.
- Release notes distinguish full and degraded capabilities; unsupported work is
  not advertised as an installed feature.
- Claude and Codex continue to share plugin versions and tags unless a future
  packaging constraint demonstrates that lockstep releases are unsafe.

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI skill metadata and invocation policy](https://developers.openai.com/codex/skills)
- [OpenAI Codex subagents](https://developers.openai.com/codex/agent-configuration/subagents)
- [OpenAI scheduled tasks](https://learn.chatgpt.com/docs/automations)
- [Superpowers harness-porting architecture](https://github.com/obra/superpowers/blob/main/docs/porting-to-a-new-harness.md)
