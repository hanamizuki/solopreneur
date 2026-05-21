import SwiftUI
import SwiftData

struct AddTransactionView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var ticker: String = ""
    @State private var assetType: AssetType = .crypto
    @State private var date: Date = Date()
    @State private var quantityText: String = ""
    @State private var isSaving = false
    @State private var lastError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Ticker (e.g. BTC, NVDA)", text: $ticker)
                        .textInputAutocapitalization(.characters)
                    Picker("類別", selection: $assetType) {
                        ForEach(AssetType.allCases) { Text($0.label).tag($0) }
                    }
                    DatePicker("買入日期", selection: $date, displayedComponents: .date)
                    TextField("數量", text: $quantityText)
                        .keyboardType(.decimalPad)
                }
                if let err = lastError {
                    Section { Text(err).foregroundStyle(.red).font(.footnote) }
                }
            }
            .navigationTitle("新增交易")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("取消") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "查價中…" : "儲存") {
                        Task { await save() }
                    }
                    .disabled(!canSave || isSaving)
                }
            }
        }
    }

    private var canSave: Bool {
        !ticker.isEmpty && Decimal(string: quantityText) != nil
    }

    @MainActor
    private func save() async {
        guard let qty = Decimal(string: quantityText) else { return }
        // Single source of truth for ticker normalization — all clients
        // and the Transaction model assume uppercase, so canonicalize
        // once at the form boundary.
        let normalizedTicker = ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard !normalizedTicker.isEmpty else { return }
        isSaving = true
        lastError = nil
        defer { isSaving = false }
        do {
            let price: Decimal
            switch assetType {
            case .crypto:
                price = try await CoinGeckoClient.closePrice(ticker: normalizedTicker, on: date)
            case .stock:
                // Finnhub /stock/candle is premium-only since 2024, so a
                // free-tier key 403s. Fall back to /quote (free) — the
                // recorded purchase price will be "now" rather than the
                // selected date, which is acceptable for the demo.
                do {
                    price = try await FinnhubClient.closePrice(ticker: normalizedTicker, on: date)
                } catch FinnhubClient.FinnhubError.premiumRequired {
                    price = try await FinnhubClient.currentPrice(ticker: normalizedTicker)
                }
            }
            let tx = Transaction(
                ticker: normalizedTicker,
                assetType: assetType,
                quantity: qty,
                date: date,
                purchasePrice: price
            )
            context.insert(tx)
            try context.save()
            dismiss()
        } catch {
            // TODO: friendlier message + manual price override fallback
            lastError = "查價失敗：\(error)"
        }
    }
}

#Preview {
    AddTransactionView()
        .modelContainer(for: Transaction.self, inMemory: true)
        .preferredColorScheme(.dark)
}
