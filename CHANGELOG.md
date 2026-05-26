# Changelog

User-facing release notes for the **solopreneur** plugin marketplace. Each
dated section describes, per plugin, what changed for someone who installs
or updates that plugin.

> Versions before `0.5.19` (and the other plugins' versions listed in the
> 2026-05-17 section below) predate this changelog — see the repo's git
> tags / GitHub Releases for earlier history.

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
