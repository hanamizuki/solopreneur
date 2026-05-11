<!--
Plan-Branch: worktree-feature+ios-app-templates
Spec: docs/spec/2026-05-11-ios-app-templates.md
-->

# `ios-app-templates` Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a new umbrella skill `ios-dev:ios-app-templates` containing a single first-entry reference implementation `photo-analysis-app`, plus matching plugin metadata updates.

**Architecture:** One umbrella skill at `plugins/ios-dev/skills/ios-app-templates/`. The skill body documents a `Catalog` of templates. Each template lives under `references/<template>/` with its own `README.md` and `Sources/` (Swift files copied/rewritten from `/Users/Hana/Backup/Developer/como-ios`). Templates are reference code, **not required to compile standalone** — they're consumed by `ios-dev` agent when starting a new project of that category.

**Tech Stack:** Markdown (`SKILL.md`, `README.md`), Swift 5.9+ (reference code), JSON (plugin/marketplace metadata).

**No test harness:** This repo has no test infrastructure for plugin skills or Swift snippets. Verification is per-file: (a) `wc -l` & visual diff vs. spec, (b) syntactic sanity (matching braces, plausible Swift), (c) absence of forbidden dependencies (e.g. `import SwiftData`, `AlbumSettings`). The user does final review via PR.

**Reference files** (consult during rewrite tasks):

| File | Path |
|---|---|
| Spec V2 | `docs/spec/2026-05-11-ios-app-templates.md` |
| como Logging | `/Users/Hana/Backup/Developer/como-ios/como/Core/Logging.swift` (32 lines) |
| como DataTypes | `/Users/Hana/Backup/Developer/como-ios/como/Models/DataTypes.swift` (89 lines) |
| como PhotoAnalysisResult | `/Users/Hana/Backup/Developer/como-ios/como/Models/PhotoAnalysisResult.swift` (370 lines) |
| como CaptureService | `/Users/Hana/Backup/Developer/como-ios/como/Services/CaptureService.swift` (858 lines) |
| como VisionFrameworkService | `/Users/Hana/Backup/Developer/como-ios/como/Services/VisionFrameworkService.swift` (632 lines) |
| como FoundationModelsService | `/Users/Hana/Backup/Developer/como-ios/como/Services/FoundationModelsService.swift` (204 lines) |
| como CameraModel | `/Users/Hana/Backup/Developer/como-ios/como/ViewModel/CameraModel.swift` (428 lines) |
| como CameraView | `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/CameraView.swift` (311 lines) |
| como CameraPreview | `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/CameraPreview.swift` (94 lines) |
| como FocusIndicatorView | `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/FocusIndicatorView.swift` (184 lines) |
| como FocusIndicatorStyle | `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/FocusIndicatorStyle.swift` (69 lines) |

**Language rules** (repo is MIT open source):
- Swift comments: English only
- `SKILL.md` / `README.md`: English only
- Commit messages: English (Conventional Commits style: `feat(ios-dev):`, `docs(ios-dev):`, `chore(ios-dev):`)

---

## Final File Layout

```
plugins/ios-dev/skills/ios-app-templates/
├── SKILL.md
└── references/
    └── photo-analysis-app/
        ├── README.md
        └── Sources/
            ├── Core/Logging.swift
            ├── Models/CameraTypes.swift
            ├── Models/PhotoAnalysisResult.swift
            ├── Services/CaptureService.swift
            ├── Services/VisionFrameworkService.swift
            ├── Services/FoundationModelsService.swift
            ├── ViewModel/CameraModel.swift
            └── View/Camera/
                ├── CameraView.swift
                ├── CameraPreview.swift
                ├── FocusIndicatorView.swift
                └── FocusIndicatorStyle.swift
```

Plus modifications to existing files:

```
plugins/ios-dev/agents/ios-dev.md           (curated list)
plugins/ios-dev/.claude-plugin/plugin.json  (description)
.claude-plugin/marketplace.json             (ios-dev entry description)
README.md                                   (mention templates)
```

---

## Task 1: Create skill skeleton and `SKILL.md`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/SKILL.md`
- Create dirs: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/{Core,Models,Services,ViewModel,View/Camera}`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Core
mkdir -p plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models
mkdir -p plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services
mkdir -p plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/ViewModel
mkdir -p plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera
```

- [ ] **Step 2: Write `SKILL.md`**

Path: `plugins/ios-dev/skills/ios-app-templates/SKILL.md`

```markdown
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
```

- [ ] **Step 3: Verify**

```bash
ls -R plugins/ios-dev/skills/ios-app-templates/
head -20 plugins/ios-dev/skills/ios-app-templates/SKILL.md
```

Expected: directory tree visible; SKILL.md has frontmatter with `name: ios-app-templates`.

- [ ] **Step 4: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/SKILL.md
git commit -m "feat(ios-dev): add ios-app-templates skill skeleton"
```

---

## Task 2: Write `photo-analysis-app/README.md`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/README.md`

- [ ] **Step 1: Write the README**

Path: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/README.md`

```markdown
# photo-analysis-app

Reference implementation for an iOS app that captures a photo and analyzes it
entirely on-device. No backend, no network dependency.

## Pipeline

```
User taps capture
    ↓
CaptureService (AVFoundation) → Photo
    ↓
VisionFrameworkService.collect → ComprehensiveVisionData
    (OCR, objects, faces, salient regions, rectangles)
    ↓
FoundationModelsService.generateResponse(prompt:) → String
    (Vision data serialized into prompt text)
    ↓
PhotoAnalysisResult (vision + LLM response + capturedAt)
```

## Architecture decisions

1. **`CaptureService` is a `final class : NSObject`** with a dedicated
   `DispatchQueue` for `AVCaptureSession`. AVFoundation pre-dates Swift
   Concurrency; a serial queue is still the idiomatic way to confine session
   mutations.

2. **`VisionFrameworkService` exposes static collectors only.** Vision requests
   are stateless; an instance type adds nothing. Data models (`ComprehensiveVisionData`
   and its members) are plain `Sendable` structs.

3. **`FoundationModelsService` is text-prompt only.** Foundation Models
   currently does not accept image input via the public API. Vision results are
   serialized into the prompt text. If Apple ships multimodal later, extend the
   service rather than mock it now.

