import Foundation

enum Formatting {
    /// USD currency, no fraction digits. Uses the iOS 15+ `.formatted()`
    /// API on `Decimal` so we don't allocate a NumberFormatter on every
    /// call (Dashboard renders this once per row on every refresh).
    static func usd(_ d: Decimal) -> String {
        d.formatted(.currency(code: "USD").precision(.fractionLength(0)))
    }

    /// "1.23456789 顆" for crypto, "10 股" for stock.
    /// Centralized here so the qty-with-unit string isn't duplicated
    /// across HoldingRow, AssetDetailView, AIClient. Uses the iOS 15+
    /// `.formatted()` API to avoid per-call NumberFormatter allocation.
    static func quantity(_ value: Decimal, type: AssetType) -> String {
        let maxFraction = type == .crypto ? 8 : 0
        let num = value.formatted(
            .number.precision(.fractionLength(0...maxFraction))
        )
        return num + (type == .stock ? " 股" : " 顆")
    }
}
