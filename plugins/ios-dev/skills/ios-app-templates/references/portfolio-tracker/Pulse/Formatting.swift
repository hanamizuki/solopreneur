import Foundation

enum Formatting {
    static func usd(_ d: Decimal) -> String {
        let nf = NumberFormatter()
        nf.numberStyle = .currency
        nf.currencyCode = "USD"
        nf.maximumFractionDigits = 0
        return nf.string(from: d as NSDecimalNumber) ?? "$0"
    }
}
