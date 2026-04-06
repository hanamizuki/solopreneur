# iOS Skills Index

When facing an iOS development issue, find the appropriate skill by description,
then use Read to load the corresponding SKILL.md.

## How to Read Skills

### User-level skills (ios-* prefix)
Read: `~/.claude/skills/{skill-name}/SKILL.md`

### Axiom plugin skills (axiom-* prefix) — Optional, requires Axiom plugin
1. Run `ls ~/.claude/plugins/cache/axiom-marketplace/axiom/` to get the version
2. Read: `~/.claude/plugins/cache/axiom-marketplace/axiom/{version}/skills/{skill-name}/SKILL.md`
3. If Axiom is not installed, skip and use context7 for doc lookups instead

---

## User-level iOS Skills

### Cross-platform Tools
- `deploy-to-device`: Deploy to physical iOS/Android devices (xcodebuild + devicectl / gradlew installDebug)
- `ios-debugging-with-log`: iOS device log debugging guide (print diagnostics + devicectl --console, incl. os.Logger limitations)

### Development Patterns
- `ios-patterns-hana`: iOS development patterns (SwiftUI, Preview, i18n String Catalogs, Xcode project)
- `ios-iphone-apps`: Complete iPhone app development workflow (build, debug, test, optimize, ship — CLI-only, iOS 26 + iOS 18 compatible)

### SwiftUI Reference
- `ios-kavsoft-reference`: Kavsoft 140+ SwiftUI example project index (tab bar, scroll effects, sheets, animations, paywall, etc.)
- `ios-swiftui-nav-ref`: SwiftUI Navigation complete reference (NavigationStack, NavigationSplitView, deep linking, state restoration, iOS 26 Liquid Glass navigation)
- `ios-swiftui-26-ref`: iOS 26 SwiftUI new features (Liquid Glass, @Animatable, 3D layout, WebView/WebPage, drag and drop)

---

## Axiom Plugin Skills (Optional)

### Router Skills (start here)
- `axiom-ios-ui`: UI (SwiftUI, UIKit, layout, navigation, animations, design)
- `axiom-ios-data`: Data persistence (SwiftData, Core Data, GRDB, SQLite, CloudKit, Codable, migrations)
- `axiom-ios-concurrency`: Concurrency (async/await, actors, Sendable, data races, @MainActor)
- `axiom-ios-build`: Build failures, compilation errors, dependency conflicts, simulator issues
- `axiom-ios-performance`: Performance (memory leaks, profiling, Instruments, retain cycles)
- `axiom-ios-networking`: Networking (URLSession, Network.framework, connection diagnostics)
- `axiom-ios-testing`: Testing (Swift Testing, XCTest, flaky tests, async testing)
- `axiom-ios-integration`: System integration (Siri, Shortcuts, widgets, IAP, camera, haptics)
- `axiom-ios-ai`: Apple Intelligence (Foundation Models, @Generable, LanguageModelSession)
- `axiom-ios-vision`: Computer vision (image analysis, pose detection, segmentation)
- `axiom-ios-graphics`: GPU rendering (Metal, RealityKit, AR, display performance)
- `axiom-ios-games`: Game development (SpriteKit, SceneKit, RealityKit)
- `axiom-ios-ml`: ML model deployment (CoreML, MLTensor, model compression)

### SwiftUI
- `axiom-swiftui-architecture`: Architecture patterns (MVVM, logic separation, testability)
- `axiom-swiftui-performance`: SwiftUI performance optimization (view updates, scrolling, animations)
- `axiom-swiftui-layout`: Adaptive layout (ViewThatFits, AnyLayout, size classes)
- `axiom-swiftui-layout-ref`: Layout API complete reference
- `axiom-swiftui-nav`: Navigation patterns (NavigationStack, deep links, coordinator)
- `axiom-swiftui-nav-ref`: Navigation API complete reference
- `axiom-swiftui-nav-diag`: Navigation issue diagnostics
- `axiom-swiftui-debugging`: SwiftUI view debugging (view updates, preview crashes)
- `axiom-swiftui-debugging-diag`: SwiftUI systematic diagnostics (Instruments integration)
- `axiom-swiftui-gestures`: Gestures (tap, drag, long press, composition)
- `axiom-swiftui-containers-ref`: Stacks, grids, outlines, scroll reference
- `axiom-swiftui-animation-ref`: Animation API reference (spring, timing, @Animatable)
- `axiom-swiftui-search-ref`: Search API reference (.searchable, suggestions, scopes)
- `axiom-swiftui-26-ref`: iOS 26 SwiftUI new features (Liquid Glass, 3D layout, WebView)

