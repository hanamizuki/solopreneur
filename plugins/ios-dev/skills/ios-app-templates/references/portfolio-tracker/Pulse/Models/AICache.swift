import Foundation
import SwiftData

@Model
final class AICache {
    @Attribute(.unique) var key: String  // ticker|YYYY-MM-DD
    var ticker: String
    var dayKey: String
    var commentary: String
    var createdAt: Date

    init(ticker: String, dayKey: String, commentary: String) {
        self.key = "\(ticker)|\(dayKey)"
        self.ticker = ticker
        self.dayKey = dayKey
        self.commentary = commentary
        self.createdAt = Date()
    }
}
