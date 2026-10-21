import Foundation
import NetworkExtension

/// iOS NetworkExtension. The app forwards its Keychain-protected URL only in
/// transient startVPNTunnel options; the URL is NEVER persisted in VPN prefs.
final class PacketTunnelProvider: NEPacketTunnelProvider {
    private var startup: Task<Void, Never>?
    #if canImport(Libbox)
    private var runtime: VainahLibboxRuntime?
    // Startup invokes synchronous libbox and opens OS TUN routes.
    // Serialize it with teardown; never stop a half-initialized native core.
    private let nativeLock = NSLock()

    private func startNative(_ config: String, keepRunning: () -> Bool) throws {
        nativeLock.lock()
        defer { nativeLock.unlock() }
        guard keepRunning() else { throw CancellationError() }
        let engine = VainahLibboxRuntime(self)
        runtime = engine
        do {
            try engine.start(config)
            guard keepRunning() else { throw CancellationError() }
        } catch {
            engine.stop()
            runtime = nil
            throw error
        }
    }

    private func stopNative() {
        nativeLock.lock()
        defer { nativeLock.unlock() }
        runtime?.stop()
        runtime = nil
    }
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
                // Keep libbox initialization and teardown serialized.
                // Recheck cancellation after libbox opens the system TUN.
                try startNative(config, keepRunning: { !Task.isCancelled })
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
                stopNative()
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
        // Do not block the NetworkExtension callback while libbox is starting.
        // Complete only after cleanup of the native daemon and OS routes.
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            stopNative()
            completionHandler()
        }
        #else
        completionHandler()
        #endif
    }

    private func failure(_ code: Int, _ description: String) -> NSError {
        NSError(
            domain: "app.vainah.vpn.PacketTunnel",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: description]
        )
    }
}
