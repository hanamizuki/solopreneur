# iOS Agent — User-Built Skills Audit & Migration

Audit the 5 user-built skills currently listed in `agents/ios-dev.md` curated
section, decide per-skill whether to generalize + vendor into this repo, find
original authors (for internet-sourced ones), and attribute properly.

## Scope

Skills to audit (from the maintainer's local skill inventory):
- legacy `ios-patterns-hana` — maintainer convention → generalize to `ios-patterns`
- `ios-iphone-apps` — possibly from internet, find original author
- `ios-kavsoft-reference` — 140+ Kavsoft catalog, attribute + keep curated link
- `ios-swiftui-nav-ref` — reference, find author, consider vendoring
- `ios-swiftui-26-ref` — iOS 26 reference, find author, consider vendoring

Also: add `app-store-connect-cli-skills` (already added to curated as third-party link — verify path resolution works).

## Decisions per skill

For each, document:
- Origin (self-written / internet / mixed)
- Generalization needed (strip project-specific content)
- Action: vendor into `skills/` | keep as curated link | drop

## Out of scope

- Extending `/rebuild-skill-index` (separate todo)
- Other platforms (separate todos)

## Status

Backlog.
