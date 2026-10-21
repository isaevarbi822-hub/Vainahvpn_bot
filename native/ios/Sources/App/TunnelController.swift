import Foundation
import Combine
import NetworkExtension

enum TunnelState: String {
    case disconnected = "Не подключено"
    case preparing = "Подготовка подключения…"
    case connected = "Подключено"
    case unavailable = "Движок пока не встроен"
    case error = "Ошибка подключения"
}

/// No successful VPN status may be shown without an established, packet-forwarding engine.
enum VLESSCore {
    // The ordinary preview has no libbox and must continue to fail closed.
    // Native-library CI enables this flag for a separate PacketTunnel target
    // once the XCFramework is linked; runtime still checks the actual core.
    #if VAINAH_NATIVE_LIBBOX
    static let available = true
    #else
    static let available = false
    #endif
}

@MainActor
final class TunnelController: ObservableObject {
    @Published private(set) var state: TunnelState = .disconnected
    @Published private(set) var explanation = "Трафик пока НЕ защищён Vainah VPN."

    /// Future real core must configure a packet tunnel extension and route packets.
    func connect() async {
        guard let subscription = SecureSubscription.load() else {
            state = .disconnected
            explanation = "Сначала сохрани HTTPS-ссылку подписки."
            return
        }
        guard VLESSCore.available else {
            state = .unavailable
            explanation = "Для H1Cloud нужен VLESS-движок. Эта версия не создаёт ложное подключение."
            return
        }
        state = .preparing
        do {
            let managers = try await NETunnelProviderManager.loadAllFromPreferences()
            let manager = managers.first ?? NETunnelProviderManager()
            let configuration = NETunnelProviderProtocol()
            configuration.providerBundleIdentifier = "app.vainah.vpn.PacketTunnel"
            configuration.serverAddress = "Vainah VPN"
            manager.protocolConfiguration = configuration
            manager.localizedDescription = "Vainah VPN"
            manager.isEnabled = true
            try await manager.saveToPreferences()
            try await manager.loadFromPreferences()
            // One-shot launch options are NOT stored in NETunnelProviderManager
            // preferences. The extension validates, fetches and discards this
            // bearer credential; do not include it in logs or errors.
            try manager.connection.startVPNTunnel(options: [
                "h1SubscriptionHTTPS": subscription as NSString
            ])
            // Waiting for NEVPNStatus connected is mandatory before claiming success.
            state = .preparing
            explanation = "Ожидаем подтверждения системного VPN…"
        } catch {
            state = .error
            explanation = "Не удалось создать системное подключение. Проверь разрешения NetworkExtension."
        }
    }

    func disconnect() async {
        let managers = (try? await NETunnelProviderManager.loadAllFromPreferences()) ?? []
        for manager in managers {
            manager.connection.stopVPNTunnel()
        }
        state = .disconnected
        explanation = "Подключение остановлено."
    }
}
