import Foundation
import NetworkExtension

/// Packet Tunnel extension. No traffic is intercepted or black-holed:
/// until a vetted VLESS engine is embedded, we explicitly fail to start.
/// A working engine must establish the encrypted socket, configure tunnel
/// routes/DNS, and exchange packets both directions BEFORE completing nil.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        let error = NSError(
            domain: "app.vainah.vpn.PacketTunnel",
            code: 1001,
            userInfo: [NSLocalizedDescriptionKey:
                "H1Cloud/VLESS packet forwarding engine is not integrated yet."]
        )
        completionHandler(error)
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
