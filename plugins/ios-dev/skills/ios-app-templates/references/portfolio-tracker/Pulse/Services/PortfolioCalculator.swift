import Foundation

enum PortfolioCalculator {
    /// Weighted-average cost basis. Buy-only MVP — same result as FIFO in this scenario.
    static func position(
        ticker: String,
        assetType: AssetType,
        transactions: [Transaction],
        currentPrice: Decimal
    ) -> Position? {
        let txs = transactions.filter { $0.ticker == ticker && $0.assetType == assetType }
        guard !txs.isEmpty else { return nil }

        let totalQty = txs.reduce(Decimal(0)) { $0 + $1.quantity }
        let totalCost = txs.reduce(Decimal(0)) { $0 + ($1.quantity * $1.purchasePrice) }
        let avgCost = totalQty > 0 ? totalCost / totalQty : 0
        let currentValue = totalQty * currentPrice
        let pnl = currentValue - totalCost
        let pnlPct: Double = totalCost > 0
            ? NSDecimalNumber(decimal: pnl / totalCost).doubleValue
            : 0

        return Position(
            ticker: ticker,
            assetType: assetType,
            totalQuantity: totalQty,
            avgCost: avgCost,
            totalCostBasis: totalCost,
            currentPrice: currentPrice,
            currentValue: currentValue,
            unrealizedPnL: pnl,
            unrealizedPnLPct: pnlPct
        )
    }

    /// Sorted by currentValue desc to match Dashboard ordering rule.
    ///
    /// `prices` is keyed by "<assetType.rawValue>|<TICKER>" so that the
    /// same symbol on different markets (e.g. crypto X vs stock X) gets
    /// the correct price. Positions whose price is missing are SKIPPED
    /// rather than rendered as -100% PnL — a fetch failure shouldn't
    /// look like a catastrophic loss on stage.
    static func positions(
        from transactions: [Transaction],
        prices: [String: Decimal]
    ) -> [Position] {
        struct Key: Hashable { let ticker: String; let assetType: AssetType }
        var seen: Set<Key> = []
        var ordered: [Key] = []
        for tx in transactions {
            let key = Key(ticker: tx.ticker, assetType: tx.assetType)
            if seen.insert(key).inserted { ordered.append(key) }
        }
        return ordered
            .compactMap { key -> Position? in
                let priceKey = "\(key.assetType.rawValue)|\(key.ticker)"
                guard let price = prices[priceKey] else { return nil }
                return position(
                    ticker: key.ticker,
                    assetType: key.assetType,
                    transactions: transactions,
                    currentPrice: price
                )
            }
            .sorted { $0.currentValue > $1.currentValue }
    }
}
