# Push Notifications

APNs setup, registration, rich notifications, and silent push.

## Basic Setup

### Request Permission

```swift
import UserNotifications

class PushService: NSObject {
    static let shared = PushService()

    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        center.delegate = self

        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])
            if granted {
                await registerForRemoteNotifications()
            }
            return granted
        } catch {
            print("Permission request failed: \(error)")
            return false
        }
    }

    @MainActor
    private func registerForRemoteNotifications() {
        UIApplication.shared.registerForRemoteNotifications()
    }

    func checkPermissionStatus() async -> UNAuthorizationStatus {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return settings.authorizationStatus
    }
}

extension PushService: UNUserNotificationCenterDelegate {
    // Handle notification when app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .badge]
    }

    // Handle notification tap
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo

        // Handle action
        switch response.actionIdentifier {
        case UNNotificationDefaultActionIdentifier:
            // User tapped notification
            handleNotificationTap(userInfo)
        case "REPLY_ACTION":
            if let textResponse = response as? UNTextInputNotificationResponse {
                handleReply(textResponse.userText, userInfo: userInfo)
            }
        default:
            break
        }
    }

    private func handleNotificationTap(_ userInfo: [AnyHashable: Any]) {
        // Navigate to relevant screen
        if let itemID = userInfo["item_id"] as? String {
            // appState.navigateToItem(id: itemID)
        }
    }

    private func handleReply(_ text: String, userInfo: [AnyHashable: Any]) {
        // Send reply
    }
}
```

### Handle Device Token

In your App or AppDelegate:

```swift
// Using UIApplicationDelegateAdaptor
@main
struct MyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        print("Device Token: \(token)")

        // Send to your server
        Task {
            try? await sendTokenToServer(token)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("Failed to register: \(error)")
    }

    private func sendTokenToServer(_ token: String) async throws {
        // POST to your server
    }
}
```

## Rich Notifications

### Notification Content Extension

1. File > New > Target > Notification Content Extension
2. Configure in `Info.plist`:

```xml
<key>NSExtension</key>
<dict>
    <key>NSExtensionAttributes</key>
    <dict>
        <key>UNNotificationExtensionCategory</key>
        <string>MEDIA_CATEGORY</string>
        <key>UNNotificationExtensionInitialContentSizeRatio</key>
        <real>0.5</real>
    </dict>
    <key>NSExtensionMainStoryboard</key>
    <string>MainInterface</string>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.usernotifications.content-extension</string>
</dict>
```

3. Implement `NotificationViewController`:

```swift
import UIKit
import UserNotifications
import UserNotificationsUI

class NotificationViewController: UIViewController, UNNotificationContentExtension {
    @IBOutlet weak var imageView: UIImageView!
    @IBOutlet weak var titleLabel: UILabel!

    func didReceive(_ notification: UNNotification) {
        let content = notification.request.content

        titleLabel.text = content.title

        // Load attachment
        if let attachment = content.attachments.first,
           attachment.url.startAccessingSecurityScopedResource() {
            defer { attachment.url.stopAccessingSecurityScopedResource() }

            if let data = try? Data(contentsOf: attachment.url),
               let image = UIImage(data: data) {
                imageView.image = image
            }
        }
    }
}
```

### Notification Service Extension

Modify notification content before display:

1. File > New > Target > Notification Service Extension
2. Implement:

```swift
import UserNotifications

class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // Download and attach media
        if let imageURLString = bestAttemptContent.userInfo["image_url"] as? String,
           let imageURL = URL(string: imageURLString) {
            downloadImage(from: imageURL) { attachment in
                if let attachment = attachment {
                    bestAttemptContent.attachments = [attachment]
                }
                contentHandler(bestAttemptContent)
            }
        } else {
            contentHandler(bestAttemptContent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        // Called just before extension is terminated
        if let contentHandler = contentHandler,
           let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }

    private func downloadImage(from url: URL, completion: @escaping (UNNotificationAttachment?) -> Void) {
        let task = URLSession.shared.downloadTask(with: url) { location, _, error in
            guard let location = location, error == nil else {
                completion(nil)
                return
            }

            let tempDirectory = FileManager.default.temporaryDirectory
            let tempFile = tempDirectory.appendingPathComponent(UUID().uuidString + ".jpg")

            do {
                try FileManager.default.moveItem(at: location, to: tempFile)
                let attachment = try UNNotificationAttachment(identifier: "image", url: tempFile)
                completion(attachment)
            } catch {
                completion(nil)
            }
        }
        task.resume()
    }
}
```

