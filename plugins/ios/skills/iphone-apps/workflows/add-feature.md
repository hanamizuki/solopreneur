# Workflow: Add a Feature to an Existing iOS App

<required_reading>
**Read these NOW:**
1. references/app-architecture.md
2. references/swiftui-patterns.md

**Plus relevant refs based on feature** (see Step 2).
</required_reading>

<process>
## Step 1: Understand the Feature

Ask:
- What should it do?
- Where does it belong in the app?
- Any constraints?

## Step 2: Read Relevant References

| Feature Type | Reference |
|--------------|-----------|
| Data persistence | references/data-persistence.md |
| Networking/API | references/networking.md |
| Push notifications | references/push-notifications.md |
| In-app purchases | references/storekit.md |
| Background tasks | references/background-tasks.md |
| Navigation | references/navigation-patterns.md |
| Polish/UX | references/polish-and-ux.md |

## Step 3: Understand Existing Code

Read:
- App entry point
- State management
- Related views

Identify patterns to follow.

## Step 4: Implement with TDD

1. Write test for new behavior → RED
2. Implement → GREEN
3. Refactor
4. Repeat

## Step 5: Integrate

- Wire up navigation
- Connect to state
- Handle errors

## Step 6: Build and Test

```bash
xcodebuild -scheme AppName -destination 'platform=iOS Simulator,name=iPhone 16' build test
xcrun simctl launch booted com.company.AppName
```

## Step 7: Polish

- Haptic feedback for actions
- Animations for transitions
- Accessibility labels
- Dynamic Type support
</process>

<integration_patterns>
**Adding state:**
```swift
@Observable
class AppState {
    var newFeatureData: [NewType] = []
    func performNewFeature() { ... }
}
```

**Adding a view:**
```swift
struct NewFeatureView: View {
    @Environment(AppState.self) private var appState
    var body: some View { ... }
}
```

**Adding navigation:**
```swift
NavigationLink("New Feature", value: NewFeatureDestination())
.navigationDestination(for: NewFeatureDestination.self) { _ in
    NewFeatureView()
}
```

**Adding a tab:**
```swift
TabView {
    NewFeatureView()
        .tabItem { Label("New", systemImage: "star") }
}
```
</integration_patterns>
