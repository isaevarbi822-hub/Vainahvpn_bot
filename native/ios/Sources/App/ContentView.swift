import SwiftUI

private enum SiteTab: Hashable {
    case home, plans, account, help
}

/**
 * Native interpretation of the EXISTING site: same hero, V logo, tokens,
 * six plans, plan filters, dashboard preview, help and information hierarchy.
 * The app is not a WebView and makes no false "connected" claim.
 */
struct ContentView: View {
    @StateObject private var tunnel = TunnelController()
    @StateObject private var nativeAccount = NativeAccount()
    @State private var nativeMethod = "email"
    @State private var nativeContact = ""
    @State private var nativeCode = ""
    @State private var attachingEmail = false
    @State private var nativeMessage = ""
    @State private var selected: SiteTab = .home
    @State private var devices = 0
    @State private var subscription = ""
    @State private var saved = SecureSubscription.load() != nil
    @State private var serverNames: [String] = []
    @State private var serverProfiles: [SubscriptionServer] = []
    @State private var serverSearch = ""
    @State private var selectedServerId: String?
    @State private var chosenServer: Int?
    @State private var loadingServers = false
    @State private var serverSyncStatus = "Серверы ещё не загружены"
    @State private var notice: String?
    @State private var showErase = false

    var body: some View {
        TabView(selection: $selected) {
            screen { home }
                .tabItem { Label("Главная", systemImage: "house.fill") }
                .tag(SiteTab.home)
            screen { plans }
                .tabItem { Label("Тарифы", systemImage: "rectangle.grid.2x2.fill") }
                .tag(SiteTab.plans)
            screen { account }
                .tabItem { Label("Кабинет", systemImage: "person.crop.circle") }
                .tag(SiteTab.account)
            screen { help }
                .tabItem { Label("Помощь", systemImage: "questionmark.circle") }
                .tag(SiteTab.help)
        }
        .tint(VainahDesign.purple)
        .preferredColorScheme(.dark)
        // Refresh H1Cloud locations only on the Home tab. Nothing secret is
        // sent to analytics or to a watch. Cancellation leaves old rows.
        .task(id: selected) {
            guard selected == .home else { return }
            await refreshServers()
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 300_000_000_000)
                if Task.isCancelled { return }
                await refreshServers()
            }
        }
        .alert("Vainah VPN", isPresented: Binding(
            get: { notice != nil },
            set: { if !$0 { notice = nil } }
        )) {
            Button("Понятно") { notice = nil }
        } message: {
            Text(notice ?? "")
        }
        .confirmationDialog("Удалить локальную подписку?",
                            isPresented: $showErase) {
            Button("Удалить профиль", role: .destructive) {
                SecureSubscription.remove()
                saved = false
                subscription = ""
                serverNames = []
                serverProfiles = []
                selectedServerId = nil
                chosenServer = nil
                tunnel.resetProfile()
                serverSyncStatus = "Подписка удалена"
            }
        } message: {
            Text("Будет удалена только ссылка на этом устройстве.")
        }
    }

    private func screen<Content: View>(
        @ViewBuilder content: () -> Content
    ) -> some View {
        ZStack {
            VainahDesign.background.ignoresSafeArea()
            RadialGradient(
                colors: [VainahDesign.purple.opacity(0.14), .clear],
                center: .topTrailing,
                startRadius: 35, endRadius: 450
            ).ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    brandHeader
                    content()
                    Text("Vainah VPN 0.5 · iPhone / iPad")
                        .font(.system(size: 11))
                        .foregroundStyle(VainahDesign.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 29)
                }
                .frame(maxWidth: 790)
                .padding(.horizontal, 20)
                .padding(.top, 22)
                .padding(.bottom, 37)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var brandHeader: some View {
        HStack(spacing: 12) {
            VainahMark()
                .frame(width: 44, height: 44)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("VAINAH VPN")
                    .font(.system(size: 17, weight: .heavy, design: .rounded))
                    .tracking(1)
                    .foregroundStyle(VainahDesign.ink)
                Text("ТВОЁ СОЕДИНЕНИЕ. ТВОИ ПРАВИЛА.")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(VainahDesign.muted)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }

    private func overline(_ name: String) -> some View {
        HStack(spacing: 7) {
            Circle()
                .fill(VainahDesign.purple)
                .frame(width: 6, height: 6)
            Text(name)
                .font(.system(size: 10, weight: .heavy))
                .tracking(1.3)
                .foregroundStyle(VainahDesign.purple)
        }
    }

    private func heading(_ kicker: String, _ title: Text,
                         _ description: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            overline(kicker)
            title
                .font(.system(size: 37, weight: .bold, design: .rounded))
                .tracking(-1.6)
                .foregroundStyle(VainahDesign.ink)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(description)
                .font(.system(size: 13))
                .lineSpacing(4)
                .foregroundStyle(VainahDesign.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 30)
        .padding(.bottom, 18)
    }

    private func callToAction(_ name: String,
                              prominent: Bool = false,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(name)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(prominent ? Color(red: 18/255, green: 13/255, blue: 34/255)
                                         : VainahDesign.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .padding(.horizontal, 14)
                .background(
                    Group {
                        if prominent {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(VainahDesign.accentGradient)
                        } else {
                            RoundedRectangle(cornerRadius: 14)
                                .fill(VainahDesign.surface2)
                        }
                    }
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(prominent ? VainahDesign.purple
                                   : VainahDesign.border, lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
    }

    private var home: some View {
        VStack(alignment: .leading, spacing: 0) {
            overline("МОЙ VPN  /  ПАНЕЛЬ УПРАВЛЕНИЯ")
                .padding(.top, 22)
            Text("VPN под контролем.")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .tracking(-0.9)
                .foregroundStyle(VainahDesign.ink)
                .padding(.top, 9)
            Text("Подключение, локации и скорость — всё рядом.")
                .font(.system(size: 12))
                .foregroundStyle(VainahDesign.muted)
                .padding(.top, 6)
            connectionCard
                .padding(.top, 16)
            VainahCard {
                VStack(alignment: .leading, spacing: 11) {
                    overline("СЕРВЕРЫ И КОНФИГУРАЦИИ")
                    Text("Твои локации")
                        .font(.system(size: 23, weight: .bold))
                        .foregroundStyle(VainahDesign.ink)
                    Text(saved
                         ? "SUB / Xray JSON · обновление при открытии и каждые 5 минут."
                         : "Добавь личную HTTPS-подписку в кабинете для загрузки локаций.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    Text(serverSyncStatus)
                        .font(.system(size: 11))
                        .foregroundStyle(VainahDesign.sky)
                    TextField("Поиск страны или локации", text: $serverSearch)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .padding(12)
                        .background(VainahDesign.background.opacity(0.6),
                                    in: RoundedRectangle(cornerRadius: 12))
                    if !serverNames.isEmpty {
                        ForEach(Array(serverProfiles.enumerated()).filter {
                            serverSearch.isEmpty ||
                                $0.element.label.localizedCaseInsensitiveContains(serverSearch)
                        }, id: \.offset) { item in
                            callToAction((selectedServerId == item.element.id ? "✓ " : "")
                                         + item.element.label) {
                                selectedServerId = item.element.id
                                chosenServer = item.offset
                                tunnel.prepare(item.element)
                                notice = "Сервер выбран. Для iOS нужен отдельный VLESS Packet Tunnel движок. Android APK здесь не работает."
                            }
                        }
                    }
                    callToAction(loadingServers ? "Загружаем серверы…" : "Обновить серверы") {
                        Task { await refreshServers() }
                    }
                    callToAction("Добавить или изменить подписку") {
                        selected = .account
                    }
                }
            }
            .padding(.top, 14)
            statistics
                .padding(.top, 14)
            privacyCard
                .padding(.top, 14)
            HStack(spacing: 12) {
                callToAction("Тарифы  ↗") { selected = .plans }
                callToAction("Мой кабинет  ↗") { selected = .account }
            }
            .padding(.top, 12)

            overline("ЛИЧНЫЙ КАБИНЕТ")
                .padding(.top, 30)
            VainahCard {
                VStack(alignment: .leading, spacing: 11) {
                    Text("Всё важное.\nВ одном месте.")
                        .font(.system(size: 28, weight: .bold, design: .rounded))
                        .tracking(-1)
                        .foregroundStyle(VainahDesign.ink)
                    Text("Подписка и срок · устройства · история покупок · VPN-доступ")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    callToAction("Открыть кабинет  ↗") {
                        selected = .account
                    }
                    .padding(.top, 8)
                }
            }
            .padding(.top, 12)

            VainahCard {
                VStack(alignment: .leading, spacing: 11) {
                    Text("Центр поддержки")
                        .font(.system(size: 21, weight: .bold, design: .rounded))
                        .foregroundStyle(VainahDesign.ink)
                    Text("Проверка сервисов и инструкции для устройств.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    callToAction("Открыть помощь  ↗") {
                        selected = .help
                    }
                    .padding(.top, 7)
                }
            }
            .padding(.top, 13)

            VainahCard(featured: true) {
                VStack(alignment: .leading, spacing: 13) {
                    overline("ПЕРВЫЙ ЗАПУСК · 3 ПРОСТЫХ ШАГА")
                    ForEach(Array([
                        ("01", "Войди в аккаунт",
                         "Выбери Telegram, почту, телефон или Яндекс на сайте."),
                        ("02", "Проверь подписку",
                         "После входа посмотри свой тариф и срок действия."),
                        ("03", "Настрой устройство",
                         "Используй мастер, пока VLESS-движок ещё не встроен.")
                    ].enumerated()), id: \.offset) { item in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.element.0 + "  " + item.element.1)
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(VainahDesign.ink)
                            Text(item.element.2)
                                .font(.system(size: 12))
                                .foregroundStyle(VainahDesign.muted)
                        }
                        .padding(.top, 4)
                    }
                    Link(destination: URL(string: "https://vainahvpnbot0.netlify.app/device-center.html")!) {
                        Text("Открыть мастер подключения ↗")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Color.black)
                            .frame(maxWidth: .infinity)
                            .padding(14)
                            .background(VainahDesign.accentGradient,
                                        in: RoundedRectangle(cornerRadius: 13))
                    }
                    Text("Предварительная версия интерфейса. Настоящий VPN ещё не подключается.")
                        .font(.system(size: 11))
                        .foregroundStyle(VainahDesign.muted)
                }
            }
            .padding(.top, 17)
        }
    }

    @MainActor
    private func refreshServers() async {
        guard !loadingServers, let link = SecureSubscription.load() else { return }
        loadingServers = true
        serverSyncStatus = "Синхронизируем локации…"
        defer { loadingServers = false }
        do {
            let profiles = try await SubscriptionServers.loadProfiles(link)
            // Do not mix a response from an old subscription with a new one.
            guard SecureSubscription.load() == link else {
                serverSyncStatus = "Подписка изменилась. Обнови список ещё раз."
                return
            }
            serverProfiles = profiles
            serverNames = profiles.map(\.label)
            if let selectedServerId, let index = profiles.firstIndex(where: {
                $0.id == selectedServerId
            }) {
                chosenServer = index
                tunnel.prepare(profiles[index])
            } else {
                selectedServerId = nil
                chosenServer = nil
                tunnel.resetProfile()
            }
            serverSyncStatus = "Обновлено: \(profiles.count) локаций"
        } catch {
            // Retain last-known-good rows; never display a private URL.
            serverSyncStatus = "Не удалось обновить. Старый список сохранён."
        }
    }

    private var privacyCard: some View {
        VainahCard {
            VStack(alignment: .leading, spacing: 12) {
                overline("ЦЕНТР ПРИВАТНОСТИ")
                Text("IP, DNS и IPv6")
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(VainahDesign.ink)
                Text("Внешние тесты увидят твой IP. Результат не гарантирует отсутствие всех утечек.")
                    .font(.system(size: 12))
                    .foregroundStyle(VainahDesign.muted)
                Link("Проверить IP и интернет ↗",
                     destination: URL(string:"https://www.cloudflare.com/cdn-cgi/trace")!)
                Link("Проверить DNS ↗",
                     destination: URL(string:"https://www.dnsleaktest.com/")!)
                Link("Проверить IPv6 ↗",
                     destination: URL(string:"https://test-ipv6.com/")!)
            }
            .tint(VainahDesign.purple)
        }
    }

    private var connectionCard: some View {
        VainahCard(featured: true) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    overline("✦ VAINAH VPN")
                    Spacer(minLength: 8)
                    Text(tunnel.state == .connected ? "ТУННЕЛЬ ОТКРЫТ" : "НЕ ПОДКЛЮЧЕНО")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(tunnel.state == .connected
                                         ? VainahDesign.green : VainahDesign.muted)
                        .lineLimit(1).minimumScaleFactor(0.75)
                }
                overline("УПРАВЛЕНИЕ ТУННЕЛЕМ")
                    .padding(.top, 2)
                HStack(alignment: .center, spacing: 15) {
                    Button {
                        Task { await tunnel.connect() }
                    } label: {
                        VainahPowerButton(active: tunnel.state == .connected)
                            .frame(width: 106, height: 106)
                    }
                    .buttonStyle(.plain)
                    .disabled(!VLESSCore.available)
                    .accessibilityLabel("Подключиться к VPN")
                    .accessibilityHint("iOS-движок VLESS ещё не встроен")
                    VStack(alignment: .leading, spacing: 6) {
                        Text(tunnel.state.rawValue)
                            .font(.system(size: 23, weight: .bold, design: .rounded))
                            .foregroundStyle(VainahDesign.ink)
                            .lineLimit(2).minimumScaleFactor(0.8)
                        Text(tunnel.explanation)
                            .font(.system(size: 11))
                            .foregroundStyle(VainahDesign.muted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                HStack(spacing: 8) {
                    Image(systemName: "server.rack")
                        .foregroundStyle(VainahDesign.purple)
                    Text(serverProfiles.first(where: { $0.id == selectedServerId })?.label
                         ?? "Сервер не выбран")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(VainahDesign.ink)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Button("Локации") {
                        notice = "Выбери страну в разделе локаций ниже."
                    }
                    .font(.system(size: 11, weight: .semibold))
                }
                .padding(11)
                .background(VainahDesign.surface2.opacity(0.85),
                            in: RoundedRectangle(cornerRadius: 12))
                callToAction(VLESSCore.available ? "Подключиться"
                             : "VPN для iOS готовится", prominent: true) {
                    Task { await tunnel.connect() }
                }
                .disabled(!VLESSCore.available)
                Text("Для iPhone и iPad нужен подписанный VLESS Packet Tunnel. " +
                     "Статус защиты не имитируется.")
                    .font(.system(size: 11))
                    .foregroundStyle(VainahDesign.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private var statistics: some View {
        HStack(spacing: 0) {
            statistic("H1Cloud", "локации")
            statistic("6 тарифов", "от 99 ₽")
            statistic("DNS/IPv6", "проверки")
        }
        .padding(.vertical, 17)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(VainahDesign.cardGradient)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .strokeBorder(VainahDesign.border)
        )
    }
    private func statistic(_ big: String, _ small: String) -> some View {
        VStack(spacing: 6) {
            Text(big)
                .font(.system(size: 14, weight: .heavy))
                .foregroundStyle(VainahDesign.ink)
                .minimumScaleFactor(0.75)
                .lineLimit(1)
            Text(small)
                .font(.system(size: 10))
                .foregroundStyle(VainahDesign.muted)
        }
        .frame(maxWidth: .infinity)
    }

    private var plans: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("ТАРИФЫ И ПОДПИСКИ",
                    Text("Доступ на твоих ")
                    + Text("условиях.").foregroundColor(VainahDesign.purple),
                    "Шесть тарифов Vainah VPN. Настоящие покупки доступны только после серверного подтверждения оплаты.")

            VainahCard {
                VStack(alignment: .leading, spacing: 11) {
                    overline("ФИЛЬТР ПО КОЛИЧЕСТВУ УСТРОЙСТВ")
                    Picker("Количество устройств", selection: $devices) {
                        Text("Все").tag(0)
                        Text("3").tag(3)
                        Text("6").tag(6)
                    }
                    .pickerStyle(.segmented)
                    .tint(VainahDesign.purple)
                }
            }
            .padding(.top, 7)

            Text("\(visiblePlans.count) тарифов · безлимитный трафик")
                .font(.system(size: 12))
                .foregroundStyle(VainahDesign.muted)
                .padding(.top, 18)

            ForEach(visiblePlans) { plan in
                planCard(plan)
                    .padding(.top, 13)
            }

            VainahCard(featured: true) {
                VStack(alignment: .leading, spacing: 12) {
                    overline("ПРОЗРАЧНЫЕ УСЛОВИЯ")
                    Text("Оплата в iOS-приложении не активирована. Цены те же, что на Android. Для выпуска через App Store потребуется соответствующий способ оплаты.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    Link(destination: siteURL("compare.html")) {
                        Text("Сравнить все тарифы ↗")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(VainahDesign.purple)
                    }
                }
            }
            .padding(.top, 19)
        }
    }

    private var visiblePlans: [VainahPlan] {
        VainahPlan.all.filter { devices == 0 || $0.deviceLimit == devices }
    }

    private func planCard(_ plan: VainahPlan) -> some View {
        VainahCard(featured: plan.deviceLimit == 6) {
            VStack(alignment: .leading, spacing: 11) {
                Text(plan.badge)
                    .font(.system(size: 10, weight: .heavy))
                    .tracking(1)
                    .foregroundStyle(VainahDesign.purple)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(VainahDesign.purple.opacity(0.11), in: Capsule())
                Text(plan.title)
                    .font(.system(size: 22, weight: .heavy, design: .rounded))
                    .foregroundStyle(VainahDesign.ink)
                Text(plan.priceRub == 1000 ? "1 000 ₽" : "\(plan.priceRub) ₽")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .foregroundStyle(VainahDesign.ink)
                Text("≈ \(plan.priceRub / (plan.days == 365 ? 12 : max(1, plan.days / 30))) ₽/мес")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(VainahDesign.purple)
                Text(plan.days.description + " дней · " + (plan.deviceLimit == 6 ? "6 устройств" : "3 устройства") + " · Безлимитный трафик")
                    .font(.system(size: 12))
                    .foregroundStyle(VainahDesign.muted)
                Link(destination: siteURL("plans.html")) {
                    Text("Подробнее на сайте  ↗")
                        .font(.system(size: 13, weight: .heavy))
                        .foregroundStyle(Color(red: 18/255, green: 13/255, blue: 34/255))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(VainahDesign.accentGradient)
                        )
                }
                .padding(.top, 6)
            }
        }
    }

    private var account: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("ЛИЧНЫЙ КАБИНЕТ",
                    Text("Моя ")
                    + Text("подписка.").foregroundColor(VainahDesign.purple),
                    "Покупки и срок действия доступны в защищённом кабинете сайта после входа.")

            VainahCard(featured: true) {
                VStack(alignment: .leading, spacing: 13) {
                    overline("МОЙ VPN-ПРОФИЛЬ")
                    Text(saved ? "✓ Профиль сохранён локально" : "Профиль не добавлен")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(VainahDesign.ink)
                    Text("Ссылка хранится на устройстве в Keychain. Это не подтверждение оплаченного тарифа.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                        .fixedSize(horizontal: false, vertical: true)

                    TextField("HTTPS-ссылка подписки", text: $subscription)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .font(.system(size: 13))
                        .padding(15)
                        .background(VainahDesign.background.opacity(0.72),
                                    in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("Секретная HTTPS-ссылка VPN")
                        .padding(.top, 5)

                    callToAction("Добавить подписку", prominent: true) {
                        if SecureSubscription.save(subscription) {
                            saved = true
                            subscription = ""
                            serverNames = []
                            serverProfiles = []
                            selectedServerId = nil
                            chosenServer = nil
                            tunnel.resetProfile()
                            notice = "Ссылка сохранена в Keychain только на этом устройстве."
                        } else {
                            notice = "Вставь корректную HTTPS-ссылку из кабинета Vainah VPN."
                        }
                    }
                    callToAction("Удалить с устройства") {
                        showErase = true
                    }
                    Text("VPN-ссылку нельзя публиковать или отправлять посторонним.")
                        .font(.system(size: 11))
                        .foregroundStyle(VainahDesign.muted)
                }
            }
            .padding(.top, 8)

            VainahCard {
                VStack(alignment: .leading, spacing: 12) {
                    overline("ПОДПИСКА И ИСТОРИЯ")
                    Text("Тариф · срок · устройства · покупки")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(VainahDesign.ink)
                    Text("Мобильный вход по телефону или почте доступен ниже. Доступ к покупкам на сервере появится после подтверждения оплаты.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    websiteButton("Войти в личный кабинет ↗", "account.html", prominent: true)
                    websiteButton("Центр управления ↗", "hub.html")
                }
            }
            .padding(.top, 16)

            VainahCard {
                VStack(alignment: .leading, spacing: 12) {
                    overline("СПОСОБЫ ВХОДА")
                    Text("Telegram · Телефон · Почта · Яндекс ID")
                        .font(.system(size: 17, weight: .bold, design: .rounded))
                        .foregroundStyle(VainahDesign.ink)
                    Text("Вход подтверждается на сайте. Приложение не запрашивает чужие пароли и не открывает заказы другого аккаунта.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    Text("Почта и телефон подтверждаются прямо в Vainah VPN. Telegram и Яндекс используют внешние приложения. Их веб-сессии пока не связаны с мобильными покупками.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    Link("Открыть Telegram ↗", destination: URL(string: "https://t.me/Vainahvpn_bot")!)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(VainahDesign.purple)
                    Link("Войти через Яндекс ↗", destination: URL(string: "https://vainahvpnbot0.netlify.app/.netlify/functions/yandex-start")!)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(VainahDesign.purple)
                }
            }
            .padding(.top, 16)

            nativeLogin
                .padding(.top, 16)
        }
    }

    private var nativeLogin: some View {
        VainahCard(featured: true) {
            VStack(alignment: .leading, spacing: 12) {
                overline("ВХОД В ПРИЛОЖЕНИЕ")
                Text(nativeAccount.authenticated
                    ? "✓ Мобильный аккаунт подтверждён"
                    : "Войди по коду из письма или SMS")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(VainahDesign.ink)
                if nativeAccount.authenticated {
                    Text(nativeAccount.emailVerified
                        ? "Email подтверждён и может получать ключ после покупки."
                        : "Чтобы получать VPN по почте, подтверди адрес отдельно.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                    if !nativeAccount.emailVerified {
                        Button("Добавить email для доставки") {
                            attachingEmail = true
                            nativeMethod = "email"
                            nativeContact = ""
                            nativeCode = ""
                        }
                        .foregroundStyle(VainahDesign.purple)
                    }
                    Button("Выйти из мобильного аккаунта") {
                        nativeAccount.signOut()
                        nativeMessage = "Сеанс на этом устройстве завершён."
                    }
                    .foregroundStyle(VainahDesign.muted)
                }
                if !nativeAccount.authenticated || attachingEmail {
                    if !attachingEmail {
                        Picker("Способ входа", selection: $nativeMethod) {
                            Text("Почта").tag("email")
                            Text("Телефон").tag("phone")
                        }
                        .pickerStyle(.segmented)
                    }
                    TextField(attachingEmail ? "Email для VPN-подписки"
                              : nativeMethod == "phone" ? "+79991234567" : "name@example.com",
                              text: $nativeContact)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(attachingEmail || nativeMethod == "email" ? .emailAddress : .phonePad)
                        .padding(13)
                        .background(VainahDesign.background, in: RoundedRectangle(cornerRadius: 12))
                    if nativeAccount.challengePending {
                        Text("Мы отправили код подтверждения. Введи цифры из сообщения.")
                            .font(.system(size: 12))
                            .foregroundStyle(VainahDesign.muted)
                        TextField("Код подтверждения", text: $nativeCode)
                            .keyboardType(.numberPad)
                            .padding(13)
                            .background(VainahDesign.background, in: RoundedRectangle(cornerRadius: 12))
                        Button("Подтвердить вход") {
                            Task {
                                do {
                                    try await nativeAccount.confirm(code: nativeCode.trimmingCharacters(in: .whitespacesAndNewlines))
                                    nativeCode = ""
                                    nativeContact = ""
                                    attachingEmail = false
                                    nativeMessage = "Контакт подтверждён. Вход сохранён в Keychain."
                                } catch { nativeMessage = error.localizedDescription }
                            }
                        }
                        .disabled(nativeAccount.busy)
                        .foregroundStyle(VainahDesign.purple)
                    } else {
                        Button("Выслать код проверки") {
                            Task {
                                do {
                                    try await nativeAccount.send(method: nativeMethod,
                                         contact: nativeContact, attachEmail: attachingEmail)
                                    nativeMessage = "Код отправлен. Введи его ниже."
                                } catch { nativeMessage = error.localizedDescription }
                            }
                        }
                        .disabled(nativeAccount.busy)
                        .foregroundStyle(VainahDesign.purple)
                    }
                }
                if !nativeMessage.isEmpty {
                    Text(nativeMessage)
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                }
            }
        }
        .task { await nativeAccount.refresh() }
    }

    private var help: some View {
        VStack(alignment: .leading, spacing: 0) {
            heading("ЦЕНТР ПОДДЕРЖКИ",
                    Text("Помощь всегда ")
                    + Text("рядом.").foregroundColor(VainahDesign.purple),
                    "Инструкции для устройств, диагностика и состояние сервисов.")

            helpItem("◉  Диагностика VPN",
                     "Вход, импорт, скорость и подключение.", "diagnostics.html")
            helpItem("◇  Статус сервисов",
                     "Проверка базы данных и H1Cloud.", "status.html")
            helpItem("▣  Мои устройства",
                     "iPhone, iPad, Android и другие.", "device-center.html")
            helpItem("?  Вопросы и ответы",
                     "Помощь с тарифами и подпиской.", "help.html")
            helpItem("⛨  Безопасность",
                     "Защита аккаунта и VPN-конфигурации.", "security.html")

            VainahCard(featured: true) {
                VStack(alignment: .leading, spacing: 11) {
                    overline("ЧТО НУЖНО ЗНАТЬ")
                    Text("Как проверить приватность?")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(VainahDesign.ink)
                    Text("Открой проверки IP, DNS и IPv6 в браузере после подключения поддерживаемого VPN-клиента. iOS-движок Vainah пока не интегрирован.")
                        .font(.system(size: 12))
                        .foregroundStyle(VainahDesign.muted)
                }
            }
            .padding(.top, 17)
        }
    }
    private func helpItem(_ title: String, _ description: String,
                          _ page: String) -> some View {
        VainahCard {
            VStack(alignment: .leading, spacing: 11) {
                Text(title)
                    .font(.system(size: 19, weight: .bold, design: .rounded))
                    .foregroundStyle(VainahDesign.ink)
                Text(description)
                    .font(.system(size: 12))
                    .foregroundStyle(VainahDesign.muted)
                websiteButton("Открыть раздел ↗", page)
            }
        }
        .padding(.top, 13)
    }
    private func websiteButton(_ name: String, _ page: String,
                               prominent: Bool = false) -> some View {
        Link(destination: siteURL(page)) {
            Text(name)
                .font(.system(size: 13, weight: .heavy))
                .foregroundStyle(prominent ? VainahDesign.background : VainahDesign.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(
                    Group {
                        if prominent {
                            RoundedRectangle(cornerRadius: 14).fill(VainahDesign.accentGradient)
                        } else {
                            RoundedRectangle(cornerRadius: 14).fill(VainahDesign.surface2)
                        }
                    }
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(VainahDesign.border.opacity(0.8))
                )
        }
        .buttonStyle(.plain)
    }
    private func siteURL(_ page: String) -> URL {
        let allowed = [
            "account.html", "plans.html", "compare.html", "hub.html",
            "diagnostics.html", "status.html", "device-center.html",
            "help.html", "security.html"
        ]
        let filename = allowed.contains(page) ? page : "index.html"
        return URL(string: "https://vainahvpnbot0.netlify.app/" + filename)!
    }
}

private struct VainahCard<Content: View>: View {
    let featured: Bool
    @ViewBuilder let content: () -> Content
    init(featured: Bool = false, @ViewBuilder content: @escaping () -> Content) {
        self.featured = featured
        self.content = content
    }
    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 23)
                    .fill(featured ? VainahDesign.previewGradient : VainahDesign.cardGradient)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 23)
                    .strokeBorder(featured ? VainahDesign.purple.opacity(0.65)
                                  : VainahDesign.border, lineWidth: 1)
            )
    }
}

/// The website's angular V SVG rebuilt using native SwiftUI paths.
private struct VainahMark: View {
    var body: some View {
        GeometryReader { geometry in
            let w = geometry.size.width
            let h = geometry.size.height
            ZStack {
                RoundedRectangle(cornerRadius: w * 0.28)
                    .fill(LinearGradient(
                        colors: [Color(red: 189/255, green: 159/255, blue: 255/255),
                                 Color(red: 101/255, green: 60/255, blue: 224/255)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ))
                Path { path in
                    path.move(to: CGPoint(x: w * 0.22, y: h * 0.30))
                    path.addLine(to: CGPoint(x: w * 0.50, y: h * 0.76))
                    path.addLine(to: CGPoint(x: w * 0.79, y: h * 0.30))
                }
                .stroke(.white, style: StrokeStyle(
                    lineWidth: w * 0.105, lineCap: .round, lineJoin: .round
                ))
                Path { path in
                    path.move(to: CGPoint(x: w * 0.50, y: h * 0.17))
                    path.addLine(to: CGPoint(x: w * 0.65, y: h * 0.44))
                    path.addLine(to: CGPoint(x: w * 0.50, y: h * 0.78))
                }
                .stroke(VainahDesign.sky, style: StrokeStyle(
                    lineWidth: w * 0.055, lineCap: .round, lineJoin: .round
                ))
            }
        }
    }
}

private struct VainahPowerButton: View {
    let active: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(
                    colors: [active ? VainahDesign.green.opacity(0.28)
                                    : VainahDesign.purple.opacity(0.28), .clear],
                    center: .center, startRadius: 12, endRadius: 65
                ))
                .frame(width: 106, height: 106)
            Circle()
                .strokeBorder(active ? VainahDesign.green : VainahDesign.purple,
                              lineWidth: 2.5)
                .frame(width: 83, height: 83)
                .background((active ? VainahDesign.green : VainahDesign.purple)
                    .opacity(0.12), in: Circle())
            Image(systemName: "power")
                .font(.system(size: 34, weight: .medium))
                .foregroundStyle(active ? VainahDesign.green : VainahDesign.purple)
        }
        .accessibilityHidden(true)
    }
}