## Actions and Categories

### Define Actions

```swift
func registerNotificationCategories() {
    // Actions
    let replyAction = UNTextInputNotificationAction(
        identifier: "REPLY_ACTION",
        title: "Reply",
        options: [],
        textInputButtonTitle: "Send",
        textInputPlaceholder: "Type your reply..."
    )

    let markReadAction = UNNotificationAction(
        identifier: "MARK_READ_ACTION",
        title: "Mark as Read",
        options: []
    )

    let deleteAction = UNNotificationAction(
        identifier: "DELETE_ACTION",
        title: "Delete",
        options: [.destructive]
    )

    // Category
    let messageCategory = UNNotificationCategory(
        identifier: "MESSAGE_CATEGORY",
        actions: [replyAction, markReadAction, deleteAction],
        intentIdentifiers: [],
        options: []
    )

    // Register
    UNUserNotificationCenter.current().setNotificationCategories([messageCategory])
}
```

### Send with Category

```json
{
    "aps": {
        "alert": {
            "title": "New Message",
            "body": "You have a new message from John"
        },
        "category": "MESSAGE_CATEGORY",
        "mutable-content": 1
    },
    "image_url": "https://example.com/image.jpg"
}
```

## Silent Push

For background data updates:

### Configuration

Add to entitlements:
```xml
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

### Handle Silent Push

```swift
class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any]
    ) async -> UIBackgroundFetchResult {
        // Process in background
        do {
            try await syncData()
            return .newData
        } catch {
            return .failed
        }
    }

    private func syncData() async throws {
        // Fetch new data
    }
}
```

### Send Silent Push

```json
{
    "aps": {
        "content-available": 1
    },
    "data": {
        "type": "sync",
        "timestamp": "2025-01-01T00:00:00Z"
    }
}
```

## Local Notifications

Schedule notifications without server:

```swift
class LocalNotificationService {
    func scheduleReminder(title: String, body: String, at date: Date, id: String) async throws {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)

        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)

        try await UNUserNotificationCenter.current().add(request)
    }

    func scheduleRepeating(title: String, body: String, hour: Int, minute: Int, id: String) async throws {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default

        var components = DateComponents()
        components.hour = hour
        components.minute = minute

        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)

        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)

        try await UNUserNotificationCenter.current().add(request)
    }

    func cancel(_ id: String) {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id])
    }

    func cancelAll() {
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }
}
```

## Badge Management

```swift
extension PushService {
    func updateBadge(count: Int) async {
        do {
            try await UNUserNotificationCenter.current().setBadgeCount(count)
        } catch {
            print("Failed to set badge: \(error)")
        }
    }

    func clearBadge() async {
        await updateBadge(count: 0)
    }
}
```

## APNs Server Setup

### Payload Format

```json
{
    "aps": {
        "alert": {
            "title": "Title",
            "subtitle": "Subtitle",
            "body": "Body text"
        },
        "badge": 1,
        "sound": "default",
        "thread-id": "group-id",
        "category": "CATEGORY_ID"
    },
    "custom_key": "custom_value"
}
```

### Sending with JWT

```bash
curl -v \
    --header "authorization: bearer $JWT" \
    --header "apns-topic: com.yourcompany.app" \
    --header "apns-push-type: alert" \
    --http2 \
    --data '{"aps":{"alert":"Hello"}}' \
    https://api.push.apple.com/3/device/$DEVICE_TOKEN
```

## Best Practices

### Request Permission at Right Time

```swift
// Don't request on launch
// Instead, request after value is demonstrated
func onFirstMessageReceived() {
    Task {
        let granted = await PushService.shared.requestPermission()
        if !granted {
            showPermissionBenefitsSheet()
        }
    }
}
```

### Handle Permission Denied

```swift
func showNotificationSettings() {
    if let url = URL(string: UIApplication.openSettingsURLString) {
        UIApplication.shared.open(url)
    }
}
```

### Group Notifications

```json
{
    "aps": {
        "alert": "New message",
        "thread-id": "conversation-123"
    }
}
```

### Time Sensitive (iOS 15+)

```json
{
    "aps": {
        "alert": "Your order arrived",
        "interruption-level": "time-sensitive"
    }
}
```
