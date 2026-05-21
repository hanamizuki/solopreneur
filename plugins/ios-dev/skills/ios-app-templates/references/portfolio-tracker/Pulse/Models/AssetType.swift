import Foundation

enum AssetType: String, Codable, CaseIterable, Identifiable {
    case crypto, stock
    var id: String { rawValue }
    var label: String { self == .crypto ? "Crypto" : "Stock" }
}
