# Networking

URLSession patterns, caching, authentication, and offline support.

## Basic Networking Service

```swift
actor NetworkService {
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(session: URLSession = .shared) {
        self.session = session

        self.decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        self.encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.keyEncodingStrategy = .convertToSnakeCase
    }

    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        let request = try endpoint.urlRequest()
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            throw NetworkError.httpError(httpResponse.statusCode, data)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw NetworkError.decodingError(error)
        }
    }

    func send<T: Encodable, R: Decodable>(_ body: T, to endpoint: Endpoint) async throws -> R {
        var request = try endpoint.urlRequest()
        request.httpBody = try encoder.encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            throw NetworkError.httpError(httpResponse.statusCode, data)
        }

        return try decoder.decode(R.self, from: data)
    }
}

enum NetworkError: LocalizedError {
    case invalidURL
    case invalidResponse
    case httpError(Int, Data)
    case decodingError(Error)
    case noConnection
    case timeout

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .invalidResponse:
            return "Invalid server response"
        case .httpError(let code, _):
            return "Server error (\(code))"
        case .decodingError:
            return "Failed to parse response"
        case .noConnection:
            return "No internet connection"
        case .timeout:
            return "Request timed out"
        }
    }
}
```

## Endpoint Pattern

```swift
enum Endpoint {
    case items
    case item(id: String)
    case createItem
    case updateItem(id: String)
    case deleteItem(id: String)
    case search(query: String, page: Int)

    var baseURL: URL {
        URL(string: "https://api.example.com/v1")!
    }

    var path: String {
        switch self {
        case .items, .createItem:
            return "/items"
        case .item(let id), .updateItem(let id), .deleteItem(let id):
            return "/items/\(id)"
        case .search:
            return "/search"
        }
    }

    var method: String {
        switch self {
        case .items, .item, .search:
            return "GET"
        case .createItem:
            return "POST"
        case .updateItem:
            return "PUT"
        case .deleteItem:
            return "DELETE"
        }
    }

    var queryItems: [URLQueryItem]? {
        switch self {
        case .search(let query, let page):
            return [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "page", value: String(page))
            ]
        default:
            return nil
        }
    }

    func urlRequest() throws -> URLRequest {
        var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: true)
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw NetworkError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        return request
    }
}
```

## Authentication

### Bearer Token

```swift
actor AuthenticatedNetworkService {
    private let session: URLSession
    private let tokenProvider: TokenProvider

    init(tokenProvider: TokenProvider) {
        self.session = .shared
        self.tokenProvider = tokenProvider
    }

    func fetch<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        var request = try endpoint.urlRequest()

        // Add auth header
        let token = try await tokenProvider.validToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NetworkError.invalidResponse
        }

        // Handle 401 - token expired
        if httpResponse.statusCode == 401 {
            // Refresh token and retry
            let newToken = try await tokenProvider.refreshToken()
            request.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
            let (retryData, retryResponse) = try await session.data(for: request)

            guard let retryHttpResponse = retryResponse as? HTTPURLResponse,
                  200..<300 ~= retryHttpResponse.statusCode else {
                throw NetworkError.unauthorized
            }

            return try JSONDecoder().decode(T.self, from: retryData)
        }

        guard 200..<300 ~= httpResponse.statusCode else {
            throw NetworkError.httpError(httpResponse.statusCode, data)
        }

        return try JSONDecoder().decode(T.self, from: data)
    }
}

protocol TokenProvider {
    func validToken() async throws -> String
    func refreshToken() async throws -> String
}
```

### OAuth 2.0 Flow

```swift
import AuthenticationServices

class OAuthService: NSObject {
    func signIn() async throws -> String {
        let authURL = URL(string: "https://auth.example.com/authorize?client_id=xxx&redirect_uri=myapp://callback&response_type=code")!

        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "myapp"
            ) { callbackURL, error in
                if let error = error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let callbackURL = callbackURL,
                      let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "code" })?.value else {
                    continuation.resume(throwing: OAuthError.invalidCallback)
                    return
                }

                continuation.resume(returning: code)
            }

            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            session.start()
        }
    }
}

extension OAuthService: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }!
    }
}
```

## Caching

### URLCache Configuration

```swift
class CachedNetworkService {
    private let session: URLSession

    init() {
        let cache = URLCache(
            memoryCapacity: 50 * 1024 * 1024,  // 50 MB memory
            diskCapacity: 200 * 1024 * 1024     // 200 MB disk
        )

        let config = URLSessionConfiguration.default
        config.urlCache = cache
        config.requestCachePolicy = .returnCacheDataElseLoad

        self.session = URLSession(configuration: config)
    }

    func fetch<T: Decodable>(_ endpoint: Endpoint, cachePolicy: URLRequest.CachePolicy = .useProtocolCachePolicy) async throws -> T {
        var request = try endpoint.urlRequest()
        request.cachePolicy = cachePolicy

        let (data, _) = try await session.data(for: request)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func fetchFresh<T: Decodable>(_ endpoint: Endpoint) async throws -> T {
        try await fetch(endpoint, cachePolicy: .reloadIgnoringLocalCacheData)
    }
}
```

