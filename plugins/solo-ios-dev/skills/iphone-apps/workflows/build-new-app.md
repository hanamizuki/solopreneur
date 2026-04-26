# Workflow: Build a New iOS App

<required_reading>
**Read these reference files NOW before writing any code:**
1. references/project-scaffolding.md
2. references/cli-workflow.md
3. references/app-architecture.md
4. references/swiftui-patterns.md
</required_reading>

<process>
## Step 1: Clarify Requirements

Ask the user:
- What does the app do? (core functionality)
- What type? (single-screen, tab-based, navigation-based, data-driven)
- Any specific features? (persistence, networking, push notifications, purchases)

## Step 2: Choose App Archetype

| Type | When to Use | Key Patterns |
|------|-------------|--------------|
| Single-screen utility | One primary function | Minimal navigation |
| Tab-based (TabView) | Multiple equal sections | TabView with 3-5 tabs |
| Navigation-based | Hierarchical content | NavigationStack |
| Data-driven | User content library | SwiftData + @Query |

## Step 3: Scaffold Project

Use XcodeGen:
```bash
mkdir AppName && cd AppName
# Create project.yml (see references/project-scaffolding.md)
# Create Swift files in Sources/
xcodegen generate
```

## Step 4: Implement with TDD

1. Write failing test
2. Run → RED
3. Implement minimal code
4. Run → GREEN
5. Refactor
6. Repeat

## Step 5: Build and Launch

```bash
# Build
xcodebuild -project AppName.xcodeproj -scheme AppName \
  -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | xcsift

# Launch in simulator
xcrun simctl boot "iPhone 16" 2>/dev/null || true
xcrun simctl install booted ./build/Build/Products/Debug-iphonesimulator/AppName.app
xcrun simctl launch booted com.company.AppName
```

## Step 6: Polish

Read references/polish-and-ux.md for:
- Haptic feedback
- Animations
- Accessibility
- Dynamic Type support
</process>

<minimum_viable_app>
```swift
import SwiftUI

@main
struct MyApp: App {
    @State private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(appState)
        }
    }
}

@Observable
class AppState {
    var items: [Item] = []
}

struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            List(appState.items) { item in
                Text(item.name)
            }
            .navigationTitle("Items")
        }
    }
}
```
</minimum_viable_app>

<success_criteria>
- Follows iOS Human Interface Guidelines
- Builds and runs from CLI
- Tests pass
- Launches in simulator
- User can verify UX manually
</success_criteria>
