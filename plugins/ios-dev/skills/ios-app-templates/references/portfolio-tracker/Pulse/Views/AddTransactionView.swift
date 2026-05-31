import SwiftUI
import SwiftData

/// Add-transaction sheet.
///
/// Cost-basis design: the cost basis is the asset's price **on the selected
/// buy date**, not today's price — otherwise PnL is wrong for any position
/// bought in the past. Resolution per asset type:
///
/// - Crypto → `CoinGeckoClient.closePrice(on:)` (the free-tier `/history`
///   endpoint works for buy-date lookups within roughly the last year). On
///   failure (network / unsupported ticker / out-of-range date) we fall back
///   to a manual 買入價 field, pre-filled with the current price as a hint.
/// - Stock → `FinnhubClient.closePrice(on:)` is premium-only; a free-tier key
///   gets 403 (`FinnhubError.premiumRequired`). So stocks almost always fall
///   back to the manual field, pre-filled with today's quote as a suggestion
///   the user can overwrite.
///
/// The manual field is the FALLBACK path: the default is "auto-fetch the
/// buy-date price". We never save a zero/blank cost, and we never silently
/// record today's price for a past buy date.
struct AddTransactionView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var ticker: String = ""
    @State private var assetType: AssetType = .crypto
    @State private var date: Date = Date()
    @State private var quantityText: String = ""

    // Auto-resolved cost basis: the buy-date price fetched from the client.
    // nil until a lookup succeeds; cleared whenever ticker/type/date changes.
    @State private var fetchedCost: Decimal?
    @State private var isFetchingCost: Bool = false

    // Manual-fallback machinery. `showManualField` is flipped on when an
    // auto-fetch fails; `priceText` holds the user-editable 買入價; once the
    // user touches it `priceAutofilled` flips to false so a later re-fetch
    // hint won't clobber their typing. `priceLookupHint` is the short inline
    // message shown next to the manual field explaining why it appeared.
    @State private var showManualField: Bool = false
    @State private var priceText: String = ""
    @State private var priceAutofilled: Bool = false
    @State private var priceLookupHint: String?

    // True while save() persists the transaction.
    @State private var isSaving: Bool = false
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
                    // Disallow future buy dates — you can't have bought an
                    // asset at a price that doesn't exist yet, and the history
                    // endpoints return null for future dates anyway.
                    DatePicker("買入日期", selection: $date, in: ...Date(), displayedComponents: .date)
                    TextField("數量", text: $quantityText)
                        .keyboardType(.decimalPad)
                } footer: {
                    Text("成本以買入日當天市價自動計算；若該日抓不到價，可手動輸入買入價。")
                        .font(.footnote)
                }

                // Manual 買入價 fallback — only shown when the buy-date fetch
                // failed (e.g. stock premium gate, unsupported crypto, an
                // out-of-range date, or a network error). Pre-filled with
                // today's price as a hint.
                if showManualField {
                    Section {
                        HStack {
                            Text("買入價 (USD)")
                            Spacer()
                            TextField("0.00", text: $priceText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                                .onChange(of: priceText) { _, _ in
                                    // User touched the field — stop treating it
                                    // as an autofilled hint so later re-fetches
                                    // don't overwrite their value.
                                    priceAutofilled = false
                                }
                        }
                    } footer: {
                        if let hint = priceLookupHint {
                            Text(hint)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                // Cost-basis preview: the resolved cost (fetched buy-date price
                // or the manual value) the transaction will be saved with.
                Section("成本預覽") {
                    HStack {
                        Text(showManualField ? "手動成本" : "買入日市價")
                            .foregroundStyle(.secondary)
                        Spacer()
                        if isFetchingCost {
                            ProgressView().controlSize(.small)
                        } else if let cost = resolvedCost {
                            Text(Formatting.usd(cost))
                        } else {
                            Text("輸入代碼後自動查價")
                                .foregroundStyle(.tertiary)
                        }
                    }
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
                        .disabled(isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if isSaving {
                        ProgressView().controlSize(.small)
                    } else {
                        Button("儲存") { Task { await save() } }
                            .disabled(!canSave)
                    }
                }
            }
            // Resolve the buy-date cost whenever ticker / asset type / date
            // settles. Rebinding the id cancels the prior task; the leading
            // sleep debounces rapid typing.
            .task(id: lookupKey) {
                await resolveBuyDateCost()
            }
        }
    }

    /// Composite key for .task(id:) — any change to ticker / asset type / date
    /// re-triggers the buy-date lookup (and cancels an in-flight one).
    private var lookupKey: String {
        "\(assetType.rawValue)|\(normalizedTicker)|\(dayKey)"
    }

    /// Day granularity for the lookup key so picking a new buy date re-fetches,
    /// but scrubbing within the same day does not.
    private var dayKey: String {
        let cal = Calendar(identifier: .gregorian)
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return "\(c.year ?? 0)-\(c.month ?? 0)-\(c.day ?? 0)"
    }

    private var normalizedTicker: String {
        ticker.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    }

    /// Manual value parsed from the 買入價 field (nil if blank / unparseable).
    private var manualCost: Decimal? {
        guard let d = Decimal(string: priceText), d > 0 else { return nil }
        return d
    }

    /// The cost the transaction will be saved with: the manual value when the
    /// fallback field is shown, otherwise the auto-fetched buy-date price.
    private var resolvedCost: Decimal? {
        showManualField ? manualCost : fetchedCost
    }

    /// Resolve the cost basis = price on the selected buy date.
    ///
    /// Default path: auto-fetch the buy-date close per asset type. On any
    /// failure, reveal the manual field and pre-fill it with the current price
    /// as a hint the user can overwrite. Never throws to the caller; never
    /// crashes — a total failure just leaves a blank manual field.
    private func resolveBuyDateCost() async {
        try? await Task.sleep(for: .milliseconds(500))
        if Task.isCancelled { return }

        guard !normalizedTicker.isEmpty else {
            await MainActor.run {
                fetchedCost = nil
                showManualField = false
                priceLookupHint = nil
                if priceAutofilled { priceText = "" }
            }
            return
        }

        await MainActor.run { isFetchingCost = true; lastError = nil }
        defer { Task { @MainActor in isFetchingCost = false } }

        do {
            let cost = try await fetchBuyDatePrice()
            if Task.isCancelled { return }
            guard cost > 0 else { throw CoinGeckoClient.CoinGeckoError.noData }
            await MainActor.run {
                fetchedCost = cost
                showManualField = false
                priceLookupHint = nil
            }
        } catch {
            if Task.isCancelled { return }
            // Log the concrete error for future debugging — the user only sees
            // the friendly hint, but this captures the real cause.
            print("[AddTransaction] buy-date price fetch failed for \(normalizedTicker) (\(assetType)) on \(date): \(error)")
            // Buy-date fetch failed → fall back to the manual field, pre-filled
            // with today's price as a suggestion (best-effort; may be nil).
            let hintPrice = try? await fetchCurrentPriceHint()
            if Task.isCancelled { return }
            // Build an honest, specific hint explaining WHY the auto-lookup
            // failed, branching on the concrete error and the situation.
            let hint = buyDateFailureHint(for: error)
            await MainActor.run {
                fetchedCost = nil
                showManualField = true
                priceLookupHint = hint
                // Only seed the field if the user hasn't typed their own value.
                if priceText.isEmpty || priceAutofilled {
                    if let hint = hintPrice {
                        // Plain decimal string (no $ / grouping) so the field
                        // round-trips through Decimal(string:) on save.
                        priceText = hint.formatted(
                            .number.grouping(.never).precision(.fractionLength(0...2))
                        )
                        priceAutofilled = true
                    }
                }
            }
        }
    }

    /// Fetch the close on the selected buy `date` for the chosen asset type.
    private func fetchBuyDatePrice() async throws -> Decimal {
        switch assetType {
        case .crypto: return try await CoinGeckoClient.closePrice(ticker: normalizedTicker, on: date)
        case .stock:  return try await FinnhubClient.closePrice(ticker: normalizedTicker, on: date)
        }
    }

    /// Fetch the current price as a manual-field hint (best-effort).
    private func fetchCurrentPriceHint() async throws -> Decimal {
        switch assetType {
        case .crypto: return try await CoinGeckoClient.currentPrice(ticker: normalizedTicker)
        case .stock:  return try await FinnhubClient.currentPrice(ticker: normalizedTicker)
        }
    }

    /// Whether the selected buy `date` is more than ~365 days before today.
    /// CoinGecko's free/Demo `/coins/{id}/history` endpoint only returns data
    /// for roughly the last year, so anything older can't be auto-priced.
    private var isCryptoOutOfHistoryRange: Bool {
        let cal = Calendar(identifier: .gregorian)
        let days = cal.dateComponents([.day], from: cal.startOfDay(for: date),
                                      to: cal.startOfDay(for: Date())).day ?? 0
        return days > 365
    }

    /// Map the concrete fetch error + situation to an honest inline hint that
    /// tells the user exactly why the auto-lookup failed.
    private func buyDateFailureHint(for error: Error) -> String {
        // Crypto + buy date older than CoinGecko's free-tier ~1-year window.
        if assetType == .crypto, isCryptoOutOfHistoryRange {
            return "CoinGecko 免費版只提供近一年的歷史價，\(normalizedTicker) 這個日期請手動輸入買入價"
        }
        switch error {
        case CoinGeckoClient.CoinGeckoError.unsupportedTicker:
            return "目前內建支援 BTC / ETH / SOL / DOGE，其他幣請手動輸入買入價"
        case FinnhubClient.FinnhubError.premiumRequired:
            return "股票歷史價需付費 API，請手動輸入 \(normalizedTicker) 的買入價（已預帶今日市價）"
        case let CoinGeckoClient.CoinGeckoError.badResponse(code, _):
            return "查價失敗（HTTP \(code)），請手動輸入買入價"
        default:
            return "\(normalizedTicker) 查價失敗：\(error)，請手動輸入買入價"
        }
    }

    private var canSave: Bool {
        // Ticker non-empty + quantity > 0 + a resolved cost basis (> 0),
        // whether auto-fetched or manually entered.
        guard let qty = Decimal(string: quantityText), qty > 0 else { return false }
        guard !normalizedTicker.isEmpty else { return false }
        guard let cost = resolvedCost, cost > 0 else { return false }
        return true
    }

    /// Persist the transaction with the resolved buy-date cost basis. Dismiss
    /// only on a successful save. Never saves a zero/blank cost.
    @MainActor
    private func save() async {
        guard let qty = Decimal(string: quantityText), qty > 0,
              !normalizedTicker.isEmpty,
              let cost = resolvedCost, cost > 0 else { return }
        lastError = nil
        isSaving = true
        defer { isSaving = false }

        let tx = Transaction(
            ticker: normalizedTicker,
            assetType: assetType,
            quantity: qty,
            date: date,
            purchasePrice: cost
        )
        context.insert(tx)
        do {
            try context.save()
            dismiss()
        } catch {
            lastError = "儲存失敗：\(error.localizedDescription)"
        }
    }
}

#Preview {
    AddTransactionView()
        .modelContainer(for: Transaction.self, inMemory: true)
        .preferredColorScheme(.dark)
}
