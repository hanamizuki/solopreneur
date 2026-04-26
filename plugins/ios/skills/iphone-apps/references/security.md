# Security

Keychain, secure storage, biometrics, and secure coding practices.

## Keychain

### KeychainService

```swift
import Security

class KeychainService {
    enum KeychainError: Error {
        case saveFailed(OSStatus)
        case loadFailed(OSStatus)
        case deleteFailed(OSStatus)
        case dataConversionError
        case itemNotFound
    }

    private let service: String

    init(service: String = Bundle.main.bundleIdentifier ?? "app") {
        self.service = service
    }

    // MARK: - Data

    func save(_ data: Data, for key: String, accessibility: CFString = kSecAttrAccessibleWhenUnlocked) throws {
        // Delete existing
        try? delete(key)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: accessibility
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }

    func load(_ key: String) throws -> Data {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status != errSecItemNotFound else {
            throw KeychainError.itemNotFound
        }

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
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]

        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.deleteFailed(status)
        }
    }

    // MARK: - Convenience

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

    func saveCodable<T: Codable>(_ value: T, for key: String) throws {
        let data = try JSONEncoder().encode(value)
        try save(data, for: key)
    }

    func loadCodable<T: Codable>(_ type: T.Type, for key: String) throws -> T {
        let data = try load(key)
        return try JSONDecoder().decode(type, from: data)
    }
}
```

### Accessibility Options

```swift
// Available when unlocked
kSecAttrAccessibleWhenUnlocked

// Available when unlocked, not backed up
kSecAttrAccessibleWhenUnlockedThisDeviceOnly

// Available after first unlock (background access)
kSecAttrAccessibleAfterFirstUnlock

// Always available (not recommended)
kSecAttrAccessibleAlways
```

## Biometric Authentication

### Local Authentication

```swift
import LocalAuthentication

class BiometricService {
    enum BiometricType {
        case none, touchID, faceID
    }

    var biometricType: BiometricType {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return .none
        }

        switch context.biometryType {
        case .touchID:
            return .touchID
        case .faceID:
            return .faceID
        default:
            return .none
        }
    }

    func authenticate(reason: String) async -> Bool {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            return false
        }

        do {
            return try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: reason
            )
        } catch {
            return false
        }
    }

    func authenticateWithFallback(reason: String) async -> Bool {
        let context = LAContext()

        do {
            // Try biometrics first, fall back to passcode
            return try await context.evaluatePolicy(
                .deviceOwnerAuthentication,  // Includes passcode fallback
                localizedReason: reason
            )
        } catch {
            return false
        }
    }
}
```

### Biometric-Protected Keychain

```swift
extension KeychainService {
    func saveBiometricProtected(_ data: Data, for key: String) throws {
        try? delete(key)

        var error: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .biometryCurrentSet,  // Invalidate if biometrics change
            &error
        ) else {
            throw error!.takeRetainedValue()
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessControl as String: access
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed(status)
        }
    }

    func loadBiometricProtected(_ key: String, prompt: String) throws -> Data {
        let context = LAContext()
        context.localizedReason = prompt

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecUseAuthenticationContext as String: context
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            throw KeychainError.loadFailed(status)
        }

        return data
    }
}
```

## Secure Network Communication

### Certificate Pinning

```swift
class PinnedURLSessionDelegate: NSObject, URLSessionDelegate {
    private let pinnedCertificates: [SecCertificate]

    init(certificates: [SecCertificate]) {
        self.pinnedCertificates = certificates
    }

    func urlSession(
        _ session: URLSession,
        didReceive challenge: URLAuthenticationChallenge
    ) async -> (URLSession.AuthChallengeDisposition, URLCredential?) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            return (.cancelAuthenticationChallenge, nil)
        }

        // Get server certificate
        guard let serverCertificate = SecTrustCopyCertificateChain(serverTrust)?
                .first else {
            return (.cancelAuthenticationChallenge, nil)
        }

        // Compare with pinned certificates
        let serverCertData = SecCertificateCopyData(serverCertificate) as Data

        for pinnedCert in pinnedCertificates {
            let pinnedCertData = SecCertificateCopyData(pinnedCert) as Data
            if serverCertData == pinnedCertData {
                let credential = URLCredential(trust: serverTrust)
                return (.useCredential, credential)
            }
        }

        return (.cancelAuthenticationChallenge, nil)
    }
}
```

