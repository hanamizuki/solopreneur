# Background Tasks

BGTaskScheduler, background fetch, and silent push for background processing.

## BGTaskScheduler

### Setup

1. Add capability: Background Modes
2. Enable: Background fetch, Background processing
3. Register identifiers in Info.plist:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.app.refresh</string>
    <string>com.app.processing</string>
</array>
```

### Registration

```swift
import BackgroundTasks

@main
struct MyApp: App {
    init() {
        registerBackgroundTasks()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }

    private func registerBackgroundTasks() {
        // App Refresh - for frequent, short updates
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.app.refresh",
            using: nil
        ) { task in
            guard let task = task as? BGAppRefreshTask else { return }
            handleAppRefresh(task: task)
        }

        // Processing - for longer, deferrable work
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: "com.app.processing",
            using: nil
        ) { task in
            guard let task = task as? BGProcessingTask else { return }
            handleProcessing(task: task)
        }
    }
}
```

### App Refresh Task

Short tasks that need to run frequently:

```swift
func handleAppRefresh(task: BGAppRefreshTask) {
    // Schedule next refresh
    scheduleAppRefresh()

    // Create task
    let refreshTask = Task {
        do {
            try await syncLatestData()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
    }

    // Handle expiration
    task.expirationHandler = {
        refreshTask.cancel()
    }
}

func scheduleAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.app.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)  // 15 minutes

    do {
        try BGTaskScheduler.shared.submit(request)
    } catch {
        print("Could not schedule app refresh: \(error)")
    }
}

private func syncLatestData() async throws {
    // Fetch new data from server
    // Update local database
    // Badge update if needed
}
```

### Processing Task

Longer tasks that can be deferred:

```swift
func handleProcessing(task: BGProcessingTask) {
    // Schedule next
    scheduleProcessing()

    let processingTask = Task {
        do {
            try await performHeavyWork()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
    }

    task.expirationHandler = {
        processingTask.cancel()
    }
}

func scheduleProcessing() {
    let request = BGProcessingTaskRequest(identifier: "com.app.processing")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 60 * 60)  // 1 hour
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = false

    do {
        try BGTaskScheduler.shared.submit(request)
    } catch {
        print("Could not schedule processing: \(error)")
    }
}

private func performHeavyWork() async throws {
    // Database maintenance
    // Large file uploads
    // ML model training
    // Cache cleanup
}
```

## Background URLSession

For large uploads/downloads that continue when app is suspended:

```swift
class BackgroundDownloadService: NSObject {
    static let shared = BackgroundDownloadService()

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(
            withIdentifier: "com.app.background.download"
        )
        config.isDiscretionary = true  // System chooses best time
        config.sessionSendsLaunchEvents = true  // Wake app on completion

        return URLSession(
            configuration: config,
            delegate: self,
            delegateQueue: nil
        )
    }()

    private var completionHandler: (() -> Void)?

    func download(from url: URL) {
        let task = session.downloadTask(with: url)
        task.resume()
    }

    func handleEventsForBackgroundURLSession(
        identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        self.completionHandler = completionHandler
    }
}

extension BackgroundDownloadService: URLSessionDownloadDelegate {
    func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        // Move file to permanent location
        let documentsURL = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        ).first!
        let destinationURL = documentsURL.appendingPathComponent("downloaded.file")

        try? FileManager.default.moveItem(at: location, to: destinationURL)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.completionHandler?()
            self.completionHandler = nil
        }
    }
}

// In AppDelegate
func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
) {
    BackgroundDownloadService.shared.handleEventsForBackgroundURLSession(
        identifier: identifier,
        completionHandler: completionHandler
    )
}
```

## Silent Push Notifications

Trigger background work from server:

### Configuration

Entitlements:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

### Handling

```swift
// In AppDelegate
func application(
    _ application: UIApplication,
    didReceiveRemoteNotification userInfo: [AnyHashable: Any]
) async -> UIBackgroundFetchResult {
    guard let action = userInfo["action"] as? String else {
        return .noData
    }

    do {
        switch action {
        case "sync":
            try await syncData()
            return .newData
        case "refresh":
            try await refreshContent()
            return .newData
        default:
            return .noData
        }
    } catch {
        return .failed
    }
}
```

### Payload

```json
{
    "aps": {
        "content-available": 1
    },
    "action": "sync",
    "data": {
        "lastUpdate": "2025-01-01T00:00:00Z"
    }
}
```

## Location Updates

Background location monitoring:

```swift
import CoreLocation

