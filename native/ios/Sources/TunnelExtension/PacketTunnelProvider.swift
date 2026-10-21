import Foundation
import NetworkExtension

/// iOS NetworkExtension. The app forwards its Keychain-protected URL only in
/// transient startVPNTunnel options; the URL is NEVER persisted in VPN prefs.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    private var startup: Task<Void, Never>?

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
                guard NativeRealityPreflight.check(plaintext) else {
                    throw failure(1003, "Конфигурация Reality отклонена движком.")
                }
                try Task.checkCancellation()
                // Next gate: instantiate libbox CommandServer with a correct
                // NEPacketTunnelProvider PlatformInterface and verify packets.
                // Until openTun + encrypted packet exchange exists, returning
                // nil would misleadingly put iOS in a 'connected' state.
                completionHandler(failure(
                    1004,
                    "Reality проверен; передача пакетов через iOS пока не подключена."
                ))
            } catch {
                // Never expose URLSession/NSError details: errors can contain
                // secret query parameters, UUIDs or upstream credentials.
                completionHandler(failure(1005, "VPN не удалось проверить безопасно."))
            }
        }
    }

    override func stopTunnel(
        with reason: NEProviderStopReason,
        completionHandler: @escaping () -> Void
    ) {
        startup?.cancel()
        startup = nil
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
