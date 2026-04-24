---
name: android-patterns
description: Use when building Android apps with Jetpack Compose — covers @Preview setup (LocalInspectionMode, Vico charts), Scaffold + bottom nav + status bar insets, ModalBottomSheet nested-scroll jitter, ripple clipping on rounded corners, SwipeToDismissBox with transparent content, and locale-aware date formatting (MIUI quirks).
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Android / Jetpack Compose Patterns

A curated collection of non-obvious patterns that solve recurring issues in Jetpack Compose apps. Each reference is self-contained — load only the one(s) relevant to the task.

## When to load which reference

Decide by the symptom or the task at hand, then read the matching reference before writing code.

| Task / Symptom | Reference |
|---|---|
| Writing a new `@Preview`, preview is blank, or any preview question | `references/compose-preview-overview.md` — start here (it branches to solutions/debugging/charts) |
| Preview involves Vico charts, `CartesianChartModelProducer`, or complex chart logic | `references/compose-preview-charts.md` |
| Designing `Scaffold` + `BottomNavigationBar` + `TopAppBar` with edge-to-edge / status bar | `references/scaffold-bottom-nav.md` |
| Content inside `ModalBottomSheet` jitters when scrolled to top | `references/bottomsheet-scroll.md` |
| Ripple on a rounded/shaped clickable is rectangular or spills past corners | `references/compose-ripple-clipping.md` |
| `SwipeToDismissBox` — background indicator bleeds through semi-transparent content | `references/swipe-to-dismiss-transparent.md` |
| Displaying user-facing dates across locales (MM/DD vs DD/MM, MIUI locale quirks, i18n) | `references/date-format-localization.md` |

## How to use these patterns

These references describe *patterns*, not project-specific conventions. Examples use `AppTheme` and generic identifiers — substitute the host project's theme (`MojoTheme`, `YourAppTheme`, etc.) and domain types when applying. The principles transfer directly.

If the host project already has an established pattern that contradicts a reference, follow the host project. Use these references for greenfield code or when a known issue matches the described symptom.
