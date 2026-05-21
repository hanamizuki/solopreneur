import Foundation

extension Calendar {
    // YYYY-MM-DD string in the current timezone — used as the daily cache
    // bucket for AI commentary and news fetches.
    static func todayKey() -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone.current
        return df.string(from: Date())
    }
}
