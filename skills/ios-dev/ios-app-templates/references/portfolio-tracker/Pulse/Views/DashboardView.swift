import SwiftUI
import SwiftData

struct DashboardView: View {
    @Query(sort: \Transaction.createdAt) private var transactions: [Transaction]

    // Keyed by "<assetType.rawValue>|<TICKER>" so the same symbol on
    // different markets doesn't collide.
    @State private var prices: [String: Decimal] = [:]
    @State private var showAdd = false

    var body: some View {
        // Compute once per body re-evaluation — `positions` derives from
        // @Query'd transactions plus @State prices, so reading it four
        // times in the same body would recompute the calculator four
        // times. Bind first, then use the local copy.
        let positions = PortfolioCalculator.positions(from: transactions, prices: prices)
        let totalValue = positions.reduce(Decimal(0)) { $0 + $1.currentValue }
        let totalPnL = positions.reduce(Decimal(0)) { $0 + $1.unrealizedPnL }
        let totalCost = positions.reduce(Decimal(0)) { $0 + $1.totalCostBasis }
        let totalPnLPct: Double = totalCost > 0
            ? NSDecimalNumber(decimal: totalPnL / totalCost).doubleValue
            : 0

        return NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    TotalAssetsCard(
                        totalValue: totalValue,
                        totalPnL: totalPnL,
                        totalPnLPct: totalPnLPct
                    )
                    .padding(.horizontal, 16)

                    if !positions.isEmpty {
                        Text("資產配置")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.gray)
                            .textCase(.uppercase)
                            .tracking(0.5)
                            .padding(.horizontal, 20)
                            .padding(.top, 6)
                        AllocationPieChart(positions: positions)
                            .padding(.horizontal, 16)
                    }

                    Text("持倉")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.gray)
                        .textCase(.uppercase)
                        .tracking(0.5)
                        .padding(.horizontal, 20)
                        .padding(.top, 10)

                    VStack(spacing: 0) {
                        ForEach(positions) { p in
                            NavigationLink(value: p) {
                                HoldingRow(position: p)
                                    .padding(.horizontal, 14)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if p.id != positions.last?.id {
                                Divider().background(Color(white: 0.14))
                            }
                        }
                    }
                    .background(Color(white: 0.09))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal, 16)
                }
                .padding(.vertical, 14)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Portfolio")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAdd = true } label: {
                        Image(systemName: "plus").foregroundStyle(.green)
                    }
                }
            }
            .sheet(isPresented: $showAdd) { AddTransactionView() }
            .navigationDestination(for: Position.self) { p in
                AssetDetailView(position: p)
            }
            .task { await loadPrices() }
            .refreshable { await loadPrices() }
            // PortfolioCalculator.positions skips any position whose
            // price is missing from the `prices` dict (so we don't show
            // misleading $0 / -100% PnL rows). That means a newly-added
            // transaction would silently vanish from the dashboard until
            // the user manually pulled to refresh, because the new
            // ticker has no entry in `prices` yet. Reload prices whenever
            // the @Query'd transactions array changes — covers add /
            // edit / delete from AddTransactionView and AssetDetailView.
            .onChange(of: transactions) { _, _ in
                Task { await loadPrices() }
            }
        }
    }

    @MainActor
    private func loadPrices() async {
        // Dedupe by (ticker, assetType) so crypto X and stock X each get
        // their own fetch. Result key matches PortfolioCalculator's
        // expected format: "<assetType.rawValue>|<TICKER>".
        struct Key: Hashable { let ticker: String; let assetType: AssetType }
        var keys: Set<Key> = []
        for tx in transactions { keys.insert(.init(ticker: tx.ticker, assetType: tx.assetType)) }
        await withTaskGroup(of: (String, Decimal?).self) { group in
            for key in keys {
                group.addTask {
                    do {
                        let p: Decimal
                        switch key.assetType {
                        case .crypto: p = try await CoinGeckoClient.currentPrice(ticker: key.ticker)
                        case .stock:  p = try await FinnhubClient.currentPrice(ticker: key.ticker)
                        }
                        return ("\(key.assetType.rawValue)|\(key.ticker)", p)
                    } catch {
                        // TODO: surface fetch failure per ticker (badge in row)
                        return ("\(key.assetType.rawValue)|\(key.ticker)", nil)
                    }
                }
            }
            for await (priceKey, p) in group {
                if let p { prices[priceKey] = p }
            }
        }
    }
}
