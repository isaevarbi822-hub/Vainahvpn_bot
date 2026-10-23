import Foundation
import NetworkExtension

/// A macOS Packet Tunnel without forwarding is worse than a failed start:
/// do not install empty routes or fake a connected state.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard let uri = SharedTunnelProfile.load(),
              VlessRealityConfig.parse(uri) != nil else {
            completionHandler(NSError(
                domain: "app.vainah.vpn.mac.PacketTunnel", code: 1003,
                userInfo: [NSLocalizedDescriptionKey: "No validated VLESS profile in Keychain"]
            ))
            return
        }
        // Native sing-box/libbox packetFlow integration and signing remain
        // required. Never claim success before encrypted packets flow.
        completionHandler(NSError(
            domain: "app.vainah.vpn.mac.PacketTunnel", code: 1001,
            userInfo: [NSLocalizedDescriptionKey: "VLESS REALITY packet forwarder is unavailable"]
        ))
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
