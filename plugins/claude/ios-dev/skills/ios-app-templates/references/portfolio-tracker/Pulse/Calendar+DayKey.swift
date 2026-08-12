import Foundation

extension Calendar {
    /// Cached so we don't allocate a DateFormatter on every cache check
    /// (AssetDetailView re-evaluates this on every refresh).
    private static let dayKeyFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone.current
        return df
    }()

    /// YYYY-MM-DD string in the current timezone — used as the daily
    /// cache bucket for AI commentary and news fetches.
    static func todayKey() -> String {
        dayKeyFormatter.string(from: Date())
    }
}