class LocationService: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = true
    }

    // Significant location changes (battery efficient)
    func startMonitoringSignificantChanges() {
        manager.startMonitoringSignificantLocationChanges()
    }

    // Region monitoring
    func monitorRegion(_ region: CLCircularRegion) {
        manager.startMonitoring(for: region)
    }

    // Continuous updates (high battery usage)
    func startContinuousUpdates() {
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.startUpdatingLocation()
    }

    func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        guard let location = locations.last else { return }

        // Process location update
        Task {
            try? await uploadLocation(location)
        }
    }

    func locationManager(
        _ manager: CLLocationManager,
        didEnterRegion region: CLRegion
    ) {
        // Handle region entry
    }
}
```

## Background Audio

For audio playback while app is in background:

```swift
import AVFoundation

class AudioService {
    private var player: AVAudioPlayer?

    func configureAudioSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default)
        try session.setActive(true)
    }

    func play(url: URL) throws {
        player = try AVAudioPlayer(contentsOf: url)
        player?.play()
    }
}
```

## Testing Background Tasks

### Simulate in Debugger

```swift
// Pause in debugger, then:
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.app.refresh"]
```

### Force Early Execution

```swift
#if DEBUG
func debugScheduleRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.app.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 1)  // 1 second for testing

    try? BGTaskScheduler.shared.submit(request)
}
#endif
```

## Best Practices

### Battery Efficiency

```swift
// Use discretionary for non-urgent work
let config = URLSessionConfiguration.background(withIdentifier: "com.app.upload")
config.isDiscretionary = true  // Wait for good network/power conditions

// Require power for heavy work
let request = BGProcessingTaskRequest(identifier: "com.app.process")
request.requiresExternalPower = true
```

### Respect User Settings

```swift
func scheduleRefreshIfAllowed() {
    // Check if user has Low Power Mode
    if ProcessInfo.processInfo.isLowPowerModeEnabled {
        // Reduce frequency or skip
        return
    }

    // Check background refresh status
    switch UIApplication.shared.backgroundRefreshStatus {
    case .available:
        scheduleAppRefresh()
    case .denied, .restricted:
        // Inform user if needed
        break
    @unknown default:
        break
    }
}
```

### Handle Expiration

Always handle task expiration:

```swift
func handleTask(_ task: BGTask) {
    let operation = Task {
        // Long running work
    }

    // CRITICAL: Always set expiration handler
    task.expirationHandler = {
        operation.cancel()
        // Clean up
        // Save progress
    }
}
```

### Progress Persistence

Save progress so you can resume:

```swift
func performIncrementalSync(task: BGTask) async {
    // Load progress
    let lastSyncDate = UserDefaults.standard.object(forKey: "lastSyncDate") as? Date ?? .distantPast

    do {
        // Sync from last position
        let newDate = try await syncSince(lastSyncDate)

        // Save progress
        UserDefaults.standard.set(newDate, forKey: "lastSyncDate")

        task.setTaskCompleted(success: true)
    } catch {
        task.setTaskCompleted(success: false)
    }
}
```

## Debugging

### Check Scheduled Tasks

```swift
BGTaskScheduler.shared.getPendingTaskRequests { requests in
    for request in requests {
        print("Pending: \(request.identifier)")
        print("Earliest: \(request.earliestBeginDate ?? Date())")
    }
}
```

### Cancel Tasks

```swift
// Cancel specific
BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: "com.app.refresh")

// Cancel all
BGTaskScheduler.shared.cancelAllTaskRequests()
```

### Console Logs

```bash
# View background task logs
log stream --predicate 'subsystem == "com.apple.BackgroundTasks"' --level debug
```
