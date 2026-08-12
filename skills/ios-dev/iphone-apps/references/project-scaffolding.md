# Project Scaffolding

Complete setup guide for new iOS projects with CLI-only development workflow.

## XcodeGen Setup (Recommended)

**Install XcodeGen** (one-time):
```bash
brew install xcodegen
```

**Create a new iOS app**:
```bash
mkdir MyApp && cd MyApp
mkdir -p MyApp/{App,Models,Views,Services,Resources} MyAppTests MyAppUITests
# Create project.yml (see template below)
# Create Swift files
xcodegen generate
xcodebuild -project MyApp.xcodeproj -scheme MyApp -destination 'platform=iOS Simulator,name=iPhone 16' build
```

## project.yml Template

Complete iOS SwiftUI app with tests:

```yaml
name: MyApp
options:
  bundleIdPrefix: com.yourcompany
  deploymentTarget:
    iOS: "18.0"
  xcodeVersion: "16.0"
  createIntermediateGroups: true

configs:
  Debug: debug
  Release: release

settings:
  base:
    SWIFT_VERSION: "5.9"
    IPHONEOS_DEPLOYMENT_TARGET: "18.0"
    TARGETED_DEVICE_FAMILY: "1,2"

targets:
  MyApp:
    type: application
    platform: iOS
    sources:
      - MyApp
    resources:
      - path: MyApp/Resources
        excludes:
          - "**/.DS_Store"
    info:
      path: MyApp/Info.plist
      properties:
        UILaunchScreen: {}
        CFBundleName: $(PRODUCT_NAME)
        CFBundleIdentifier: $(PRODUCT_BUNDLE_IDENTIFIER)
        CFBundleShortVersionString: "1.0"
        CFBundleVersion: "1"
        UIRequiredDeviceCapabilities:
          - armv7
        UISupportedInterfaceOrientations:
          - UIInterfaceOrientationPortrait
          - UIInterfaceOrientationLandscapeLeft
          - UIInterfaceOrientationLandscapeRight
        UISupportedInterfaceOrientations~ipad:
          - UIInterfaceOrientationPortrait
          - UIInterfaceOrientationPortraitUpsideDown
          - UIInterfaceOrientationLandscapeLeft
          - UIInterfaceOrientationLandscapeRight
    entitlements:
      path: MyApp/MyApp.entitlements
      properties:
        aps-environment: development
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.yourcompany.myapp
        PRODUCT_NAME: MyApp
        CODE_SIGN_STYLE: Automatic
        DEVELOPMENT_TEAM: YOURTEAMID
        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
        ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: AccentColor
      configs:
        Debug:
          DEBUG_INFORMATION_FORMAT: dwarf-with-dsym
          SWIFT_OPTIMIZATION_LEVEL: -Onone
        Release:
          SWIFT_OPTIMIZATION_LEVEL: -Osize

  MyAppTests:
    type: bundle.unit-test
    platform: iOS
    sources:
      - MyAppTests
    dependencies:
      - target: MyApp
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.yourcompany.myapp.tests

  MyAppUITests:
    type: bundle.ui-testing
    platform: iOS
    sources:
      - MyAppUITests
    dependencies:
      - target: MyApp
    settings:
      base:
        PRODUCT_BUNDLE_IDENTIFIER: com.yourcompany.myapp.uitests
        TEST_TARGET_NAME: MyApp

schemes:
  MyApp:
    build:
      targets:
        MyApp: all
        MyAppTests: [test]
        MyAppUITests: [test]
    run:
      config: Debug
    test:
      config: Debug
      gatherCoverageData: true
      targets:
        - MyAppTests
        - MyAppUITests
    profile:
      config: Release
    archive:
      config: Release
```

## project.yml with SwiftData

Add SwiftData support:

```yaml
targets:
  MyApp:
    # ... existing config ...
    settings:
      base:
        # ... existing settings ...
        SWIFT_ACTIVE_COMPILATION_CONDITIONS: "$(inherited) SWIFT_DATA"
    dependencies:
      - sdk: SwiftData.framework
```

## project.yml with Swift Packages

```yaml
packages:
  Alamofire:
    url: https://github.com/Alamofire/Alamofire
    from: 5.8.0
  KeychainAccess:
    url: https://github.com/kishikawakatsumi/KeychainAccess
    from: 4.2.0

targets:
  MyApp:
    # ... other config ...
    dependencies:
      - package: Alamofire
      - package: KeychainAccess
```

## Alternative: Xcode GUI

For users who prefer Xcode:
1. File > New > Project > iOS > App
2. Settings: SwiftUI, Swift, SwiftData (optional)
3. Save and close Xcode

---

## File Structure