4. **`PhotoAnalysisResult` is a plain `struct`.** Not a SwiftData `@Model`.
   The template stays storage-agnostic; you wire your own persistence
   (SwiftData / Core Data / cloud) when integrating.

5. **MVVM strict layering.** `View` only renders. `CameraModel` (ViewModel)
   composes services. Services wrap one framework each.

6. **`Log` categories.** `Log.capture` for AVFoundation, `Log.camera` for
   ViewModel, `Log.ui` for gestures / views, `Log.focus` for focus flow.
   Subsystem defaults to bundle identifier.

## Platform requirements

| Feature | Minimum |
|---|---|
| Camera capture (`CaptureService`, `CameraPreview`) | iOS 13+ |
| Vision Framework (`VisionFrameworkService`) | iOS 11+ |
| Foundation Models on-device LLM (`FoundationModelsService`) | iOS 26.0+, Apple Intelligence-supported device |

`FoundationModelsService` is wrapped in `#if canImport(FoundationModels)` and
`@available(iOS 26.0, *)`. On unsupported devices, replace the call site with a
backend LLM (e.g. OpenAI, Anthropic, or your own server) preserving the
`generateResponse(prompt:) async throws -> String` signature.

## Multimodal note

The original como project's `FoundationModelsService.generateResponse(prompt:image:)`
accepted a `UIImage` parameter but did not actually pass it to the model.
This template removes the `image` parameter to avoid misleading callers.
Vision-extracted text is serialized into the prompt — see
`ComprehensiveVisionData.summarizedForPrompt()`.

## File index

```
Sources/
├── Core/Logging.swift                — Log categories
├── Models/
│   ├── CameraTypes.swift            — CameraStatus, CaptureActivity, Photo, CameraError
│   └── PhotoAnalysisResult.swift    — plain struct: vision + llmResponse + capturedAt
├── Services/
│   ├── CaptureService.swift         — AVFoundation session, capture, focus, zoom
│   ├── VisionFrameworkService.swift — static Vision collectors + data models
│   └── FoundationModelsService.swift — on-device LLM (text prompt)
├── ViewModel/CameraModel.swift      — composes services, exposes state to View
└── View/Camera/
    ├── CameraView.swift              — preview + capture button + zoom + focus
    ├── CameraPreview.swift           — AVCaptureVideoPreviewLayer wrapper
    ├── FocusIndicatorView.swift      — animated focus indicator
    └── FocusIndicatorStyle.swift     — style enum for the indicator
```

## How to use

1. Scaffold a new Xcode project with `ios-dev:iphone-apps`:
   ```bash
   # See ios-dev:iphone-apps skill for the exact bootstrap commands.
   ```
2. Copy the contents of `Sources/` into your new project, preserving folder structure.
3. Add to `Info.plist`:
   ```xml
   <key>NSCameraUsageDescription</key>
   <string>This app needs camera access to capture photos for analysis.</string>
   ```
4. In your root `App.swift` or a `NavigationStack`, embed `CameraView()`:
   ```swift
   NavigationStack {
       CameraView()
   }
   ```
5. Build and run on a physical device (camera does not work in Simulator).

## Extension points

- **Persistence:** `CameraModel.analyze(photo:)` writes results into
  `analysisResult: PhotoAnalysisResult?`. Replace with SwiftData / Core Data /
  cloud writes.
- **LLM backend:** Swap `FoundationModelsService` with your own client
  conforming to `generateResponse(prompt:) async throws -> String`.
- **UI:** `CameraView` is minimal (preview + capture button + zoom slider).
  Add album picker, history, settings, etc. as needed.
- **Vision configuration:** `ComprehensiveVisionData` collects OCR + objects +
  faces + salient regions + rectangles. Comment out unused requests in
  `VisionFrameworkService.collect` to reduce processing time.
```

- [ ] **Step 2: Verify**

```bash
wc -l plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/README.md
```

Expected: ~120-160 lines.

- [ ] **Step 3: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/README.md
git commit -m "docs(ios-dev): document photo-analysis-app template"
```

---

## Task 3: `Core/Logging.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Core/Logging.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Core/Logging.swift`

Strategy: Near-direct copy. Translate Chinese comments to English. Default subsystem to `"PhotoAnalysisApp"` instead of bundle id fallback `"como"`.

- [ ] **Step 1: Write the file**

```swift
//
//  Logging.swift
//
//  Unified logging facade wrapping Apple's os.Logger.
//
//  Goals:
//  - Centralize subsystem + category definitions so call sites only use
//    Log.capture / Log.camera / Log.ui / Log.focus.
//  - Logger is thread-safe; safe to call from any thread including the AVFoundation
//    session queue and @MainActor.
//  - Use info / debug / notice / error severities — never print().
//

import Foundation
import os

/// Logging facade: provides per-domain Logger instances.
enum Log {
    /// Subsystem name. Falls back to a literal if the bundle identifier is nil
    /// (which happens in some test or preview contexts).
    private static let subsystem: String = Bundle.main.bundleIdentifier ?? "PhotoAnalysisApp"

    /// Camera capture + AVFoundation layer (session, device).
    static let capture = Logger(subsystem: subsystem, category: "capture")

    /// Camera ViewModel + application state.
    static let camera = Logger(subsystem: subsystem, category: "camera")

    /// UI interactions (gestures, preview taps).
    static let ui = Logger(subsystem: subsystem, category: "ui")

    /// Focus flow + focus indicator.
    static let focus = Logger(subsystem: subsystem, category: "focus")
}
```

- [ ] **Step 2: Verify**

```bash
swift -frontend -parse plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Core/Logging.swift 2>&1 | head -5
```

If `swift` is on PATH, expect no parse errors. If not available, skip and rely on visual review.

- [ ] **Step 3: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Core/Logging.swift
git commit -m "feat(ios-dev): add Logging.swift to photo-analysis-app template"
```

---

## Task 4: `Models/CameraTypes.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models/CameraTypes.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Models/DataTypes.swift`

Strategy: Extract `CameraStatus`, `CaptureActivity`, `Photo`, `CameraError`. **Drop** `PhotoCaptureState` (not needed in the simplified flow — `CameraModel` exposes `captureActivity` directly). Translate error descriptions to English.

- [ ] **Step 1: Write the file**

```swift
//
//  CameraTypes.swift
//
//  Core value types for camera capture: status, activity, photo, and error.
//

