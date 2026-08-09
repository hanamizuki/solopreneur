# Codex Skill Portability Architecture

**Status:** Approved design; implementation pending

**Date:** 2026-08-09

**Scope:** every skill published by the seven solopreneur plugins; 104 exist at
this commit

**Related specs:** [Codex dual-publish](./2026-07-08-codex-dual-publish.md), [pilot findings](./2026-07-15-codex-dual-publish-pilot-findings.md)

The related specs remain authoritative for agent-distribution status on
`main`: PR 5a is paused there. A separate v2 effort must update those documents
with accepted current evidence before it can satisfy this plan's distribution
gate. This architecture does not itself unpause or certify that pilot.

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
- Keep Claude Code behavior unchanged while Codex support is added.
- Make drift, accidental exposure, and unsupported platform vocabulary fail in
  CI.

## Non-goals

- Do not create 104 hand-maintained Codex copies.
- Do not promise that Agent Skills format compliance implies runtime parity.
- Do not require every skill to reach full Codex support in one rollout.
- Do not reproduce Claude Workflow, Cron, or per-agent worktree APIs one for
  one when Codex has a different control model.
- Do not publish a high-level workflow merely because it loads.

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

`legacy` is a migration status restricted to the 104 skills already present on
the canonical `claude-code` surface at this architecture baseline. It cannot be
used for Codex, for a skill added after this baseline, or as evidence for a
portability claim. It preserves the honest current product state without
labelling untested orchestration `full`. Before a legacy skill's control flow
changes or any Codex surface is promoted, its relevant Claude baseline
scenarios must replace `legacy` with `full` or an explicit `degraded` result.

The canonical tree is the Claude publication surface today. Therefore
`claude-code: unsupported` is invalid until a future design provides a filtered
Claude publication view. Existing Claude skills may be `legacy`, `full`, or
explicitly `degraded`.

Surface support and package publication are separate because all Codex
surfaces consume one plugin skills view. The registry therefore also records a
single Codex publication decision. That view is a guarded union: a skill may be
included when at least one Codex surface is supported and every other reachable
Codex surface either has a tested fail-closed surface guard or is also
supported. If the skill cannot reliably identify the active Codex surface, the
rule falls back to the intersection and one unsupported reachable surface
excludes it from the shared Codex view. Publication never upgrades that
surface's support status.

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

A hand-maintained root-level `skills-compatibility.json` registry will cover
every discovered `plugins/*/skills/*/SKILL.md`. JSON matches the existing Codex
generator and validation stack, which already use JSON and `jq`; adding a YAML
parser is not justified for this metadata.

Each registry entry contains:

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
| Internal skill dependencies | Repository skills that participate in support closure |
| External required capabilities | Required external skills, CLIs, MCP servers, network, or host capabilities |
| Optional enhancements | Capabilities that improve results but never gate the contract |

Missing entries, unknown skills, invalid enum values, invalid use of `legacy`,
missing resources, or a skill exposed contrary to its platform publication
decision are CI failures.
Internal dependencies must resolve to registry entries; a supported skill
cannot depend on an unsupported internal skill on the same surface unless its
declared degraded path removes that dependency. External capabilities are
validated as declared prerequisites, while optional enhancements never enter
the hard dependency closure.

`legacy` satisfies only unchanged Claude-to-Claude dependency closure. It
cannot satisfy a gate for new behavior, a changed control flow, or any Codex
promotion.

For Codex, the validator also rejects publication when no surface is supported,
or when an unsupported reachable surface lacks a tested fail-closed guard. The
guard must stop before workflow side effects and explain the supported surface;
`allow_implicit_invocation: false` is not a guard because explicit invocation
remains possible.

Registry structure checks are conditional on support. A future Codex engine
path is not required while all Codex surfaces are `unsupported`. The validator
must reject invented placeholder paths and must require the shared contract,
platform resources, limitations, and scenarios before the related surface can
be promoted.

