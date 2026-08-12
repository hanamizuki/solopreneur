# Workflow: Optimize iOS App Performance

<required_reading>
**Read NOW:**
1. references/performance.md
2. references/cli-observability.md
</required_reading>

<philosophy>
Measure first, optimize second. Never optimize based on assumptions.
</philosophy>

<process>
## Step 1: Define the Problem

Ask:
- What feels slow?
- Startup? Scrolling? Specific action?
- When did it start?

## Step 2: Measure

**CPU Profiling:**
```bash
xcrun xctrace record \
  --template 'Time Profiler' \
  --device 'iPhone 16' \
  --attach AppName \
  --output profile.trace
```

**Memory:**
```bash
xcrun xctrace record --template 'Allocations' ...
```

**Launch time:**
```bash
# Add DYLD_PRINT_STATISTICS=1 to scheme environment
```

## Step 3: Identify Bottlenecks

Look for:
- Functions with high "self time"
- Main thread blocking
- Repeated expensive operations
- Large allocations

**SwiftUI re-renders:**
```swift
var body: some View {
    let _ = Self._printChanges()
    // ...
}
```

## Step 4: Common Optimizations

### Main Thread
```swift
// Bad
let data = expensiveWork() // blocks UI

// Good
let data = await Task.detached { expensiveWork() }.value
```

### SwiftUI
```swift
// Bad - rebuilds everything
struct BigView: View {
    @State var a, b, c, d, e
}

// Good - isolated state
struct BigView: View {
    var body: some View {
        SubViewA() // has own @State
        SubViewB() // has own @State
    }
}
```

### Lists
```swift
// Use LazyVStack for long lists
ScrollView {
    LazyVStack {
        ForEach(items) { ... }
    }
}
```

### Images
```swift
AsyncImage(url: url) { image in
    image.resizable()
} placeholder: {
    ProgressView()
}
```

## Step 5: Measure Again

Did it improve? If not, revert.

## Step 6: Performance Tests

```swift
func testScrollPerformance() {
    measure(metrics: [XCTCPUMetric(), XCTMemoryMetric()]) {
        // scroll simulation
    }
}
```
</process>

<targets>
| Metric | Target | Unacceptable |
|--------|--------|--------------|
| Launch | < 1s | > 2s |
| Scroll | 60 fps | < 30 fps |
| Response | < 100ms | > 500ms |
</targets>
