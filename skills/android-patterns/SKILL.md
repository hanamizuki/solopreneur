---
name: android-patterns
description: "Battle-tested Jetpack Compose patterns for Kotlin/Android projects. Covers @Preview setup (LocalInspectionMode, Vico charts rendering blank in preview), Scaffold + bottom navigation + status bar insets, ModalBottomSheet nested-scroll jitter, Ripple clipping on rounded corners, SwipeToDismissBox with transparent content, and locale-aware date formatting (MM/DD vs DD/MM, MIUI locale quirks). Use this skill whenever writing Kotlin or Jetpack Compose code, building a new @Preview, debugging a blank preview, handling window insets with Scaffold/TopAppBar, implementing swipe-to-dismiss or bottom sheets, or displaying user-facing dates across locales — even if the user does not explicitly mention 'pattern' or 'best practice'."
disable-model-invocation: true
---

# Android / Jetpack Compose Patterns

A curated collection of non-obvious patterns that solve recurring issues in Jetpack Compose apps. Each reference is self-contained — load only the one(s) relevant to the task.

## When to load which reference

Decide by the symptom or the task at hand, then read the matching reference before writing code.

| Task / Symptom | Reference |
|---|---|
| Writing a new `@Preview`, or existing preview renders blank / shows no data | `references/compose-preview-overview.md` — start here, then branch |
| Preview involves Vico charts, `LaunchedEffect`, or `CartesianChartModelProducer` | `references/compose-preview-overview.md` (solution 1) |
| Component depends on a ViewModel / Flow and preview needs real logic | `references/compose-preview-solutions.md` (solution 3: internal implementation) |
| Preview still blank after applying a solution — need a debug workflow | `references/compose-preview-debugging.md` |
| Writing chart previews or setting up fake data providers for charts | `references/compose-preview-charts.md` |
| Designing `Scaffold` + `BottomNavigationBar` + `TopAppBar` with edge-to-edge / status bar | `references/scaffold-bottom-nav.md` |
| Content inside `ModalBottomSheet` jitters when scrolled to top | `references/bottomsheet-scroll.md` |
| Ripple on a rounded/shaped clickable is rectangular or spills past corners | `references/compose-ripple-clipping.md` |
| `SwipeToDismissBox` — background indicator bleeds through semi-transparent content | `references/swipe-to-dismiss-transparent.md` |
| Displaying user-facing dates across locales (MM/DD vs DD/MM, MIUI locale quirks, i18n) | `references/date-format-localization.md` |

## How to use these patterns

These references describe *patterns*, not project-specific conventions. Examples use `AppTheme` and generic identifiers — substitute the host project's theme (`MojoTheme`, `YourAppTheme`, etc.) and domain types when applying. The principles transfer directly.

If the host project already has an established pattern that contradicts a reference, follow the host project. Use these references for greenfield code or when a known issue matches the described symptom.
