---
name: rebuild-skill-index
description: |
  Rebuild the per-machine, per-config extended skill index used by platform
  subagents. Scans installed Claude Code skills, classifies each by platform
  relevance (iOS, Android, design, marketer, neo4j-dev, …) using the
  frontmatter description, and writes one file per platform under
  `<base>/solopreneur/skill-index/` where `<base>` is `$CLAUDE_CONFIG_DIR`
  or `~/.claude`. Use when the user says "rebuild skill index", "refresh
  skill index", or after installing / removing platform-related skills.
---

# Rebuild Skill Index

Generate one index file per platform, specific to the current Claude Code
config. Each file is the extended list of every platform-relevant skill
installed on this machine that is not already in the curated list inside the
matching agent's markdown file.

Outputs are consumed by the matching subagents (`ios-dev`, `android-dev`,
`designer`, `marketer`, `neo4j-dev`) and any caller that dispatches them
(`/specialist-review`, `/preflight`, `/todos-review`).

## Step 0: Resolve base directory

Claude Code may be invoked with `CLAUDE_CONFIG_DIR` pointing at a non-default
config. Resolve the current config's base directory first via Bash:

```bash
BASE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
echo "$BASE"
```

Use the resolved absolute value in all subsequent read and write paths and in
`Path:` metadata written into output files — readers should not have to
re-resolve.

## Step 1: Collect candidate skills

For each source below, read **frontmatter only** (the `name:` and
`description:` fields). Do not read full SKILL.md bodies — that would burn
unnecessary tokens. Use `Read file_path=<path> limit=30` (30 lines covers any
reasonable frontmatter).

