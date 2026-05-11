---
name: ios-app-templates
description: Use when starting a new iOS app from a known category — provides
  reference implementations for camera-based photo analysis (AVFoundation +
  Vision Framework + Foundation Models on-device LLM) and future categories.
  Triggers on phrases like "拍照分析 app", "camera analysis app",
  "photo analysis", "Vision + Foundation Models", "ios 範本", "ios template",
  "on-device AI camera".
allowed-tools: Read, Glob
---

# iOS App Templates

When starting a new iOS app, check the catalog first for a matching template.

## Catalog

| Template | Use when |
|---|---|
| photo-analysis-app | Camera capture + Vision Framework + Foundation Models on-device LLM |

→ Read `references/<template>/README.md` for architecture and decisions, then
copy files from `references/<template>/Sources/` into your new project.

## Workflow

1. Find a matching template in the catalog above.
2. Read the template's `README.md` (architecture, decisions, platform limits).
3. Use `ios-dev:iphone-apps` skill to scaffold a new Xcode project.
4. Copy all files under `Sources/` into the new project.
5. Add required `Info.plist` keys (e.g. `NSCameraUsageDescription` for camera).
6. Wire the entry view (`CameraView` for photo-analysis-app) into your `NavigationStack`.
7. Extend the template with your app-specific logic (persistence, custom UI, etc.).

## Related skills

- `ios-dev:ios-patterns` — common SwiftUI conventions (i18n, Logger, Previews).
- `ios-dev:iphone-apps` — CLI-only build / test / ship workflow.
