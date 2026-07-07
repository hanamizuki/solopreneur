# Android Agent — Curated List & Extended Index

Build `agents/android-dev.md` curated skills section from scratch, migrating
self-written skills into this repo and attributing internet-sourced ones.

## Scope

Source inventory: a maintainer-local `android-skill-index.md` listed 17 Android skills.

Per-skill audit:
- Determine origin: repo-maintained vs. third-party
- For repo-maintained skills: generalize (strip project-specific content) and vendor into `skills/`
- For internet-sourced: find original author, attribute, decide vendor vs. curated-link

Known definite action:
- ✅ legacy `android-patterns-hana` — maintainer-authored → generalized → vendored as `android-patterns` → added to curated (PR #4, merged 2026-04-14)

Other 16 skills to audit:
- `android-architecture`, `android-gradle-logic`, `android-gradle-build-performance`
- `android-jetpack-compose`, `android-compose-ui`, `android-compose-performance-audit`
- `android-xml-to-compose-migration`, `android-mobile-design`
- `android-compose-navigation`
- `android-data-layer`, `android-viewmodel`
- `android-coroutines`, `android-kotlin-concurrency-expert`
- `android-testing`
- `android-accessibility`
- Cross-platform: `deploy-to-device`

## Deliverables

1. Audit table (per-skill origin + action)
2. ✅ Generalized `android-patterns` in `skills/` (PR #4)
3. ✅ `agents/android-dev.md` curated section written (PR #4)
4. Extended index classification rules for Android (added to `/rebuild-skill-index`)

## Out of scope

- Running `/rebuild-skill-index` extension — separate todo
- Third-party Android plugin integration (no Axiom-equivalent identified yet)

## Status

In progress — `android-patterns` vendored + wired into `android-dev` agent (PR #4).
Remaining: audit 16 other skills, write audit table, add Android classification rules
to `/rebuild-skill-index`.
