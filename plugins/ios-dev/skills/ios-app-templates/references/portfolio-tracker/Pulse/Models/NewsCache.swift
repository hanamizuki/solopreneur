import Foundation
import SwiftData

@Model
final class NewsCache {
    @Attribute(.unique) var key: String
    var ticker: String
    var dayKey: String
    var payload: Data    // JSON-encoded [NewsArticle]
    var createdAt: Date

    init(ticker: String, dayKey: String, payload: Data) {
        self.key = "\(ticker)|\(dayKey)"
        self.ticker = ticker
        self.dayKey = dayKey
        self.payload = payload
        self.createdAt = Date()
    }
}
