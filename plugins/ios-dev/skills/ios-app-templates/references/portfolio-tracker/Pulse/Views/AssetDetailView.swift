import SwiftUI
import SwiftData

struct AssetDetailView: View {
    let position: Position

    @Query private var allTransactions: [Transaction]
    @Environment(\.modelContext) private var context
    @State private var news: [NewsArticle] = []
    @State private var aiState: AICommentaryCard.State = .loading

    private var transactions: [Transaction] {
        allTransactions
            .filter { $0.ticker == position.ticker }
            .sorted(by: { $0.date < $1.date })
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                // Header
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(position.ticker)
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.white)
                        Text(position.assetType.label)
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background(position.assetType == .crypto
                                        ? Color.orange.opacity(0.18)
                                        : Color.blue.opacity(0.18))
                            .foregroundStyle(position.assetType == .crypto ? Color.orange : Color.blue)
                            .clipShape(Capsule())
                    }
                    Text(Formatting.usd(position.currentPrice))
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(.white)
                    Text("\(position.unrealizedPnL >= 0 ? "+" : "")\(Formatting.usd(position.unrealizedPnL)) \(String(format: "%+.1f%%", position.unrealizedPnLPct * 100)) 未實現")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(position.unrealizedPnL >= 0 ? .green : .red)
                }
                .padding(.horizontal, 20)

                // Summary grid
                VStack(spacing: 10) {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        labelValue("持有", qtyText(position))
                        labelValue("平均成本", Formatting.usd(position.avgCost))
                        labelValue("投入", Formatting.usd(position.totalCostBasis))
                        labelValue("當前市值", Formatting.usd(position.currentValue))
                    }
                    Divider().background(Color(white: 0.14))
                    VStack(alignment: .leading, spacing: 4) {
                        Text("買入紀錄")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.gray)
                            .textCase(.uppercase).tracking(0.5)
                        ForEach(transactions) { tx in
                            HStack {
                                Text(Self.dateText(tx.date))
                                Text("· \(qtyOnly(tx))")
                                Spacer()
                                Text("@ \(Formatting.usd(tx.purchasePrice))")
                            }
                            .font(.footnote)
                            .foregroundStyle(Color(white: 0.85))
                        }
                    }
                }
                .padding(14)
                .background(Color(white: 0.09))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 16)

                if !news.isEmpty {
                    Text("今日新聞")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.gray)
                        .textCase(.uppercase).tracking(0.5)
                        .padding(.horizontal, 20)
                        .padding(.top, 6)
                    VStack(spacing: 0) {
                        ForEach(news) { a in
                            NewsListItem(article: a).padding(.horizontal, 14)
                            if a.id != news.last?.id {
                                Divider().background(Color(white: 0.14))
                            }
                        }
                    }
                    .background(Color(white: 0.09))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .padding(.horizontal, 16)
                }

                AICommentaryCard(state: aiState)
                    .padding(.horizontal, 16)
                    .padding(.top, 4)
            }
            .padding(.vertical, 14)
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load(force: true) }
    }

    @MainActor
    private func load(force: Bool = false) async {
        let dayKey = Calendar.todayKey()
        let cacheKey = "\(position.ticker)|\(dayKey)"

        // News (typed fetch — SwiftData #Predicate can't do type casts)
        let newsHit: NewsCache? = try? context.fetch(
            FetchDescriptor<NewsCache>(predicate: #Predicate { $0.key == cacheKey })
        ).first

        if !force, let cached = newsHit,
           let decoded = try? JSONDecoder().decode([NewsArticle].self, from: cached.payload) {
            news = decoded
        } else {
            do {
                switch position.assetType {
                case .crypto:
                    news = try await GoogleNewsClient.news(ticker: position.ticker)
                case .stock:
                    news = try await FinnhubClient.companyNews(ticker: position.ticker, on: Date())
                }
                if let data = try? JSONEncoder().encode(news) {
                    upsertNewsCache(ticker: position.ticker, dayKey: dayKey, payload: data)
                }
            } catch {
                // TODO: friendlier news-load failure UI
                news = []
            }
        }

        // AI (typed fetch)
        let aiHit: AICache? = try? context.fetch(
            FetchDescriptor<AICache>(predicate: #Predicate { $0.key == cacheKey })
        ).first

        if !force, let cached = aiHit {
            aiState = .loaded(cached.commentary)
        } else {
            aiState = .loading
            do {
                let text = try await AIClient.commentary(for: position, news: news)
                aiState = .loaded(text)
                upsertAICache(ticker: position.ticker, dayKey: dayKey, commentary: text)
            } catch {
                // TODO: distinguish missingKey vs network vs api error
                aiState = .failed
            }
        }
    }

    private func upsertAICache(ticker: String, dayKey: String, commentary: String) {
        // Delete-then-insert keeps the unique constraint simple.
        let key = "\(ticker)|\(dayKey)"
        if let old = try? context.fetch(
            FetchDescriptor<AICache>(predicate: #Predicate { $0.key == key })
        ).first {
            context.delete(old)
        }
        context.insert(AICache(ticker: ticker, dayKey: dayKey, commentary: commentary))
        try? context.save()
    }

    private func upsertNewsCache(ticker: String, dayKey: String, payload: Data) {
        let key = "\(ticker)|\(dayKey)"
        if let old = try? context.fetch(
            FetchDescriptor<NewsCache>(predicate: #Predicate { $0.key == key })
        ).first {
            context.delete(old)
        }
        context.insert(NewsCache(ticker: ticker, dayKey: dayKey, payload: payload))
        try? context.save()
    }

    private func labelValue(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption2).foregroundStyle(.gray)
            Text(value).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func qtyText(_ p: Position) -> String {
        let nf = NumberFormatter()
        nf.maximumFractionDigits = p.assetType == .crypto ? 8 : 0
        return (nf.string(from: p.totalQuantity as NSDecimalNumber) ?? "0") +
            (p.assetType == .stock ? " 股" : " 顆")
    }
    private func qtyOnly(_ tx: Transaction) -> String {
        let nf = NumberFormatter()
        nf.maximumFractionDigits = tx.assetType == .crypto ? 8 : 0
        return (nf.string(from: tx.quantity as NSDecimalNumber) ?? "0") +
            (tx.assetType == .stock ? " 股" : " 顆")
    }
    static func dateText(_ d: Date) -> String {
        let df = DateFormatter()
        df.dateFormat = "MM/dd"
        return df.string(from: d)
    }
}
