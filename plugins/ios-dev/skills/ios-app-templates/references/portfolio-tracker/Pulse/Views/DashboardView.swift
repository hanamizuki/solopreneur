import SwiftUI
import SwiftData

struct DashboardView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Transaction.createdAt) private var transactions: [Transaction]

    @State private var prices: [String: Decimal] = [:]
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    TotalAssetsCard(
                        totalValue: positions.reduce(0) { $0 + $1.currentValue },
                        totalPnL: positions.reduce(0) { $0 + $1.unrealizedPnL },
                        totalPnLPct: pnlPct
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
        }
    }

    private var positions: [Position] {
        PortfolioCalculator.positions(from: transactions, prices: prices)
    }

    private var pnlPct: Double {
        let cost = positions.reduce(Decimal(0)) { $0 + $1.totalCostBasis }
        let pnl = positions.reduce(Decimal(0)) { $0 + $1.unrealizedPnL }
        guard cost > 0 else { return 0 }
        return NSDecimalNumber(decimal: pnl / cost).doubleValue
    }

    @MainActor
    private func loadPrices() async {
        // Dedupe by ticker; tuples aren't Hashable so use Dictionary keyed by ticker.
        var tickerTypes: [String: AssetType] = [:]
        for tx in transactions { tickerTypes[tx.ticker] = tx.assetType }
        await withTaskGroup(of: (String, Decimal?).self) { group in
            for (ticker, type) in tickerTypes {
                group.addTask {
                    do {
                        let p: Decimal
                        switch type {
                        case .crypto: p = try await CoinGeckoClient.currentPrice(ticker: ticker)
                        case .stock:  p = try await FinnhubClient.currentPrice(ticker: ticker)
                        }
                        return (ticker, p)
                    } catch {
                        // TODO: surface fetch failure per ticker (badge in row)
                        return (ticker, nil)
                    }
                }
            }
            for await (ticker, p) in group {
                if let p { prices[ticker] = p }
            }
        }
    }
}
