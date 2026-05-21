import Foundation

struct Position: Identifiable, Hashable {
    // Composite id: a symbol like "X" can exist on both Crypto and Stock
    // and must NOT collapse into a single position. Keying by ticker
    // alone caused that collision in the previous version.
    var id: String { "\(assetType.rawValue)|\(ticker)" }
    let ticker: String
    let assetType: AssetType
    let totalQuantity: Decimal
    let avgCost: Decimal
    let totalCostBasis: Decimal
    let currentPrice: Decimal
    let currentValue: Decimal
    let unrealizedPnL: Decimal
    let unrealizedPnLPct: Double

    // Identity for SwiftUI navigation lives in (ticker, assetType) only.
    // The synthesized Hashable would include currentPrice and friends,
    // which causes `.navigationDestination(for: Position.self)` to see
    // a NEW hashable value every price refresh and blow away the
    // navigation path mid-render.
    static func == (lhs: Position, rhs: Position) -> Bool {
        lhs.ticker == rhs.ticker && lhs.assetType == rhs.assetType
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(ticker)
        hasher.combine(assetType)
    }
}
