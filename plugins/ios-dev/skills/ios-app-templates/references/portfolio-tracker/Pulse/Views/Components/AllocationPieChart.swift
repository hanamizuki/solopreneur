import SwiftUI
import Charts

struct AllocationPieChart: View {
    let positions: [Position]

    private func color(for ticker: String) -> Color {
        // Stable palette per ticker — same symbol always lands on the
        // same color regardless of sort order. `String.hashValue` is
        // process-randomized in Swift 5+, so sum the UTF-8 bytes
        // ourselves for a deterministic index.
        let palette: [Color] = [.orange, .blue, .purple, .mint, .pink]
        let normalized = ticker.uppercased()
        let sum = normalized.utf8.reduce(0) { $0 &+ Int($1) }
        return palette[abs(sum) % palette.count]
    }

    var body: some View {
        let totalValue = positions.reduce(Decimal(0)) { $0 + $1.currentValue }
        let totalDouble = NSDecimalNumber(decimal: totalValue).doubleValue

        HStack(spacing: 14) {
            Chart(positions, id: \.id) { p in
                SectorMark(
                    angle: .value("Value", NSDecimalNumber(decimal: p.currentValue).doubleValue),
                    innerRadius: .ratio(0.55),
                    angularInset: 1.5
                )
                .foregroundStyle(color(for: p.ticker))
            }
            .frame(width: 80, height: 80)
            .chartLegend(.hidden)

            VStack(spacing: 6) {
                ForEach(positions, id: \.id) { p in
                    HStack {
                        Circle()
                            .fill(color(for: p.ticker))
                            .frame(width: 7, height: 7)
                        Text(p.ticker).foregroundStyle(.gray)
                        Spacer()
                        Text(String(format: "%.1f%%",
                                    totalDouble > 0
                                    ? NSDecimalNumber(decimal: p.currentValue).doubleValue / totalDouble * 100
                                    : 0))
                            .foregroundStyle(.white)
                            .fontWeight(.semibold)
                    }
                    .font(.caption)
                }
            }
        }
        .padding(14)
        .background(Color(white: 0.09))
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
