import Foundation
import SwiftData

@Model
final class AICache {
    // Composite key: <assetType>|<TICKER>|YYYY-MM-DD. The assetType
    // prefix prevents a crypto "X" and a stock "X" from clobbering each
    // other's daily commentary cache.
    @Attribute(.unique) var key: String
    var ticker: String
    var assetTypeRaw: String
    var dayKey: String
    var commentary: String
    var createdAt: Date

    init(ticker: String, assetType: AssetType, dayKey: String, commentary: String) {
        self.key = "\(assetType.rawValue)|\(ticker)|\(dayKey)"
        self.ticker = ticker
        self.assetTypeRaw = assetType.rawValue
        self.dayKey = dayKey
        self.commentary = commentary
        self.createdAt = Date()
    }
}
