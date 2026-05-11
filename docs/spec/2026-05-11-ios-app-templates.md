# `ios-app-templates` skill

> V2 — V1 假設「從 como-ios 直接複製檔案」不成立（Codex review 找出 8 個實質
> 問題，主要原因是 como-ios 是成熟產品 codebase，service/View 互相耦合）。
> V2 改成「重寫精簡 reference implementation」，從 como-ios 取概念但 code 全新寫。

新增一個 umbrella skill 到 `ios-dev` plugin，承載「特定類型 iOS app 的精簡參考實作」。第一個 entry 是 `photo-analysis-app`，未來可加 todo-app、chat-app 等。

來源概念：使用者過去專案 `/Users/Hana/Backup/Developer/como-ios`（拍照分析 app），但 reference code 是針對範本目的重寫的精簡版本，不是該專案的子集。

## 目標

當使用者說「我想開發拍照分析 app」、「camera analysis app」之類的話，`ios-dev` agent 能自動載入這個 skill、看到範本 catalog、找到對應 reference implementation，agent 拼進新專案就能起步。

## 為什麼用 umbrella 而非一範例一 skill

一範例一 skill 會讓 `ios-dev/skills/` 被各種特化 app 塞爆，且每個 skill 的 description 都要精準命中各種觸發詞。改用單一 umbrella skill：

- skill 數量穩定（永遠 1 個 `ios-app-templates`）
- 加新範本只是加 `references/` 子目錄
- agent 進來看 catalog 表能順便看到其他範本

trade-off：description 觸發詞較廣，可能在「建立任何 iOS app」場景都會載入。可接受 — agent 看到 catalog 後可自行判斷是否相關。

## 設計原則：精簡重寫，不複製

V1 的「從 como-ios 複製檔案」策略證實不可行：
- `CaptureService` 依賴 `Models/DataTypes.swift` 的 `Photo` / `CameraError` 型別
- `VisionFrameworkService` 前半段 `import SwiftData` 並耦合 `AlbumSettings`、`ModelContext`、`PhotoAnalysisResult`、`DataRequirementAnalyzer`
- `CameraView` 含相簿按鈕、`AlbumListView`、`PhotoPreviewView`、`ComoFonts` 等專案特化元件
- `PhotoAnalysisResult` 是 SwiftData `@Model` 且綁 `ModelContext` 查詢
- `FoundationModelsService.generateResponse(prompt:image:)` 雖有 `image` 參數但實作未使用

範本是「拍照分析 app 的骨架實作」，不是「como-ios 的子集」。每支檔重寫成乾淨、最小依賴的版本。

## 結構

```
plugins/ios-dev/skills/ios-app-templates/
├── SKILL.md                            # 觸發描述、catalog、使用流程
└── references/
    └── photo-analysis-app/
        ├── README.md                   # 架構、決策、限制、檔案索引
        └── Sources/
            ├── Core/
            │   └── Logging.swift                # os.Logger 分類
            ├── Models/
            │   ├── CameraTypes.swift            # CameraError, Photo 等基本型別
            │   └── PhotoAnalysisResult.swift    # 純 struct，非 @Model
            ├── Services/
            │   ├── CaptureService.swift         # final class : NSObject
            │   ├── VisionFrameworkService.swift # static collector + data models
            │   └── FoundationModelsService.swift # prompt-only，image 標 TODO
            ├── ViewModel/
            │   └── CameraModel.swift            # 只依賴 CaptureService
            └── View/Camera/
                ├── CameraView.swift             # 只 preview + 拍照按鈕
                ├── CameraPreview.swift          # AVCaptureVideoPreviewLayer wrapper
                ├── FocusIndicatorView.swift
                └── FocusIndicatorStyle.swift
```

每支檔的重寫範圍與限制：

