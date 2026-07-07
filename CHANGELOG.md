# Changelog

User-facing release notes for the **solopreneur** plugin marketplace. Each
dated section describes, per plugin, what changed for someone who installs
or updates that plugin.

> Versions before `0.5.19` (and the other plugins' versions listed in the
> 2026-05-17 section below) predate this changelog — see the repo's git
> tags / GitHub Releases for earlier history.

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
