import SwiftUI

struct OnboardingView: View {
    @AppStorage("onboarded") private var onboarded: Bool = false

    /// Called after all keys are saved so the host (RootView) can re-check
    /// Keychain. Defaults to no-op so plain Previews still work.
    var onComplete: () -> Void = {}

    @State private var anthropic: String = KeychainService.load(.anthropic) ?? ""
    @State private var finnhub: String = KeychainService.load(.finnhub) ?? ""
    @State private var coingecko: String = KeychainService.load(.coingecko) ?? ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Pulse")
                            .font(.system(size: 40, weight: .bold))
                            .foregroundStyle(.white)
                        Text("貼三組 API key 就能用，全部存進 iOS Keychain。")
                            .font(.footnote)
                            .foregroundStyle(.gray)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        keyField("Anthropic API Key",
                                 hint: "console.anthropic.com → API Keys",
                                 text: $anthropic)
                        keyField("Finnhub API Key",
                                 hint: "finnhub.io/register (free)",
                                 text: $finnhub)
                        keyField("CoinGecko Demo API Key",
                                 hint: "coingecko.com/en/api/pricing → Demo tier (free, full history)",
                                 text: $coingecko)
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Crypto 新聞改吃 Google News RSS（不用 key）")
                            .font(.caption2)
                            .foregroundStyle(.gray)
                    }

                    Button {
                        save()
                    } label: {
                        Text("完成")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(canSave ? Color.green : Color.gray.opacity(0.4))
                            .foregroundStyle(.black)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(!canSave)
                }
                .padding(24)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationBarHidden(true)
        }
    }

    private var canSave: Bool {
        !anthropic.isEmpty && !finnhub.isEmpty && !coingecko.isEmpty
    }

    private func keyField(_ label: String, hint: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.footnote.weight(.semibold)).foregroundStyle(.white)
            SecureField("貼上 key", text: text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(12)
                .background(Color(white: 0.12))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
            Text(hint).font(.caption2).foregroundStyle(.gray)
        }
    }

    private func save() {
        // Trim leading/trailing whitespace — paste from web often carries
        // invisible spaces or newlines that break header / query auth.
        let trim: (String) -> String = { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        KeychainService.save(trim(anthropic), slot: .anthropic)
        KeychainService.save(trim(finnhub), slot: .finnhub)
        KeychainService.save(trim(coingecko), slot: .coingecko)
        onboarded = true
        onComplete()
    }
}