| 檔案 | 來源 | 重寫策略 |
|---|---|---|
| `Logging.swift` | como `Core/Logging.swift` | 直接搬，篩掉專案特化分類，保留 capture / camera / ui / focus |
| `CameraTypes.swift` | como `Models/DataTypes.swift` 抽出 | 只含 `CameraError` enum 和 `Photo` struct（拍照產出的最小 model） |
| `PhotoAnalysisResult.swift` | como `Models/PhotoAnalysisResult.swift` | 改寫為純 `struct`，去掉 SwiftData `@Model`、`ModelContext` 查詢、`DataRequirementAnalyzer` |
| `CaptureService.swift` | como `Services/CaptureService.swift` | `final class : NSObject` + `DispatchQueue`，保留 session/device/focus/zoom/photo capture；移除 album hook、location service 整合 |
| `VisionFrameworkService.swift` | como `Services/VisionFrameworkService.swift` line 137+, 481+ | 只保留 static collector + data models（`ComprehensiveVisionData`、`RecognizedTextBlock`、`FaceData` 等）；丟掉 instance 那段 SwiftData 耦合 |
| `FoundationModelsService.swift` | como `Services/FoundationModelsService.swift` | 保留 `generateResponse(prompt:)` 介面，**移除 `image` 參數**（原版未實際使用）。檔頭註明 multimodal 受限於 Apple Intelligence API |
| `CameraModel.swift` | como `ViewModel/CameraModel.swift` | 僅持 `CaptureService`，狀態機保 `status` / `captureActivity` / `zoomFactor` / `isFocusing` / `focusPoint` / `error`。拍完照 hook 介面定義為 `func didCapture(photo: Photo) async`，內部呼叫 `VisionFrameworkService.collect` → `FoundationModelsService.generateResponse(prompt:)`，結果寫入 `analysisResult: PhotoAnalysisResult?` 屬性 |
| `CameraView.swift` | como `View/Camera/CameraView.swift` | 重寫：preview + 對焦指示 + 拍照按鈕 + zoom slider；無 album 按鈕、無 `AlbumListView` sheet、無 `ComoFonts` |
| `CameraPreview.swift` | 同名 | 直接搬（94 行，無耦合） |
| `FocusIndicatorView.swift`、`FocusIndicatorStyle.swift` | 同名 | 直接搬（無耦合） |

## 平台需求（README 必須明寫）

- **Foundation Models（on-device LLM）需要 iOS 26+ 且裝置支援 Apple Intelligence**（M1 iPad 起，iPhone 15 Pro 起，搭配 iOS 26）。原 como 使用 `#if canImport(FoundationModels)` 與 `@available(iOS 26.0, *)` 包裹整個 service
- **Vision Framework** 從 iOS 11 起可用，無 Apple Intelligence 需求
- **AVFoundation** 相機 API 全 iOS 版本可用

範本 README 明寫：若目標裝置不支援 Apple Intelligence，需自行替換 `FoundationModelsService` 為其他 LLM 接口（後端 API、第三方 on-device model）。

## Multimodal 限制（README 必須明寫）

原 como `FoundationModelsService.generateResponse(prompt:image:)` 雖收 `image` 參數但實作未用。範本介面**只保 prompt**，並在 README 註明：

> Apple Foundation Models 目前以 text prompt 為主。範本把 Vision 抽取出的 OCR / 物件 / 文字 block 序列化成 prompt 段落，餵入 LLM 做語意推理。若 Apple 之後開放 multimodal API，再擴充介面。

## `CameraModel` 的「拍完照 hook」明確介面

V1 把這個寫成 TODO，V2 在 spec 直接定義介面，避免 implementer 卡住：

```swift
// CameraModel.swift
@MainActor
@Observable
final class CameraModel {
    var status = CameraStatus.unknown
    var captureActivity = CaptureActivity.idle
    var zoomFactor: Float = 1.0
    var isFocusing: Bool = false
    var focusPoint: CGPoint?
    var error: Error?

    // 分析結果（範本內最簡型）
    var analysisResult: PhotoAnalysisResult?

    private let captureService = CaptureService()
    private let visionService = VisionFrameworkService()
    private let foundationService = FoundationModelsService()

    func capturePhoto() async {
        let photo = try? await captureService.capturePhoto()
        guard let photo else { return }
        await analyze(photo: photo)
    }

    private func analyze(photo: Photo) async {
        guard let image = UIImage(data: photo.data) else { return }
        let visionData = (try? await VisionFrameworkService.collectComprehensiveVisionData(from: image)) ?? ComprehensiveVisionData()
        let prompt = visionData.summarizedForPrompt()  // 範本內提供 helper
        let response = (try? await foundationService.generateResponse(prompt: prompt)) ?? ""
        analysisResult = PhotoAnalysisResult(
            vision: visionData,
            llmResponse: response,
            capturedAt: photo.timestamp
        )
    }
}
```