### Custom Caching

```swift
actor DataCache {
    private var cache: [String: CachedItem] = [:]
    private let maxAge: TimeInterval

    struct CachedItem {
        let data: Data
        let timestamp: Date
    }

    init(maxAge: TimeInterval = 300) {
        self.maxAge = maxAge
    }

    func get(_ key: String) -> Data? {
        guard let item = cache[key] else { return nil }
        guard Date().timeIntervalSince(item.timestamp) < maxAge else {
            cache.removeValue(forKey: key)
            return nil
        }
        return item.data
    }

    func set(_ data: Data, for key: String) {
        cache[key] = CachedItem(data: data, timestamp: Date())
    }

    func invalidate(_ key: String) {
        cache.removeValue(forKey: key)
    }

    func clearAll() {
        cache.removeAll()
    }
}
```

## Offline Support

### Network Monitor

```swift
import Network

@Observable
class NetworkMonitor {
    var isConnected = true
    var connectionType: ConnectionType = .wifi

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "NetworkMonitor")

    enum ConnectionType {
        case wifi, cellular, unknown
    }

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                self?.isConnected = path.status == .satisfied
                self?.connectionType = self?.getConnectionType(path) ?? .unknown
            }
        }
        monitor.start(queue: queue)
    }

    private func getConnectionType(_ path: NWPath) -> ConnectionType {
        if path.usesInterfaceType(.wifi) {
            return .wifi
        } else if path.usesInterfaceType(.cellular) {
            return .cellular
        }
        return .unknown
    }

    deinit {
        monitor.cancel()
    }
}
```

### Offline-First Pattern

```swift
actor OfflineFirstService {
    private let network: NetworkService
    private let storage: StorageService
    private let cache: DataCache

    func fetchItems() async throws -> [Item] {
        // Try cache first
        if let cached = await cache.get("items"),
           let items = try? JSONDecoder().decode([Item].self, from: cached) {
            // Return cached, fetch fresh in background
            Task {
                try? await fetchAndCacheFresh()
            }
            return items
        }

        // Try network
        do {
            let items: [Item] = try await network.fetch(.items)
            await cache.set(try JSONEncoder().encode(items), for: "items")
            return items
        } catch {
            // Fall back to storage
            return try await storage.loadItems()
        }
    }

    private func fetchAndCacheFresh() async throws {
        let items: [Item] = try await network.fetch(.items)
        await cache.set(try JSONEncoder().encode(items), for: "items")
        try await storage.saveItems(items)
    }
}
```

### Pending Operations Queue

```swift
actor PendingOperationsQueue {
    private var operations: [PendingOperation] = []
    private let storage: StorageService

    struct PendingOperation: Codable {
        let id: UUID
        let endpoint: String
        let method: String
        let body: Data?
        let createdAt: Date
    }

    func add(_ operation: PendingOperation) async {
        operations.append(operation)
        try? await persist()
    }

    func processAll() async {
        for operation in operations {
            do {
                try await execute(operation)
                operations.removeAll { $0.id == operation.id }
            } catch {
                // Keep in queue for retry
                continue
            }
        }
        try? await persist()
    }

    private func execute(_ operation: PendingOperation) async throws {
        // Execute network request
    }

    private func persist() async throws {
        try await storage.savePendingOperations(operations)
    }
}
```

## Multipart Upload

```swift
extension NetworkService {
    func upload(_ fileData: Data, filename: String, mimeType: String, to endpoint: Endpoint) async throws -> UploadResponse {
        let boundary = UUID().uuidString
        var request = try endpoint.urlRequest()
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              200..<300 ~= httpResponse.statusCode else {
            throw NetworkError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0, data)
        }

        return try JSONDecoder().decode(UploadResponse.self, from: data)
    }
}
```

## Download with Progress

```swift
class DownloadService: NSObject, URLSessionDownloadDelegate {
    private lazy var session: URLSession = {
        URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }()

    private var progressHandler: ((Double) -> Void)?
    private var completionHandler: ((Result<URL, Error>) -> Void)?

    func download(from url: URL, progress: @escaping (Double) -> Void) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            self.progressHandler = progress
            self.completionHandler = { result in
                continuation.resume(with: result)
            }
            session.downloadTask(with: url).resume()
        }
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        completionHandler?(.success(location))
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        DispatchQueue.main.async {
            self.progressHandler?(progress)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            completionHandler?(.failure(error))
        }
    }
}
```