import Foundation

/// Authorization + lifecycle state of the camera session.
enum CameraStatus {
    case unknown
    case unauthorized
    case failed
    case running
}

/// Whether the camera is currently capturing.
enum CaptureActivity {
    case idle
    case capturing

    var isCapturing: Bool {
        if case .capturing = self { return true }
        return false
    }
}

/// A captured photo wrapping its raw data representation.
struct Photo: Sendable {
    let data: Data
    let timestamp: Date

    init(data: Data, timestamp: Date = Date()) {
        self.data = data
        self.timestamp = timestamp
    }

    /// Returns the photo file data representation suitable for writing or further processing.
    func fileDataRepresentation() -> Data? {
        return data
    }
}

/// Errors thrown by the capture pipeline.
enum CameraError: LocalizedError {
    case setupFailed
    case captureDeviceNotFound
    case addInputFailed
    case addOutputFailed
    case captureFailed
    case photoCaptureFailed
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .setupFailed:           return "Camera setup failed."
        case .captureDeviceNotFound: return "No capture device found."
        case .addInputFailed:        return "Unable to add capture input."
        case .addOutputFailed:       return "Unable to add capture output."
        case .captureFailed:         return "Capture failed."
        case .photoCaptureFailed:    return "Photo capture processing failed."
        case .unauthorized:          return "Camera access is not authorized."
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models/CameraTypes.swift
git commit -m "feat(ios-dev): add CameraTypes.swift to photo-analysis-app template"
```

---

## Task 5: `Models/PhotoAnalysisResult.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models/PhotoAnalysisResult.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Models/PhotoAnalysisResult.swift` (do NOT copy as-is — it is `@Model` + 370 lines of SwiftData queries)

Strategy: Rewrite from scratch as a plain `Sendable struct`. Hold the Vision data, the LLM response, and a timestamp. **No `@Model`, no `ModelContext`, no `DataRequirementAnalyzer`.**

- [ ] **Step 1: Write the file**

```swift
//
//  PhotoAnalysisResult.swift
//
//  Aggregated output of a single capture-and-analyze pass: Vision-extracted
//  signals plus the LLM's textual interpretation. Plain struct — the template
//  stays storage-agnostic, so consumers can persist via SwiftData, Core Data,
//  cloud, or not at all.
//

import Foundation

struct PhotoAnalysisResult: Identifiable, Sendable {
    let id: UUID
    let vision: ComprehensiveVisionData
    let llmResponse: String
    let capturedAt: Date