### Data & Storage
- `axiom-swiftdata`: SwiftData @Model, @Query, @Relationship, ModelContext
- `axiom-swiftdata-migration`: SwiftData schema migration (VersionedSchema)
- `axiom-swiftdata-migration-diag`: SwiftData migration issue diagnostics
- `axiom-core-data`: Core Data stack setup, relationships, concurrency
- `axiom-core-data-diag`: Core Data issue diagnostics (migration, thread-confinement)
- `axiom-grdb`: GRDB raw SQL, ValueObservation, DatabaseMigrator
- `axiom-sqlitedata`: SQLiteData @Table models, CRUD, CloudKit SyncEngine
- `axiom-sqlitedata-ref`: SQLiteData advanced patterns
- `axiom-sqlitedata-migration`: SwiftData → SQLiteData migration
- `axiom-database-migration`: SQLite/GRDB schema migration safe patterns
- `axiom-codable`: Codable protocol, JSON encoding/decoding, CodingKeys
- `axiom-storage`: Storage solution selection (SwiftData vs files, Documents vs Caches)
- `axiom-storage-diag`: File missing, storage space issue diagnostics
- `axiom-storage-management-ref`: iOS storage management API reference
- `axiom-file-protection-ref`: File encryption (NSFileProtection)
- `axiom-cloud-sync`: iCloud sync architecture (CloudKit vs iCloud Drive)
- `axiom-cloud-sync-diag`: iCloud sync issue diagnostics
- `axiom-cloudkit-ref`: CloudKit API reference (CKSyncEngine, CKRecord)
- `axiom-icloud-drive-ref`: iCloud Drive file sync reference

### Concurrency
- `axiom-swift-concurrency`: Swift 6 strict concurrency (actor isolation, async/await)
- `axiom-swift-concurrency-ref`: Swift concurrency API reference
- `axiom-concurrency-profiling`: async/await performance analysis, actor contention
- `axiom-assume-isolated`: MainActor.assumeIsolated, @preconcurrency
- `axiom-synchronization`: Mutex, OSAllocatedUnfairLock, Atomic types

### Build & Debug
- `axiom-xcode-debugging`: BUILD FAILED, simulator hangs, stale builds
- `axiom-build-debugging`: Dependency conflicts, SPM/CocoaPods issues
- `axiom-build-performance`: Build time optimization, compilation caching
- `axiom-lldb`: Runtime debugging (breakpoints, variables, expressions)
- `axiom-lldb-ref`: LLDB command reference
- `axiom-auto-layout-debugging`: Auto Layout constraint conflicts
- `axiom-memory-debugging`: Memory leaks, retain cycles
- `axiom-hang-diagnostics`: App freezes, main thread blocked
- `axiom-testflight-triage`: TestFlight crash analysis, symbolication

### Performance
- `axiom-swift-performance`: Swift code performance (COW, ARC, generics)
- `axiom-performance-profiling`: Instruments workflows (Time Profiler, Allocations)
- `axiom-energy`: Battery consumption diagnostics
- `axiom-energy-ref`: Energy optimization API reference
- `axiom-energy-diag`: Battery issue diagnostic decision tree
- `axiom-display-performance`: Frame rate, ProMotion, hitches
- `axiom-metrickit-ref`: MetricKit API reference

### Networking
- `axiom-networking`: Network.framework (connections, structured concurrency)
- `axiom-networking-diag`: Connection issue diagnostics (timeouts, TLS, drops)
- `axiom-networking-legacy`: NWConnection (iOS 12-25)
- `axiom-networking-migration`: BSD sockets → NWConnection → NetworkConnection
- `axiom-network-framework-ref`: Network.framework API complete reference

