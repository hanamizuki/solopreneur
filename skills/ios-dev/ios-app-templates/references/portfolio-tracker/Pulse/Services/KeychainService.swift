import Foundation
import Security

enum KeychainSlot: String, CaseIterable {
    case anthropic = "anthropic"
    case finnhub = "finnhub"
    case coingecko = "coingecko"
}

enum KeychainService {
    // Derived from the host app's bundle ID so multiple apps using this
    // pattern never collide in the shared keychain.
    private static let service = Bundle.main.bundleIdentifier ?? "app.unknown"

    /// Saves the value into the Keychain for the given slot. Returns
    /// `true` on success so callers can surface a real failure (rare but
    /// possible — e.g. corrupt keychain after restore) instead of
    /// silently flipping their "ready" flag.
    ///
    /// Uses `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` so the
    /// stored secret is **not** synced via iCloud Keychain and **not**
    /// copied into device backups that could be restored to another
    /// device. API keys belong on the device they were pasted into.
    @discardableResult
    static func save(_ value: String, slot: KeychainSlot) -> Bool {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: slot.rawValue
        ]
        SecItemDelete(query as CFDictionary)
        let attrs = query.merging([
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]) { _, b in b }
        let status = SecItemAdd(attrs as CFDictionary, nil)
        return status == errSecSuccess
    }

    static func load(_ slot: KeychainSlot) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: slot.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data,
              let str = String(data: data, encoding: .utf8)
        else { return nil }
        // Trim defensively so any code path that wrote without going
        // through OnboardingView still produces an auth-clean value.
        return str.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
