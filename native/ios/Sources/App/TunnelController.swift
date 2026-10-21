import Foundation
import Combine
import NetworkExtension

enum TunnelState: String {
    case disconnected = "Не подключено"
    case preparing = "Подготовка подключения…"
    case testing = "VPN-туннель активен — не проверен"
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
    private var activeManager: NETunnelProviderManager?
    private var statusObserver: NSObjectProtocol?

    private func observeSystemStatus() {
        if statusObserver != nil { return }
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.updateSystemStatus() }
        }
    }

    private func updateSystemStatus() {
        guard let current = activeManager?.connection.status else { return }
        switch current {
        case .connected:
            state = .testing
            explanation = "iOS создала VPN-туннель. Трафик через H1Cloud и DNS/IPv6 пока НЕ проверены."
        case .connecting, .reasserting:
            state = .preparing
            explanation = "Система устанавливает VPN-соединение…"
        case .disconnecting:
            state = .preparing
            explanation = "Система завершает VPN-соединение…"
        case .disconnected, .invalid:
            if state != .disconnected {
                state = .error
                explanation = "VPN-туннель не запущен или отключился."
            }
        @unknown default:
            state = .error
            explanation = "Неизвестное состояние системного VPN."
        }
    }

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
            // Never overwrite another VPN provider's configuration.
            let manager = managers.first(where: {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == "app.vainah.vpn.PacketTunnel"
            }) ?? NETunnelProviderManager()
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
            activeManager = manager
            observeSystemStatus()
            try manager.connection.startVPNTunnel(options: [
                "h1SubscriptionHTTPS": subscription as NSString
            ])
            // A system .connected status is only a route setup signal,
            // NOT evidence that H1Cloud carries DNS, IPv4 and IPv6 traffic.
            state = .preparing
            explanation = "Ожидаем подтверждения системного VPN…"
        } catch {
            state = .error
            explanation = "Не удалось создать системное подключение. Проверь разрешения NetworkExtension."
        }
    }

    func disconnect() async {
        let managers = (try? await NETunnelProviderManager.loadAllFromPreferences()) ?? []
        // Disconnect only our own PacketTunnel, not other installed VPNs.
        for manager in managers {
            let provider = manager.protocolConfiguration as? NETunnelProviderProtocol
            guard provider?.providerBundleIdentifier == "app.vainah.vpn.PacketTunnel" else {
                continue
            }
            manager.connection.stopVPNTunnel()
        }
        activeManager = nil
        if let observer = statusObserver {
            NotificationCenter.default.removeObserver(observer)
            statusObserver = nil
        }
        state = .disconnected
        explanation = "Подключение остановлено."
    }
}
