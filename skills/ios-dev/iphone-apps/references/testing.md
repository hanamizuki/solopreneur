# Testing

Unit tests, UI tests, snapshot tests, and testing patterns for iOS apps.

## Swift Testing (Xcode 16+)

### Basic Tests

```swift
import Testing
@testable import MyApp

@Suite("Item Tests")
struct ItemTests {
    @Test("Create item with name")
    func createItem() {
        let item = Item(name: "Test")
        #expect(item.name == "Test")
        #expect(item.isCompleted == false)
    }

    @Test("Toggle completion")
    func toggleCompletion() {
        var item = Item(name: "Test")
        item.isCompleted = true
        #expect(item.isCompleted == true)
    }
}
```

### Async Tests

```swift
@Test("Fetch items from network")
func fetchItems() async throws {
    let service = MockNetworkService()
    service.mockResult = [Item(name: "Test")]

    let viewModel = ItemListViewModel(networkService: service)
    await viewModel.load()

    #expect(viewModel.items.count == 1)
    #expect(viewModel.items[0].name == "Test")
}

@Test("Handle network error")
func handleNetworkError() async {
    let service = MockNetworkService()
    service.mockError = NetworkError.noConnection

    let viewModel = ItemListViewModel(networkService: service)
    await viewModel.load()

    #expect(viewModel.items.isEmpty)
    #expect(viewModel.error != nil)
}
```

### Parameterized Tests

```swift
@Test("Validate email", arguments: [
    ("test@example.com", true),
    ("invalid", false),
    ("@example.com", false),
    ("test@", false)
])
func validateEmail(email: String, expected: Bool) {
    let isValid = EmailValidator.isValid(email)
    #expect(isValid == expected)
}
```

### Test Lifecycle

```swift
@Suite("Database Tests")
struct DatabaseTests {
    let database: TestDatabase

    init() async throws {
        database = try await TestDatabase.create()
    }

    @Test func insertItem() async throws {
        try await database.insert(Item(name: "Test"))
        let items = try await database.fetchAll()
        #expect(items.count == 1)
    }
}
```

## XCTest (Traditional)

### Basic XCTest

```swift
import XCTest
@testable import MyApp

class ItemTests: XCTestCase {
    var sut: Item!

    override func setUp() {
        super.setUp()
        sut = Item(name: "Test")
    }

    override func tearDown() {
        sut = nil
        super.tearDown()
    }

    func testCreateItem() {
        XCTAssertEqual(sut.name, "Test")
        XCTAssertFalse(sut.isCompleted)
    }

    func testToggleCompletion() {
        sut.isCompleted = true
        XCTAssertTrue(sut.isCompleted)
    }
}
```

### Async XCTest

```swift
func testFetchItems() async throws {
    let service = MockNetworkService()
    service.mockResult = [Item(name: "Test")]

    let viewModel = ItemListViewModel(networkService: service)
    await viewModel.load()

    XCTAssertEqual(viewModel.items.count, 1)
}
```

## Mocking

### Protocol-Based Mocks

```swift
// Protocol
protocol NetworkServiceProtocol {
    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T
}

// Mock
class MockNetworkService: NetworkServiceProtocol {
    var mockResult: Any?
    var mockError: Error?
    var fetchCallCount = 0

    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        fetchCallCount += 1

        if let error = mockError {
            throw error
        }

        guard let result = mockResult as? T else {
            fatalError("Mock result type mismatch")
        }

        return result
    }
}
```

### Testing with Mocks

```swift
@Test func loadItemsCallsNetwork() async {
    let mock = MockNetworkService()
    mock.mockResult = [Item]()

    let viewModel = ItemListViewModel(networkService: mock)
    await viewModel.load()

    #expect(mock.fetchCallCount == 1)
}
```

## Testing SwiftUI Views

### View Tests with ViewInspector

```swift
import ViewInspector
@testable import MyApp

@Test func itemRowDisplaysName() throws {
    let item = Item(name: "Test Item")
    let view = ItemRow(item: item)

    let text = try view.inspect().hStack().text(0).string()
    #expect(text == "Test Item")
}
```

### Testing View Models

```swift
@Test func viewModelUpdatesOnSelection() async {
    let viewModel = ItemListViewModel()
    viewModel.items = [Item(name: "A"), Item(name: "B")]

    viewModel.select(viewModel.items[0])

    #expect(viewModel.selectedItem?.name == "A")
}
```

## UI Testing

### Basic UI Test

```swift
import XCTest

class MyAppUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["--uitesting"]
        app.launch()
    }

    func testAddItem() {
        // Tap add button
        app.buttons["Add"].tap()

        // Enter name
        let textField = app.textFields["Item name"]
        textField.tap()
        textField.typeText("New Item")

        // Save
        app.buttons["Save"].tap()

        // Verify
        XCTAssertTrue(app.staticTexts["New Item"].exists)
    }

    func testSwipeToDelete() {
        // Assume item exists
        let cell = app.cells["Item Row"].firstMatch

        // Swipe and delete
        cell.swipeLeft()
        app.buttons["Delete"].tap()

        // Verify
        XCTAssertFalse(cell.exists)
    }
}
```