    init(
        id: UUID = UUID(),
        vision: ComprehensiveVisionData,
        llmResponse: String,
        capturedAt: Date = Date()
    ) {
        self.id = id
        self.vision = vision
        self.llmResponse = llmResponse
        self.capturedAt = capturedAt
    }
}
```

Note: `ComprehensiveVisionData` is defined in `VisionFrameworkService.swift` (Task 7).

- [ ] **Step 2: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models/PhotoAnalysisResult.swift
git commit -m "feat(ios-dev): add PhotoAnalysisResult.swift to photo-analysis-app template"
```

---

## Task 6: `Services/FoundationModelsService.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/FoundationModelsService.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Services/FoundationModelsService.swift` (204 lines)

Strategy: Keep:
- `#if canImport(FoundationModels)` wrapping
- `@available(iOS 26.0, *)` on call sites
- `isSupported` static check
- `generateResponse(prompt:)` — **drop the `image:` parameter** (the original ignored it)
- `FoundationModelsError` enum
- `checkAvailability()` helper

Drop:
- `generateJSONResponse(prompt:image:)` and `extractJSONFromResponse(_:)` — out of scope for the minimal template; consumers can layer JSON parsing on top of `generateResponse`.
- All Chinese comments and emoji log messages — translate to plain English.

- [ ] **Step 1: Write the file**

```swift
//
//  FoundationModelsService.swift
//
//  Thin wrapper around Apple Intelligence on-device LLM (iOS 26+).
//
//  Multimodal note: The public Foundation Models API currently accepts text
//  prompts only. Vision-extracted signals are serialized into the prompt by
//  callers (see CameraModel + ComprehensiveVisionData.summarizedForPrompt()).
//
//  Fallback: On devices that do not support Apple Intelligence, swap this
//  service with a backend-LLM client preserving the
//  `generateResponse(prompt:) async throws -> String` signature.
//

import Foundation
import os

#if canImport(FoundationModels)
import FoundationModels
#endif

@MainActor
final class FoundationModelsService {

    /// Whether Foundation Models is available on the current build + OS.
    static var isSupported: Bool {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) { return true }
        #endif
        return false
    }

    /// Generate a text response from a text prompt.
    /// - Parameter prompt: The full prompt text. Callers serialize any
    ///   structured signals (Vision results, metadata) into this string.
    /// - Returns: Raw text response from the model.
    @available(iOS 26.0, *)
    func generateResponse(prompt: String) async throws -> String {
        #if canImport(FoundationModels)
        Log.camera.info("FoundationModels: starting response generation")
        Log.camera.debug("FoundationModels: prompt length=\(prompt.count) chars")

        let model = SystemLanguageModel.default
        let availability = model.availability

        Log.camera.debug("FoundationModels availability=\(String(describing: availability))")

        guard availability == .available else {
            Log.camera.notice("FoundationModels unavailable: \(String(describing: availability))")
            throw FoundationModelsError.modelNotAvailable(status: String(describing: availability))
        }

        do {
            let session = LanguageModelSession()
            let promptObject = Prompt(prompt)
            let response = try await session.respond(to: promptObject)
            let text = response.content
            guard !text.isEmpty else {
                Log.camera.error("FoundationModels returned empty response")
                throw FoundationModelsError.emptyResponse
            }
            Log.camera.info("FoundationModels response ok (\(text.count) chars)")
            return text
        } catch let error as FoundationModelsError {
            throw error
        } catch {
            Log.camera.error("FoundationModels call failed: \(error.localizedDescription)")
            throw FoundationModelsError.apiError(underlying: error)
        }
        #else
        Log.camera.notice("FoundationModels framework not present in this build")
        throw FoundationModelsError.frameworkNotAvailable
        #endif
    }

    /// Returns a human-readable availability description.
    @available(iOS 26.0, *)
    func checkAvailability() -> String {
        #if canImport(FoundationModels)
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:   return "available"
        case .unavailable: return "unavailable"
        @unknown default:  return "unknown(\(String(describing: model.availability)))"
        }
        #else
        return "framework-not-imported"
        #endif
    }
}

enum FoundationModelsError: LocalizedError {
    case frameworkNotAvailable
    case modelNotAvailable(status: String)
    case emptyResponse
    case apiError(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .frameworkNotAvailable:
            return "Foundation Models framework unavailable (requires iOS 26.0+)."
        case .modelNotAvailable(let status):
            return "Foundation Models unavailable (status: \(status))."
        case .emptyResponse:
            return "Foundation Models returned an empty response."
        case .apiError(let error):
            return "Foundation Models API error: \(error.localizedDescription)"
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/FoundationModelsService.swift
git commit -m "feat(ios-dev): add FoundationModelsService.swift to photo-analysis-app template"
```

---

## Task 7: `Services/VisionFrameworkService.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/VisionFrameworkService.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Services/VisionFrameworkService.swift` (632 lines)
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Services/VisionFrameworkService+SafeConfidence.swift` (108 lines, optional helper extension)

Strategy: This file is the trickiest rewrite. The original mixes a SwiftData-coupled instance service with reusable static collectors. Per Codex review, **only the static collector code + data models are portable.**

**Keep (from the source):**
- All data model structs at lines 481-632: `ComprehensiveVisionData`, `RecognizedTextBlock`, `FaceData`, `HumanData`, `AnimalData`, `RectangleData`, `SalientObjectData`, etc. These are pure `Codable`/`Sendable` value types.
- The static collector `collectComprehensiveVisionData(from:)` and its helper static methods at lines 137-479 area (these run Vision requests synchronously and bundle results).
- Confidence-filtering helpers (from the `+SafeConfidence` extension if helpful — fold inline if small).

**Drop:**
- `import SwiftData` (line 8 area)
- The instance `class VisionFrameworkService` itself if it only exists to hold SwiftData state. The template exposes static methods directly.
- Any references to `AlbumSettings`, `ModelContext`, `PhotoAnalysisResult` (the original), `DataRequirementAnalyzer`.
- Any methods that write to SwiftData or query a `ModelContext`.

**Add:**
- `extension ComprehensiveVisionData { func summarizedForPrompt() -> String }` — serializes the data into prompt-friendly text. Format example:
  ```
  OCR text blocks (3):
   - "Receipt total: $42.18" (confidence 0.95)
   - "2026-05-11" (confidence 0.91)
   - "Coffee shop" (confidence 0.88)
  Detected objects (2):
   - cup (confidence 0.82)
   - table (confidence 0.74)
  Faces detected: 0
  Salient regions: 1
  ```
  Keep it deterministic and concise — this text becomes part of the LLM prompt.

- [ ] **Step 1: Read source for the data-model section**

```bash
sed -n '481,632p' /Users/Hana/Backup/Developer/como-ios/como/Services/VisionFrameworkService.swift
```

Capture the struct definitions verbatim. Verify they only `import Foundation` / `import Vision` / `import UIKit`.

- [ ] **Step 2: Read source for the static collector section**

```bash
sed -n '137,479p' /Users/Hana/Backup/Developer/como-ios/como/Services/VisionFrameworkService.swift | head -100
```

Identify the entry point. Look for a method whose signature roughly matches:
```swift
static func collectComprehensiveVisionData(from image: UIImage) async throws -> ComprehensiveVisionData
```
or a synchronous variant. Capture it and its private helpers verbatim.

- [ ] **Step 3: Write the rewritten file**

Skeleton (fill the marked sections from the source):

```swift
//
//  VisionFrameworkService.swift
//
//  Static collectors that run Vision Framework requests against a captured
//  image and return Sendable structs.
//
//  This service has no instance state; consumers call static methods directly.
//  See ComprehensiveVisionData.summarizedForPrompt() for the prompt serializer
//  used by the photo-analysis pipeline.
//

import Foundation
import UIKit
import Vision
import os

// MARK: - Public entry point

enum VisionFrameworkService {

    /// Runs the full Vision request pipeline against `image` and bundles
    /// results into a ComprehensiveVisionData snapshot.
    static func collectComprehensiveVisionData(from image: UIImage) async throws -> ComprehensiveVisionData {
        // <COPY FROM como:VisionFrameworkService.swift static collector section>
        // - Build VNImageRequestHandler from image.cgImage
        // - Run text recognition, object recognition, face detection,
        //   salient object detection, rectangle detection requests
        // - Map results to RecognizedTextBlock / FaceData / etc.
        // - Apply SafeConfidence filtering helpers
        // - Return ComprehensiveVisionData
    }

