import SwiftUI

private enum Brand {
    static let background = Color(red: 0.035, green: 0.047, blue: 0.097)
    static let surface = Color(red: 0.085, green: 0.097, blue: 0.17)
    static let violet = Color(red: 0.71, green: 0.59, blue: 1.0)
    static let muted = Color(red: 0.70, green: 0.74, blue: 0.83)
}

struct ContentView: View {
    @StateObject private var tunnel = TunnelController()
    @State private var subscription = ""
    @State private var saved = SecureSubscription.load() != nil
    @State private var notice = ""
    @State private var showErase = false

    var body: some View {
        ZStack {
            Brand.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 23) {
                    header
                    connectionCard
                    subscriptionCard
                    helpCard
                    Text("Vainah VPN · Native 0.1 · VPN-движок пока не встроен")
                        .font(.caption2)
                        .foregroundStyle(Brand.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
                .padding(.horizontal, 20)
                .padding(.top, 26)
                .padding(.bottom, 36)
                .frame(maxWidth: 650)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .alert("Vainah VPN", isPresented: Binding(
            get: { !notice.isEmpty },
            set: { if !$0 { notice = "" } }
        )) {
            Button("Понятно") { notice = "" }
        } message: {
            Text(notice)
        }
        .confirmationDialog("Удалить локальную подписку?",
                            isPresented: $showErase) {
            Button("Удалить профиль", role: .destructive) {
                SecureSubscription.remove()
                saved = false
                subscription = ""
            }
        } message: {
            Text("Будет удалена только ссылка на этом устройстве.")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 13) {
            Label("VAINAH VPN", systemImage: "sparkle")
                .font(.system(size: 13, weight: .heavy, design: .rounded))
                .tracking(2)
                .foregroundStyle(Brand.violet)
            Text("Свобода\nна связи.")
                .font(.system(size: 43, weight: .bold, design: .rounded))
                .tracking(-1.9)
                .foregroundStyle(.white)
                .fixedSize(horizontal: false, vertical: true)
            Text("Нативное приложение для iPhone и iPad")
                .font(.subheadline)
                .foregroundStyle(Brand.muted)
        }
        .padding(.bottom, 7)
    }

    private var connectionCard: some View {
        VStack(spacing: 19) {
            HStack {
                Label("МОЁ СОЕДИНЕНИЕ", systemImage: "shield")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(Brand.violet)
                Spacer()
                Text("OFFLINE")
                    .font(.system(size: 10, weight: .heavy))
                    .foregroundStyle(Brand.muted)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.06), in: Capsule())
            }
            Button {
                Task { await tunnel.connect() }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(colors: [
                                Brand.violet.opacity(0.35),
                                Brand.violet.opacity(0.10),
                                .clear
                            ], center: .center, startRadius: 20, endRadius: 102)
                        )
                        .frame(width: 205, height: 205)
                    Circle()
                        .strokeBorder(Brand.violet.opacity(0.9), lineWidth: 3)
                        .frame(width: 134, height: 134)
                        .background(Brand.violet.opacity(0.12), in: Circle())
                    Image(systemName: "power")
                        .font(.system(size: 49, weight: .medium))
                        .foregroundStyle(Brand.violet)
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Подключиться к VPN")
            .accessibilityHint("Пока нет VLESS-движка: покажет сообщение, не создавая ложный туннель")

            Text(tunnel.state.rawValue)
                .font(.system(size: 25, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            Text(tunnel.explanation)
                .font(.footnote)
                .foregroundStyle(Brand.muted)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 6)
            Button("Отключить") {
                Task { await tunnel.disconnect() }
            }
            .buttonStyle(.bordered)
            .tint(Brand.violet)
            .disabled(!VLESSCore.available)
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .background(Brand.surface, in: RoundedRectangle(cornerRadius: 27))
        .overlay(
            RoundedRectangle(cornerRadius: 27)
                .strokeBorder(Brand.violet.opacity(0.25))
        )
    }

    private var subscriptionCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            sectionTitle("МОЯ ПОДПИСКА", symbol: "key.fill")
            HStack {
                Text(saved ? "✓ Профиль сохранён" : "Профиль не добавлен")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
            }
            SecureField("HTTPS-ссылка подписки", text: $subscription)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textContentType(.password)
                .font(.subheadline)
                .padding(15)
                .background(Color.black.opacity(0.22),
                            in: RoundedRectangle(cornerRadius: 13))
                .accessibilityLabel("Секретная HTTPS-ссылка VPN")
            Button {
                if SecureSubscription.save(subscription) {
                    saved = true
                    subscription = ""
                    notice = "Ссылка зашифрована и сохранена в Keychain. На сервер она не отправлялась."
                } else {
                    notice = "Вставь корректную HTTPS-ссылку из личного кабинета Vainah VPN."
                }
            } label: {
                Text("Сохранить профиль")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
            }
            .buttonStyle(.borderedProminent)
            .tint(Brand.violet)
            .foregroundStyle(Color.black)
            if saved {
                Button("Удалить профиль с устройства", role: .destructive) {
                    showErase = true
                }
                .font(.footnote)
            }
            Text("Подписка содержит секрет доступа. Не пересылай её и не публикуй скриншоты ссылки. Пока что импорт выполняется вручную.")
                .font(.footnote)
                .foregroundStyle(Brand.muted)
        }
        .card()
    }

    private var helpCard: some View {
        VStack(alignment: .leading, spacing: 17) {
            sectionTitle("АККАУНТ И ПОМОЩЬ", symbol: "person.crop.circle")
            Text("Войди через сайт, проверь срок подписки и открой доступ к инструкции.")
                .font(.footnote)
                .foregroundStyle(Brand.muted)
            Link(destination: URL(string: "https://vainahvpnbot0.netlify.app/account.html")!) {
                Label("Личный кабинет", systemImage: "arrow.up.right")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .tint(Brand.violet)
            Link(destination: URL(string: "https://vainahvpnbot0.netlify.app/diagnostics.html")!) {
                Label("Диагностика и поддержка", systemImage: "wrench.and.screwdriver")
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .tint(Brand.violet)
        }
        .card()
    }

    private func sectionTitle(_ title: String, symbol: String) -> some View {
        Label(title, systemImage: symbol)
            .font(.system(size: 11, weight: .heavy))
            .tracking(1.1)
            .foregroundStyle(Brand.violet)
    }
}

private extension View {
    func card() -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(21)
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: 24))
            .overlay(
                RoundedRectangle(cornerRadius: 24)
                    .strokeBorder(Brand.violet.opacity(0.22))
            )
    }
}
