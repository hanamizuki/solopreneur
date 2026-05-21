import SwiftUI

struct TotalAssetsCard: View {
    let totalValue: Decimal
    let totalPnL: Decimal
    let totalPnLPct: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("總資產 (USD)")
                .font(.caption)
                .foregroundStyle(.gray)
                .textCase(.uppercase)
                .tracking(0.5)
            Text(Formatting.usd(totalValue))
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(.white)
            HStack(spacing: 4) {
                Image(systemName: totalPnL >= 0 ? "arrow.up" : "arrow.down")
                Text("\(totalPnL >= 0 ? "+" : "")\(Formatting.usd(totalPnL))")
                Text("\(totalPnL >= 0 ? "+" : "")\(String(format: "%.1f%%", totalPnLPct * 100))")
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(totalPnL >= 0 ? Color.green : Color.red)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color(white: 0.09))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
