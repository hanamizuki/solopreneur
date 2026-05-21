import SwiftUI
import Charts

struct AllocationPieChart: View {
    let positions: [Position]

    private func color(for ticker: String, index: Int) -> Color {
        // Stable palette per ticker; reuses 3-color rotation if >3 holdings.
        let palette: [Color] = [.orange, .blue, .purple, .mint, .pink]
        return palette[index % palette.count]
    }

    var body: some View {
        let totalValue = positions.reduce(Decimal(0)) { $0 + $1.currentValue }
        let totalDouble = NSDecimalNumber(decimal: totalValue).doubleValue

        HStack(spacing: 14) {
            Chart(Array(positions.enumerated()), id: \.element.id) { idx, p in
                SectorMark(
                    angle: .value("Value", NSDecimalNumber(decimal: p.currentValue).doubleValue),
                    innerRadius: .ratio(0.55),
                    angularInset: 1.5
                )
                .foregroundStyle(color(for: p.ticker, index: idx))
            }
            .frame(width: 80, height: 80)
            .chartLegend(.hidden)

            VStack(spacing: 6) {
                ForEach(Array(positions.enumerated()), id: \.element.id) { idx, p in
                    HStack {
                        Circle()
                            .fill(color(for: p.ticker, index: idx))
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
