---
name: rebuild-skill-index
description: |
  Rebuild the per-machine extended skill index used by platform subagents.
  Scans installed Claude Code skills, classifies each by platform relevance
  (iOS, design, …) using the frontmatter description, and writes one file per
  platform under ~/.claude/solopreneur/skill-index/. Use when the user says
  "rebuild skill index", "refresh skill index", or after installing / removing
  platform-related skills.
---

# Rebuild Skill Index

Generate one index file per platform under
`~/.claude/solopreneur/skill-index/` — each one is the extended list of every
platform-relevant skill installed on this machine that is not already in the
curated list inside the matching agent's markdown file.

Current platforms: **iOS** and **design**. (Others — android, web, python,
llm — will be added when they need extended indexing.)

Outputs are consumed by the matching subagents (`ios-dev`, `designer`, …) and
any caller that dispatches them (`/specialist-review`, `/preflight`,
`/todos-review`).

## Step 1: Collect candidate skills

For each source below, read **frontmatter only** (the `name:` and
`description:` fields). Do not read full SKILL.md bodies — that would burn
unnecessary tokens. Use `Read file_path=<path> limit=30` (30 lines covers any
reasonable frontmatter).

Shared sources (used by every platform's classifier):

1. **User-level skills:**
   `Glob pattern: ~/.claude/skills/*/SKILL.md`

iOS-specific sources:

2. **Axiom plugin skills** (optional):
   ```bash
   ls ~/.claude/plugins/cache/axiom-marketplace/axiom/ | sort -V | tail -1
   ```
   - If the directory exists, use the highest semver version returned above
     and glob: `~/.claude/plugins/cache/axiom-marketplace/axiom/<version>/skills/*/SKILL.md`
   - If it does not exist, record a "missing" warning for the iOS output file.

Design-specific sources:

3. **frontend-design plugin** (optional):
   ```bash
   ls ~/.claude/plugins/cache/claude-plugins-official/frontend-design/ | tail -1
   ```
   - This plugin uses hash directories, not semver; `tail -1` picks the
     alphabetically-last hash (good enough — there's usually one).
   - If present: `~/.claude/plugins/cache/claude-plugins-official/frontend-design/<hash>/skills/*/SKILL.md`
   - If absent, record a "missing" warning for the design output file.

4. **ui-ux-pro-max-skill plugin** (optional):
   ```bash
   ls ~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/ | sort -V | tail -1
   ```
   - If present: `~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/<version>/skills/*/SKILL.md`
   - If absent, record a "missing" warning for the design output file.

5. **frontend-slides plugin** (optional):
   ```bash
   ls ~/.claude/plugins/cache/claude-plugins-official/frontend-slides/ | tail -1
   ```
   - Slide-oriented skills — included in the design index because
     presentation design overlaps with product UI work.
   - If absent, skip silently (no warning — this is bonus, not required).

## Step 2: Read curated dedup lists

Read each agent's markdown from the solopreneur plugin. Find the
`## Curated Skills` section. Extract skill names from every bullet line that
looks like:

```
- `<skill-name>` — <description>
```

The section is subdivided by source (Plugin built-in / Third-party / …).
Collect names from all subsections — they form the per-agent dedup blacklist
and should not be re-included in that agent's extended index.

Agents to read:
- `agents/ios-dev.md` → iOS dedup list
- `agents/designer.md` → design dedup list

To locate the plugin path on disk, try:
- `~/.claude/plugins/cache/solopreneur-marketplace/solopreneur/<version>/agents/<name>.md`
- Or use Glob: `~/.claude/plugins/**/solopreneur/**/agents/<name>.md`

If you can't find an agent file, ask the user where the solopreneur plugin is
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

### Design classification

- **Yes**: visual design / typography / color / spacing / layout / motion /
  component styling / design systems / design review / critique / UX copy /
  information architecture / presentation slides / mockup generation /
  responsive design / accessibility when it's about visual contrast or type
- **No**: pure frontend implementation (React hooks, Next.js routing) without
  design framing, QA testing, backend, iOS/Android development patterns that
  aren't design-focused, devops
- **Borderline** (polish / audit / harden / normalize and other "action verb"
  skills): include only when the description explicitly mentions UI / visual /
  design. When in doubt, skip — curated catches the must-haves.

## Step 4: Write output files

```bash
mkdir -p ~/.claude/solopreneur/skill-index
```

Write one file per platform.

### `~/.claude/solopreneur/skill-index/ios.md`

```markdown
# iOS Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <one-line description trimmed to ~120 chars>
  Path: ~/.claude/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified Axiom plugin skills (axiom-marketplace v<version>)
- `<name>` — <description>
  Path: ~/.claude/plugins/cache/axiom-marketplace/axiom/<version>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<empty if all good; otherwise warnings, e.g.:>
- Axiom plugin not installed. Install with: `claude plugin install axiom`
  (https://github.com/CharlesWiltgen/Axiom)
```

### `~/.claude/solopreneur/skill-index/design.md`

```markdown
# Design Skills Index — Extended
Generated: <ISO 8601 timestamp with timezone>
Classified by: <model name running this skill>

## Auto-classified user skills
- `<name>` — <description>
  Path: ~/.claude/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified frontend-design plugin skills (v<hash>)
- `<name>` — <description>
  Path: ~/.claude/plugins/cache/claude-plugins-official/frontend-design/<hash>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified ui-ux-pro-max plugin skills (v<version>)
- `<name>` — <description>
  Path: ~/.claude/plugins/cache/ui-ux-pro-max-skill/ui-ux-pro-max/<version>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Auto-classified frontend-slides plugin skills (v<hash>)
- `<name>` — <description>
  Path: ~/.claude/plugins/cache/claude-plugins-official/frontend-slides/<hash>/skills/<name>/SKILL.md
- ... (alphabetical by name)

## Missing
<warnings for any optional source not found>
```

Skip a section entirely if it would be empty (except `## Missing` — always
emit it for transparency).

## Step 5: Report to the user

Print a short summary:

```
Wrote ~/.claude/solopreneur/skill-index/{ios,design}.md

iOS:
- N user skills classified as iOS-relevant
- M Axiom skills classified as iOS-relevant (axiom v<version>)
- K curated skills excluded from extended index
- Warnings: <list, or "none">

Design:
- N user skills classified as design-relevant
- M frontend-design plugin skills classified as design-relevant (v<hash>)
- L ui-ux-pro-max plugin skills classified as design-relevant (v<version>)
- S frontend-slides plugin skills classified as design-relevant (v<hash>)
- K curated skills excluded from extended index
- Warnings: <list, or "none">
```

## Notes

- This skill is **manual**. There is no auto-rebuild on subagent invocation
  or on plugin update.
- Output is **per-machine**. The plugin git repo only ships the curated lists
  inside each `agents/<name>.md`.
- A single candidate skill can land in multiple platform indexes (design +
  iOS overlap is common for SwiftUI-focused visual skills).
- Classification is LLM judgment, not regex. Output may shift slightly
  between runs at the margin; that's acceptable because the curated list is
  the deterministic top-priority layer.
- Other platforms (android, web, python, llm) will get the same treatment if
  their agents start hitting the limits of the curated list.
