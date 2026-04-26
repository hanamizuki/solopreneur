# Data Persistence

SwiftData, Core Data, and file-based storage for iOS apps.

## SwiftData (iOS 17+)

### Model Definition

```swift
import SwiftData

@Model
class Item {
    var name: String
    var createdAt: Date
    var isCompleted: Bool
    var priority: Int

    @Relationship(deleteRule: .cascade)
    var tasks: [Task]

    @Relationship(inverse: \Category.items)
    var category: Category?

    init(name: String, priority: Int = 0) {
        self.name = name
        self.createdAt = Date()
        self.isCompleted = false
        self.priority = priority
        self.tasks = []
    }
}

@Model
class Task {
    var title: String
    var isCompleted: Bool

    init(title: String) {
        self.title = title
        self.isCompleted = false
    }
}

@Model
class Category {
    var name: String
    var items: [Item]

    init(name: String) {
        self.name = name
        self.items = []
    }
}
```

### Container Setup

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(for: [Item.self, Category.self])
    }
}
```

### Querying Data

```swift
struct ItemList: View {
    // Basic query
    @Query private var items: [Item]

    // Sorted query
    @Query(sort: \Item.createdAt, order: .reverse)
    private var sortedItems: [Item]

    // Filtered query
    @Query(filter: #Predicate<Item> { $0.isCompleted == false })
    private var incompleteItems: [Item]

    // Complex query
    @Query(
        filter: #Predicate<Item> { !$0.isCompleted && $0.priority > 5 },
        sort: [
            SortDescriptor(\Item.priority, order: .reverse),
            SortDescriptor(\Item.createdAt)
        ]
    )
    private var highPriorityItems: [Item]

    var body: some View {
        List(items) { item in
            ItemRow(item: item)
        }
    }
}
```

### CRUD Operations

```swift
struct ItemList: View {
    @Query private var items: [Item]
    @Environment(\.modelContext) private var context

    var body: some View {
        List {
            ForEach(items) { item in
                ItemRow(item: item)
            }
            .onDelete(perform: delete)
        }
        .toolbar {
            Button("Add", action: addItem)
        }
    }

    private func addItem() {
        let item = Item(name: "New Item")
        context.insert(item)
        // Auto-saves
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets {
            context.delete(items[index])
        }
    }
}
```

### Custom Container Configuration

```swift
@main
struct MyApp: App {
    let container: ModelContainer

    init() {
        let schema = Schema([Item.self, Category.self])

        let config = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: false,
            allowsSave: true,
            groupContainer: .identifier("group.com.yourcompany.app")
        )

        do {
            container = try ModelContainer(for: schema, configurations: config)
        } catch {
            fatalError("Failed to configure SwiftData container: \(error)")
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .modelContainer(container)
    }
}
```

### iCloud Sync

SwiftData syncs automatically with iCloud when:
1. App has iCloud capability
2. User is signed into iCloud
3. Container uses CloudKit

```swift
let config = ModelConfiguration(
    cloudKitDatabase: .automatic
)
```

## Core Data (All iOS Versions)

### Stack Setup

```swift
class CoreDataStack {
    static let shared = CoreDataStack()

    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "MyApp")

        // Enable cloud sync
        guard let description = container.persistentStoreDescriptions.first else {
            fatalError("No persistent store description")
        }
        description.cloudKitContainerOptions = NSPersistentCloudKitContainerOptions(
            containerIdentifier: "iCloud.com.yourcompany.app"
        )

        container.loadPersistentStores { description, error in
            if let error = error {
                fatalError("Core Data failed to load: \(error)")
            }
        }

        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

        return container
    }()

    var viewContext: NSManagedObjectContext {
        persistentContainer.viewContext
    }

    func saveContext() {
        let context = viewContext
        if context.hasChanges {
            do {
                try context.save()
            } catch {
                print("Failed to save context: \(error)")
            }
        }
    }
}
```

### With SwiftUI

```swift
@main
struct MyApp: App {
    let coreDataStack = CoreDataStack.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, coreDataStack.viewContext)
        }
    }
}

struct ItemList: View {
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Item.createdAt, ascending: false)],
        predicate: NSPredicate(format: "isCompleted == NO")
    )
    private var items: FetchedResults<Item>

    @Environment(\.managedObjectContext) private var context

    var body: some View {
        List(items) { item in
            ItemRow(item: item)
        }
    }
}
```

## File-Based Storage

### Codable Models

```swift
struct UserSettings: Codable {
    var theme: Theme
    var fontSize: Int
    var notificationsEnabled: Bool

