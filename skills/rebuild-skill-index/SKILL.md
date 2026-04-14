---
name: rebuild-skill-index
description: |
  Rebuild the per-machine extended skill index used by platform subagents.
  Scans installed Claude Code skills (user-level + Axiom plugin), classifies
  each as iOS-relevant by reading its frontmatter description, and writes
  ~/.claude/solopreneur/skill-index/ios.md with resolved paths. Use when the
  user says "rebuild skill index", "refresh skill index", or after installing
  / removing iOS-related skills.
---

# Rebuild Skill Index

Generate `~/.claude/solopreneur/skill-index/ios.md` — the per-machine extended
index of every iOS-relevant skill installed on this machine that is not
already in the curated list inside `agents/ios-dev.md`.

The output is consumed by the `ios-dev` subagent (and any consumer that
dispatches it: `/specialist-review`, `/preflight`, `/todos-review`).

## Step 1: Collect candidate skills

Glob both sources and read **frontmatter only** (the `name:` and
`description:` fields). Do not read full SKILL.md bodies — that would burn
unnecessary tokens.

1. **User-level skills:**
   `Glob pattern: ~/.claude/skills/*/SKILL.md`

2. **Axiom plugin skills** (optional):
   ```bash
   ls ~/.claude/plugins/cache/axiom-marketplace/axiom/
   ```
   - If the directory exists, take the first version directory listed and
     glob: `~/.claude/plugins/cache/axiom-marketplace/axiom/<version>/skills/*/SKILL.md`
   - If it does not exist, record a "missing" warning for the output file.

For each SKILL.md found, Read just the top of the file (limit ~30 lines is
plenty for frontmatter) to extract `name` and `description`.

## Step 2: Read curated dedup list

Read `agents/ios-dev.md` from the solopreneur plugin. Find the
`## Curated Skills` section. Extract skill names from bullet lines matching:

```
- `<skill-name>` (user|axiom) — <description>
```

These are the dedup blacklist — do not re-include them in the extended index.

To locate the plugin path on disk, the agents/ios-dev.md is bundled with
this skill's parent plugin. Try:
- `~/.claude/plugins/cache/solopreneur-marketplace/solopreneur/<version>/agents/ios-dev.md`
- Or use Glob: `~/.claude/plugins/**/solopreneur/**/agents/ios-dev.md`

If you can't find it, ask the user where the solopreneur plugin is installed
and continue with an empty dedup list (extended file will have duplicates
with curated, which is fine — costs one extra entry).

## Step 3: Classify each candidate as iOS-relevant

For each skill not in the dedup list, judge from `name` + `description`
whether it is iOS-relevant. Be inclusive but not sloppy:

- **Yes**: anything Swift / SwiftUI / UIKit / Xcode / iOS / macOS / iPadOS /
  watchOS / tvOS / visionOS / Apple frameworks (CoreData, AVFoundation,
  CoreLocation, etc.) / Apple toolchain (lldb, Instruments, asc CLI, App
  Store Connect)
- **No**: web (React, Vue, Next.js, CSS), Android (Kotlin, Compose, Room),
  Python, LLM/agent frameworks, design tools, infra/devops, generic prose
  helpers
- **Borderline cases** (e.g. cross-platform performance audit, generic git
  workflow): exclude from the iOS index. The curated list catches the
  must-haves; extended is best-effort.

## Step 4: Write the output file

```bash
mkdir -p ~/.claude/solopreneur/skill-index
```

Write `~/.claude/solopreneur/skill-index/ios.md` with this structure:

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

Skip a section entirely if it would be empty (except `## Missing` — always
emit it for transparency).

## Step 5: Report to the user

Print a short summary:

```
Wrote ~/.claude/solopreneur/skill-index/ios.md
- N user skills classified as iOS-relevant
- M Axiom skills classified as iOS-relevant (axiom v<version>)
- K curated skills excluded from extended index
- Warnings: <list, or "none">
```

## Notes

- This skill is **manual**. There is no auto-rebuild on subagent invocation
  or on plugin update.
- Output is **per-machine**. The plugin git repo only ships the curated list
  inside `agents/ios-dev.md`.
- v1 covers iOS only. Other platforms (android, web, python, llm) will get
  the same treatment if/when they need it.
- Classification is LLM judgment, not regex. Output may shift slightly
  between runs at the margin; that's acceptable because the curated list is
  the deterministic top-priority layer.