### 6. Codex gets a generated publication view

The canonical skill tree is not automatically the Codex publication tree.
Current OpenAI plugin packaging exposes one relative `skills` directory, while
`allow_implicit_invocation: false` disables only implicit invocation and still
allows explicit invocation. Therefore metadata alone cannot keep an
unsupported skill out of the package.

For this contract, "published" means discoverable or invokable through the
plugin's declared skills root. It does not mean that canonical source bytes are
absent from the installed plugin snapshot. Canonical files excluded from Codex
publication may be present as inert source, but Codex must not discover or
invoke them through the declared skills root.

The Codex generator will assemble its one publication view from the
compatibility registry. Per-surface statuses do not create separate packages:

- Skills whose Codex publication decision is `include` are included.
- Skills whose Codex publication decision is `exclude` are absent from the
  declared skills root.
- Shared skill content is taken verbatim from its canonical source.
- Platform profiles, engines, and Codex UI metadata are overlaid without
  creating a second hand-maintained skill body.
- Included skills have a valid supported dependency closure.

The physical representation of this view is an implementation gate, not an
assumption. A fixture must prove the chosen representation through both a local
marketplace install and a git-ref install. It must also prove that an explicit
skills path does not cause Codex to fall back to or rescan the canonical
`skills/` directory. Until that gate passes, no Codex release may advertise the
complete canonical skill tree as supported. The architecture and marketer
distribution changes may merge without a release version bump while this gate
is pending.

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

## Source-shape research hypothesis

The current tree contains 104 skills. The counts below are a planning
hypothesis for this commit, not a registry seed or a Codex support claim. The
marketer v2 slice is expected to add `using-marketer` and
`codex-agents-bootstrap`, so the registry PR must enumerate the tree at its own
commit instead of assuming 104. It must re-audit every discovered skill against
the semantic decision rule rather than copying these values.

| Source shape | Count | Initial scope |
| --- | ---: | --- |
| `shared` | 88 | All Android, iOS, AI engineering, and Neo4j skills; nine designer skills; six marketer skills; `perspective` and `post-mortem` |
| `shared_with_seams` | 11 | `impeccable`, `slide-design`, `handoff`, `merge-pr`, `preview`, `rebuild-skill-index`, `session-retro`, `specialist-review`, `todos-cleanup`, `todos-review`, `worktree-handoff` |
| `native_engines` | 5 | `greenlight`, `autopilot`, `mvp`, `plan-review`, `todos-babysit` |

`handoff` is at least a seam because delivery tools differ. `plan-review` is a
native-engine candidate because outside-reviewer independence and subagent
lifecycle affect its control flow. These corrections demonstrate why the
registry cannot be populated mechanically from token scans alone.

New skills default to `unsupported` on all Codex surfaces until their acceptance
evidence lands.

## Greenlight pilot

Greenlight is the first workflow portability pilot because Autopilot depends on
it and because its current entry point combines policy, reviewer selection,
state transitions, subagent orchestration, config resolution, and report
generation in one large file.

### Shared Greenlight contract

The following remain platform-independent:

- Target selection and unattended versus interactive mode.
- Size classification, round limits, and retry ceilings.
- Finding, evidence, reviewer-result, and final-result schemas.
- Halt, flag, pass, and failure taxonomy and terminal-state priority.
- Reviewer independence groups for the host and every reviewer. A reviewer in
  the host's equivalence group cannot satisfy the independent-review gate.
- The independent reviewer must inspect the final diff after the last mutation,
  not only an earlier revision.
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
- Interrupted, partial, and failed reviewer runs produce the same classified
  terminal result on both platforms.
- No complete Greenlight skill body is copied into a second tree.

Before the Claude split, baseline scenarios must cover uncommitted, pull
request, and post-commit modes; mutation boundaries; upward-only sizing and
round limits; reviewer exhaustion; repeated verification failure; and child
interruption. Those same scenarios become the cross-engine conformance suite.

