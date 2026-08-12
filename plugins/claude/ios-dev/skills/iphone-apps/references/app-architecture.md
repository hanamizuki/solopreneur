# App Architecture

State management, dependency injection, and architectural patterns for iOS apps.

## State Management

### @Observable (iOS 17+)

The modern approach for shared state:

```swift
@Observable
class AppState {
    var items: [Item] = []
    var selectedItemID: UUID?
    var isLoading = false
    var error: AppError?

    // Computed properties work naturally
    var selectedItem: Item? {
        items.first { $0.id == selectedItemID }
    }

    var hasItems: Bool { !items.isEmpty }
}

// In views - only re-renders when used properties change
struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        if appState.isLoading {
            ProgressView()
        } else {
            ItemList(items: appState.items)
        }
    }
}
```

### Two-Way Bindings

For binding to @Observable properties:

```swift
struct SettingsView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        @Bindable var appState = appState

        Form {
            TextField("Username", text: $appState.username)
            Toggle("Notifications", isOn: $appState.notificationsEnabled)
        }
    }
}
```

### State Decision Tree

**@State** - View-local UI state
- Toggle expanded/collapsed
- Text field content
- Sheet presentation

```swift
struct ItemRow: View {
    @State private var isExpanded = false

    var body: some View {
        VStack {
            // ...
        }
    }
}
```

**@Observable in Environment** - Shared app state
- User session
- Navigation state
- Feature flags

```swift
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
```

**@Query** - SwiftData persistence
- Database entities
- Filtered/sorted queries

```swift
struct ItemList: View {
    @Query(sort: \Item.createdAt, order: .reverse)
    private var items: [Item]

    var body: some View {
        List(items) { item in
            ItemRow(item: item)
        }
    }
}
```

## Dependency Injection

### Environment Keys

Define environment keys for testable dependencies:

```swift
// Protocol for testability
protocol NetworkServiceProtocol {
    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T
}

// Live implementation
class LiveNetworkService: NetworkServiceProtocol {
    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        // Real implementation
    }
}

// Mock for testing
class MockNetworkService: NetworkServiceProtocol {
    var mockResult: Any?
    var mockError: Error?

    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        if let error = mockError { throw error }
        return mockResult as! T
    }
}

// Environment key
struct NetworkServiceKey: EnvironmentKey {
    static let defaultValue: NetworkServiceProtocol = LiveNetworkService()
}

extension EnvironmentValues {
    var networkService: NetworkServiceProtocol {
        get { self[NetworkServiceKey.self] }
        set { self[NetworkServiceKey.self] = newValue }
    }
}

// Inject at app level
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.networkService, LiveNetworkService())
        }
    }
}

// Use in views
struct ItemList: View {
    @Environment(\.networkService) private var networkService

    var body: some View {
        // ...
    }

    func loadItems() async {
        let items: [Item] = try await networkService.fetch(.items)
    }
}
```

### Dependency Container

For complex apps with many dependencies:

```swift
@Observable
class AppDependencies {
    let network: NetworkServiceProtocol
    let storage: StorageServiceProtocol
    let purchases: PurchaseServiceProtocol
    let analytics: AnalyticsServiceProtocol

    init(
        network: NetworkServiceProtocol = LiveNetworkService(),
        storage: StorageServiceProtocol = LiveStorageService(),
        purchases: PurchaseServiceProtocol = LivePurchaseService(),
        analytics: AnalyticsServiceProtocol = LiveAnalyticsService()
    ) {
        self.network = network
        self.storage = storage
        self.purchases = purchases
        self.analytics = analytics
    }

    // Convenience for testing
    static func mock() -> AppDependencies {
        AppDependencies(
            network: MockNetworkService(),
            storage: MockStorageService(),
            purchases: MockPurchaseService(),
            analytics: MockAnalyticsService()
        )
    }
}

// Inject as single environment object
@main
struct MyApp: App {
    @State private var dependencies = AppDependencies()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(dependencies)
        }
    }
}
```

## View Models (When Needed)

For views with significant logic, use a view-local model:

```swift
struct ItemDetailScreen: View {
    let itemID: UUID
    @State private var viewModel: ItemDetailViewModel

    init(itemID: UUID) {
        self.itemID = itemID
        self._viewModel = State(initialValue: ItemDetailViewModel(itemID: itemID))
    }

    var body: some View {
        Form {
            if viewModel.isLoading {
                ProgressView()
            } else if let item = viewModel.item {
                ItemContent(item: item)
            }
        }
        .task {
            await viewModel.load()
        }
    }
}

@Observable
class ItemDetailViewModel {
    let itemID: UUID
    var item: Item?
    var isLoading = false
    var error: Error?

    init(itemID: UUID) {
        self.itemID = itemID
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            item = try await fetchItem(id: itemID)
        } catch {
            self.error = error
        }
    }

    func save() async {
        // Save logic
    }
}
```

