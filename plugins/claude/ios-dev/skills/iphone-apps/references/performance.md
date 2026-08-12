# Performance

Instruments, memory management, launch optimization, and battery efficiency.

## Instruments Profiling

### Time Profiler

Find CPU-intensive code:

```bash
# Profile from CLI
xcrun xctrace record \
    --template 'Time Profiler' \
    --device-name 'iPhone 16' \
    --launch MyApp.app \
    --output profile.trace
```

Common issues:
- Main thread work during UI updates
- Expensive computations in body
- Synchronous I/O

### Allocations

Track memory usage:

```bash
xcrun xctrace record \
    --template 'Allocations' \
    --device-name 'iPhone 16' \
    --launch MyApp.app \
    --output allocations.trace
```

Look for:
- Memory growth over time
- Abandoned memory
- High transient allocations

### Leaks

Find retain cycles:

```bash
xcrun xctrace record \
    --template 'Leaks' \
    --device-name 'iPhone 16' \
    --launch MyApp.app \
    --output leaks.trace
```

Common causes:
- Strong reference cycles in closures
- Delegate patterns without weak references
- Timer retain cycles

## Memory Management

### Weak References in Closures

```swift
// Bad - creates retain cycle
class ViewModel {
    var timer: Timer?

    func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            self.update()  // Strong capture
        }
    }
}

// Good - weak capture
class ViewModel {
    var timer: Timer?

    func startTimer() {
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.update()
        }
    }

    deinit {
        timer?.invalidate()
    }
}
```

### Async Task Cancellation

```swift
class ViewModel {
    private var loadTask: Task<Void, Never>?

    func load() {
        loadTask?.cancel()
        loadTask = Task { [weak self] in
            guard let self else { return }

            let items = try? await fetchItems()

            // Check cancellation before updating
            guard !Task.isCancelled else { return }

            await MainActor.run {
                self.items = items ?? []
            }
        }
    }

    deinit {
        loadTask?.cancel()
    }
}
```

### Large Data Handling

```swift
// Bad - loads all into memory
let allPhotos = try await fetchAllPhotos()
for photo in allPhotos {
    process(photo)
}

// Good - stream processing
for await photo in fetchPhotosStream() {
    process(photo)

    // Allow UI updates
    if shouldYield {
        await Task.yield()
    }
}
```

## SwiftUI Performance

### Avoid Expensive Body Computations

```swift
// Bad - recomputes on every body call
struct ItemList: View {
    let items: [Item]

    var body: some View {
        let sortedItems = items.sorted { $0.date > $1.date }  // Every render!
        List(sortedItems) { item in
            ItemRow(item: item)
        }
    }
}

// Good - compute once
struct ItemList: View {
    let items: [Item]

    var sortedItems: [Item] {
        items.sorted { $0.date > $1.date }
    }

    var body: some View {
        List(sortedItems) { item in
            ItemRow(item: item)
        }
    }
}

// Better - use @State or computed in view model
struct ItemList: View {
    @State private var sortedItems: [Item] = []
    let items: [Item]

    var body: some View {
        List(sortedItems) { item in
            ItemRow(item: item)
        }
        .onChange(of: items) { _, newItems in
            sortedItems = newItems.sorted { $0.date > $1.date }
        }
    }
}
```

### Optimize List Performance

```swift
// Use stable identifiers
struct Item: Identifiable {
    let id: UUID  // Stable identifier
    var name: String
}

// Explicit id for efficiency
List(items, id: \.id) { item in
    ItemRow(item: item)
}

// Lazy loading for large lists
LazyVStack {
    ForEach(items) { item in
        ItemRow(item: item)
    }
}
```

### Equatable Conformance

```swift
// Prevent unnecessary re-renders
struct ItemRow: View, Equatable {
    let item: Item

    static func == (lhs: ItemRow, rhs: ItemRow) -> Bool {
        lhs.item.id == rhs.item.id &&
        lhs.item.name == rhs.item.name
    }

    var body: some View {
        Text(item.name)
    }
}

// Use in ForEach
ForEach(items) { item in
    ItemRow(item: item)
        .equatable()
}
```

### Task Modifier Optimization

```swift
// Bad - recreates task on any state change
struct ContentView: View {
    @State private var items: [Item] = []
    @State private var searchText = ""

    var body: some View {
        List(filteredItems) { item in
            ItemRow(item: item)
        }
        .task {
            items = await fetchItems()  // Reruns when searchText changes!
        }
    }
}

// Good - use task(id:)
struct ContentView: View {
    @State private var items: [Item] = []
    @State private var searchText = ""
    @State private var needsLoad = true

    var body: some View {
        List(filteredItems) { item in
            ItemRow(item: item)
        }
        .task(id: needsLoad) {
            if needsLoad {
                items = await fetchItems()
                needsLoad = false
            }
        }
    }
}
```

## Launch Time Optimization

### Measure Launch Time

```bash
# Cold launch measurement
xcrun simctl spawn booted log stream --predicate 'subsystem == "com.apple.os.signpost" && category == "PointsOfInterest"'
```

