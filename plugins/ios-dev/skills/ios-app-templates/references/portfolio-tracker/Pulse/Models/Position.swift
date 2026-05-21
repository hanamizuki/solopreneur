import Foundation

struct Position: Identifiable, Hashable {
    var id: String { ticker }
    let ticker: String
    let assetType: AssetType
    let totalQuantity: Decimal
    let avgCost: Decimal
    let totalCostBasis: Decimal
    let currentPrice: Decimal
    let currentValue: Decimal
    let unrealizedPnL: Decimal
    let unrealizedPnLPct: Double
}
