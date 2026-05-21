import Foundation

enum Formatting {
    static func usd(_ d: Decimal) -> String {
        let nf = NumberFormatter()
        nf.numberStyle = .currency
        nf.currencyCode = "USD"
        nf.maximumFractionDigits = 0
        return nf.string(from: d as NSDecimalNumber) ?? "$0"
    }

    /// "1.23456789 顆" for crypto, "10 股" for stock.
    /// Centralized here so the qty-with-unit string isn't duplicated
    /// across HoldingRow, AssetDetailView, AIClient.
    static func quantity(_ value: Decimal, type: AssetType) -> String {
        let nf = NumberFormatter()
        nf.maximumFractionDigits = type == .crypto ? 8 : 0
        nf.minimumFractionDigits = 0
        let num = nf.string(from: value as NSDecimalNumber) ?? "0"
        return num + (type == .stock ? " 股" : " 顆")
    }
}