    // <ALSO COPY any private helper static methods from the source's
    //  static collector area.>
}

// MARK: - Data models

// <COPY VERBATIM from como:VisionFrameworkService.swift lines 481-632>
// Strip Chinese comments; translate to English.
// All structs should be `Sendable`. Mark them `public` only if needed by
// downstream consumers (default internal is fine for a template).

struct ComprehensiveVisionData: Sendable {
    // <FIELDS FROM SOURCE>
}

// struct RecognizedTextBlock: Sendable { ... }
// struct FaceData: Sendable { ... }
// struct HumanData: Sendable { ... }
// struct AnimalData: Sendable { ... }
// struct RectangleData: Sendable { ... }
// struct SalientObjectData: Sendable { ... }

// MARK: - Prompt serializer

extension ComprehensiveVisionData {
    /// Produces a deterministic, human-readable summary suitable for embedding
    /// in an LLM prompt. Keep the format stable — the LLM has been observed to
    /// rely on consistent labeling.
    func summarizedForPrompt() -> String {
        var lines: [String] = []

        // OCR
        // if textBlocks is non-empty:
        //   lines.append("OCR text blocks (\(textBlocks.count)):")
        //   for block in textBlocks {
        //       lines.append(" - \"\(block.text)\" (confidence \(format(block.confidence)))")
        //   }

        // Objects, faces, salient regions — follow the same pattern.

        // <IMPLEMENT against the actual fields in ComprehensiveVisionData>
        return lines.joined(separator: "\n")
    }
}
```

- [ ] **Step 4: Verify no forbidden imports**

```bash
grep -E "import SwiftData|AlbumSettings|ModelContext|DataRequirementAnalyzer|PhotoAnalysisResult" \
  plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/VisionFrameworkService.swift
```

Expected: empty output (no matches). If any match, remove that line.

- [ ] **Step 5: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/VisionFrameworkService.swift
git commit -m "feat(ios-dev): add VisionFrameworkService.swift to photo-analysis-app template"
```

---

## Task 8: `Services/CaptureService.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/CaptureService.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/Services/CaptureService.swift` (858 lines)

Strategy: Rewrite the camera session manager preserving its real architecture (`final class : NSObject` + `DispatchQueue`) — NOT an `actor`. Subset to: session setup, device selection, focus, zoom, photo capture, AVCapturePhotoCaptureDelegate.

**Drop everything related to:**
- Album hooks / `AlbumSettings`
- `LocationService` integration
- `PhotoMetadataService` integration
- Background analysis hooks (`BackgroundAnalysisActor`)
- Any cloud or file-system writes triggered from inside CaptureService

**Keep:**
- `final class CaptureService: NSObject` with a private serial `DispatchQueue` (commonly named `sessionQueue`).
- `start()` / `stop()` lifecycle.
- Device discovery and selection (back camera default; front camera switching kept if present in source).
- Focus point + focus mode (`autoFocus` / `continuousAutoFocus`).
- Zoom (`zoom(by:)` / `zoom(factor:)`).
- `capturePhoto() async throws -> Photo` — the main capture entry.
- `previewLayer: AVCaptureVideoPreviewLayer` exposed to UI.
- Internal `AVCapturePhotoCaptureDelegate` implementation (typically a private nested type or `extension` in the source). Map AVFoundation result → `Photo` (Models/CameraTypes.swift).

- [ ] **Step 1: Read source structure**

```bash
grep -n "^func\|^class\|^extension\|^private func\|^private class" \
  /Users/Hana/Backup/Developer/como-ios/como/Services/CaptureService.swift | head -60
```

Identify the entry points (likely `start`, `stop`, `capturePhoto`, `setFocus`, `zoom`).

- [ ] **Step 2: Read sections to copy**

```bash
sed -n '1,80p' /Users/Hana/Backup/Developer/como-ios/como/Services/CaptureService.swift
```

Capture the imports + class declaration + `sessionQueue` + `previewLayer` properties.

- [ ] **Step 3: Write the rewritten file**

Skeleton (fill from source, stripping album/location/metadata/background concerns):

```swift
//
//  CaptureService.swift
//
//  AVFoundation camera session manager.
//
//  Architecture: `final class : NSObject` with a dedicated serial queue
//  (`sessionQueue`) — AVCaptureSession mutations must run off the main
//  thread, and AVFoundation pre-dates Swift Concurrency.
//

import Foundation
import AVFoundation
import UIKit
import os

final class CaptureService: NSObject {

    // MARK: - Properties

    private let session = AVCaptureSession()
    private let sessionQueue = DispatchQueue(label: "photo-analysis-app.capture-session")
    private var photoOutput: AVCapturePhotoOutput?
    private var videoDeviceInput: AVCaptureDeviceInput?

    private(set) lazy var previewLayer: AVCaptureVideoPreviewLayer = {
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        return layer
    }()

    private var captureContinuation: CheckedContinuation<Photo, Error>?

    // MARK: - Lifecycle

    func start() async throws { /* COPY: configure session + start running */ }
    func stop()                { /* COPY: stop session */ }

    // MARK: - Capture

    func capturePhoto() async throws -> Photo {
        try await withCheckedThrowingContinuation { continuation in
            sessionQueue.async {
                guard let output = self.photoOutput else {
                    continuation.resume(throwing: CameraError.captureNotConfigured)
                    return
                }
                self.captureContinuation = continuation
                let settings = AVCapturePhotoSettings()
                // <COPY format / flash / orientation handling from source>
                output.capturePhoto(with: settings, delegate: self)
            }
        }
    }

    // MARK: - Focus

    func setFocus(at point: CGPoint) { /* COPY focus implementation */ }

    // MARK: - Zoom

    func zoom(factor: CGFloat) { /* COPY zoom implementation */ }
}

// MARK: - AVCapturePhotoCaptureDelegate

extension CaptureService: AVCapturePhotoCaptureDelegate {
    func photoOutput(_ output: AVCapturePhotoOutput,
                     didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        if let error {
            captureContinuation?.resume(throwing: error)
            captureContinuation = nil
            return
        }
        guard let data = photo.fileDataRepresentation() else {
            captureContinuation?.resume(throwing: CameraError.photoDataExtractionFailed)
            captureContinuation = nil
            return
        }
        captureContinuation?.resume(returning: Photo(data: data))
        captureContinuation = nil
    }
}
```

Fill the `// COPY` regions verbatim from the como source, **stripping any references to AlbumSettings, LocationService, PhotoMetadataService, BackgroundAnalysisActor.** If a method body has those calls interleaved with real capture logic, keep only the capture logic.

- [ ] **Step 4: Verify no forbidden references**

```bash
grep -nE "AlbumSettings|LocationService|PhotoMetadataService|BackgroundAnalysisActor|PhotoLibraryService|ModelContext" \
  plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/CaptureService.swift
```

Expected: empty.

- [ ] **Step 5: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/CaptureService.swift
git commit -m "feat(ios-dev): add CaptureService.swift to photo-analysis-app template"
```

---

## Task 9: `ViewModel/CameraModel.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/ViewModel/CameraModel.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/ViewModel/CameraModel.swift` (428 lines — heavy refs to dropped services, do NOT copy as-is)

Strategy: Spec V2 already gives the exact target structure. Write it.

- [ ] **Step 1: Write the file**

```swift
//
//  CameraModel.swift
//
//  ViewModel that composes CaptureService, VisionFrameworkService, and
//  FoundationModelsService into the photo-analysis pipeline:
//      capture → vision → LLM → PhotoAnalysisResult.
//
//  Persistence is intentionally absent — wire your own (SwiftData / Core Data
//  / cloud) at the call site in your app.
//

import Foundation
import SwiftUI
import UIKit
import AVFoundation
import os

@MainActor
@Observable
final class CameraModel {