    enum Theme: String, Codable {
        case light, dark, system
    }
}

class SettingsStore {
    private let fileURL: URL

    init() {
        let documentsDirectory = FileManager.default.urls(
            for: .documentDirectory,
            in: .userDomainMask
        ).first!
        fileURL = documentsDirectory.appendingPathComponent("settings.json")
    }

    func load() -> UserSettings {
        guard let data = try? Data(contentsOf: fileURL),
              let settings = try? JSONDecoder().decode(UserSettings.self, from: data) else {
            return UserSettings(theme: .system, fontSize: 16, notificationsEnabled: true)
        }
        return settings
    }

    func save(_ settings: UserSettings) throws {
        let data = try JSONEncoder().encode(settings)
        try data.write(to: fileURL)
    }
}
```

### Document Directory Paths

```swift
extension FileManager {
    var documentsDirectory: URL {
        urls(for: .documentDirectory, in: .userDomainMask).first!
    }

    var cachesDirectory: URL {
        urls(for: .cachesDirectory, in: .userDomainMask).first!
    }

    var applicationSupportDirectory: URL {
        let url = urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        try? createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
```

## UserDefaults

### Basic Usage

```swift
// Save
UserDefaults.standard.set("value", forKey: "key")
UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")

// Load
let value = UserDefaults.standard.string(forKey: "key")
let hasCompletedOnboarding = UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")
```

### @AppStorage

```swift
struct SettingsView: View {
    @AppStorage("fontSize") private var fontSize = 16
    @AppStorage("isDarkMode") private var isDarkMode = false
    @AppStorage("username") private var username = ""

    var body: some View {
        Form {
            Stepper("Font Size: \(fontSize)", value: $fontSize, in: 12...24)
            Toggle("Dark Mode", isOn: $isDarkMode)
            TextField("Username", text: $username)
        }
    }
}
```

### Custom Codable Storage

```swift
extension UserDefaults {
    func set<T: Codable>(_ value: T, forKey key: String) {
        if let data = try? JSONEncoder().encode(value) {
            set(data, forKey: key)
        }
    }

    func get<T: Codable>(_ type: T.Type, forKey key: String) -> T? {
        guard let data = data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}

// Usage
UserDefaults.standard.set(userProfile, forKey: "userProfile")
let profile = UserDefaults.standard.get(UserProfile.self, forKey: "userProfile")
```

## Keychain (Sensitive Data)

### Simple Wrapper

```swift
import Security

class KeychainService {
    enum KeychainError: Error {
        case saveFailed(OSStatus)
        case loadFailed(OSStatus)
        case deleteFailed(OSStatus)
        case dataConversionError
    }

    func save(_ data: Data, for key: String) throws {
        // Delete existing
        try? delete(key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlocked
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }

    func load(_ key: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess else {
            throw KeychainError.loadFailed(status)
        }

        guard let data = result as? Data else {
            throw KeychainError.dataConversionError
        }

        return data
    }

    func delete(_ key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status)
        }
    }
}

// String convenience
extension KeychainService {
    func saveString(_ value: String, for key: String) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.dataConversionError
        }
        try save(data, for: key)
    }

    func loadString(_ key: String) throws -> String {
        let data = try load(key)
        guard let string = String(data: data, encoding: .utf8) else {
            throw KeychainError.dataConversionError
        }
        return string
    }
}
```

### Usage

```swift
let keychain = KeychainService()

// Save API token
try keychain.saveString(token, for: "apiToken")

// Load API token
let token = try keychain.loadString("apiToken")

// Delete on logout
try keychain.delete("apiToken")
```

## Migration Strategies

### SwiftData Migrations

```swift
enum SchemaV1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] {
        [Item.self]
    }

    @Model
    class Item {
        var name: String
        init(name: String) { self.name = name }
    }
}

enum SchemaV2: VersionedSchema {
    static var versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] {
        [Item.self]
    }

    @Model
    class Item {
        var name: String
        var createdAt: Date  // New field

        init(name: String) {
            self.name = name
            self.createdAt = Date()
        }
    }
}

enum MigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [SchemaV1.self, SchemaV2.self]
    }

    static var stages: [MigrationStage] {
        [migrateV1toV2]
    }

    static let migrateV1toV2 = MigrationStage.lightweight(
        fromVersion: SchemaV1.self,
        toVersion: SchemaV2.self
    )
}
```
