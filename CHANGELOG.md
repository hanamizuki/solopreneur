# Changelog

User-facing release notes for the **solopreneur** plugin marketplace. Each
dated section describes, per plugin, what changed for someone who installs
or updates that plugin.

> Versions before `0.5.19` (and the other plugins' versions listed in the
> 2026-05-17 section below) predate this changelog — see the repo's git
> tags / GitHub Releases for earlier history.

## 2026-08-16

### solopreneur 0.6.0 → 0.6.1

`/preview` now delivers to a local Library by default: it builds a browsable
catalog on your machine and returns a `file://` link instead of deploying.
Vercel publishing is opt-in — ask for an online or shareable link explicitly —
and one-off throwaway previews still write a single ephemeral file. The
preview toolchain also works when running under Codex. (#176)

Review tooling reaches Codex: `/specialist-review` runs there via a reviewer
ladder that reads the specialist plugins' published knowledge skills (#190),
and `/greenlight` can drive its Phase 1 review round on Codex too (#191).
`/greenlight` also gains Grok CLI as an opt-in local reviewer (#186). The
Codex core package grows from four skills to nine: `handoff`, `perspective`,
`post-mortem`, `preview`, and `specialist-review` join `autopilot`,
`greenlight`, `merge-pr`, and `plan-review` (#182).

### designer 0.1.10 → 0.1.11

Re-syncs the vendored `impeccable` skill across a large upstream cycle
(4.0.3 → 4.1.1): a comp-driven design workflow ("comps are shipped screens",
comp-fidelity review discipline, hero-first building), a richer decision page
(full-fidelity comps, IMPECCABLE'S PICK, Safer/Bolder registers, build-path
toggle), Antigravity and Hermes Agent provider support, raster-provenance
auditing through the fix loop (`embed-prompt.mjs --scan`), and a batch of
detector false-positive and performance fixes. (#149, #185)

### ios-dev 0.4.12 → 0.4.13

Re-syncs the `asc-*` App Store Connect skills to the current `asc` CLI.
Signing setup covers App Groups provisioning, private-identity sync with
file-based passwords (inline `--password` / `ASC_MATCH_PASSWORD` deprecated),
an experimental device/profile reconcile workflow, and one-shot signing with
an isolated temporary keychain. Xcode export documents the `release-testing`
method that replaces the deprecated `ad-hoc` spelling. Release staging
validates build ownership and gates metadata deletes behind `--allow-deletes`;
workflows gain bounded per-step retry and timeout; localization picks up
Apple's expanded locale list; Apple Ads commands are split between Platform
API v1 and the deprecated v5. (#154, #189)

### android-dev 0.4.12 → 0.4.13

Removes two vendored skills that had aged into bad guidance: `gradle-logic`
(pinned late-2023 AGP/Kotlin versions, contradicting the bundled
`agp-9-upgrade`) and `compose-navigation` (a community Navigation 3 retelling
superseded by the official `navigation-3` skill bundled here). Their upstream
mappings are dropped so future syncs cannot resurrect them. (#183, #184)

### ai-engineer 0.3.15 → 0.3.16

Removes the in-house `langgraph` skill: it taught an incorrect `interrupt()`
contract and an unconditional "never add a checkpointer" rule that breaks
human-in-the-loop flows, with 2024-era model pins. Use the `ai-engineer`
agent with current LangGraph docs instead. The plugin description now lists
`ai-app-templates` as the sole in-house skill. (#183)

### neo4j-dev 0.0.9 → 0.0.10

Re-syncs the vendored Neo4j skills: `neo4j-cypher` now documents GRAPH TYPE
schema DDL as GA (2026.06) — the `ALTER CURRENT GRAPH TYPE ADD/ALTER/DROP`
forms, element-type syntax, and required privileges — plus the 2026.07
Cypher 25 additions (`GROUP BY` subclause, `cardinality()`, aggregates in
`ORDER BY`/`WHERE`). (#153, #187)

## 2026-08-12 — Codex milestone

### solopreneur 0.5.38 → 0.6.0

Promotes the Codex integration introduced in 0.5.38 to a minor release,
reflecting the new officially supported platform surface.

Codex users can install the verified, filtered core plugin with `autopilot`,
`greenlight`, `merge-pr`, and `plan-review`. Unsupported skills remain excluded,
and the documented Codex V1 limitations remain unchanged. Claude Code behavior
is unchanged.

There are no functional differences from 0.5.38; this version corrects the
release classification and establishes Codex support as the 0.6 milestone.

## 2026-08-12

### solopreneur 0.5.37 → 0.5.38

Codex now receives a deliberately filtered, fail-closed core package: only
`autopilot`, `greenlight`, `merge-pr`, and `plan-review` are published, while
unsupported skills stay out instead of installing and failing later.

`autopilot` gains a Codex profile for immediate single-PR runs from a clean,
up-to-date `main`. `greenlight` can run its external review loop on Codex with
an independent Claude CLI final gate, host-aware reviewer selection, and
fail-closed handling for missing reviewers, authentication, or configuration.
Codex-specific `plan-review internal` and `merge-pr` profiles complete the
dependency chain without enabling unsupported paths.

Shared configuration now resolves against the active Claude or Codex home.
This release also completes the package-layout cutover: Claude installs from
`plugins/claude/`, Codex installs its filtered package from `plugins/codex/`,
and the temporary compatibility copies are retired atomically. Plugin names
and normal install commands do not change.
(#155, #158, #161, #162, #163, #165, #169, #171, #172, #175, #177)

### designer 0.1.9 → 0.1.10

Packaging-only release for the platform-specific layout cutover. The designer
agent and ten bundled design skills are unchanged; the plugin name and install
command remain the same.
(#177)

### marketer 0.0.10 → 0.0.11

Adds the cross-harness `using-marketer` router and a Codex-native marketer
agent definition, establishing the agent-distribution pilot without claiming
full marketer skill parity. The public Codex marketplace remains limited to
the verified core package.

Claude's existing seven marketing workflows remain intact. The plugin also
moves to the platform-specific Claude package root without changing its name
or install command.
(#155, #177)

### ios-dev 0.4.11 → 0.4.12

Packaging-only release for the platform-specific layout cutover. The iOS
agent and bundled skills are unchanged; the plugin name and install command
remain the same.
(#177)

### android-dev 0.4.11 → 0.4.12

Re-synces the six vendored skills from Android's official skill repository.
Navigation 3 gains additional recipes for deep links, synthetic back stacks,
custom matchers, conditional transitions, and lifecycle ownership.

The R8 analyzer workflow is repaired: it detects explicit R8 overrides from
settings files, uses the standalone analyzer task on AGP 9.3+, retains the
quantitative path for compatible older versions, and falls back to heuristic
review otherwise. The repair is applied deterministically during future
vendor syncs.

The plugin also moves to the platform-specific Claude package root without
changing its name or install command.
(#177, #178)

### ai-engineer 0.3.14 → 0.3.15

Packaging-only release for the platform-specific layout cutover. The AI
engineer agent and bundled skills are unchanged; the plugin name and install
command remain the same.
(#177)

### neo4j-dev 0.0.8 → 0.0.9

Packaging-only release for the platform-specific layout cutover. The Neo4j
agent and four bundled skills are unchanged; the plugin name and install
command remain the same.
(#177)

## 2026-07-31

### solopreneur 0.5.36 → 0.5.37
`/greenlight` stops hardcoding which review bots it can see. PR-mode
detection now recognizes any GitHub App that actually reviews on your
repo — CodeRabbit, Cursor, Copilot, and whatever comes next qualify with
zero config — while conversation-only automation (dependabot, CI
notifiers) is never mistaken for a reviewer. CodeRabbit graduated from
"passive, observe-only" to a triggerable reviewer like the rest. A round
can now drive several reviewers at once: `select=<ids>` chooses which
reviewers run, `gate=<id>` chooses the one whose clean pass ends the
loop, and what a run learns about your repo's reviewers is cached
per-repo in `solopreneur.json` so later rounds build on it. `/autopilot`
dispatches pass the new tokens and always run unattended, so scheduled
runs never stall on a reviewer prompt.
(#150, #151)

### ai-engineer 0.3.13 → 0.3.14
Housekeeping: re-pinned the vendored `senior-prompt-engineer` skill to
upstream's latest revision (2026-07-27). Upstream moved without changing
this skill, so content is identical — the release just brings the
recorded provenance current.
(#131)

### neo4j-dev 0.0.7 → 0.0.8
Housekeeping: no skill or agent changes — realigns the generated
Codex-surface manifest that had lagged one release behind the plugin
version.

## 2026-07-28

### solopreneur 0.5.35 → 0.5.36
Planning-stage review collapses into one skill. `/tech-vetting` is now
**`/plan-review`**, and `/second-opinion` is retired — both old commands are
gone (see `MIGRATION.md`). The new skill runs three stages over a spec, plan,
or design doc: technical vetting against official docs, a lean check that
flags over-engineering, and an independent outside review via Codex. Findings
from all three arrive as one list you adjudicate before anything is written
back — no stage edits your plan on its own. The file argument is now optional,
so it can review a plan that only exists in the conversation. Unattended
callers (`/autopilot`, `/todos-babysit`) pass `internal` to run the first two
stages without the expensive external review, and a cost confirmation guards
the third stage against accidental triggers.
(#148)

### marketer 0.0.9 → 0.0.10
The `slide-design` component reference stopped demonstrating its skill-card
markup with a command that no longer exists.
(#148)

### designer 0.1.8 → 0.1.9
The vendored `impeccable` skill jumps to upstream 4.x, its largest revision
since it was added. The skill file is now a lean router: the design rules that
used to load on every invocation — color, typography, layout, motion, the
anti-pattern bans — moved into a craft-floor reference that loads only when
you're about to edit UI. Surfaces are classified by what success looks like on
them (persuade, operate, read, experience), replacing the older
brand-versus-product split, and `craft` is deprecated in favor of an ordinary
new-work request. The anti-pattern detector grew from 46 to 60 checks. New: a
`doctor` pass that finds stale PRODUCT.md / DESIGN.md artifacts, a
browser-served decision page for choices that are better seen than described,
and concept seeding that pulls composition directions from an upstream catalog
— it falls back to a local catalog when offline, and its anonymous choice ping
honors `DO_NOT_TRACK`. Optional image generation runs only when
`OPENAI_API_KEY` is set and bills to your own key. Self-QA is now capped at
bounded verification passes instead of an open-ended polish loop.
(#132)

### ios-dev 0.4.10 → 0.4.11
`asc-release-flow` and `asc-submission-health` were restructured: both SKILL
files shrank substantially, with situational detail moved into references that
load only when the situation applies. The new references cover review
submissions that must bundle an app version with versioned digital goods or
Game Center components, App Privacy publish state when the public API can't
confirm it, digital-goods readiness when IAP or subscription validation fails,
and repairs for proven `asc validate` / `asc review doctor` blockers.
(#130)

### android-dev 0.4.10 → 0.4.11
`compose-navigation` was rewritten for **Navigation 3**, which models
navigation as application state rather than through a `NavController`. It now
covers navigation keys, back stack management, ViewModel scoping, entry
decorators, adaptive layouts, and migration from Navigation Compose — note
that Navigation 3 is still an alpha library, and the skill pins alpha
coordinates. The `viewmodel` skill moved to Kotlin 2.3+ explicit backing
fields. `gplay-submission-checks` now documents full manifest decoding (binary
AXML for APKs, aapt2 protobuf for App Bundles) across nine named scanners, and
describes Google Play's target-API floor as a yearly moving requirement rather
than a fixed 2025 number.
(#133)

## 2026-07-25

### solopreneur 0.5.34 → 0.5.35
`/preview` Library sidebar gains **Manage mode**: multi-select Active/Archive items and copy a structured archive request for your agent (batch move + one republish — the page itself stays read-only). Archive rows linked by `supersededBy` nest under **Earlier copies**. Library publish no longer gets stuck when a background git rebase rewrites the commit that was recorded at the last deploy — it compares content trees instead. The skill docs now default agents to Library v2 (`active/<id>/`, `deploy-library`, Share, archive requests); three-bucket `deploy.sh` is documented as a legacy escape hatch. `/mvp` preview paths align with the same `active/` layout.
(#145, #146, #147)

### solopreneur 0.5.33 → 0.5.34
`/preview` now ships **Preview Library v2**: path-based `.solopreneur.json` config, a static library builder (catalog, content hashes, Shadow DOM sidebar with expand/collapse, provenance footer, per-preview comments), staged library publish with fail-closed SSO protection, and single-item **Share** deployments (project-members or anyone-with-link) that never move Library production. Includes first-run setup, legacy migrator, and a docked push-layout sidebar on wide screens.
(#134–#144)

## 2026-07-21

### solopreneur 0.5.32 → 0.5.33
Fixed an `/autopilot` multi-PR wave failure: the Workflow tool delivers the
wave script's `args` as a JSON-encoded string in production (observed in
every run), which crashed wave dispatch before any agent started. The
wave-workflow template now parses `args` defensively and documents the
quirk so the guard isn't removed later. (#129)

### designer 0.1.7 → 0.1.8
Routine re-sync of the vendored `taste-*` family and `impeccable` from
upstream — this cycle picked up only pin/metadata refreshes, no content
changes. (#127)

### ios-dev 0.4.9 → 0.4.10
New vendored skill **`apple-design`** (from emilkowalski/skills): Apple's
fluid-interface design thinking — spring animations, gesture-driven UI,
momentum projection, translucent materials, typography, reduced-motion —
distilled from WWDC design talks and translated to the web platform. The
vendored `asc-*` App Store Connect skills and `iphone-apps` were also
re-synced to latest upstream (release flow, RevenueCat catalog sync,
subscription localization, submission health, Xcode build, and others
picked up new revisions). (#128)

### android-dev 0.4.9 → 0.4.10
Corrected the plugin description's vendored-skill counts (37 total, 16
`gplay-*`) to match what actually ships — a metadata fix, no behavior
change.

## 2026-07-16

### solopreneur 0.5.31 → 0.5.32
The `/greenlight` review loop now engineers itself around risk:

- **Risk-based sizing.** Every run is classified S / M / L by a mechanical cascade over the diff (paths touched, size, risk markers). Small pure-prose changes get a lighter, faster loop; large or risky ones get more rounds and the full reviewer lineup. (#125)
- **Objective verifier.** Each fix round must pass the project's own verify command before anything is pushed, with an anti-gaming guard so a fix can't "pass" by weakening the checks themselves. (#123)
- **Predictable escalation.** Unattended runs escalate through one halt / flag / note taxonomy with machine-readable reason classes (transient-dependency / invariant-violation / authority-boundary), and contradictory reviewer findings are resolved by a decision table instead of stalling the run. (#126)
- **Reviewer lineup upkeep.** Reviewers live in a registry with activity detection: the Gemini bot is only offered when it's actually acting on the repo (consumer Gemini Code Assist ends GitHub review on 2026-07-17; enterprise unaffected), and the Antigravity CLI (`agy`) replaces the discontinued `gemini` CLI as the Gemini-family reviewer in post-commit mode. (#111)

`/merge-pr` now gates merges on CI checks pinned to the PR's exact head commit — a stale green from an older push no longer counts, and pending checks are waited on instead of treated as passing. (#124)

`/autopilot` gained a spec quality gate: every acceptance criterion in a generated PR spec must be an executable command or a verifiable assertion, enforced at planning time. Its orchestrator also defers to greenlight's per-size round budgets instead of a hard-coded 3-round limit. (#126)

### designer 0.1.6 → 0.1.7
Re-synced `impeccable` from upstream (3.8.0 → 3.9.1): it now handles **native iOS and Android projects** — platform-aware `audit` and `adapt` variants pick HIG / Material 3 references from the project's declared platform — plus better font detection, an expanded anti-pattern registry, and smarter routing when a project has no PRODUCT.md yet (scoped fix/refine requests are no longer blocked by init). The `taste-*` skills were re-synced with upstream fixes. (#118)

### marketer 0.0.8 → 0.0.9
`/humanly` gained a fidelity layer — protected content categories that must never be invented or altered, plus a mandatory read-back step verifying a rewrite kept the original meaning — along with Taiwan-specific Traditional Chinese localization (mainland→Taiwan vocabulary, punctuation, register), ten new Chinese and three new English AI-writing patterns, and an eval benchmark guarding the catalog (adapted in part from speak-human-tw, MIT). `/naming`'s multi-model candidate generation moved from the discontinued `gemini` CLI to the Antigravity CLI (`agy`). (#106, #110)

### ios-dev 0.4.8 → 0.4.9
Re-synced the vendored `asc-*` App Store Connect skills from upstream (release flow, metadata sync, pricing, screenshot pipeline, submission health, and more picked up their latest revisions), and code examples containing `$1`-style tokens now survive Claude Code's argument substitution. (#105, #116)

### android-dev 0.4.8 → 0.4.9
Following upstream, `gplay-signing-setup` and `gplay-subscription-localization` were removed (the vendored Play Console set is now 16 `gplay-*` skills); the remaining Play Console and official Android skills (AGP 9 upgrade, Navigation 3, XML-to-Compose migration, Play Billing upgrade) were re-synced. (#113, #117)

### ai-engineer 0.3.12 → 0.3.13
Internal alignment release: vendored-skill metadata moved from `skills/_vendored/` to `vendor/`; no behavior change. (#108, #115)

### neo4j-dev 0.0.6 → 0.0.7
`neo4j-cypher` re-synced from upstream: now documents Cypher 25's `DISJOINT BY` clause for `IN CONCURRENT TRANSACTIONS` (deadlock-free concurrent relationship imports), plus graph-type reference updates. (#114)

## 2026-07-09

### solopreneur 0.5.30 → 0.5.31
`/preview` deploys now land in configurable buckets — **scratch** (disposable, the default), **keep** (long-lived), or **public** (external-facing, no access restriction). Previews are protected by default: unless the target is the public bucket or `autoProtect` is explicitly disabled, Vercel SSO protection is enabled automatically so URLs are only viewable by team members. Bucket-to-project mappings are set per user (and optionally per repo) in `solopreneur.json`.
(#101)

## 2026-07-07

### solopreneur 0.5.29 → 0.5.30
Native skills that embed shell snippets are safer to run through Claude Code's skill argument handling. Shared config helpers and worktree commands now preserve shell positional parameters and `awk` field references instead of letting `$1`, `$2`, or similar placeholders disappear before the shell sees them. This affects `/greenlight`, `/merge-pr`, `/preview`, `/todos-babysit`, `/todos-cleanup`, and `/worktree-handoff`.
(#87)

### marketer 0.0.7 → 0.0.8
`/humanly` now has a generated prewrite system for English and Traditional Chinese, built from the same source pattern catalogs used by rewrite/review mode. Prewrite runs get a compact, current brief instead of hand-maintained cheatsheets, while maintainers get validation for missing summaries, stale generated files, and broken numbering. The catalog also adds new Chinese and English AI-writing patterns, expands word tables, and renames the modes to `prewrite`, `rewrite`, and `review` so the behavior is clearer.
(#77, #78, #82, #83, #87, #91)

## 2026-07-03

### solopreneur 0.5.28 → 0.5.29
`/autopilot` and `/greenlight` now use Claude Code's Workflow tool when available (v2.1.154+), falling back to the previous flow automatically when it isn't:

- **`/greenlight` — adversarial verification gate.** Before findings reach a fix subagent, each consolidated internal-review finding is challenged by 3 independent skeptic subagents; findings a majority refutes are dropped and reported as push-backs instead of triggering a fix cycle. Applies in PR mode and post-commit mode — cuts wasted rounds on false-positive findings.
- **`/autopilot` — wave dispatch via Workflow.** Each wave of PR subagents is dispatched as a single Workflow with schema-validated results and in-script retries; `plan.yaml` gains an optional per-PR `files:` field for the wave overlap check.

(#75, #76)

## 2026-07-02

### solopreneur 0.5.27 → 0.5.28
`/merge-pr` no longer deletes real files before merging. A leftover "legacy cleanup" step ran `git rm -r docs/superpowers/` (and `docs/CONTEXT.md`) on the worktree before merge, assuming those were per-worktree scratch files. In any repo that actually tracks those paths on its main branch, the step deleted real content and pushed the deletion into the PR branch. The cleanup is removed; the independent refuse-on-uncommitted-changes guard stays.

## 2026-06-28

### solopreneur 0.5.26 → 0.5.27
Greenlight's Phase 1 internal review now includes an optional over-engineering reviewer (`ponytail:ponytail-review`). If the ponytail plugin is installed, greenlight dispatches it alongside the existing four reviewers to flag dead code, hand-rolled stdlib, unused abstractions, and shrinkable logic. If not installed, a one-line install suggestion is printed and the review continues without it.
(#72)

## 2026-06-25

### solopreneur 0.5.25 → 0.5.26
- **Autopilot：單 PR 確認步驟簡化。** 移除編號選單，直接問「要現在跑嗎？」，附時間估算和排程備選說明。
(#67)

### designer 0.1.5 → 0.1.6
- Re-synced vendored skills from upstream — impeccable major update (hooks system, live browser manual-edit workflow, SvelteKit adapter, design-system detector, palette tool, inline ignores), taste-skill updated.
(#68)

### marketer 0.0.6 → 0.0.7
- **Humanly 新增第 38 個 pattern「情緒驗證腔」。** 偵測 AI 替用戶認證情緒（「你的焦慮是真實的」→「會焦慮很正常」）和赦免句（「不是你的錯」→ 刪除）。中英文 pattern、cheatsheet、word table 同步更新。
(#66)

### ios-dev 0.4.7 → 0.4.8
- Re-synced vendored skills from upstream (app-store-connect-cli-skills, iphone-apps).

### android-dev 0.4.7 → 0.4.8
- Re-synced vendored skills from upstream (awesome-android-agent-skills, wshobson-agents, gplay-cli-skills, android/skills).

### ai-engineer 0.3.11 → 0.3.12
- Re-synced vendored skill (senior-prompt-engineer) from upstream — rewritten around eval-driven iteration and stdlib Python tools.

### neo4j-dev 0.0.5 → 0.0.6
- Re-synced vendored skills from upstream (neo4j-skills, cypher-guide) — neo4j-cli-tools rewritten around the modern unified `neo4j-cli`, Cypher skill adds schema guardrail and import scripts.

## 2026-06-20

### marketer 0.0.5 → 0.0.6
- **Humanly 新增第 37 個 pattern「做作選詞」。** 偵測 AI 把簡單動詞用比喻性動詞包裝的寫法（接不住→搞不來、餵給它→丟進去）。跟既有的精心設計比喻 (#18) 互補：擬人抓主詞不對，做作選詞抓動詞不對。附替換表、咖啡聊天測試法、與 #18 的區別比較。中文 word table 同步新增 Tier 1 禁用詞（硬撐、踩坑、爆了）和 Tier 2 做作動詞子分類。
(#64, #65)

### solopreneur 0.5.24 → 0.5.25
- **Greenlight：GitHub bot 新增 👍 reaction 偵測。** 部分 reviewer bot 跳過文字回覆只留 👍 reaction，以前會卡在無限等待。現在 poll 增加第三道檢查，看到 trigger 後的 👍 即判定 clean pass。
(#64)

## 2026-06-02

### solopreneur 0.5.23 → 0.5.24
- **Handoff skill now saves to file.** `/handoff` still prints the context
  document inline, but also writes it to `/tmp/handoff/<date>_<slug>.md` and
  delivers the file via SendUserFile — no more copying from the terminal for
  cross-session handoffs.
(#63)

## 2026-06-01

### ios-dev 0.4.6 → 0.4.7
- **Portfolio Tracker template — accurate buy-date cost basis.** The
  `ios-app-templates` Portfolio Tracker reference now records a position's
  cost from its price **on the buy date** rather than silently using today's
  price (which gave wrong P&L for anything bought in the past). Future buy
  dates are blocked; a failed price lookup now explains the real cause (crypto
  older than CoinGecko's free ~1-year window, unsupported ticker, or stock
  history behind a paid API) and surfaces a manual buy-price field —
  pre-filled with today's quote — so you can enter the actual figure. Manual
  prices parse correctly on comma-decimal locales, and rapidly changing the
  ticker/date no longer leaves a stale price saveable. (#60)

## 2026-05-26

### solopreneur 0.5.22 → 0.5.23
- **`/preview` Mermaid-in-tabs caveat.** Documented that Mermaid diagrams
  fail to render when they start inside a hidden Alpine (`x-show`) tab — the
  container has zero width at init so Mermaid measures nothing — with guidance
  to render on tab activation instead. (#47) — thanks @mailkentlee!

### designer 0.1.4 → 0.1.5
- Re-synced the vendored `taste-*` design family and `impeccable` from
  upstream. Refreshed guidance; no skills added or removed. (#44, #52)

### marketer 0.0.4 → 0.0.5
- **Background music for `/slide-design`.** New recipe for a soft music bed
  that fades in/out as tagged slides appear, with per-engine implementations
  (IntersectionObserver for frontend-slides, `slidechanged` for reveal.js)
  and the autoplay / venue-PA / licensing caveats that bite presenters. (#58)

### android-dev 0.4.6 → 0.4.7
- Re-synced the vendored Android skill set (Jetpack Compose, `gplay-*` Play
  Console, Gradle, Kotlin concurrency, testing) from upstream. (#33, #53)

### ai-engineer 0.3.10 → 0.3.11
- Re-synced the vendored `senior-prompt-engineer` skill from upstream. (#38, #51)

### neo4j-dev 0.0.4 → 0.0.5
- Re-synced the vendored Neo4j skills (Cypher, Cypher guide, migration,
  CLI tools) from upstream. (#32)

## 2026-05-21

### solopreneur 0.5.21 → 0.5.22

- **`/preview` comment-export hardening.** Comment export now copies
  reliably even when a password manager intercepts the modal textarea —
  added a three-tier fallback (Clipboard API → `document.execCommand`
  → manual ⌘C) and tagged the textarea so 1Password / LastPass /
  Bitwarden / Dashlane stop autofilling it.
- **Export button is always visible.** Each `/preview` deploy gets a
  fresh Vercel URL with empty localStorage; previously the export
  button was hidden until the first comment, which made fresh-URL
  visitors think the feature was broken. The button now stays visible
  (dimmed at zero comments) and is properly disabled so keyboard users
  can't tab into an empty export.
- **`/preview` can now host viewport-wide slide decks.** Opt-in
  `<body class="cmt-full-bleed">` switches the comment-gutter reserve
  from `margin-right: 332px` to `width: calc(100% - 332px)` on
  `main.doc`, so full-bleed slides don't overflow under the gutter
  once comments exist. Existing narrow-prose previews are unaffected.
- **Overlay CSS is now tagged with `OVERLAY-CSS:BEGIN`/`END` markers**
  in `template.html`, so other skills referencing the block (e.g.
  `/slide-design`) point at markers instead of fragile line numbers.
  (#49)

### marketer 0.0.3 → 0.0.4

- **`/slide-design` now reads the source markdown end-to-end and
  confirms scope before generating.** New Phase 0 catches the most
  damaging silent failure: when a working draft splits each slide into
  multiple emoji-headed or YAML-headed sections (slide content vs.
  speaker notes vs. internal scaffolding), the agent now detects the
  split, asks which section is actually slide content, and strips
  planning scaffolding (Act tags, slide IDs, time estimates, speaker
  action meta) before generation.
- **`/slide-design` plays nicely with `/preview` comment overlay.**
  New Phase 2.7 documents the four things a deck needs to be
  reviewable in `/preview` (`<main class="doc">` wrapper,
  `<body class="cmt-full-bleed">`, `scroll-snap-type: y proximity`,
  `width: 100%` slides). New `references/preview-overlay-css.md`
  spells out the integration in detail.
- Phase numbering shifted to make room: `Phase 0→1`, `0.5→1.5`,
  `1→2`, `1.5→2.5`, `2→3`, `3→4`. (#49)

### solopreneur 0.5.20 → 0.5.21

- **`/preview` exported comments now carry their selected text.** When you
  highlight a passage and leave a comment, the exported markdown quotes
  the selected text alongside the comment body — the agent picking up
  the export sees what you were actually pointing at, not just the
  comment in isolation. (#43)
- **Skills that read `solopreneur.json` now support per-repo overrides.**
  A 5-layer cascade (per-repo → user-global default → fallbacks → legacy
  top-level) lets you point `todos/` or other config keys at different
  locations per project. Existing flat-schema configs keep working;
  migration is optional. Affected: `/greenlight`, `/merge-pr`,
  `/preview`, `/todos-babysit`, `/todos-cleanup`, `/worktree-handoff`.
  (#45)

### ios-dev 0.4.5 → 0.4.6

- **`ios-app-templates` catalog gains `portfolio-tracker`.** New
  "complete-clone" iOS app template — crypto + stock positions with
  daily Anthropic commentary, prices via CoinGecko + Finnhub, news via
  Google News RSS. Ships with `project.yml` so `xcodegen generate &&
  xcodebuild` works as-is; `customization-points.md` flags the 5–6 files
  to swap for re-brand. Reusable patterns inside: hardened Keychain
  (no iCloud-eligible storage), AI client that surfaces HTTP error
  bodies, SwiftData daily-cache, Gregorian-locale-pinned date formatters
  (safe on Buddhist / Japanese / ROC calendars), Finnhub `/stock/candle`
  premium-tier fallback. The existing `photo-analysis-app` (source-pack
  shape) stays; the catalog now documents both shapes. (#48)

## 2026-05-17

### solopreneur 0.5.19 → 0.5.20

- **`/preview` comments are now margin notes, not a docked side panel.**
  On desktop, each comment sits in the right margin next to the text it
  annotates (Google-Docs / Medium style) instead of one docked panel,
  and shows a relative timestamp ("now", "5m ago"). Cards stack without
  overlapping, stay reachable when they overflow, and a preview with no
  comments renders full-width. This supersedes the docked-panel
  behaviour described in the previous release. (#41)
- **You can now leave `/preview` comments on a phone.** Selecting text
  on mobile previously did nothing — comment creation only responded to
  a mouse. Selecting text now surfaces a fixed "+ comment" button that
  opens the comment dialog; the mobile bottom sheet for reading
  comments is unchanged. (#41)
- **The `/preview` skill and the page it generates are now fully
  English.** Trigger phrases and the on-page comment buttons (Edit /
  Delete / Save / Cancel / Clean / Show edits) were previously a
  Chinese/English mix. (#40)
- Fixes: the export dialog no longer leaks a keyboard listener each
  time it is opened and closed, and a comment you are mid-editing is no
  longer wiped by a background refresh pass. (#42)

## 2026-05-17

### solopreneur 0.5.18 → 0.5.19

- **`/mvp` now confirms the product with you before building it.** A new
  PRD visual confirmation step runs between brainstorming and template
  lookup: your spec is rendered as an interactive preview so you can
  approve the UI, data shape, and flow before any plan or code is
  generated. It's a deliberate gate — the run pauses for your sign-off
  instead of charging straight into unsupervised execution. (#37)
- **`/preview` is now reviewable like a Google Doc.** Highlight any text
  in a preview and leave an in-page comment; comments become persistent
  yellow markers you can edit, delete, and jump to, with a docked panel
  on desktop and a bottom sheet on mobile. `/preview` also gained a
  conditional scope step so it only renders what's relevant to the
  artifact at hand. (#36)
- Internal fix to how the vendored-skill sync script resolves bundled
  script paths; no change to how you use any skill. (#35)

### designer 0.1.3 → 0.1.4

- Picked up the same vendored-script path fix as the core plugin; no
  change to how the `taste-*` or `impeccable` skills are used. (#35)
- Re-synced vendored design skills from upstream. (#31)

### ios-dev 0.4.4 → 0.4.5

- Re-synced vendored iOS skills (`asc-*`, `iphone-apps`) from upstream. (#29)

### android-dev 0.4.5 → 0.4.6

- Re-synced vendored Android skills (Compose, `gplay-*`, Android official)
  from upstream. (#30)

### ai-engineer 0.3.9 → 0.3.10

- Re-synced the vendored `senior-prompt-engineer` skill from upstream. (#27)

### neo4j-dev 0.0.3 → 0.0.4

- Re-synced vendored Neo4j skills from upstream. (#28)