    // MARK: - Camera state

    var status: CameraStatus = .unknown
    private(set) var captureActivity: CaptureActivity = .idle
    private(set) var zoomFactor: Float = 1.0
    private(set) var isFocusing: Bool = false
    private(set) var focusPoint: CGPoint?
    var error: Error?

    // MARK: - Analysis state

    /// The latest analysis result. Nil until the first capture-and-analyze
    /// pass completes.
    private(set) var analysisResult: PhotoAnalysisResult?

    // MARK: - Services

    private let captureService = CaptureService()
    private let foundationService = FoundationModelsService()

    /// The preview layer to display in the UI.
    var previewLayer: AVCaptureVideoPreviewLayer { captureService.previewLayer }

    // MARK: - Lifecycle

    func start() async {
        do {
            try await captureService.start()
            status = .running
            Log.camera.info("Camera started")
        } catch {
            status = .failed
            self.error = error
            Log.camera.error("Camera start failed: \(error.localizedDescription)")
        }
    }

    func stop() {
        captureService.stop()
        status = .unknown
    }

    // MARK: - Capture

    func capturePhoto() async {
        captureActivity = .capturing
        defer { captureActivity = .idle }

        let photo: Photo
        do {
            photo = try await captureService.capturePhoto()
        } catch {
            self.error = error
            Log.camera.error("Capture failed: \(error.localizedDescription)")
            return
        }

        await analyze(photo: photo)
    }

    // MARK: - Focus + zoom (pass-through)

    func focus(at point: CGPoint) {
        focusPoint = point
        isFocusing = true
        captureService.setFocus(at: point)
        // Reset the indicator after a short delay; UI animation owns timing.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            isFocusing = false
        }
    }

    func zoom(by delta: Float) {
        zoomFactor = max(1.0, min(zoomFactor + delta, 6.0))
        captureService.zoom(factor: CGFloat(zoomFactor))
    }

    // MARK: - Analyze

    private func analyze(photo: Photo) async {
        guard let image = UIImage(data: photo.data) else {
            Log.camera.notice("Captured photo has no decodable UIImage")
            return
        }

        let visionData: ComprehensiveVisionData
        do {
            visionData = try await VisionFrameworkService.collectComprehensiveVisionData(from: image)
        } catch {
            Log.camera.error("Vision collection failed: \(error.localizedDescription)")
            return
        }

        let prompt = """
            Analyze the following visual signals captured from a photo and
            describe the scene in one paragraph. Highlight any text content.

            \(visionData.summarizedForPrompt())
            """

        var llmResponse = ""
        if #available(iOS 26.0, *), FoundationModelsService.isSupported {
            do {
                llmResponse = try await foundationService.generateResponse(prompt: prompt)
            } catch {
                Log.camera.error("FoundationModels failed: \(error.localizedDescription)")
            }
        } else {
            Log.camera.notice("FoundationModels not available on this device; skipping LLM step")
        }

        analysisResult = PhotoAnalysisResult(
            vision: visionData,
            llmResponse: llmResponse,
            capturedAt: photo.timestamp
        )
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/ViewModel/CameraModel.swift
git commit -m "feat(ios-dev): add CameraModel.swift to photo-analysis-app template"
```

---

## Task 10: `View/Camera/CameraPreview.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraPreview.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/CameraPreview.swift` (94 lines)

Strategy: Near-direct copy. Translate Chinese comments to English.

- [ ] **Step 1: Write the file**

```swift
//
//  CameraPreview.swift
//
//  UIViewRepresentable wrapper around AVCaptureVideoPreviewLayer with an
//  optional tap callback (used for tap-to-focus).
//

import SwiftUI
import AVFoundation
import os

struct CameraPreview: UIViewRepresentable {
    let previewLayer: AVCaptureVideoPreviewLayer
    /// Tap callback. Receives the tap location in view-local coordinates.
    let onTap: ((CGPoint) -> Void)?

    init(previewLayer: AVCaptureVideoPreviewLayer, onTap: ((CGPoint) -> Void)? = nil) {
        self.previewLayer = previewLayer
        self.onTap = onTap
    }

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.layer.addSublayer(previewLayer)
        view.onTap = onTap
        return view
    }

    func updateUIView(_ uiView: PreviewView, context: Context) {
        DispatchQueue.main.async { [self] in
            // Explicit self capture for Swift 6 closure-capture rules.
            self.previewLayer.frame = uiView.bounds
        }
        uiView.onTap = onTap
    }
}

final class PreviewView: UIView {
    var onTap: ((CGPoint) -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupTapGesture()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        setupTapGesture()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        layer.sublayers?.first?.frame = bounds
    }

    private func setupTapGesture() {
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap(_:)))
        tap.numberOfTapsRequired = 1
        tap.numberOfTouchesRequired = 1
        addGestureRecognizer(tap)
        isUserInteractionEnabled = true
        Log.ui.info("Camera preview tap gesture installed")
    }

    @objc private func handleTap(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: self)
        Log.ui.debug("Preview tap location=\(String(describing: location)) bounds=\(String(describing: self.bounds.size))")
        guard bounds.contains(location) else {
            Log.ui.notice("Tap outside preview bounds; ignoring")
            return
        }
        onTap?(location)
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraPreview.swift
git commit -m "feat(ios-dev): add CameraPreview.swift to photo-analysis-app template"
```

---

## Task 11: `View/Camera/FocusIndicatorStyle.swift` and `FocusIndicatorView.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/FocusIndicatorStyle.swift`
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/FocusIndicatorView.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/FocusIndicatorStyle.swift` (69 lines)
- Source: `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/FocusIndicatorView.swift` (184 lines)

Strategy: Direct copy with Chinese-comment translation. If `FocusIndicatorView` references project-specific fonts or colors (e.g. `ComoFonts`), replace with system equivalents (`.system(...)`, `.primary`).

- [ ] **Step 1: Read sources to confirm no project-specific deps**

```bash
grep -nE "Como|ComoFonts|ComoColors" \
  /Users/Hana/Backup/Developer/como-ios/como/View/Camera/FocusIndicator*.swift
```

If matches found, plan to replace inline during the rewrite.

- [ ] **Step 2: Write `FocusIndicatorStyle.swift`**

