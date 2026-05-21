import Foundation

enum PortfolioCalculator {
    /// Weighted-average cost basis. Buy-only MVP — same result as FIFO in this scenario.
    static func position(
        ticker: String,
        transactions: [Transaction],
        currentPrice: Decimal
    ) -> Position? {
        let txs = transactions.filter { $0.ticker == ticker }
        guard let first = txs.first else { return nil }

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
            assetType: first.assetType,
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
    static func positions(
        from transactions: [Transaction],
        prices: [String: Decimal]
    ) -> [Position] {
        let tickers = Set(transactions.map(\.ticker))
        return tickers
            .compactMap { ticker -> Position? in
                let price = prices[ticker] ?? 0
                return position(ticker: ticker, transactions: transactions, currentPrice: price)
            }
            .sorted { $0.currentValue > $1.currentValue }
    }
}
