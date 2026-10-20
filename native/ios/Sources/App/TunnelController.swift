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
    static let available = false
}

@MainActor
final class TunnelController: ObservableObject {
    @Published private(set) var state: TunnelState = .disconnected
    @Published private(set) var explanation = "Трафик пока НЕ защищён Vainah VPN."

    /// Future real core must configure a packet tunnel extension and route packets.
    func connect() async {
        guard SecureSubscription.load() != nil else {
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
            try manager.connection.startVPNTunnel()
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
