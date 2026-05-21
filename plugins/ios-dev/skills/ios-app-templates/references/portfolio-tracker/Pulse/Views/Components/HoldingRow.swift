import SwiftUI

struct HoldingRow: View {
    let position: Position

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(position.ticker)
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.white)
                    Text(position.assetType.label)
                        .font(.system(size: 9.5, weight: .semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(position.assetType == .crypto
                                    ? Color.orange.opacity(0.18)
                                    : Color.blue.opacity(0.18))
                        .foregroundStyle(position.assetType == .crypto ? Color.orange : Color.blue)
                        .clipShape(Capsule())
                }
                Text("\(qtyText) · 均 \(Formatting.usd(position.avgCost))")
                    .font(.caption)
                    .foregroundStyle(.gray)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Formatting.usd(position.currentValue))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                Text("\(position.unrealizedPnL >= 0 ? "+" : "")\(Formatting.usd(position.unrealizedPnL)) \(String(format: "%+.1f%%", position.unrealizedPnLPct * 100))")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(position.unrealizedPnL >= 0 ? .green : .red)
            }
        }
        .padding(.vertical, 10)
    }

    private var qtyText: String {
        let nf = NumberFormatter()
        nf.maximumFractionDigits = position.assetType == .crypto ? 8 : 0
        nf.minimumFractionDigits = 0
        return (nf.string(from: position.totalQuantity as NSDecimalNumber) ?? "0") +
            (position.assetType == .stock ? " 股" : " 顆")
    }
}