Shared sources (used by every platform's classifier):

1. **User-level skills:**
   `Glob pattern: $BASE/skills/*/SKILL.md`

Android-specific sources:

- None beyond the shared user-level glob. All curated Android skills are
  vendored inside `solo-android-dev` itself (under `<plugin>/skills/`) and
  excluded via the dedup list in Step 2.

iOS-specific sources:

2. **Axiom plugin skills** (optional):
   ```bash
   ls "$BASE/plugins/cache/axiom-marketplace/axiom/" | sort -V | tail -1
   ```
   - If the directory exists, use the highest semver version returned above
     and glob: `$BASE/plugins/cache/axiom-marketplace/axiom/<version>/skills/*/SKILL.md`
   - If it does not exist, record a "missing" warning for the iOS output file.

Design-specific sources:

3. **frontend-design plugin** (optional):
   ```bash
   ls -t "$BASE/plugins/cache/claude-plugins-official/frontend-design/" | head -1
   ```
   - This plugin uses hash directories, not semver; `ls -t | head -1` picks
     the newest by mtime — matches "the one currently installed" even when
     multiple hash dirs coexist.
   - If present: `$BASE/plugins/cache/claude-plugins-official/frontend-design/<hash>/skills/*/SKILL.md`
   - If absent, record a "missing" warning for the design output file.

4. **ui-ux-pro-max-skill plugin** (optional):
   ```bash
   ls "$BASE/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/" | sort -V | tail -1
   ```
   - If present: `$BASE/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/<version>/skills/*/SKILL.md`
   - If absent, record a "missing" warning for the design output file.

Marketer-specific sources:

5. **frontend-slides plugin** (optional):
   ```bash
   ls "$BASE/plugins/cache/frontend-slides/frontend-slides/" | sort -V | tail -1
   ```
   - Slide-oriented skills — included in the marketer index because
     presentations are a content/brand output (the `slide-design` curated
     skill orchestrates them).
   - If present: `$BASE/plugins/cache/frontend-slides/frontend-slides/<version>/skills/*/SKILL.md`
   - If absent, skip silently (no warning — this is bonus, not required).

6. **revealjs plugin** (optional):
   ```bash
   ls "$BASE/plugins/cache/revealjs/revealjs/" | sort -V | tail -1
   ```
   - Same rationale as frontend-slides — alternative slide engine used by
     `slide-design`.
   - If present: `$BASE/plugins/cache/revealjs/revealjs/<version>/skills/*/SKILL.md`
   - If absent, skip silently.

Neo4j-specific sources:

- None beyond the shared user-level glob. All curated Neo4j skills are
  vendored inside `solo-neo4j-dev` itself.

## Step 2: Read curated dedup lists

Read each agent's markdown from the solopreneur marketplace plugins. Find
the `## Curated Skills` section. Extract skill names from every bullet line
that looks like:

```
- `<skill-name>` — <description>
```

The section is subdivided by source (Plugin-bundled / Third-party / …).
Collect names from all subsections — they form the per-agent dedup blacklist
and should not be re-included in that agent's extended index. Names may be
bare (`asc-release-flow`) or namespaced (`solo-ios-dev:ios-patterns`,
`axiom:axiom-ios-ui`) — strip any `<plugin>:` prefix before comparing
against candidate skill names.

Agents to read (each lives in its own sub-plugin):

- `ios-dev.md` (from `solo-ios-dev`) → iOS dedup list
- `android-dev.md` (from `solo-android-dev`) → Android dedup list
- `designer.md` (from `solo-designer`) → design dedup list
- `marketer.md` (from `solo-marketer`) → marketer dedup list
- `neo4j-dev.md` (from `solo-neo4j-dev`) → neo4j-dev dedup list

Locate each agent file via Glob (widens across any marketplace name the user
chose at `claude plugin marketplace add --name`):

    Glob: `$BASE/plugins/cache/*/<plugin>/*/agents/<name>.md`

If multiple versions coexist, take the highest semver match.

If you can't find an agent file, ask the user where that sub-plugin is
installed and continue with an empty dedup list for that platform (the
extended file will have duplicates with curated, which is fine — costs one
extra entry per dup).

## Step 3: Classify each candidate

For each skill not in a given platform's dedup list, judge from `name` +
`description` whether it is relevant to that platform. Each candidate can be
classified into **multiple** platforms (e.g., a SwiftUI-specific design skill
belongs in both ios.md and design.md).

Be inclusive but not sloppy.

### iOS classification

- **Yes**: Swift / SwiftUI / UIKit / Xcode / iOS / macOS / iPadOS / watchOS /
  tvOS / visionOS / Apple frameworks (CoreData, AVFoundation, CoreLocation,
  etc.) / Apple toolchain (lldb, Instruments, asc CLI, App Store Connect)
- **No**: web (React, Vue, Next.js, CSS), Android (Kotlin, Compose, Room),
  Python, LLM/agent frameworks, generic design tools, infra/devops, prose
  helpers
- **Borderline** (e.g. cross-platform performance audit, generic git
  workflow): exclude. Curated catches must-haves; extended is best-effort.

### Android classification

- **Yes**: Kotlin / Jetpack Compose / Android Gradle / Hilt / Room / Retrofit /
  Coroutines / Flow / WorkManager / KMP-on-Android / Material Design (Material
  3, Material You) / AGP / R8 / ProGuard / Android Studio / `adb` / `gradlew` /
  Google Play Console (`gplay-*`, signing, release flows, in-app purchases) /
  Android-specific testing (Roborazzi, Espresso, Compose UI testing)
- **No**: web (React, Vue, Next.js, CSS), iOS (Swift, SwiftUI, Xcode, asc CLI),
  Python, LLM/agent frameworks, generic design tools, infra/devops, prose
  helpers
- **Borderline** (e.g. cross-platform performance audit, generic git
  workflow): exclude. Curated catches must-haves; extended is best-effort.

### Design classification

- **Yes**: visual design / typography / color / spacing / layout / motion /
  component styling / design systems / design review / critique / UX copy /
  information architecture / mockup generation / responsive design /
  accessibility when it's about visual contrast or type
- **No**: pure frontend implementation (React hooks, Next.js routing) without
  design framing, QA testing, backend, iOS/Android development patterns that
  aren't design-focused, devops, presentation slides (these go to marketer)
- **Borderline** (polish / audit / harden / normalize and other "action verb"
  skills): include only when the description explicitly mentions UI / visual /
  design. When in doubt, skip — curated catches the must-haves.

### Marketer classification

- **Yes**: brand / GTM / positioning / messaging / naming / copywriting /
  content strategy / social writing (X/Twitter, LinkedIn, Threads) /
  newsletter / email marketing / SEO copy / AI-pattern removal /
  presentation slides / pitch decks / community management / launch playbooks
- **No**: pure dev (any language), pure design (visual systems without
  brand voice), infra, QA testing
- **Borderline**: skills that touch both brand and design (e.g. brand-aware
  presentation builder) — include in marketer. Slide-design tooling
  specifically goes here, not design.

### Neo4j-dev classification

- **Yes**: Cypher (read or write) / Neo4j drivers (Java, Python, Go, .NET,
  JS) / graph schema / graph data modelling / `MERGE` patterns / `MATCH`
  patterns / index & constraint design / vector indexes on graph / APOC /
  GDS (Graph Data Science) / Neo4j Aura / `cypher-shell` / `neo4j-admin` /
  knowledge graph / GraphRAG / text2cypher
- **No**: relational SQL without graph aspects, document DBs (Mongo, Firestore),
  vector DBs without a graph layer (Pinecone, Weaviate without Neo4j),
  generic prose
- **Borderline**: GraphRAG skills that span LLM + graph — include only in
  neo4j-dev. If the skill is explicitly about prompt orchestration rather
  than graph retrieval, it can also land in a future ai-engineer index.

## Step 4: Write output files

```bash
mkdir -p "$BASE/solopreneur/skill-index"
```

Write one file per platform. **Expand `$BASE` to its absolute resolved value
in all `Path:` lines** so that consumers (agents that Read this file) can
open each path directly without re-resolving the env var.

### `$BASE/solopreneur/skill-index/ios.md`

```markdown
# iOS Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Config: <resolved absolute $BASE>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified Axiom plugin skills (axiom-marketplace v<version>)
- `<name>` — <description>
  Path: <$BASE resolved>/plugins/cache/axiom-marketplace/axiom/<version>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<empty if all good; otherwise warnings, e.g.:>
- Axiom plugin not installed. Install with: `claude plugin install axiom`
  (https://github.com/CharlesWiltgen/Axiom)
```

### `$BASE/solopreneur/skill-index/android.md`

```markdown
# Android Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Config: <resolved absolute $BASE>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<empty if all good; otherwise warnings>
```

### `$BASE/solopreneur/skill-index/design.md`

```markdown
# Design Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Config: <resolved absolute $BASE>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified frontend-design plugin skills (v<hash>)
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/plugins/cache/claude-plugins-official/frontend-design/<hash>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified ui-ux-pro-max plugin skills (v<version>)
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/<version>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<warnings for any optional source not found>
```

### `$BASE/solopreneur/skill-index/marketer.md`

```markdown
# Marketer Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Config: <resolved absolute $BASE>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified frontend-slides plugin skills (v<version>)
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/plugins/cache/frontend-slides/frontend-slides/<version>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified revealjs plugin skills (v<version>)
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/plugins/cache/revealjs/revealjs/<version>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<empty if all good; otherwise warnings>
```

### `$BASE/solopreneur/skill-index/neo4j-dev.md`

```markdown
# Neo4j Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Config: <resolved absolute $BASE>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: <$BASE resolved>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<empty if all good; otherwise warnings>
```

Skip a section entirely if it would be empty (except `## Missing` — always
emit it for transparency).

## Step 5: Report to the user

Print a short summary (one `Wrote` line per file actually written — skip
platforms that had no sources available):

```
Wrote <$BASE resolved>/solopreneur/skill-index/ios.md
Wrote <$BASE resolved>/solopreneur/skill-index/android.md
Wrote <$BASE resolved>/solopreneur/skill-index/design.md
Wrote <$BASE resolved>/solopreneur/skill-index/marketer.md
Wrote <$BASE resolved>/solopreneur/skill-index/neo4j-dev.md

iOS:
- N user skills classified as iOS-relevant
- M Axiom skills classified as iOS-relevant (axiom v<version>)
- K curated skills excluded from extended index
- Warnings: <list, or "none">

Android:
- N user skills classified as Android-relevant
- K curated skills excluded from extended index
- Warnings: <list, or "none">

Design:
- N user skills classified as design-relevant
- M frontend-design plugin skills classified as design-relevant (v<hash>)
- L ui-ux-pro-max plugin skills classified as design-relevant (v<version>)
- K curated skills excluded from extended index
- Warnings: <list, or "none">

Marketer:
- N user skills classified as marketer-relevant
- S frontend-slides plugin skills classified as marketer-relevant (v<version>)
- R revealjs plugin skills classified as marketer-relevant (v<version>)
- K curated skills excluded from extended index
- Warnings: <list, or "none">

Neo4j:
- N user skills classified as Neo4j-relevant
- K curated skills excluded from extended index
- Warnings: <list, or "none">
```

## Notes

- This skill is **manual**. There is no auto-rebuild on subagent invocation
  or on plugin update.
- Output is **per-machine and per-config**. Each Claude Code config
  (`CLAUDE_CONFIG_DIR`) gets its own index because each config has its own
  set of installed plugins and user skills.
- The plugin git repo only ships the curated lists inside each
  `agents/<name>.md`.
- A single candidate skill can land in multiple platform indexes (design +
  iOS overlap is common for SwiftUI-focused visual skills; brand + design
  overlap exists too, but slide tooling specifically routes to marketer).
- Classification is LLM judgment, not regex. Output may shift slightly
  between runs at the margin; that's acceptable because the curated list is
  the deterministic top-priority layer.
- The `ai-engineer` agent does not yet read an extended index file. If its
  curated list grows beyond what's manageable, add an `ai-engineer.md`
  output here following the same pattern.