Copy verbatim, translating any Chinese comments to English.

- [ ] **Step 3: Write `FocusIndicatorView.swift`**

Copy verbatim, replacing any `ComoFonts`/`ComoColors` with system equivalents. Translate Chinese comments to English.

- [ ] **Step 4: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/FocusIndicatorStyle.swift \
        plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/FocusIndicatorView.swift
git commit -m "feat(ios-dev): add focus indicator views to photo-analysis-app template"
```

---

## Task 12: `View/Camera/CameraView.swift`

**Files:**
- Create: `plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraView.swift`
- Source: `/Users/Hana/Backup/Developer/como-ios/como/View/Camera/CameraView.swift` (311 lines) — heavy album / preview-sheet / ComoFonts coupling. **Do NOT copy as-is.**

Strategy: Rewrite minimally. Keep: live preview, tap-to-focus, capture button, zoom slider, latest-result text overlay. **Drop**: album button, `AlbumListView` sheet, `PhotoPreviewView`, `ComoFonts`.

- [ ] **Step 1: Write the file**

```swift
//
//  CameraView.swift
//
//  Minimal SwiftUI camera screen: preview, tap-to-focus, capture button,
//  zoom slider, and a basic readout of the latest analysis result.
//
//  Extend this view in your app: add a navigation bar, history,
//  album integration, permission denial UI, etc.
//

import SwiftUI
import AVFoundation

struct CameraView: View {
    @State private var model = CameraModel()

    var body: some View {
        ZStack {
            // Live preview
            CameraPreview(previewLayer: model.previewLayer) { point in
                model.focus(at: point)
            }
            .ignoresSafeArea()

            // Focus indicator
            if model.isFocusing, let point = model.focusPoint {
                FocusIndicatorView(style: .focusing)
                    .position(point)
                    .allowsHitTesting(false)
            }

            VStack {
                Spacer()
                // Latest analysis (text overlay)
                if let result = model.analysisResult, !result.llmResponse.isEmpty {
                    Text(result.llmResponse)
                        .font(.callout)
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        .padding(.horizontal, 16)
                        .padding(.bottom, 8)
                }

                // Zoom slider
                HStack {
                    Image(systemName: "minus.magnifyingglass")
                    Slider(
                        value: Binding(
                            get: { Double(model.zoomFactor) },
                            set: { newValue in
                                model.zoom(by: Float(newValue) - model.zoomFactor)
                            }
                        ),
                        in: 1.0...6.0
                    )
                    Image(systemName: "plus.magnifyingglass")
                }
                .padding(.horizontal, 24)

                // Capture button
                Button {
                    Task { await model.capturePhoto() }
                } label: {
                    Circle()
                        .fill(model.captureActivity.isCapturing ? .gray : .white)
                        .frame(width: 72, height: 72)
                        .overlay(
                            Circle()
                                .stroke(.white, lineWidth: 4)
                                .frame(width: 82, height: 82)
                        )
                }
                .disabled(model.captureActivity.isCapturing)
                .padding(.bottom, 32)
            }
        }
        .task {
            await model.start()
        }
        .onDisappear {
            model.stop()
        }
        .alert("Camera error",
               isPresented: Binding(
                get: { model.error != nil },
                set: { if !$0 { model.error = nil } }
               ),
               presenting: model.error) { _ in
            Button("OK", role: .cancel) { model.error = nil }
        } message: { error in
            Text(error.localizedDescription)
        }
    }
}

#Preview {
    CameraView()
}
```

- [ ] **Step 2: Verify no forbidden references**

```bash
grep -nE "ComoFonts|ComoColors|AlbumListView|PhotoPreviewView|AlbumSettings" \
  plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraView.swift
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git add plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraView.swift
git commit -m "feat(ios-dev): add CameraView.swift to photo-analysis-app template"
```

---

## Task 13: Update `ios-dev` agent curated skills list

**Files:**
- Modify: `plugins/ios-dev/agents/ios-dev.md` (around lines 17-33, "Plugin-bundled (ios-dev)" section)

Strategy: Add `ios-dev:ios-app-templates` as a new in-house bullet alongside `ios-dev:ios-patterns`.

- [ ] **Step 1: Read current curated section**

```bash
sed -n '15,35p' plugins/ios-dev/agents/ios-dev.md
```

- [ ] **Step 2: Insert a new bullet immediately after the `ios-patterns` entry**

The new bullet:

```markdown
- `ios-dev:ios-app-templates` — Reference implementations for common iOS app
  categories. Currently ships `photo-analysis-app` (AVFoundation capture +
  Vision Framework + Foundation Models on-device LLM). Auto-loads when the
  user mentions building a camera analysis app, photo analysis, or similar.
```

Use `Edit` to insert below the existing `ios-patterns` bullet — match on the unique tail of that bullet (`keyboard Done button.`).

- [ ] **Step 3: Commit**

```bash
git add plugins/ios-dev/agents/ios-dev.md
git commit -m "docs(ios-dev): list ios-app-templates in agent curated skills"
```

---

## Task 14: Update plugin descriptions in `plugin.json` and `marketplace.json`

**Files:**
- Modify: `plugins/ios-dev/.claude-plugin/plugin.json`
- Modify: `.claude-plugin/marketplace.json` (the `ios-dev` entry around line 24)

Strategy: Update the `description` strings to mention templates. Do NOT bump the version (per repo's `CLAUDE.md`, regular commits don't bump versions; release happens via `/release` skill).

- [ ] **Step 1: Update `plugin.json`**

Current (from spec):
```json
{
  "name": "ios-dev",
  "version": "0.4.3",
  "description": "iOS/macOS SwiftUI expertise. Ships the ios-dev agent, ios-patterns, and 23 vendored third-party skills (iphone-apps + asc-* App Store Connect CLI).",
  ...
}
```

New description:
```
iOS/macOS SwiftUI expertise. Ships the ios-dev agent, ios-patterns, ios-app-templates (reference apps), and 23 vendored third-party skills (iphone-apps + asc-* App Store Connect CLI).
```

Edit with the `Edit` tool, matching the old description exactly.

- [ ] **Step 2: Update `marketplace.json`**

Match the ios-dev entry's description (at `.claude-plugin/marketplace.json` line ~24-25) and apply the same string. The two files must stay in sync.

- [ ] **Step 3: Verify**

```bash
grep -o 'ios-app-templates' plugins/ios-dev/.claude-plugin/plugin.json .claude-plugin/marketplace.json
```

Expected: two matches (one per file).

- [ ] **Step 4: Commit**

```bash
git add plugins/ios-dev/.claude-plugin/plugin.json .claude-plugin/marketplace.json
git commit -m "docs(ios-dev): mention ios-app-templates in plugin metadata"
```

---

## Task 15: Update root `README.md`

**Files:**
- Modify: `README.md` (mentions `ios-dev` plugin features)

Strategy: Find the ios-dev section/row and update wording to include templates.

- [ ] **Step 1: Locate ios-dev mentions in README**

```bash
grep -n "ios-dev\|ios-patterns" README.md | head -20
```

- [ ] **Step 2: Update the relevant line(s)**

Match the existing description ("ios-patterns, and 23 vendored third-party skills") and replace with: "ios-patterns, ios-app-templates, and 23 vendored third-party skills".

If the README has a longer paragraph describing `ios-dev`, append a one-sentence mention of templates: "Also includes reference implementations for common app categories under `ios-app-templates` (currently `photo-analysis-app`)."

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: mention ios-app-templates in root README"
```

