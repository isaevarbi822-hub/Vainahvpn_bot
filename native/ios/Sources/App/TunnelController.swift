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
    private var statusObserver: NSObjectProtocol?
    private var managedConnection: NEVPNConnection?

    init() {
        statusObserver = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] notification in
            // Notification may refer to *another app's* VPN: never update
            // our screen from an unrelated NEVPNConnection instance.
            Task { @MainActor [weak self] in
                guard let self,
                      let connection = notification.object as? NEVPNConnection,
                      self.managedConnection === connection else { return }
                self.updateStatus(connection.status)
            }
        }
    }

    private func updateStatus(_ status: NEVPNStatus) {
        switch status {
        case .connected:
            // This is an OS connection state, not proof of real browser
            // egress or absence of DNS/IPv6 leaks.
            state = .connected
            explanation = "Система сообщает о туннеле. Проверь IP, DNS и IPv6 в браузере."
        case .connecting, .reasserting:
            state = .preparing
            explanation = "VPN подключается или восстанавливает сеть…"
        case .disconnecting:
            state = .preparing
            explanation = "Отключение VPN…"
        case .disconnected:
            state = .disconnected
            explanation = "VPN отключён. Трафик не защищён."
        case .invalid:
            state = .error
            explanation = "Системный VPN-профиль недействителен."
        @unknown default:
            state = .error
            explanation = "Неизвестное состояние системного VPN."
        }
    }

    // Pre-flight checks occur in the UI process. The profile URI is a bearer
    // credential; never put it in logs, error messages or NE configuration.
    @Published private(set) var profilePrepared = false
    private var currentProfileId: String?
    private var currentProfileURI: String?

    func resetProfile() {
        currentProfileId = nil
        currentProfileURI = nil
        SharedTunnelProfile.clear()
        profilePrepared = false
        state = .disconnected
        explanation = "Выбери сервер новой подписки перед подключением."
    }

    func prepare(_ server: SubscriptionServer) {
        // Replacing a profile during a running NE session risks reconnecting
        // with stale credentials. Disconnect first.
        guard state != .connected && state != .preparing else {
            explanation = "Сначала отключи VPN перед сменой сервера."
            return
        }
        // A rejected server must never leave the previous VLESS credential
        // available for a later extension restart.
        SharedTunnelProfile.clear()
        currentProfileId = nil
        currentProfileURI = nil
        profilePrepared = VlessRealityConfig.validate(server.uri)
        if profilePrepared {
            currentProfileId = server.id
            currentProfileURI = server.uri
        }
        if !profilePrepared {
            state = .unavailable
            explanation = "Выбранный сервер не поддерживается. Нужен VLESS REALITY TCP."
        } else {
            explanation = "Параметры сервера проверены. Ожидается интеграция libbox для Apple."
        }
    }

    /// Future real core must configure a packet tunnel extension and route packets.
    func connect() async {
        guard SecureSubscription.load() != nil else {
            state = .disconnected
            explanation = "Сначала сохрани HTTPS-ссылку подписки."
            return
        }
        guard profilePrepared, currentProfileId != nil,
              let profileURI = currentProfileURI else {
            state = .unavailable
            explanation = "Сначала выбери и проверь VLESS REALITY TCP сервер."
            return
        }
        guard VLESSCore.available else {
            state = .unavailable
            explanation = "Для H1Cloud нужен VLESS-движок. Эта версия не создаёт ложное подключение."
            return
        }
        // This protected Keychain entry is accessible to the extension only
        // when both app targets have the same signing entitlement. Refuse to
        // proceed if provisioning does not permit secure sharing.
        guard SharedTunnelProfile.save(profileURI) else {
            state = .error
            explanation = "Не удалось защитить VPN-профиль в общем Keychain."
            return
        }
        state = .preparing
        do {
            let managers = try await NETunnelProviderManager.loadAllFromPreferences()
            // Never mutate an unrelated VPN profile already installed on a
            // user's iPhone. Scope all operations to our extension identifier.
            let manager = managers.first(where: { manager in
                guard let proto = manager.protocolConfiguration as? NETunnelProviderProtocol
                else { return false }
                return proto.providerBundleIdentifier == "app.vainah.vpn.PacketTunnel"
            }) ?? NETunnelProviderManager()
            let configuration = NETunnelProviderProtocol()
            configuration.providerBundleIdentifier = "app.vainah.vpn.PacketTunnel"
            configuration.serverAddress = "Vainah VPN"
            manager.protocolConfiguration = configuration
            manager.localizedDescription = "Vainah VPN"
            manager.isEnabled = true
            try await manager.saveToPreferences()
            try await manager.loadFromPreferences()
            managedConnection = manager.connection
            try manager.connection.startVPNTunnel()
            // Do not publish CONNECTED before NetworkExtension reports it.
            updateStatus(manager.connection.status)
        } catch {
            SharedTunnelProfile.clear()
            state = .error
            explanation = "Не удалось создать системное подключение. Проверь разрешения NetworkExtension."
        }
    }

    func disconnect() async {
        let managers = (try? await NETunnelProviderManager.loadAllFromPreferences()) ?? []
        for manager in managers {
            let proto = manager.protocolConfiguration as? NETunnelProviderProtocol
            guard proto?.providerBundleIdentifier == "app.vainah.vpn.PacketTunnel"
            else { continue }
            manager.connection.stopVPNTunnel()
        }
        managedConnection = nil
        SharedTunnelProfile.clear()
        state = .disconnected
        explanation = "Подключение остановлено."
    }
}
