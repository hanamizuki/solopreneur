import Foundation
import SwiftData

@Model
final class Transaction {
    var id: UUID
    var ticker: String
    var assetTypeRaw: String
    var quantity: Decimal
    var date: Date
    var purchasePrice: Decimal
    var createdAt: Date

    var assetType: AssetType {
        get { AssetType(rawValue: assetTypeRaw) ?? .stock }
        set { assetTypeRaw = newValue.rawValue }
    }

    init(
        ticker: String,
        assetType: AssetType,
        quantity: Decimal,
        date: Date,
        purchasePrice: Decimal
    ) {
        self.id = UUID()
        self.ticker = ticker.uppercased()
        self.assetTypeRaw = assetType.rawValue
        self.quantity = quantity
        self.date = date
        self.purchasePrice = purchasePrice
        self.createdAt = Date()
    }
}
