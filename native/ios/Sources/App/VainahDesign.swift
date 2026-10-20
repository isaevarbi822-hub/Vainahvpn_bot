import SwiftUI

/// Tokens aligned to CSS :root in site/index.html; identical Android palette.
enum VainahDesign {
    static let background = Color(red: 8/255, green: 11/255, blue: 21/255) // #080b15
    static let surface = Color(red: 18/255, green: 22/255, blue: 38/255) // #121626
    static let surface2 = Color(red: 24/255, green: 27/255, blue: 47/255) // #181b2f
    static let border = Color(red: 41/255, green: 45/255, blue: 67/255) // #292d43
    static let muted = Color(red: 160/255, green: 166/255, blue: 189/255) // #a0a6bd
    static let ink = Color(red: 245/255, green: 246/255, blue: 255/255) // #f5f6ff
    static let purple = Color(red: 169/255, green: 139/255, blue: 255/255) // #a98bff
    static let sky = Color(red: 121/255, green: 205/255, blue: 233/255) // #79cde9
    static let green = Color(red: 112/255, green: 229/255, blue: 177/255) // #70e5b1

    static let accentGradient = LinearGradient(
        colors: [Color(red: 212/255, green: 185/255, blue: 255/255),
                 Color(red: 145/255, green: 113/255, blue: 255/255)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let previewGradient = LinearGradient(
        colors: [Color(red: 37/255, green: 34/255, blue: 71/255),
                 Color(red: 19/255, green: 27/255, blue: 52/255)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
    static let cardGradient = LinearGradient(
        colors: [Color(red: 30/255, green: 34/255, blue: 57/255),
                 Color(red: 17/255, green: 23/255, blue: 37/255)],
        startPoint: .topLeading, endPoint: .bottomTrailing
    )
}

/** Plan prices and limits must match server plan-catalog.mjs. No native payments. */
struct VainahPlan: Identifiable {
    let id: String
    let days: Int
    let title: String
    let priceRub: Int
    let deviceLimit: Int
    let badge: String

    static let all: [VainahPlan] = [
        .init(id: "30", days: 30, title: "1 месяц", priceRub: 99, deviceLimit: 3, badge: "НАЧАТЬ С МАЛОГО"),
        .init(id: "60", days: 60, title: "2 месяца", priceRub: 160, deviceLimit: 3, badge: "60 ДНЕЙ"),
        .init(id: "90", days: 90, title: "3 месяца", priceRub: 219, deviceLimit: 3, badge: "90 ДНЕЙ"),
        .init(id: "180", days: 180, title: "6 месяцев", priceRub: 339, deviceLimit: 3, badge: "180 ДНЕЙ"),
        .init(id: "365", days: 365, title: "1 год", priceRub: 700, deviceLimit: 3, badge: "365 ДНЕЙ"),
        .init(id: "365-family", days: 365, title: "1 год · семейный", priceRub: 1000, deviceLimit: 6, badge: "СЕМЕЙНЫЙ")
    ]
}