### Testing
- `axiom-swift-testing`: Swift Testing framework (@Test, @Suite, #expect)
- `axiom-testing-async`: Testing async code (confirmation, @MainActor tests)
- `axiom-xctest-automation`: XCUITest (element queries, waiting strategies)
- `axiom-ui-testing`: UI testing (recording, race conditions, flaky tests)
- `axiom-ui-recording`: Xcode 26 UI test recording

### App Store & Shipping
- `axiom-app-store-submission`: Pre-submission checklist, rejection prevention
- `axiom-app-store-diag`: App Review rejection diagnostics
- `axiom-app-store-ref`: App Store metadata, guidelines reference
- `axiom-app-store-connect-ref`: App Store Connect crash analysis, TestFlight
- `axiom-shipping`: Submission workflow (metadata, privacy manifests, export compliance)
- `axiom-asc-mcp`: App Store Connect MCP automation

### App Store Connect CLI (asc)
Skills for automating App Store Connect via `asc` CLI (requires `brew install asc` + API Key setup).
- `asc-cli-usage`: asc CLI usage guide (installation, auth, common commands)
- `asc-id-resolver`: Resolve App Store Connect IDs (apps, builds, versions)
- `asc-release-flow`: End-to-end release workflow (TestFlight → App Store)
- `asc-build-lifecycle`: Build processing tracking, query latest build, wait for processing
- `asc-xcode-build`: Build, archive, export iOS/macOS app
- `asc-submission-health`: Pre-submission checks, submit, verify readiness
- `asc-testflight-orchestration`: TestFlight distribution management (groups, testers, builds)
- `asc-metadata-sync`: App Store metadata sync and validation
- `asc-localize-metadata`: Auto-translate and sync multi-language App Store metadata
- `asc-crash-triage`: TestFlight crash triage and beta feedback analysis
- `asc-shots-pipeline`: Screenshot automation pipeline (capture, device frame, upload)
- `asc-signing-setup`: Bundle ID, capabilities, signing setup
- `asc-app-create-ui`: Create new App Store Connect app record
- `asc-workflow`: Define and execute multi-step automation workflows
- `asc-notarization`: macOS app notarization (archive, export, notarize)
- `asc-ppp-pricing`: Regional pricing setup (subscriptions, IAP)
- `asc-subscription-localization`: Batch multi-language subscription and IAP copy
- `asc-revenuecat-catalog-sync`: RevenueCat ↔ App Store Connect subscription catalog sync
- `asc-wall-submit`: Submit Wall of Apps entry

### Camera & Media
- `axiom-camera-capture`: AVCaptureSession, photo/video capture
- `axiom-camera-capture-ref`: AVCapture API reference
- `axiom-camera-capture-diag`: Camera issue diagnostics (freezes, rotation, black preview)
- `axiom-photo-library`: PHPicker, PhotosPicker, photo permissions
- `axiom-photo-library-ref`: Photo library API reference
- `axiom-avfoundation-ref`: AVFoundation audio API reference
- `axiom-now-playing`: Now Playing metadata (Lock Screen, Control Center)
- `axiom-now-playing-musickit`: MusicKit Now Playing integration
- `axiom-now-playing-carplay`: CarPlay audio controls

### System Integration
- `axiom-app-intents-ref`: App Intents API (Siri, Shortcuts, Spotlight)
- `axiom-app-shortcuts-ref`: App Shortcuts API
- `axiom-app-discoverability`: Spotlight search, Siri suggestions
- `axiom-app-composition`: App entry points, auth flows, scene lifecycle
- `axiom-extensions-widgets`: Widgets, Live Activities, Control Center
- `axiom-extensions-widgets-ref`: WidgetKit, ActivityKit API reference
- `axiom-core-location`: Core Location implementation patterns
- `axiom-core-location-ref`: Core Location API reference
- `axiom-core-location-diag`: Location issue diagnostics
- `axiom-core-spotlight-ref`: Core Spotlight indexing
- `axiom-in-app-purchases`: StoreKit 2, subscriptions, transactions
- `axiom-storekit-ref`: StoreKit 2 API complete reference
- `axiom-haptics`: Core Haptics, UIFeedbackGenerator
- `axiom-localization`: String Catalogs, plurals, RTL layouts
- `axiom-transferable-ref`: Drag and drop, copy/paste, ShareLink
- `axiom-deep-link-debugging`: Debug deep links for testing
- `axiom-alarmkit-ref`: AlarmKit API reference
- `axiom-background-processing`: BGTaskScheduler, background execution
- `axiom-background-processing-ref`: Background task API reference
- `axiom-background-processing-diag`: Background task issue diagnostics

### UI Design
- `axiom-hig`: Apple HIG design decisions (colors, typography, Dark Mode)
- `axiom-hig-ref`: HIG complete reference
- `axiom-liquid-glass`: Liquid Glass effects (iOS 26)
- `axiom-liquid-glass-ref`: Liquid Glass complete reference
- `axiom-sf-symbols`: SF Symbols rendering modes, symbol effects
- `axiom-sf-symbols-ref`: SF Symbols API complete reference
- `axiom-typography-ref`: Apple typography reference (San Francisco, Dynamic Type)
- `axiom-accessibility-diag`: Accessibility issue diagnostics
- `axiom-privacy-ux`: Privacy manifests, permissions UX
- `axiom-uikit-bridging`: UIKit ↔ SwiftUI interop
- `axiom-uikit-animation-debugging`: CAAnimation issue diagnostics

### AI & Vision
- `axiom-foundation-models`: Foundation Models framework (iOS 26)
- `axiom-foundation-models-ref`: Foundation Models API complete reference
- `axiom-foundation-models-diag`: Foundation Models issue diagnostics
- `axiom-vision`: Vision framework (segmentation, OCR, barcode)
- `axiom-vision-ref`: Vision API reference
- `axiom-vision-diag`: Vision issue diagnostics

### Graphics & Games
- `axiom-realitykit`: RealityKit (ECS, AR, spatial computing)
- `axiom-realitykit-ref`: RealityKit API reference
- `axiom-realitykit-diag`: RealityKit issue diagnostics
- `axiom-scenekit`: SceneKit 3D scenes, migration to RealityKit
- `axiom-scenekit-ref`: SceneKit API reference
- `axiom-spritekit`: SpriteKit games (physics, actions, scene management)
- `axiom-spritekit-ref`: SpriteKit API reference
- `axiom-spritekit-diag`: SpriteKit issue diagnostics
- `axiom-metal-migration`: OpenGL/DirectX → Metal migration
- `axiom-metal-migration-ref`: GLSL/HLSL → MSL conversion reference
- `axiom-metal-migration-diag`: Metal porting issue diagnostics

### Other
- `axiom-apple-docs`: Apple framework API lookup (incl. WWDC 2025)
- `axiom-apple-docs-research`: Apple documentation research techniques
- `axiom-objc-block-retain-cycles`: ObjC block memory leak diagnostics
- `axiom-ownership-conventions`: Noncopyable types, InlineArray, Span
- `axiom-realm-migration-ref`: Realm → SwiftData migration guide
- `axiom-textkit-ref`: TextKit 2 reference (Writing Tools, TextEditor)
- `axiom-timer-patterns`: Timer pattern selection and issue diagnostics
- `axiom-timer-patterns-ref`: Timer API reference
- `axiom-tvos`: tvOS development (Focus Engine, Siri Remote)
- `axiom-xcode-mcp`: Xcode MCP integration
- `axiom-xcode-mcp-ref`: Xcode MCP tools reference
- `axiom-xcode-mcp-setup`: Xcode MCP setup
- `axiom-xcode-mcp-tools`: Xcode MCP workflow patterns
- `axiom-axe-ref`: AXe CLI (Simulator UI automation)
- `axiom-xctrace-ref`: xctrace CLI (headless Instruments profiling)
- `axiom-getting-started`: Axiom getting started guide
- `axiom-using-axiom`: Axiom usage guide

## Common Combinations

- New feature → read `ios-patterns-hana` for conventions first, then the relevant feature skill
- SwiftUI performance → `axiom-swiftui-performance` (view layer) + `axiom-swift-performance` (Swift layer)
- Navigation issues → `axiom-swiftui-nav` (patterns) + `axiom-swiftui-nav-diag` (diagnostics)
- Data layer selection → `axiom-storage` (solution selection) → corresponding DB skill (`axiom-swiftdata` / `axiom-grdb` etc.)
- App hang → `axiom-hang-diagnostics` (diagnostics) + `axiom-concurrency-profiling` (actor contention)
- App Store submission → `axiom-shipping` + `asc-release-flow` (CLI automation)