In Instruments: App Launch template

### Defer Non-Critical Work

```swift
@main
struct MyApp: App {
    init() {
        // Critical only
        setupErrorReporting()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .task {
                    // Defer non-critical
                    await setupAnalytics()
                    await preloadData()
                }
        }
    }
}
```

### Avoid Synchronous Work

```swift
// Bad - blocks launch
@main
struct MyApp: App {
    let database = Database.load()  // Synchronous I/O

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

// Good - async initialization
@main
struct MyApp: App {
    @State private var database: Database?

    var body: some Scene {
        WindowGroup {
            if let database {
                ContentView()
                    .environment(database)
            } else {
                LaunchScreen()
            }
        }
        .task {
            database = await Database.load()
        }
    }
}
```

### Reduce Dylib Loading

- Minimize third-party dependencies
- Use static linking where possible
- Merge frameworks

## Network Performance

### Request Batching

```swift
// Bad - many small requests
for id in itemIDs {
    let item = try await fetchItem(id)
    items.append(item)
}

// Good - batch request
let items = try await fetchItems(ids: itemIDs)
```

### Image Loading

```swift
// Use AsyncImage with caching
AsyncImage(url: imageURL) { phase in
    switch phase {
    case .empty:
        ProgressView()
    case .success(let image):
        image.resizable().scaledToFit()
    case .failure:
        Image(systemName: "photo")
    @unknown default:
        EmptyView()
    }
}

// For better control, use custom caching
actor ImageCache {
    private var cache: [URL: UIImage] = [:]

    func image(for url: URL) async throws -> UIImage {
        if let cached = cache[url] {
            return cached
        }

        let (data, _) = try await URLSession.shared.data(from: url)
        let image = UIImage(data: data)!
        cache[url] = image
        return image
    }
}
```

### Prefetching

```swift
struct ItemList: View {
    let items: [Item]
    let prefetcher = ImagePrefetcher()

    var body: some View {
        List(items) { item in
            ItemRow(item: item)
                .onAppear {
                    // Prefetch next items
                    let index = items.firstIndex(of: item) ?? 0
                    let nextItems = items.dropFirst(index + 1).prefix(5)
                    prefetcher.prefetch(urls: nextItems.compactMap(\.imageURL))
                }
        }
    }
}
```

## Battery Optimization

### Location Updates

```swift
import CoreLocation

class LocationService: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    func startUpdates() {
        // Use appropriate accuracy
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters  // Not kCLLocationAccuracyBest

        // Allow deferred updates
        manager.allowsBackgroundLocationUpdates = false
        manager.pausesLocationUpdatesAutomatically = true

        // Use significant change for background
        manager.startMonitoringSignificantLocationChanges()
    }
}
```

### Background Tasks

```swift
import BackgroundTasks

func scheduleAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.app.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)  // 15 minutes

    do {
        try BGTaskScheduler.shared.submit(request)
    } catch {
        print("Could not schedule app refresh: \(error)")
    }
}

func handleAppRefresh(task: BGAppRefreshTask) {
    // Schedule next refresh
    scheduleAppRefresh()

    let refreshTask = Task {
        do {
            try await syncData()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
    }

    task.expirationHandler = {
        refreshTask.cancel()
    }
}
```

### Network Efficiency

```swift
// Use background URL session for large transfers
let config = URLSessionConfiguration.background(withIdentifier: "com.app.background")
config.isDiscretionary = true  // System chooses optimal time
config.allowsCellularAccess = false  // WiFi only for large downloads

let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
```

## Debugging Performance

### Signposts

```swift
import os

let signposter = OSSignposter()

func processItems() async {
    let signpostID = signposter.makeSignpostID()
    let state = signposter.beginInterval("Process Items", id: signpostID)

    for item in items {
        signposter.emitEvent("Processing", id: signpostID, "\(item.name)")
        await process(item)
    }

    signposter.endInterval("Process Items", state)
}
```

### MetricKit

```swift
import MetricKit

class MetricsManager: NSObject, MXMetricManagerSubscriber {
    override init() {
        super.init()
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            // Process CPU, memory, launch time metrics
            if let cpuMetrics = payload.cpuMetrics {
                print("CPU time: \(cpuMetrics.cumulativeCPUTime)")
            }
        }
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            // Process crash and hang diagnostics
        }
    }
}
```

## Performance Checklist

### Launch
- [ ] < 400ms to first frame
- [ ] No synchronous I/O in init
- [ ] Deferred non-critical setup

### Memory
- [ ] No leaks
- [ ] Stable memory usage
- [ ] No abandoned memory

### UI
- [ ] 60 fps scrolling
- [ ] No main thread blocking
- [ ] Efficient list rendering

### Network
- [ ] Request batching
- [ ] Image caching
- [ ] Proper timeout handling

### Battery
- [ ] Minimal background activity
- [ ] Efficient location usage
- [ ] Discretionary transfers
