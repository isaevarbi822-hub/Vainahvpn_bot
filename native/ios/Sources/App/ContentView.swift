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
    @State private var selected: SiteTab = .home
    @State private var devices = 0
    @State private var subscription = ""
    @State private var saved = SecureSubscription.load() != nil
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
                    Text("Vainah VPN · iOS · Нативное приложение")
                        .font(.system(size: 11))
                        .foregroundStyle(VainahDesign.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 29)
                }
                .frame(maxWidth: 650)
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
            heading("VAINAH VPN · ТВОЙ СЕРВИС ПОДПИСКИ",
                    Text("Интернет под твоим ")
                    + Text("контролем.").foregroundColor(VainahDesign.purple),
                    "Выбирай тарифы, управляй подпиской и находи помощь за пару нажатий.")
            callToAction("Выбрать тариф  ↗", prominent: true) {
                selected = .plans
            }
            .padding(.top, 5)
            callToAction("Мой кабинет") {
                selected = .account
            }
            .padding(.top, 10)

            connectionCard
                .padding(.top, 25)
            statistics
                .padding(.top, 17)

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

    private var connectionCard: some View {
        VainahCard(featured: true) {
            VStack(spacing: 14) {
                HStack {
                    Text("✦  VAINAH VPN")
                        .font(.system(size: 11, weight: .heavy))
                        .tracking(1)
                        .foregroundStyle(VainahDesign.purple)
                    Spacer()
                    Text("Нативный клиент")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(VainahDesign.green)
                }
                .padding(.bottom, 9)
                Text("ВАШЕ СОЕДИНЕНИЕ")
                    .font(.system(size: 11, weight: .heavy))
                    .tracking(1.5)
                    .foregroundStyle(VainahDesign.purple)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Button {
                    Task { await tunnel.connect() }
                } label: {
                    VainahPowerButton()
                        .frame(height: 194)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Подключиться к VPN")
                .accessibilityHint(VLESSCore.available ?
                    "Начать проверочное подключение. Защита трафика потребует отдельной проверки." :
                    "Без VLESS-движка VPN пока не устанавливает соединение")

                Text(tunnel.state.rawValue)
                    .font(.system(size: 25, weight: .bold, design: .rounded))
                    .foregroundStyle(VainahDesign.ink)
                Text(tunnel.explanation)
                    .font(.system(size: 12))
                    .foregroundStyle(VainahDesign.muted)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                callToAction("⏻  Подключиться", prominent: true) {
                    Task { await tunnel.connect() }
                }
                .padding(.top, 3)
                if tunnel.state == .preparing || tunnel.state == .testing {
                    callToAction("⏹  Отключить VPN") {
                        Task { await tunnel.disconnect() }
                    }
                }
                Text(saved ? "✓ HTTPS-подписка сохранена в Keychain" :
                             "Сначала добавь личную HTTPS-ссылку H1Cloud.")
                    .font(.system(size: 12))
                    .foregroundStyle(VainahDesign.muted)
                    .multilineTextAlignment(.center)
                SecureField("Вставь HTTPS-ссылку подписки H1Cloud", text: $subscription)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .textContentType(.password)
                    .font(.system(size: 13))
                    .padding(15)
                    .background(VainahDesign.background.opacity(0.72),
                                in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel("Секретная HTTPS-ссылка VPN")
                callToAction("Сохранить HTTPS-подписку", prominent: true) {
                    if SecureSubscription.save(subscription) {
                        saved = true
                        subscription = ""
                        notice = "Ссылка сохранена в Keychain только на этом устройстве."
                    } else {
                        subscription = ""
                        notice = "Нужна корректная HTTPS-ссылка H1Cloud."
                    }
                }
                callToAction("Управление VPN-подпиской") {
                    selected = .account
                }
                Text("Реальный статус, без имитации защиты.")
                    .font(.system(size: 11))
                    .foregroundStyle(VainahDesign.muted)
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var statistics: some View {
        HStack(spacing: 0) {
            statistic("6 тарифов", "от 30 дней")
            statistic("3 / 6", "устройств")
            statistic("Безлимит", "трафик")
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
            heading("ТАРИФЫ VAINAH",
                    Text("Выбери свой ")
                    + Text("формат доступа.").foregroundColor(VainahDesign.purple),
                    "Все тарифы с безлимитным трафиком; цены как на нашем сайте.")

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
                    Text("Оплата в приложении пока отключена. Просмотр тарифов ничего не списывает.")
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

                    SecureField("HTTPS-ссылка подписки", text: $subscription)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .textContentType(.password)
                        .font(.system(size: 13))
                        .padding(15)
                        .background(VainahDesign.background.opacity(0.72),
                                    in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("Секретная HTTPS-ссылка VPN")
                        .padding(.top, 5)

                    callToAction("Сохранить профиль", prominent: true) {
                        if SecureSubscription.save(subscription) {
                            saved = true
                            subscription = ""
                            notice = "Ссылка сохранена в Keychain только на этом устройстве."
                        } else {
                            notice = "Вставь корректную HTTPS-ссылку из кабинета Vainah VPN."
                        }
                    }
                    callToAction("Проверить формат H1Cloud") {
                        Task {
                            guard let link = SecureSubscription.load() else {
                                notice = "Сначала сохрани HTTPS-ссылку подписки."
                                return
                            }
                            do {
                                let result = try await H1SubscriptionDiscovery.inspect(link)
                                let kinds = H1SubscriptionDiscovery.Transport.allCases
                                    .filter { result.transports.contains($0) }
                                    .map { $0.rawValue.uppercased() }
                                notice = "Найдено Reality-профилей: \(result.realityProfiles). Транспорт: \(kinds.isEmpty ? "не определён" : kinds.joined(separator: ", ")). Это проверка формата, VPN пока не подключён."
                            } catch {
                                notice = "Не удалось проверить подписку. Ссылка и секреты не отображаются."
                            }
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
                    Text("Приложение пока не считывает личные покупки. Реальные данные после Telegram Login показывает сайт.")
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
                    websiteButton("Выбрать способ входа ↗", "account.html")
                }
            }
            .padding(.top, 16)
        }
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
                    Text("Когда заработает подключение?")
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(VainahDesign.ink)
                    Text("После безопасной интеграции и испытаний VLESS-движка. Пока интернет не проходит через Vainah VPN.")
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
    var body: some View {
        ZStack {
            Circle()
                .fill(RadialGradient(
                    colors: [VainahDesign.purple.opacity(0.35),
                             VainahDesign.purple.opacity(0.13), .clear],
                    center: .center, startRadius: 10, endRadius: 110
                ))
                .frame(width: 199, height: 199)
            Circle()
                .strokeBorder(VainahDesign.purple, lineWidth: 3)
                .frame(width: 127, height: 127)
                .background(VainahDesign.purple.opacity(0.11), in: Circle())
            Image(systemName: "power")
                .font(.system(size: 48, weight: .medium))
                .foregroundStyle(VainahDesign.purple)
        }
    }
}