### App Transport Security

In Info.plist (avoid if possible):
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>legacy-api.example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
            <key>NSExceptionMinimumTLSVersion</key>
            <string>TLSv1.2</string>
        </dict>
    </dict>
</dict>
```

## Data Protection

### File Protection

```swift
// Protect files on disk
let fileURL = documentsDirectory.appendingPathComponent("sensitive.dat")
try data.write(to: fileURL, options: .completeFileProtection)

// Check protection class
let attributes = try FileManager.default.attributesOfItem(atPath: fileURL.path)
let protection = attributes[.protectionKey] as? FileProtectionType
```

### In-Memory Sensitive Data

```swift
// Clear sensitive data when done
var password = "secret"
defer {
    password.removeAll()  // Clear from memory
}

// For arrays
var sensitiveBytes = [UInt8](repeating: 0, count: 32)
defer {
    sensitiveBytes.withUnsafeMutableBytes { ptr in
        memset_s(ptr.baseAddress, ptr.count, 0, ptr.count)
    }
}
```

## Secure Coding Practices

### Input Validation

```swift
func processInput(_ input: String) throws -> String {
    // Validate length
    guard input.count <= 1000 else {
        throw ValidationError.tooLong
    }

    // Sanitize HTML
    let sanitized = input
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")

    // Validate format if needed
    guard isValidFormat(sanitized) else {
        throw ValidationError.invalidFormat
    }

    return sanitized
}
```

### SQL Injection Prevention

With SwiftData/Core Data, use predicates:
```swift
// Safe - parameterized
let predicate = #Predicate<Item> { $0.name == searchTerm }

// Never do this
// let sql = "SELECT * FROM items WHERE name = '\(searchTerm)'"
```

### Avoid Logging Sensitive Data

```swift
func authenticate(username: String, password: String) async throws {
    // Bad
    // print("Authenticating \(username) with password \(password)")

    // Good
    print("Authenticating user: \(username)")

    // Use OSLog with privacy
    import os
    let logger = Logger(subsystem: "com.app", category: "auth")
    logger.info("Authenticating user: \(username, privacy: .public)")
    logger.debug("Password length: \(password.count)")  // Length only, never value
}
```

## Jailbreak Detection

```swift
class SecurityChecker {
    func isDeviceCompromised() -> Bool {
        // Check for common jailbreak files
        let suspiciousPaths = [
            "/Applications/Cydia.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/private/var/lib/apt/"
        ]

        for path in suspiciousPaths {
            if FileManager.default.fileExists(atPath: path) {
                return true
            }
        }

        // Check if can write outside sandbox
        let testPath = "/private/jailbreak_test.txt"
        do {
            try "test".write(toFile: testPath, atomically: true, encoding: .utf8)
            try FileManager.default.removeItem(atPath: testPath)
            return true
        } catch {
            // Expected - can't write outside sandbox
        }

        // Check for fork
        let forkResult = fork()
        if forkResult >= 0 {
            // Fork succeeded - jailbroken
            return true
        }

        return false
    }
}
```

## App Store Privacy

### Privacy Manifest

Create `PrivacyInfo.xcprivacy`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

### App Tracking Transparency

```swift
import AppTrackingTransparency

func requestTrackingPermission() async -> ATTrackingManager.AuthorizationStatus {
    await ATTrackingManager.requestTrackingAuthorization()
}

// Check before tracking
if ATTrackingManager.trackingAuthorizationStatus == .authorized {
    // Can use IDFA for tracking
}
```

## Security Checklist

### Data Storage
- [ ] Sensitive data in Keychain, not UserDefaults
- [ ] Appropriate Keychain accessibility
- [ ] File protection for sensitive files
- [ ] Clear sensitive data from memory

### Network
- [ ] HTTPS only (ATS)
- [ ] Certificate pinning for sensitive APIs
- [ ] Secure token storage
- [ ] No hardcoded secrets

### Authentication
- [ ] Biometric option available
- [ ] Secure session management
- [ ] Token refresh handling
- [ ] Logout clears all data

### Code
- [ ] Input validation
- [ ] No sensitive data in logs
- [ ] Parameterized queries
- [ ] No hardcoded credentials

### Privacy
- [ ] Privacy manifest complete
- [ ] ATT compliance
- [ ] Minimal data collection
- [ ] Clear privacy policy
