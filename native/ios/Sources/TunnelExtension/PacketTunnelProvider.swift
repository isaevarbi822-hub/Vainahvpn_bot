import Foundation
import NetworkExtension

/// Contract for the real Apple VLESS REALITY packet forwarder.
/// The implementation must create encrypted upstream sockets, configure
/// routes/DNS and pass IP packets in both directions via packetFlow.
/// This protocol is not a VPN engine on its own.
protocol VainahPacketForwarding: AnyObject {
    func start(provider: NEPacketTunnelProvider,
               completion: @escaping (Error?) -> Void)
    func stop(completion: @escaping () -> Void)
}

/// A missing native Apple core MUST NOT create an apparently successful VPN.
/// Until an audited iOS-compatible core is linked, the extension rejects startup.
private final class UnavailablePacketForwarder: VainahPacketForwarding {
    func start(provider: NEPacketTunnelProvider,
               completion: @escaping (Error?) -> Void) {
        completion(NSError(
            domain: "app.vainah.vpn.PacketTunnel",
            code: 1001,
            userInfo: [NSLocalizedDescriptionKey:
                "VLESS REALITY forwarding is not integrated on iOS yet."]
        ))
    }

    func stop(completion: @escaping () -> Void) { completion() }
}

final class PacketTunnelProvider: NEPacketTunnelProvider {
    private let engine: VainahPacketForwarding = UnavailablePacketForwarder()
    private var tunnelStarted = false

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard !tunnelStarted else {
            completionHandler(NSError(domain: "app.vainah.vpn.PacketTunnel",
                                      code: 1002))
            return
        }
        engine.start(provider: self) { [weak self] error in
            // Never complete with nil just because NE has allocated a profile.
            // Only a genuine packet-forwarding engine may signal success.
            self?.tunnelStarted = error == nil
            completionHandler(error)
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        tunnelStarted = false
        engine.stop(completion: completionHandler)
    }
}
