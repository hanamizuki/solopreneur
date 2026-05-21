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

    static func save(_ value: String, slot: KeychainSlot) {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: slot.rawValue
        ]
        SecItemDelete(query as CFDictionary)
        let attrs = query.merging([kSecValueData as String: data]) { _, b in b }
        SecItemAdd(attrs as CFDictionary, nil)
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
        return str
    }
}