## Coordinator Pattern

For complex navigation flows:

```swift
@Observable
class OnboardingCoordinator {
    var currentStep: OnboardingStep = .welcome
    var isComplete = false

    enum OnboardingStep {
        case welcome
        case permissions
        case personalInfo
        case complete
    }

    func next() {
        switch currentStep {
        case .welcome:
            currentStep = .permissions
        case .permissions:
            currentStep = .personalInfo
        case .personalInfo:
            currentStep = .complete
            isComplete = true
        case .complete:
            break
        }
    }

    func back() {
        switch currentStep {
        case .welcome:
            break
        case .permissions:
            currentStep = .welcome
        case .personalInfo:
            currentStep = .permissions
        case .complete:
            currentStep = .personalInfo
        }
    }
}

struct OnboardingFlow: View {
    @State private var coordinator = OnboardingCoordinator()

    var body: some View {
        Group {
            switch coordinator.currentStep {
            case .welcome:
                WelcomeView(onContinue: coordinator.next)
            case .permissions:
                PermissionsView(onContinue: coordinator.next, onBack: coordinator.back)
            case .personalInfo:
                PersonalInfoView(onContinue: coordinator.next, onBack: coordinator.back)
            case .complete:
                CompletionView()
            }
        }
        .animation(.default, value: coordinator.currentStep)
    }
}
```

## Error Handling

### Structured Error Types

```swift
enum AppError: LocalizedError {
    case networkError(NetworkError)
    case storageError(StorageError)
    case validationError(String)
    case unauthorized
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .networkError(let error):
            return error.localizedDescription
        case .storageError(let error):
            return error.localizedDescription
        case .validationError(let message):
            return message
        case .unauthorized:
            return "Please sign in to continue"
        case .unknown(let error):
            return error.localizedDescription
        }
    }

    var recoverySuggestion: String? {
        switch self {
        case .networkError:
            return "Check your internet connection and try again"
        case .unauthorized:
            return "Tap to sign in"
        default:
            return nil
        }
    }
}

enum NetworkError: LocalizedError {
    case noConnection
    case timeout
    case serverError(Int)
    case decodingError

    var errorDescription: String? {
        switch self {
        case .noConnection:
            return "No internet connection"
        case .timeout:
            return "Request timed out"
        case .serverError(let code):
            return "Server error (\(code))"
        case .decodingError:
            return "Invalid response from server"
        }
    }
}
```

### Error Presentation

```swift
struct ContentView: View {
    @Environment(AppState.self) private var appState

    var body: some View {
        NavigationStack {
            // Content
        }
        .alert(
            "Error",
            isPresented: Binding(
                get: { appState.error != nil },
                set: { if !$0 { appState.error = nil } }
            ),
            presenting: appState.error
        ) { error in
            Button("OK") { }
            if error.recoverySuggestion != nil {
                Button("Retry") {
                    Task { await retry() }
                }
            }
        } message: { error in
            VStack {
                Text(error.localizedDescription)
                if let suggestion = error.recoverySuggestion {
                    Text(suggestion)
                        .font(.caption)
                }
            }
        }
    }
}
```

## Testing Architecture

### Unit Testing with Mocks

```swift
@Test
func testLoadItems() async throws {
    // Arrange
    let mockNetwork = MockNetworkService()
    mockNetwork.mockResult = [Item(name: "Test")]

    let viewModel = ItemListViewModel(networkService: mockNetwork)

    // Act
    await viewModel.load()

    // Assert
    #expect(viewModel.items.count == 1)
    #expect(viewModel.items[0].name == "Test")
    #expect(viewModel.isLoading == false)
}

@Test
func testLoadItemsError() async throws {
    // Arrange
    let mockNetwork = MockNetworkService()
    mockNetwork.mockError = NetworkError.noConnection

    let viewModel = ItemListViewModel(networkService: mockNetwork)

    // Act
    await viewModel.load()

    // Assert
    #expect(viewModel.items.isEmpty)
    #expect(viewModel.error != nil)
}
```

### Preview with Dependencies

```swift
#Preview {
    ContentView()
        .environment(AppDependencies.mock())
        .environment(AppState())
}
```