---

## Task 16: Final verification

**Files:** none (audit only).

- [ ] **Step 1: Confirm complete file tree**

```bash
find plugins/ios-dev/skills/ios-app-templates -type f | sort
```

Expected 13 files:
```
plugins/ios-dev/skills/ios-app-templates/SKILL.md
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/README.md
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Core/Logging.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models/CameraTypes.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Models/PhotoAnalysisResult.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/CaptureService.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/FoundationModelsService.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/Services/VisionFrameworkService.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraPreview.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/CameraView.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/FocusIndicatorStyle.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/View/Camera/FocusIndicatorView.swift
plugins/ios-dev/skills/ios-app-templates/references/photo-analysis-app/Sources/ViewModel/CameraModel.swift
```

- [ ] **Step 2: Confirm no forbidden references anywhere in Sources/**

```bash
grep -rnE "AlbumSettings|LocationService|PhotoMetadataService|BackgroundAnalysisActor|PhotoLibraryService|ModelContext|DataRequirementAnalyzer|SwiftData|ComoFonts|ComoColors|AlbumListView|PhotoPreviewView" \
  plugins/ios-dev/skills/ios-app-templates/
```

Expected: empty output. If anything matches, open that file and remove the reference (or document why it must stay).

- [ ] **Step 3: Confirm no Chinese in skill files**

```bash
LANG=C grep -rnP "[\x{4e00}-\x{9fff}]" \
  plugins/ios-dev/skills/ios-app-templates/ || echo "no chinese characters"
```

Expected: "no chinese characters" (or no matches). The plugin is open source MIT; English-only inside the skill.

- [ ] **Step 4: Confirm metadata sync**

```bash
grep -h "description" plugins/ios-dev/.claude-plugin/plugin.json | grep -c ios-app-templates
grep -h "ios-dev" .claude-plugin/marketplace.json | head -5
```

Expected: `plugin.json` shows 1 match; marketplace.json's `ios-dev` entry mentions `ios-app-templates`.

- [ ] **Step 5: Manual skill-trigger test (user step)**

Note in PR description: ask the user to open a fresh Claude Code session and say "我想開發拍照分析 app" or "I want to build a camera analysis app", confirming the `ios-app-templates` skill is auto-discovered and listed in the agent's available skills.

- [ ] **Step 6: Push branch + open PR**

```bash
git log --oneline origin/main..HEAD
git push -u origin worktree-feature+ios-app-templates
gh pr create --title "feat(ios-dev): add ios-app-templates skill with photo-analysis-app" --body "$(cat <<'EOF'
## Summary
- Add umbrella skill `ios-dev:ios-app-templates` carrying reference implementations of iOS app categories.
- First entry: `photo-analysis-app` — AVFoundation capture + Vision Framework + Foundation Models on-device LLM.
- Update ios-dev agent curated list, plugin.json, marketplace.json, root README.

## Background
Spec at `docs/spec/2026-05-11-ios-app-templates.md`. V2 of the spec reflects a Codex adversarial review which ruled out the original "copy files from como-ios" approach in favor of a rewritten minimal reference implementation (como is a mature product, its services/views are too coupled to copy directly).

## Test plan
- [ ] Open a fresh Claude Code session and say "我想開發拍照分析 app" — confirm `ios-app-templates` skill is discovered.
- [ ] Open the skill catalog manually and confirm `photo-analysis-app/README.md` is readable.
- [ ] Verify no forbidden references in `Sources/` (no `AlbumSettings`, no `SwiftData`, etc.) — see Task 16 grep.
- [ ] Verify metadata sync between `plugin.json`, `marketplace.json`, and root `README.md`.

Template files are reference code — not required to compile standalone in this repo.
EOF
)"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** all 12 reference files + SKILL.md + photo-analysis-app/README.md + 4 metadata updates from spec are mapped to tasks 1-15. Task 16 covers verification.
- **Placeholder scan:** every code-bearing task contains either full Swift source or a precise skeleton + line-range pointers into the como source. The two largest rewrites (`VisionFrameworkService` and `CaptureService`) use skeleton-plus-copy regions because pasting 600+ verbatim lines into the plan would be wasteful and obscure the *changes* required.
- **Type consistency:** `Photo` (with `timestamp`) is defined in `CameraTypes.swift` (Task 4), referenced by `CaptureService.capturePhoto()` (Task 8), `CameraModel.analyze(photo:)` (Task 9). `ComprehensiveVisionData` is defined in `VisionFrameworkService.swift` (Task 7), referenced by `PhotoAnalysisResult` (Task 5) and `CameraModel` (Task 9). `PhotoAnalysisResult` shape matches across tasks 5 and 9. `generateResponse(prompt:)` signature matches between tasks 6 and 9.

---

## Out of Scope (per spec)

- Second template (todo-app, chat-app) — future PR.
- Plugin version bump — handled by `/release` skill at release time.
- Test infrastructure for template Swift snippets — none in repo.
- Xcode project file scaffolding — relies on existing `ios-dev:iphone-apps` skill at consume time.
