import SwiftUI

struct MacDashboard: View {
    @StateObject private var vpn = MacTunnelController()
    @State private var profileInput = ""

    private let purple = Color(red: 0.66, green: 0.55, blue: 1)
    private let background = Color(red: 0.05, green: 0.06, blue: 0.10)

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("V A I N A H   V P N")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(purple)
                Text("Твоё соединение.\nТвои правила.")
                    .font(.system(size: 34, weight: .bold))
                Text("macOS · Native NetworkExtension foundation · 0.5")
                    .font(.footnote).foregroundStyle(.secondary)

                GroupBox {
                    VStack(alignment: .leading, spacing: 15) {
                        Text("ПОДКЛЮЧЕНИЕ")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(purple)
                        Text(vpn.message)
                            .font(.body)
                            .accessibilityLabel(vpn.message)
                        Text("macOS пока не защищён Vainah VPN: библиотека VLESS REALITY не подключена к Packet Tunnel.")
                            .font(.footnote).foregroundStyle(.orange)
                        HStack(spacing: 12) {
                            Button("Подключить") {
                                Task { await vpn.connect() }
                            }
                            .disabled(!vpn.serverReady)
                            Button("Отключить") {
                                Task { await vpn.disconnect() }
                            }
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
                }

                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("VLESS REALITY · ИМПОРТ ПРОФИЛЯ")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(purple)
                        SecureField("Вставь VLESS-ссылку только от своего сервера", text: $profileInput)
                            .textFieldStyle(.roundedBorder)
                        HStack {
                            Button("Проверить и сохранить") {
                                let input = profileInput.trimmingCharacters(in: .whitespacesAndNewlines)
                                _ = vpn.prepare(input)
                                // Never leave a credential in an editable text field.
                                profileInput = ""
                            }
                            Text("Ссылка хранится только в Keychain")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
                }

                GroupBox {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("ПРИВАТНОСТЬ")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(purple)
                        Text("Внешние проверки откроются в браузере и увидят публичный IP.")
                            .font(.caption).foregroundStyle(.secondary)
                        HStack {
                            Link("Внешний IP ↗", destination: URL(string: "https://www.cloudflare.com/cdn-cgi/trace")!)
                            Link("DNS ↗", destination: URL(string: "https://www.dnsleaktest.com/")!)
                            Link("IPv6 ↗", destination: URL(string: "https://test-ipv6.com/")!)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading).padding(12)
                }
            }
            .padding(30)
            .frame(maxWidth: 850, alignment: .leading)
        }
        .background(background.ignoresSafeArea())
        .tint(purple)
    }
}
