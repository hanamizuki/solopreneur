# Workflow: Write and Run Tests

<required_reading>
**Read NOW:**
1. references/testing.md
</required_reading>

<philosophy>
Tests are documentation that runs. They let the user verify correctness without reading code.
</philosophy>

<process>
## Step 1: Understand What to Test

**Claude tests (automated):**
- Core logic
- State management
- Service layer
- Edge cases

**User tests (manual):**
- UX feel
- Visual polish
- Real device behavior

## Step 2: Write Tests

### Unit Tests
```swift
import Testing
@testable import AppName

struct ItemTests {
    @Test func creation() {
        let item = Item(name: "Test")
        #expect(item.name == "Test")
    }

    @Test func validation() {
        let empty = Item(name: "")
        #expect(!empty.isValid)
    }
}
```

### Async Tests
```swift
@Test func fetchItems() async throws {
    let service = MockService()
    let items = try await service.fetch()
    #expect(items.count > 0)
}
```

### State Tests
```swift
@Test func addItem() {
    let state = AppState()
    state.addItem(Item(name: "New"))
    #expect(state.items.count == 1)
}
```

## Step 3: Run Tests

```bash
xcodebuild test \
  -project AppName.xcodeproj \
  -scheme AppName \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -resultBundlePath TestResults.xcresult

# Summary
xcrun xcresulttool get test-results summary --path TestResults.xcresult
```

## Step 4: Coverage

```bash
xcodebuild test -enableCodeCoverage YES ...
xcrun xccov view --report TestResults.xcresult
```

## Step 5: TDD Cycle

For new features:
1. Write failing test
2. Run → RED
3. Implement minimum
4. Run → GREEN
5. Refactor
6. Repeat
</process>

<coverage_targets>
| Code Type | Target |
|-----------|--------|
| Business logic | 80-100% |
| State management | 70-90% |
| Views | 0% (manual) |
</coverage_targets>
