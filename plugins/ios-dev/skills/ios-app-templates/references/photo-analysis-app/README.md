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
