import Foundation
import Combine
import NetworkExtension

/// Native macOS Packet Tunnel ownership (separate from Electron preview).
/// Apple NetworkExtension requires a signed app and embedded packet forwarder.
@MainActor
final class MacTunnelController: ObservableObject {
    enum State {
        case off, prepared, connecting, tunnelUnverified, error
    }

    // Do not turn this on until a genuine Apple VLESS REALITY core is linked
    // into the PacketTunnel extension and device tests confirm forwarding.
    private static let hasVerifiedCore = false

    @Published private(set) var state: State = .off
    @Published private(set) var message = "VPN отключён. macOS-движок готовится."
    @Published private(set) var serverReady = false

    private let extensionID = "app.vainah.vpn.mac.PacketTunnel"
    private var connection: NEVPNConnection?
    private var observer: NSObjectProtocol?

    init() {
        observer = NotificationCenter.default.addObserver(
            forName: .NEVPNStatusDidChange, object: nil, queue: .main
        ) { [weak self] notification in
            Task { @MainActor [weak self] in
                guard let self,
                      let candidate = notification.object as? NEVPNConnection,
                      self.connection === candidate else { return }
                self.syncStatus(candidate.status)
            }
        }
    }

    /// Only a validated profile is stored, in the same Keychain access group
    /// as this app's own Packet Tunnel extension. Never log the supplied URL.
    func prepare(_ raw: String) -> Bool {
        guard state != .connecting && state != .tunnelUnverified else {
            message = "Отключите VPN перед заменой профиля."
            return false
        }
        // Never let the previous node be reused after a rejected import.
        guard VlessRealityConfig.validate(raw),
              SharedTunnelProfile.save(raw) else {
            SharedTunnelProfile.clear()
            serverReady = false
            state = .error
            message = "Профиль не поддерживается или защищённое хранилище недоступно."
            return false
        }
        serverReady = true
        state = .prepared
        message = "VLESS REALITY TCP профиль сохранён в защищённом Keychain."
        return true
    }

    private func syncStatus(_ status: NEVPNStatus) {
        switch status {
        case .connected:
            // OS says connected, not that DNS/IPv6 are leak free.
            state = .tunnelUnverified
            message = "Системный туннель открыт. Выход IP/DNS/IPv6 не проверен."
        case .connecting, .reasserting, .disconnecting:
            state = .connecting
            message = "Операция с VPN или восстановление сети…"
        case .disconnected:
            state = .off
            message = "VPN отключён. Трафик не защищён."
        case .invalid:
            state = .error
            message = "Недействительный VPN-профиль macOS."
        @unknown default:
            state = .error
            message = "Неизвестное состояние VPN."
        }
    }

    func connect() async {
        guard serverReady, SharedTunnelProfile.load() != nil else {
            state = .error
            message = "Сначала сохраните поддерживаемый VLESS REALITY профиль."
            return
        }
        guard Self.hasVerifiedCore else {
            state = .error
            message = "Настоящий VLESS-движок macOS ещё не встроен. VPN не подключён."
            return
        }

        state = .connecting
        do {
            let existing = try await NETunnelProviderManager.loadAllFromPreferences()
            let manager = existing.first {
                ($0.protocolConfiguration as? NETunnelProviderProtocol)?
                    .providerBundleIdentifier == extensionID
            } ?? NETunnelProviderManager()

            let settings = NETunnelProviderProtocol()
            settings.providerBundleIdentifier = extensionID
            settings.serverAddress = "Vainah VPN"
            manager.localizedDescription = "Vainah VPN"
            manager.protocolConfiguration = settings
            manager.isEnabled = true
            try await manager.saveToPreferences()
            try await manager.loadFromPreferences()
            connection = manager.connection
            try manager.connection.startVPNTunnel()
            syncStatus(manager.connection.status)
        } catch {
            state = .error
            message = "Не удалось создать VPN-профиль. Проверьте подпись и права NetworkExtension."
        }
    }

    func disconnect() async {
        let managers = (try? await NETunnelProviderManager.loadAllFromPreferences()) ?? []
        for manager in managers {
            guard let config = manager.protocolConfiguration as? NETunnelProviderProtocol,
                  config.providerBundleIdentifier == extensionID else { continue }
            manager.connection.stopVPNTunnel()
        }
        connection = nil
        state = .off
        message = "VPN отключён."
    }
}
