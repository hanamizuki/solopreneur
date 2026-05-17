# Changelog

User-facing release notes for the **solopreneur** plugin marketplace. Each
dated section describes, per plugin, what changed for someone who installs
or updates that plugin.

> Versions before `0.5.19` (and the other plugins' versions listed in the
> 2026-05-17 section below) predate this changelog — see the repo's git
> tags / GitHub Releases for earlier history.

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
