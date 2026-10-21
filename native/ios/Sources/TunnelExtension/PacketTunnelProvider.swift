import Foundation
import NetworkExtension

/// iOS NetworkExtension. The app forwards its Keychain-protected URL only in
/// transient startVPNTunnel options; the URL is NEVER persisted in VPN prefs.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    private var startup: Task<Void, Never>?
    #if canImport(Libbox)
    private var runtime: VainahLibboxRuntime?
    #endif

    override func startTunnel(
        options: [String: NSObject]?,
        completionHandler: @escaping (Error?) -> Void
    ) {
        guard let secret = options?["h1SubscriptionHTTPS"] as? String,
              SubscriptionLink.validate(secret) != nil else {
            completionHandler(failure(1001, "Не указана приватная HTTPS-подписка."))
            return
        }
        guard NativeRealityPreflight.nativeCoreLinked else {
            completionHandler(failure(1002, "Нативный VLESS-движок не включён в эту сборку."))
            return
        }

        startup = Task {
            do {
                let plaintext = try await H1ExtensionSubscription.download(secret)
                try Task.checkCancellation()
                let config = try MobileRealityConfig.fromSubscription(plaintext)
                try Task.checkCancellation()
                #if canImport(Libbox)
                let engine = VainahLibboxRuntime(self)
                runtime = engine
                // Native libbox config check, PacketTunnel settings, and
                // full TUN startup must succeed before iOS can signal start.
                try engine.start(config)
                try Task.checkCancellation()
                completionHandler(nil)
                #else
                _ = config
                completionHandler(failure(
                    1004,
                    "Для передачи пакетов нужен нативный движок libbox."
                ))
                #endif
            } catch {
                #if canImport(Libbox)
                runtime?.stop()
                runtime = nil
                #endif
                // Never expose URLSession/NSError details: errors can contain
                // secret query parameters, UUIDs or upstream credentials.
                completionHandler(failure(1005, "VPN не удалось подключить безопасно."))
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        startup?.cancel()
        startup = nil
        #if canImport(Libbox)
        runtime?.stop()
        runtime = nil
        #endif
        completionHandler()
    }

    private func failure(_ code: Int, _ description: String) -> NSError {
        NSError(
            domain: "app.vainah.vpn.PacketTunnel",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: description]
        )
    }
}
