import SwiftUI
import WatchConnectivity

/// Watch companion for a paired phone. It never holds a subscription URL,
/// VPN bearer token, REALITY key, server IP or a packet-tunnel entitlement.
struct VainahWatchSnapshot {
    let phase: String
    let label: String
    let latency: String

    static func parse(_ payload: [String: Any]) -> VainahWatchSnapshot {
        let phases = ["off", "starting", "tun_ready", "online", "failed"]
        let raw = payload["phase"] as? String ?? "off"
        let valid = phases.contains(raw) ? raw : "off"
        // A phone must explicitly confirm browser egress before advertising
        // online. An app-owned probe does not count.
        let verified = payload["verified_browser_egress"] as? Bool == true
        let phase = valid == "online" && !verified ? "tun_ready" : valid
        let text = payload["server"] as? String ?? ""
        let safe = text.count <= 80 && !text.contains("://") &&
            !text.contains("@") && !text.contains("?") &&
            !text.contains("#") &&
            text.rangeOfCharacter(from: .controlCharacters) == nil
            ? text : ""
        let ms = payload["tcp_latency_ms"] as? Int ?? -1
        return VainahWatchSnapshot(
            phase: phase, label: safe.isEmpty ? "Vainah VPN" : safe,
            latency: (0...60000).contains(ms) ? "TCP \(ms) мс" : "—"
        )
    }
}

final class VainahWatchPhone: NSObject, ObservableObject, WCSessionDelegate {
    @Published var status = VainahWatchSnapshot.parse([:])
    @Published var message = "Ожидание телефона…"

    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        } else { message = "Связь с телефоном недоступна" }
    }

    func requestStatus() { send(command: "status_request") }
    func requestDisconnect() { send(command: "disconnect") }

    private func send(command: String) {
        guard ["status_request", "disconnect"].contains(command),
              WCSession.isSupported(), WCSession.default.isReachable else {
            DispatchQueue.main.async { self.message = "Телефон недоступен" }
            return
        }
        // Commands contain neither secrets nor remote server addresses.
        WCSession.default.sendMessage(
            ["version": 1, "command": command],
            replyHandler: { response in
                DispatchQueue.main.async {
                    self.status = VainahWatchSnapshot.parse(response)
                    self.message = "Ответ телефона"
                }
            },
            errorHandler: { _ in
                DispatchQueue.main.async { self.message = "Нет ответа телефона" }
            }
        )
    }

    func session(_ session: WCSession, activationDidCompleteWith state:
                 WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            self.message = state == .activated
                ? "Телефон подключён" : "Ожидание телефона…"
        }
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        DispatchQueue.main.async { self.status = VainahWatchSnapshot.parse(message) }
    }
}

struct VainahWatchDashboard: View {
    @StateObject private var phone = VainahWatchPhone()

    var body: some View {
        ScrollView {
            VStack(spacing: 9) {
                Text("VAINAH VPN").font(.headline)
                    .foregroundStyle(.purple)
                Text(phone.status.label).font(.subheadline)
                    .lineLimit(2)
                Text(phone.status.phase == "online" ? "Подтверждено телефоном"
                     : phone.status.phase == "tun_ready" ? "Туннель не проверен"
                     : phone.status.phase == "starting" ? "Подключение…"
                     : phone.status.phase == "failed" ? "Ошибка VPN"
                     : "VPN отключён")
                    .font(.caption)
                Text(phone.status.latency).font(.caption2)
                Button("Обновить") { phone.requestStatus() }
                Button("Отключить на телефоне") { phone.requestDisconnect() }
                    .tint(.red)
                Text(phone.message).font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