### Accessibility Identifiers

```swift
struct ItemRow: View {
    let item: Item

    var body: some View {
        HStack {
            Text(item.name)
        }
        .accessibilityIdentifier("Item Row")
    }
}

struct NewItemView: View {
    @State private var name = ""

    var body: some View {
        TextField("Item name", text: $name)
            .accessibilityIdentifier("Item name")
    }
}
```

### Launch Arguments for Testing

```swift
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    if CommandLine.arguments.contains("--uitesting") {
                        // Use mock data
                        // Skip onboarding
                        // Clear state
                    }
                }
        }
    }
}
```

## Snapshot Testing

Using swift-snapshot-testing:

```swift
import SnapshotTesting
import XCTest
@testable import MyApp

class SnapshotTests: XCTestCase {
    func testItemRow() {
        let item = Item(name: "Test", subtitle: "Subtitle")
        let view = ItemRow(item: item)
            .frame(width: 375)

        assertSnapshot(of: view, as: .image)
    }

    func testItemRowDarkMode() {
        let item = Item(name: "Test", subtitle: "Subtitle")
        let view = ItemRow(item: item)
            .frame(width: 375)
            .preferredColorScheme(.dark)

        assertSnapshot(of: view, as: .image, named: "dark")
    }

    func testItemRowLargeText() {
        let item = Item(name: "Test", subtitle: "Subtitle")
        let view = ItemRow(item: item)
            .frame(width: 375)
            .environment(\.sizeCategory, .accessibilityExtraLarge)

        assertSnapshot(of: view, as: .image, named: "large-text")
    }
}
```

## Testing SwiftData

```swift
@Suite("SwiftData Tests")
struct SwiftDataTests {
    @Test func insertAndFetch() async throws {
        // In-memory container for testing
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: Item.self, configurations: config)
        let context = container.mainContext

        // Insert
        let item = Item(name: "Test")
        context.insert(item)
        try context.save()

        // Fetch
        let descriptor = FetchDescriptor<Item>()
        let items = try context.fetch(descriptor)

        #expect(items.count == 1)
        #expect(items[0].name == "Test")
    }
}
```

## Testing Network Calls

### Using URLProtocol

```swift
class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            fatalError("Handler not set")
        }

        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

@Test func fetchItemsReturnsData() async throws {
    // Configure mock
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    let session = URLSession(configuration: config)

    let mockItems = [Item(name: "Test")]
    let mockData = try JSONEncoder().encode(mockItems)

    MockURLProtocol.requestHandler = { request in
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: 200,
            httpVersion: nil,
            headerFields: nil
        )!
        return (response, mockData)
    }

    // Test
    let service = NetworkService(session: session)
    let items: [Item] = try await service.fetch(.items)

    #expect(items.count == 1)
}
```

## Test Helpers

### Factory Methods

```swift
extension Item {
    static func sample(
        name: String = "Sample",
        isCompleted: Bool = false,
        priority: Int = 0
    ) -> Item {
        Item(name: name, isCompleted: isCompleted, priority: priority)
    }

    static var samples: [Item] {
        [
            .sample(name: "First"),
            .sample(name: "Second", isCompleted: true),
            .sample(name: "Third", priority: 5)
        ]
    }
}
```

### Async Test Utilities

```swift
func waitForCondition(
    timeout: TimeInterval = 1.0,
    condition: @escaping () -> Bool
) async throws {
    let start = Date()
    while !condition() {
        if Date().timeIntervalSince(start) > timeout {
            throw TestError.timeout
        }
        try await Task.sleep(nanoseconds: 10_000_000) // 10ms
    }
}

enum TestError: Error {
    case timeout
}
```

## Running Tests from CLI

```bash
# Run all tests
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16'

# Run specific test
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -only-testing:MyAppTests/ItemTests

# With code coverage
xcodebuild test \
    -project MyApp.xcodeproj \
    -scheme MyApp \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    -enableCodeCoverage YES \
    -resultBundlePath TestResults.xcresult
```

## Best Practices

### Test Naming

```swift
// Describe what is being tested and expected outcome
@Test func itemListViewModel_load_setsItemsFromNetwork()
@Test func purchaseService_purchaseProduct_updatesEntitlements()
```

### Arrange-Act-Assert

```swift
@Test func toggleCompletion() {
    // Arrange
    var item = Item(name: "Test")

    // Act
    item.isCompleted.toggle()

    // Assert
    #expect(item.isCompleted == true)
}
```

### One Assertion Per Test

Focus each test on a single behavior:

```swift
// Good
@Test func loadSetsItems() async { ... }
@Test func loadSetsLoadingFalse() async { ... }
@Test func loadClearsError() async { ... }

// Avoid
@Test func loadWorks() async {
    // Too many assertions
}
```