```
MyApp/
├── MyApp.xcodeproj/
├── MyApp/
│   ├── App/
│   │   ├── MyApp.swift
│   │   ├── AppState.swift
│   │   └── AppDependencies.swift
│   ├── Models/
│   ├── Views/
│   │   ├── ContentView.swift
│   │   ├── Screens/
│   │   └── Components/
│   ├── Services/
│   ├── Utilities/
│   ├── Resources/
│   │   ├── Assets.xcassets/
│   │   ├── Localizable.xcstrings
│   │   └── PrivacyInfo.xcprivacy
│   ├── Info.plist
│   └── MyApp.entitlements
├── MyAppTests/
└── MyAppUITests/
```

## Starter Code

### MyApp.swift

```swift
import SwiftUI

@main
struct MyApp: App {
    @State private var appState = AppState()

    init() {
        configureAppearance()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
                .task {
                    await appState.initialize()
                }
        }
    }

    private func configureAppearance() {
        // Global appearance customization
    }
}
```

### AppState.swift

```swift
import SwiftUI

@Observable
class AppState {
    // Navigation
    var navigationPath = NavigationPath()
    var selectedTab: Tab = .home

    // App state
    var isLoading = false
    var error: AppError?
    var user: User?

    // Feature flags
    var isPremium = false

    enum Tab: Hashable {
        case home, search, profile
    }

    func initialize() async {
        // Load initial data
        // Check purchase status
        // Request permissions if needed
    }

    func handleDeepLink(_ url: URL) {
        // Parse URL and update navigation
    }
}

enum AppError: LocalizedError {
    case networkError(Error)
    case dataError(String)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return error.localizedDescription
        case .dataError(let message):
            return message
        case .unauthorized:
            return "Please sign in to continue"
        }
    }
}
```

### ContentView.swift

```swift
import SwiftUI

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState

        TabView(selection: $appState.selectedTab) {
            HomeScreen()
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(AppState.Tab.home)

            SearchScreen()
                .tabItem {
                    Label("Search", systemImage: "magnifyingglass")
                }
                .tag(AppState.Tab.search)

            ProfileScreen()
                .tabItem {
                    Label("Profile", systemImage: "person")
                }
                .tag(AppState.Tab.profile)
        }
        .overlay {
            if appState.isLoading {
                LoadingOverlay()
            }
        }
        .alert("Error", isPresented: .constant(appState.error != nil)) {
            Button("OK") { appState.error = nil }
        } message: {
            if let error = appState.error {
                Text(error.localizedDescription)
            }
        }
    }
}
```

## Privacy Manifest

Required for App Store submission. Create `PrivacyInfo.xcprivacy`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <!-- Add collected data types here -->
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

## Entitlements Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Push Notifications -->
    <key>aps-environment</key>
    <string>development</string>

    <!-- App Groups (for shared data) -->
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.yourcompany.myapp</string>
    </array>
</dict>
</plist>
```

## Xcode Project Creation

Create via command line using `xcodegen` or `tuist`, or create in Xcode and immediately close:

```bash
# Option 1: Using xcodegen
brew install xcodegen
# Create project.yml, then:
xcodegen generate

# Option 2: Create in Xcode, configure, close
# File > New > Project > iOS > App
# Configure settings, then close Xcode
```

## Build Configuration

### Development vs Release

```bash
# Debug build
xcodebuild -project MyApp.xcodeproj \
    -scheme MyApp \
    -configuration Debug \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    build

# Release build
xcodebuild -project MyApp.xcodeproj \
    -scheme MyApp \
    -configuration Release \
    -destination 'generic/platform=iOS' \
    build
```

### Environment Variables

Use xcconfig files for different environments:

```
// Debug.xcconfig
API_BASE_URL = https://dev-api.example.com
ENABLE_LOGGING = YES

// Release.xcconfig
API_BASE_URL = https://api.example.com
ENABLE_LOGGING = NO
```

Access in code:
```swift
let apiURL = Bundle.main.infoDictionary?["API_BASE_URL"] as? String
```

## Asset Catalog Setup

### App Icon
- Provide 1024x1024 PNG
- Xcode generates all sizes automatically

### Colors
Define semantic colors in Assets.xcassets:
- `AccentColor` - App tint color
- `BackgroundPrimary` - Main background
- `TextPrimary` - Primary text

### SF Symbols
Prefer SF Symbols for icons. Use custom symbols only when necessary.

## Localization Setup

1. Enable localization in project settings
2. Create `Localizable.xcstrings` (Xcode 15+)
3. Use String Catalogs for automatic extraction

```swift
// Strings are automatically extracted
Text("Welcome")
Text("Items: \(count)")
```