範本提供的是這個 minimal 拼裝，agent 在新專案要加儲存層 / 自訂 UI 時，直接擴充。

## `SKILL.md` 大綱

```yaml
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
```

正文（英文，因為 repo 是 MIT 開源）：

```markdown
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
- `ios-dev:ios-patterns` — common SwiftUI conventions (i18n, Logger, Previews)
- `ios-dev:iphone-apps` — CLI-only build/test/ship workflow
```

## `references/photo-analysis-app/README.md` 大綱

英文，內容大綱（最終實作時擴充）：

- **What this template does** — capture → Vision → Foundation Models pipeline
- **Architecture decisions** — 為什麼這樣切（CaptureService 為 NSObject + DispatchQueue 而非 actor；Vision 結果序列化成 prompt 段；MVVM 嚴格分層；Logger 分類）
- **Platform requirements** — iOS 26 + Apple Intelligence required for Foundation Models; AVFoundation/Vision are available earlier
- **Multimodal note** — Foundation Models currently text-only; Vision results are serialized into prompts
- **File index** — 每支檔的職責、相依
- **How to use** — copy steps, Info.plist keys, NavigationStack wiring
- **Extension points** — 接 persistence / 換 LLM backend / 加自訂 UI

## 不在範圍內的內容

- LangGraph 後端 LLM 串接（純 on-device）
- 相簿管理（AlbumSettings、PhotoLibraryService 等）
- 照片 metadata 提取（EXIF / GPS / PhotoMetadataService）
- 背景重分析（BackgroundAnalysisActor）

這些是 como-ios 的特化功能，不屬於「拍照分析」核心。

## 範圍內的 plugin metadata 更新

V1 spec 漏掉這部分（Codex finding #7）。實作時必須一併更新：

1. **`plugins/ios-dev/agents/ios-dev.md`** — curated skills list 加入 `ios-dev:ios-app-templates`
2. **`plugins/ios-dev/.claude-plugin/plugin.json`** — `description` 欄位更新，提到 templates
3. **`plugins/ios-dev/README.md`**（若存在）— 範本清單
4. **根目錄 `README.md`** — 提到 `ios-dev` 新增 templates skill
5. **根目錄 `.claude-plugin/marketplace.json`** — `ios-dev` entry 的 description 同步

不更新 plugin 版本（依 CLAUDE.md，regular commit 不 bump version；release 走 `/release` skill）。

## 觸發機制驗證

Skill 是否被正確觸發，看 description 是否涵蓋使用者實際說法。預期觸發語句：
- 「我想開發拍照分析 app」
- 「camera analysis app」
- 「ios photo analysis」
- 「Vision + Foundation Models」
- 「on-device AI camera app」
- 「ios 範本」

實作完成後手動測：開新 Claude Code session，講上述語句，看 ios-dev agent 是否載入此 skill。

## 範本內檔案的語言策略

Repo 為 MIT 開源（依 `LICENSE`），全域規則為「開源專案註解一律英文」。範本內：

- `Sources/` 下所有 .swift 檔註解：**英文**
- `README.md`、`SKILL.md`：**英文**
- 重寫時不保留原 como 的中文設計說明（中文留在 como 原 repo，這裡是公開範本）

## 工作量預估

- 寫 SKILL.md：~50 行
- 寫 README.md：~150 行
- 重寫 12 支 .swift 檔（合計 ~1500-2500 行，比 como 原本的 ~4000 行縮減 40-60%）
- 更新 5 處 plugin metadata
- 觸發機制驗證

預估 1-2 個工作 session 完成。

## 後續方向（未在本 spec 範圍）

- 第二個範本（todo-app / chat-app）
- 範本是否需要 sample test files
- 範本是否需要對應的 Xcode project template plist
- 是否需要 `setup.sh` 之類的 helper 把範本一鍵拼進新專案
