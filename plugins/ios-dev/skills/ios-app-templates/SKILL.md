---
name: ios-app-templates
description: Use when starting a new iOS app from a known category — provides
  reference implementations for camera-based photo analysis (AVFoundation +
  Vision Framework + Foundation Models on-device LLM), portfolio tracking
  (crypto + stock positions with daily AI commentary), and future categories.
  Triggers on phrases like "拍照分析 app", "camera analysis app",
  "photo analysis", "Vision + Foundation Models", "投資組合 app",
  "portfolio tracker", "crypto tracker", "stock tracker", "ios 範本",
  "ios template", "on-device AI camera".
allowed-tools: Read, Glob
---

# iOS App Templates

When starting a new iOS app, check the catalog first for a matching template.

## Catalog

| Template | Use when | Shape |
|---|---|---|
| photo-analysis-app | Camera capture + Vision Framework + Foundation Models on-device LLM | Source-pack: `Sources/` + README; paste into a freshly scaffolded project |
| portfolio-tracker | Crypto + stock positions, prices via CoinGecko / Finnhub, news via Google News RSS, daily commentary via Anthropic Messages API | Complete-clone: `Pulse/` + `project.yml` + `.gitignore`; `xcodegen generate` and the project builds as-is |

→ Read `references/<template>/README.md` for architecture and decisions.
Source-pack templates expect you to paste their `Sources/` into a project
you scaffold first. Complete-clone templates ship a buildable XcodeGen
project — copy the whole template directory, customize, `xcodegen`, build.

Each template directory may also contain `customization-points.md` listing
the files most demos / starters need to touch.

## Workflow

### Source-pack template (e.g. photo-analysis-app)

1. Read the template's `README.md`.
2. Use `ios-dev:iphone-apps` skill to scaffold a new Xcode project.
3. Copy all files under `Sources/` into the new project.
4. Add required `Info.plist` keys (e.g. `NSCameraUsageDescription` for camera).
5. Wire the entry view into your `NavigationStack`.
6. Extend the template with your app-specific logic (persistence, custom UI, etc.).

### Complete-clone template (e.g. portfolio-tracker)

1. Read the template's `README.md` and `customization-points.md`.
2. Copy the entire template directory to your target path.
3. Edit `project.yml` (`name`, `PRODUCT_BUNDLE_IDENTIFIER`, `CFBundleDisplayName`).
4. Apply customizations listed in `customization-points.md`
   (e.g. `AIPersona.swift` for voice; accent color overrides; ticker maps).
5. `xcodegen generate` to produce the `.xcodeproj`.
6. `xcodebuild` to verify; install to simulator or device.

Note: `allowed-tools: Read, Glob` reflects what this skill itself needs
(browse the catalog and read referenced files). The file-copy and Xcode
scaffolding steps are performed by the calling agent using its own tool
permissions — they do not need to be listed here.

## Related skills

- `ios-dev:ios-patterns` — common SwiftUI conventions (i18n, Logger, Previews).
- `ios-dev:iphone-apps` — CLI-only build / test / ship workflow.