## Relationship to agent distribution

The marketer agent pilot and skill portability are independent tracks. On
`main`, the former remains paused under the related pilot documents. Its v2
redo answers whether Codex can install, discover, and dispatch a custom
marketer agent. This spec answers whether a skill executed by that agent or by
the parent satisfies the same cross-platform behavioral contract.

Evidence does not transfer between the tracks: a linked child thread does not
prove its skills are portable, and a loadable skill does not prove agent TOML,
bootstrap, or delegation behavior. A merged PR 5a/v2 vertical slice is the
agent-distribution prerequisite and does not certify marketer skill parity.

## Rollout

| PR | Scope | Gate |
| --- | --- | --- |
| 1. Architecture | This independent spec and backlog update | No runtime, pilot-document, or packaging change |
| 2. Marketer PR 5a/v2 | Resolve the paused agent-distribution vertical slice and update its authoritative pilot documents | Accepted current evidence; new delivery skills bring their own acceptance evidence; no marketer domain-skill parity claim |
| 3. Registry | Add the complete compatibility registry, conditional schema validation, and generated inventory report | Every skill discovered at that commit is re-audited; expected count is 106 if PR 2 lands first; existing Claude skills may enter as `legacy` |
| 4. Publication fixture | Prove and implement the Codex publication view | Local and git-ref installs expose only registry-included skills through the declared root; inert snapshot bytes do not count as exposure |
| 5. Shared foundations | Add one executable config/plugin-root resolver and platform-resource validation | No bulk vocabulary rewrite; existing Claude behavior remains unchanged |
| 6. Greenlight contract | Establish baseline scenarios, then extract shared protocol, schemas, scripts, and the Claude engine | Claude conformance passes before Codex engine work |
| 7. Greenlight Codex pilot | Add the Codex engine and run scenarios per claimed surface | Every Codex surface remains `unsupported`, or earns its own `full` or explicit `degraded` status |
| 8. Seam skills | Port `shared_with_seams` skills in bounded batches | Each skill earns its own support status |
| 9. Remaining engines | Port `autopilot`, `mvp`, `plan-review`, and `todos-babysit` one at a time | Required dependency closure is supported on the target surface; no bundled control-plane rewrite |
| 10. Portable skills | Promote shared skills by plugin-sized behavioral batches | Loadability alone is insufficient |

Autopilot must not begin its Codex engine merely because Greenlight's contract
exists. On each target surface, Greenlight must be `full`, or its `degraded`
contract must retain unattended pull-request review, structured halt and reason
results, and the final result summary that Autopilot consumes. `plan-review`
and `merge-pr` must also have a supported dependency closure on that surface.

App scheduling is a later capability. The initial Autopilot Codex scope may be
run-now only if that degradation is explicit, tested, and accepted; a mapping
must not pretend to reproduce Claude Cron behavior.

If PR 5a/v2 satisfies step 2, marketer's known portability seams and the
Greenlight contract extraction may proceed independently. Remaining agent
adapters roll out one plugin at a time only after that plugin's skills have
complete registry entries; they do not have to wait for every skill to reach
`full` support.

## Release policy

- A plugin release exposes only skills marked for inclusion by the compatibility
  registry for that platform.
- Registry, generated publication view, manifests, and platform metadata must
  be regenerated and staged atomically by the release workflow.
- Release notes distinguish full and degraded capabilities; unsupported work is
  not advertised as an installed feature.
- Claude and Codex continue to share plugin versions and tags unless a future
  packaging constraint demonstrates that lockstep releases are unsafe.

## References

- [Agent Skills specification](https://agentskills.io/specification)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [OpenAI skill metadata and invocation policy](https://developers.openai.com/codex/skills)
- [Superpowers harness-porting architecture](https://github.com/obra/superpowers/blob/main/docs/porting-to-a-new-harness.md)
