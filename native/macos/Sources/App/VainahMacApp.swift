import SwiftUI

@main
struct VainahMacApp: App {
    var body: some Scene {
        WindowGroup("Vainah VPN") {
            MacDashboard()
                .frame(minWidth: 610, minHeight: 500)
                .preferredColorScheme(.dark)
        }
        .defaultSize(width: 800, height: 620)
    }
}
