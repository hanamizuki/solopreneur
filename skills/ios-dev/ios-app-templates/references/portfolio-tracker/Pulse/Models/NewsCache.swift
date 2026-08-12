import Foundation
import SwiftData

@Model
final class NewsCache {
    // Composite key: <assetType>|<TICKER>|YYYY-MM-DD. Same rationale as
    // AICache — prevents crypto/stock symbol collisions in the cache.
    @Attribute(.unique) var key: String
    var ticker: String
    var assetTypeRaw: String
    var dayKey: String
    var payload: Data    // JSON-encoded [NewsArticle]
    var createdAt: Date

    init(ticker: String, assetType: AssetType, dayKey: String, payload: Data) {
        self.key = "\(assetType.rawValue)|\(ticker)|\(dayKey)"
        self.ticker = ticker
        self.assetTypeRaw = assetType.rawValue
        self.dayKey = dayKey
        self.payload = payload
        self.createdAt = Date()
    }
}
