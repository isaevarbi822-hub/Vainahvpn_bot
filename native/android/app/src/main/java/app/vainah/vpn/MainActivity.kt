package app.vainah.vpn

import android.app.Activity
import android.app.AlertDialog
import android.Manifest
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.content.Intent
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.RadialGradient
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.text.SpannableString
import android.text.Spanned
import android.text.method.PasswordTransformationMethod
import android.text.style.ForegroundColorSpan
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Site-matched Vainah VPN native UI. No WebView, bogus billing or fake tunnel. */
class MainActivity : Activity() {
    private enum class Tab { HOME, PLANS, ACCOUNT, HELP }
    private var tab = Tab.HOME
    private var deviceFilter = 0
    private var chosenServer = -1
    private var selectedNode: VainahNode? = null
    private lateinit var vault: SecureSubscription
    private val d get() = VainahDesign
    private val requestVpn = 4519
    private val refresher = Handler(Looper.getMainLooper())
    private var statusView: TextView? = null
    private var connectionDetailView: TextView? = null
    private var connectionMetaView: TextView? = null
    private var connectionButton: Button? = null
    private var ipCheckButton: Button? = null
    private val refreshTask = object : Runnable {
        override fun run() {
            refreshConnectionStatus()
            refresher.postDelayed(this, 1400)
        }
    }

    override fun onResume() {
        super.onResume()
        refresher.removeCallbacks(refreshTask)
        refresher.post(refreshTask)
    }

    override fun onPause() {
        refresher.removeCallbacks(refreshTask)
        super.onPause()
    }

    private fun refreshConnectionStatus() {
        var snapshot = VpnConnectionState.read(this)
        if ((snapshot.phase == VpnConnectionState.ONLINE ||
                snapshot.phase == VpnConnectionState.TUN_READY) &&
            !VainahVpnService.runningInProcess) {
            VpnConnectionState.failed(this, "VPN-служба завершилась, соединение не защищено")
            snapshot = VpnConnectionState.read(this)
        }
        statusView?.text = when (snapshot.phase) {
            VpnConnectionState.STARTING -> "Подключаемся…"
            VpnConnectionState.TUN_READY -> if (snapshot.detail.startsWith("VPN-туннель запущен;"))
                "Туннель активен · проверь браузер" else "Проверяем интернет…"
            VpnConnectionState.ONLINE -> "VPN · интернет доступен"
            VpnConnectionState.FAILED -> "VPN не подключён"
            else -> "Не подключено"
        }
        connectionDetailView?.text = when (snapshot.phase) {
            VpnConnectionState.ONLINE ->
                "HTTPS через VPN доступен. Внешний IP и DNS ещё требуют проверки."
            VpnConnectionState.STARTING, VpnConnectionState.TUN_READY -> snapshot.detail
            VpnConnectionState.FAILED -> snapshot.detail
            else -> if (EngineRegistry.active.ready)
                "Экспериментальный libbox: защита трафика ещё не подтверждена."
                else "VPN-движок пока не установлен. Трафик не защищён."
        }
        connectionMetaView?.text =
            if (snapshot.server.isNotBlank() && snapshot.phase != VpnConnectionState.OFF) {
                "Сервер: ${snapshot.server}" +
                    if (snapshot.tcpLatencyMs >= 0)
                        " · TCP ${snapshot.tcpLatencyMs} мс" else " · задержка неизвестна"
            } else "Выбери сервер из подписки"
        ipCheckButton?.visibility = if (snapshot.canDisconnect) View.VISIBLE else View.GONE
        connectionButton?.text = if (snapshot.canDisconnect)
            "⏻   Отключить VPN" else if (EngineRegistry.active.ready)
            "⏻   Испытать VPN-движок" else "⏻   Подключиться"
    }

    private fun stopTunnel() {
        startService(Intent(this, VainahVpnService::class.java).apply {
            action = VainahVpnService.ACTION_DISCONNECT
        })
        // UI update is driven by actual service-owned status.
        refresher.postDelayed({ refreshConnectionStatus() }, 300)
    }
    private fun dp(n: Int) = (resources.displayMetrics.density * n).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vault = SecureSubscription(this)
        tab = savedInstanceState?.getString("page")?.let {
            runCatching { Tab.valueOf(it) }.getOrNull()
        } ?: Tab.HOME
        deviceFilter = savedInstanceState?.getInt("devices") ?: 0
        window.statusBarColor = d.background
        window.navigationBarColor = d.background
        renderPage()
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4520)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("page", tab.name)
        outState.putInt("devices", deviceFilter)
        super.onSaveInstanceState(outState)
    }

    private fun shape(start: Int, end: Int = start, radius: Float = 22f,
                      border: Int = d.border): GradientDrawable =
        GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(start, end)).apply {
            cornerRadius = radius * resources.displayMetrics.density
            setStroke(dp(1), border)
        }

    private fun column(): LinearLayout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    private fun row(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
    }
    private fun add(parent: LinearLayout, child: View, top: Int = 0) {
        parent.addView(child, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(top) })
    }
    private fun text(value: String, size: Float = 14f, color: Int = d.ink,
                     bold: Boolean = false): TextView = TextView(this).apply {
        this.text = value; textSize = size; setTextColor(color)
        if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
        setLineSpacing(dp(2).toFloat(), 1.04f)
        setPadding(0, dp(2), 0, dp(2))
    }
    private fun overline(value: String) = text(value,10f,d.purple,true).apply { letterSpacing = .12f }
    private fun panel(featured: Boolean = false): LinearLayout = column().apply {
        background = if(featured) shape(d.previewTop,d.previewBottom,23f,d.purple)
                     else shape(Color.rgb(30,34,57),Color.rgb(17,23,37),23f)
        setPadding(dp(20),dp(20),dp(20),dp(21))
    }
    private fun action(title: String, primary: Boolean = false): Button = Button(this).apply {
        text = title; isAllCaps = false; textSize = 13f
        typeface = Typeface.create("sans-serif", Typeface.BOLD)
        setTextColor(if(primary) Color.rgb(18,13,34) else d.ink)
        background = if(primary) shape(Color.rgb(212,185,255),Color.rgb(145,113,255),14f,d.purple)
                     else shape(d.surface2,d.surface2,14f,Color.rgb(65,70,95))
        minHeight = dp(49); contentDescription = title
    }
    private fun switch(destination: Tab) { tab = destination; renderPage() }
    private fun openSite(page: String) {
        if (!page.matches(Regex("[a-z-]+\\.html"))) return
        startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(
            "https://vainahvpnbot0.netlify.app/" + page
        )))
    }
    private fun notice(message: String) {
        AlertDialog.Builder(this).setTitle("Vainah VPN").setMessage(message)
            .setPositiveButton("Понятно",null).show()
    }

    private fun renderPage() {
        val root = column().apply { setBackgroundColor(d.background) }
        val scroll = ScrollView(this).apply {
            isFillViewport = true; isVerticalScrollBarEnabled = false
        }
        val body = column().apply { setPadding(dp(20),dp(22),dp(20),dp(38)) }
        scroll.addView(body)
        root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        root.addView(bottomBar(),LinearLayout.LayoutParams(-1,dp(69)))
        setContentView(root)
        brandHeader(body)
        when(tab) {
            Tab.HOME -> home(body)
            Tab.PLANS -> plans(body)
            Tab.ACCOUNT -> account(body)
            Tab.HELP -> help(body)
        }
        add(body,text("Vainah VPN · Android · Нативное приложение",11f,d.muted),26)
    }

    private fun brandHeader(parent: LinearLayout) {
        val header = row()
        header.addView(VainahMark(this),LinearLayout.LayoutParams(dp(44),dp(44)))
        val brand = column().apply { setPadding(dp(12),0,0,0) }
        add(brand,text("VAINAH VPN",16f,d.ink,true).apply { letterSpacing=.07f })
        add(brand,text("ТВОЁ СОЕДИНЕНИЕ. ТВОИ ПРАВИЛА.",9f,d.muted,true))
        header.addView(brand,LinearLayout.LayoutParams(0,-2,1f))
        add(parent,header)
    }
    private fun intro(parent: LinearLayout,kicker: String,heading: String,
                      description: String,emphasis: String="") {
        add(parent,overline("●  "+kicker),29)
        val title = text(heading,35f,d.ink,true).apply {
            letterSpacing = -.045f
            if (emphasis.isNotEmpty() && heading.contains(emphasis)) {
                val start = heading.lastIndexOf(emphasis)
                val s = SpannableString(heading)
                s.setSpan(ForegroundColorSpan(d.purple),start,
                    start+emphasis.length,Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                setText(s)
            }
        }
        add(parent,title,12)
        add(parent,text(description,13f,d.muted),9)
    }
    private fun home(parent: LinearLayout) {
        intro(parent,"VAINAH VPN · ТВОЙ СЕРВИС ПОДПИСКИ",
            "Интернет под твоим контролем.",
            "Выбирай тарифы, управляй подпиской и находи помощь за пару нажатий.",
            "контролем.")
        val planButton=action("Выбрать тариф   ↗",true)
        add(parent,planButton,19)
        planButton.setOnClickListener { switch(Tab.PLANS) }
        val accountButton=action("Мой кабинет")
        add(parent,accountButton,9)
        accountButton.setOnClickListener { switch(Tab.ACCOUNT) }

        val preview=panel(true)
        add(parent,preview,22)
        val bar=row()
        bar.addView(overline("✦ VAINAH VPN"),LinearLayout.LayoutParams(0,-2,1f))
        bar.addView(text("Нативный клиент",10f,d.green,true))
        add(preview,bar)
        add(preview,overline("ВАШЕ СОЕДИНЕНИЕ"),24)
        val power=VainahPower(this).apply {
            contentDescription=if (EngineRegistry.active.ready) "Испытать экспериментальный VPN-движок" else "Подключиться к VPN. Движок VLESS пока не встроен."
            isClickable=true;isFocusable=true
            setOnClickListener { requestConnection() }
        }
        preview.addView(power,LinearLayout.LayoutParams(-1,dp(196)))
        val currentStatus = text("Не подключено",25f,d.ink,true).apply {
            gravity = Gravity.CENTER
        }
        statusView = currentStatus
        add(preview,currentStatus)
        val stateDetail = text("",12f,d.muted).apply { gravity=Gravity.CENTER }
        connectionDetailView = stateDetail
        add(preview,stateDetail,8)
        val stateMeta = text("",12f,d.muted).apply { gravity=Gravity.CENTER }
        connectionMetaView = stateMeta
        add(preview,stateMeta,9)
        val connect=action(if (EngineRegistry.active.ready) "⏻   Испытать VPN-движок" else "⏻   Подключиться",true)
        add(preview,connect,17)
        connectionButton = connect
        connect.setOnClickListener { requestConnection() }
        val ipButton = action("Проверить IP и интернет ↗")
        ipCheckButton = ipButton
        add(preview, ipButton, 9)
        ipButton.setOnClickListener {
            startActivity(Intent(Intent.ACTION_VIEW,
                Uri.parse("https://www.cloudflare.com/cdn-cgi/trace")))
        }
        refreshConnectionStatus()
        val vpnDiagnostics = getSharedPreferences("vpn_diagnostics", MODE_PRIVATE)
        val lastError = vpnDiagnostics.getString("last_failure", null)
        val lastStage = vpnDiagnostics.getString("last_stage", null)
        val interrupted = vpnDiagnostics.getBoolean("startup_pending", false)
        if (EngineRegistry.active.ready) {
            if (interrupted && !lastStage.isNullOrBlank()) {
                add(preview,text("Запуск VPN прервался на этапе: $lastStage",11f,d.muted),9)
            } else if (!lastError.isNullOrBlank()) {
                add(preview,text("Последняя ошибка движка: $lastError",11f,d.muted),9)
            }
        }
        add(preview,text("Реальный статус, без имитации защиты.",11f,d.muted),13)

        val servers=panel()
        add(parent,servers,17)
        add(servers,overline("СЕРВЕРЫ И КОНФИГУРАЦИИ"))
        add(servers,text("Серверы подписки",19f,d.ink,true),9)
        add(servers,text(if(vault.load()!=null)
            "Синхронизируем серверы из подписки. Новые локации появятся автоматически."
            else "Добавь одну HTTPS-подписку в кабинете. Все её серверы появятся здесь после подключения синхронизации.",
            12f,d.muted),7)
        val serverResults=column()
        add(servers,serverResults,8)
        val loadServers=action("Обновить серверы")
        add(servers,loadServers,10)
        loadServers.setOnClickListener {
            val link=vault.load()
            if(link==null){notice("Сначала добавь HTTPS-подписку.");return@setOnClickListener}
            loadServers.isEnabled=false
            Thread {
                val result=runCatching { SubscriptionServers.loadNodes(link) }
                runOnUiThread {
                    loadServers.isEnabled=true
                    serverResults.removeAllViews()
                    result.onSuccess { names ->
                        chosenServer = -1
                        selectedNode = null
                        names.forEachIndexed { index, node ->
                            val choice=action(node.label)
                            add(serverResults,choice,7)
                            choice.setOnClickListener {
                                chosenServer=index
                                selectedNode=node
                                notice(if (EngineRegistry.active.ready) "Выбран: ${node.label}. Экспериментальный VPN-движок доступен для теста; реальная защита ещё не проверена." else "Выбран: ${node.label}. VPN-туннель Android пока не подключён.")
                            }
                        }
                    }.onFailure {
                        add(serverResults,text("Не удалось загрузить VLESS REALITY серверы. Проверь ссылку.",12f,d.muted),7)
                    }
                }
            }.start()
        }
        // Refresh the current subscription whenever the server screen opens.
        // New nodes appear without adding another URL or reinstalling the app.
        if (vault.load()!=null) loadServers.post { loadServers.performClick() }
        val goProfile=action("Добавить или изменить подписку")
        add(servers,goProfile,12)
        goProfile.setOnClickListener{switch(Tab.ACCOUNT)}
        val stats=row().apply{background=shape(d.surface2,d.surface,18f)}
        for ((head,sub) in listOf("6 тарифов" to "от 30 дней",
                                 "3 / 6" to "устройств",
                                 "Безлимит" to "трафик")) {
            val box=column().apply{gravity=Gravity.CENTER}
            add(box,text(head,14f,d.ink,true).apply{gravity=Gravity.CENTER})
            add(box,text(sub,10f,d.muted).apply{gravity=Gravity.CENTER})
            stats.addView(box,LinearLayout.LayoutParams(0,dp(73),1f))
        }
        add(parent,stats,18)

        add(parent,overline("ЛИЧНЫЙ КАБИНЕТ"),28)
        val overview=panel()
        add(parent,overview,10)
        add(overview,text("Всё важное.\nВ одном месте.",27f,d.ink,true))
        add(overview,text("Подписка и срок · устройства · история покупок · VPN-доступ",
            12f,d.muted),9)
        val go=action("Открыть кабинет  ↗")
        add(overview,go,15);go.setOnClickListener{switch(Tab.ACCOUNT)}
        val help=panel()
        add(parent,help,13)
        add(help,text("Центр поддержки",21f,d.ink,true))
        add(help,text("Проверка сервисов и инструкции для устройств.",
            12f,d.muted),9)
        val guide=action("Открыть помощь  ↗")
        add(help,guide,13);guide.setOnClickListener{switch(Tab.HELP)}

        val start=panel(true)
        add(parent,start,17)
        add(start,overline("ПЕРВЫЙ ЗАПУСК · 3 ПРОСТЫХ ШАГА"))
        for ((index,title,explain) in listOf(
            Triple("01","Войди в аккаунт","Открой настоящий сайт и выбери удобный способ входа."),
            Triple("02","Проверь подписку","Посмотри свой тариф, срок и доступ только после подтверждения."),
            Triple("03","Настрой устройство","Используй официальный мастер, пока движок VLESS ещё не встроен.")
        )) {
            add(start,text(index+"  "+title,16f,d.ink,true),13)
            add(start,text(explain,12f,d.muted),4)
        }
        val setup=action("Открыть мастер подключения ↗",true)
        add(start,setup,17)
        setup.setOnClickListener{openSite("device-center.html")}
        add(start,text(if (EngineRegistry.active.ready) "Экспериментальная версия: проверь IP и DNS перед использованием." else "Это предварительная версия интерфейса. VPN пока не подключается.",11f,d.muted),11)
    }
    private fun plans(parent: LinearLayout) {
        intro(parent,"ТАРИФЫ VAINAH",
            "Выбери свой формат доступа.",
            "Все тарифы с безлимитным трафиком; цены как на нашем сайте.",
            "формат доступа.")
        val filter=panel()
        add(parent,filter,20)
        add(filter,overline("ФИЛЬТР ПО КОЛИЧЕСТВУ УСТРОЙСТВ"))
        val choices=row()
        for((value,name) in listOf(0 to "Все",3 to "3",6 to "6")) {
            val btn=action(name,value==deviceFilter)
            choices.addView(btn,LinearLayout.LayoutParams(0,dp(49),1f).apply {
                marginEnd=dp(6)
            })
            btn.setOnClickListener{deviceFilter=value;renderPage()}
        }
        add(filter,choices,10)
        val filtered=VainahPlans.all.filter{deviceFilter==0 || it.deviceLimit==deviceFilter}
        add(parent,text(filtered.size.toString()+" тарифов · безлимитный трафик",
            12f,d.muted),14)
        for(plan in filtered) {
            val tile=panel(plan.deviceLimit==6)
            add(parent,tile,13)
            add(tile,overline(plan.badge))
            add(tile,text(plan.title,22f,d.ink,true),12)
            add(tile,text((if(plan.priceRub==1000) "1 000" else plan.priceRub.toString())+" ₽",34f,d.ink,true),4)
            add(tile,text(plan.days.toString()+" дней · "+(if(plan.deviceLimit==6) "6 устройств" else "3 устройства")+
                " · Безлимитный трафик",12f,d.muted),4)
            val more=action("Подробнее на сайте   ↗",true)
            add(tile,more,18)
            more.setOnClickListener{openSite("plans.html")}
        }
        val note=panel(true)
        add(parent,note,19)
        add(note,overline("ПРОЗРАЧНЫЕ УСЛОВИЯ"))
        add(note,text("Оплата в приложении пока отключена. Просмотр тарифов ничего не списывает.",
            12f,d.muted),8)
        val compare=action("Сравнить все тарифы ↗")
        add(note,compare,13);compare.setOnClickListener{openSite("compare.html")}
    }
    private fun account(parent: LinearLayout) {
        intro(parent,"ЛИЧНЫЙ КАБИНЕТ",
            "Моя подписка.",
            "Данные о покупках доступны в защищённом кабинете сайта после входа.",
            "подписка.")
        val vaultCard=panel(true)
        add(parent,vaultCard,23)
        add(vaultCard,overline("МОЙ VPN-ПРОФИЛЬ"))
        val present=vault.load()!=null
        add(vaultCard,text(if(present)"✓ Профиль сохранён локально"
            else "Профиль не добавлен",20f,d.ink,true),12)
        add(vaultCard,text("Ссылка хранится на устройстве в Android Keystore. Это не является подтверждением оплаченной подписки.",
            12f,d.muted),8)
        val input=EditText(this).apply{
            hint="https://... (личная ссылка подписки)"
            setHintTextColor(d.muted);setTextColor(d.ink);textSize=13f
            inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setSingleLine(true)
            background=shape(Color.rgb(14,21,38),Color.rgb(14,21,38),12f)
            setPadding(dp(14),dp(15),dp(14),dp(15))
            importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO
        }
        add(vaultCard,input,15)
        val save=action("Добавить подписку",true)
        add(vaultCard,save,12)
        save.setOnClickListener{
            if(vault.save(input.text.toString())){
                chosenServer = -1
                selectedNode = null
                input.text.clear();renderPage()
                notice("Ссылка сохранена локально и зашифрована с помощью Android Keystore.")
            }else notice("Нужна корректная HTTPS-ссылка подписки из кабинета.")
        }
        val delete=action("Удалить с устройства")
        add(vaultCard,delete,9)
        delete.setOnClickListener{
            AlertDialog.Builder(this).setTitle("Удалить VPN-профиль?")
                .setMessage("Удалится только локально сохранённая ссылка.")
                .setNegativeButton("Отмена",null)
                .setPositiveButton("Удалить"){_,_->vault.delete();renderPage()}
                .show()
        }
        add(vaultCard,text("VPN-ссылку нельзя публиковать или отправлять посторонним.",
            11f,d.muted),13)
        val cabinet=panel()
        add(parent,cabinet,16)
        add(cabinet,overline("ПОДПИСКА И ИСТОРИЯ"))
        add(cabinet,text("Тариф · срок · устройства · покупки",20f,d.ink,true),10)
        add(cabinet,text("Приложение пока не считывает личные покупки. Реальные данные после Telegram Login показывает сайт.",
            12f,d.muted),8)
        val web=action("Войти в личный кабинет ↗",true)
        add(cabinet,web,13);web.setOnClickListener{openSite("account.html")}
        val hub=action("Центр управления ↗")
        add(cabinet,hub,8);hub.setOnClickListener{openSite("hub.html")}

        val providers=panel()
        add(parent,providers,16)
        add(providers,overline("СПОСОБЫ ВХОДА"))
        add(providers,text("Telegram · Телефон · Почта · Яндекс ID",
            17f,d.ink,true),11)
        add(providers,text("Вход подтверждается на сайте. Приложение не запрашивает чужие пароли и не выдаёт покупки другого аккаунта.",
            12f,d.muted),8)
        val login=action("Выбрать способ входа ↗")
        add(providers,login,12)
        login.setOnClickListener{openSite("account.html")}
    }
    private fun help(parent: LinearLayout) {
        intro(parent,"ЦЕНТР ПОДДЕРЖКИ",
            "Помощь всегда рядом.",
            "Инструкции для устройств, диагностика и состояние сервисов.",
            "рядом.")
        val links=listOf(
            Triple("◉  Диагностика VPN","Вход, импорт, скорость и подключение.","diagnostics.html"),
            Triple("◇  Статус сервисов","Проверка базы данных и H1Cloud.","status.html"),
            Triple("▣  Мои устройства","iPhone, iPad, Android и другие.","device-center.html"),
            Triple("?  Вопросы и ответы","Помощь с тарифами и подпиской.","help.html"),
            Triple("⛨  Безопасность","Защита аккаунта и VPN-конфигурации.","security.html")
        )
        for((title,detail,page) in links){
            val tile=panel()
            add(parent,tile,13)
            add(tile,text(title,19f,d.ink,true))
            add(tile,text(detail,12f,d.muted),8)
            val button=action("Открыть раздел  ↗")
            add(tile,button,13);button.setOnClickListener{openSite(page)}
        }
        val faq=panel(true);add(parent,faq,17)
        add(faq,overline("ЧТО НУЖНО ЗНАТЬ"))
        add(faq,text("Когда заработает подключение?",18f,d.ink,true),10)
        add(faq,text("После безопасной интеграции и испытаний нативного VLESS-движка. Пока интернет не проходит через Vainah VPN.",
            12f,d.muted),8)
    }
    private fun bottomBar(): LinearLayout {
        val nav=row().apply{
            setBackgroundColor(d.surface);setPadding(dp(6),dp(6),dp(6),dp(6))
        }
        for((destination,icon,title) in listOf(
            Triple(Tab.HOME,"⌂","Главная"),
            Triple(Tab.PLANS,"▦","Тарифы"),
            Triple(Tab.ACCOUNT,"◇","Кабинет"),
            Triple(Tab.HELP,"?","Помощь")
        )){
            val selected=tab==destination
            val tile=column().apply{
                gravity=Gravity.CENTER
                background=if(selected)shape(Color.rgb(51,42,81),Color.rgb(51,42,81),
                    13f,Color.rgb(92,75,136))else null
                isClickable=true;isFocusable=true
                contentDescription=title+(if(selected)" — текущая вкладка"else "")
                setOnClickListener{switch(destination)}
            }
            add(tile,text(icon,20f,if(selected)d.purple else d.muted,true).apply{
                gravity=Gravity.CENTER
            })
            add(tile,text(title,10f,if(selected)d.ink else d.muted,selected).apply{
                gravity=Gravity.CENTER
            })
            nav.addView(tile,LinearLayout.LayoutParams(0,-1,1f).apply{marginEnd=dp(2)})
        }
        return nav
    }
    private fun requestConnection(){
        if (VpnConnectionState.read(this).canDisconnect) {
            stopTunnel()
            return
        }
        if(selectedNode == null){
            notice("Сначала выбери сервер из подписки H1Cloud.");return
        }
        if(vault.load()==null){
            notice("Сначала добавь HTTPS-ссылку подписки из личного кабинета.");return
        }
        if(!EngineRegistry.active.ready){
            notice("VPN-движок H1Cloud/VLESS пока не интегрирован. Подключение не установлено, трафик не защищён.");return
        }
        val consent=VpnService.prepare(this)
        if(consent!=null)startActivityForResult(consent,requestVpn)else startTunnel()
    }
    @Deprecated("Compatibility VPN permission callback")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode==requestVpn){
            if(resultCode==RESULT_OK)startTunnel()
            else notice("Разрешение Android на VPN не предоставлено.")
        }
    }
    private fun startTunnel(){
        if(!EngineRegistry.active.ready||vault.load()==null)return
        val selected=selectedNode?.uri ?: return
        val intent=Intent(this,VainahVpnService::class.java).apply{
            action=VainahVpnService.ACTION_CONNECT
            putExtra(VainahVpnService.EXTRA_SELECTED_VLESS,selected)
            putExtra(VainahVpnService.EXTRA_SELECTED_LABEL,selectedNode?.label.orEmpty())
        }
        if(Build.VERSION.SDK_INT>=26)startForegroundService(intent)else startService(intent)
    }
}

private class VainahMark(activity:Activity):View(activity){
    private val p=Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(c:Canvas){
        super.onDraw(c)
        val w=width.toFloat();val h=height.toFloat()
        p.shader=android.graphics.LinearGradient(0f,0f,w,h,
            intArrayOf(Color.rgb(189,159,255),Color.rgb(101,60,224)),
            null,Shader.TileMode.CLAMP)
        c.drawRoundRect(0f,0f,w,h,w*.28f,h*.28f,p)
        p.shader=null;p.color=Color.WHITE
        p.style=Paint.Style.STROKE;p.strokeWidth=w*.105f
        p.strokeCap=Paint.Cap.ROUND;p.strokeJoin=Paint.Join.ROUND
        val mark=Path().apply{
            moveTo(w*.22f,h*.30f);lineTo(w*.50f,h*.76f);lineTo(w*.79f,h*.30f)
        }
        c.drawPath(mark,p)
        p.color=Color.rgb(209,247,255);p.strokeWidth=w*.055f
        c.drawPath(Path().apply{
            moveTo(w*.50f,h*.17f);lineTo(w*.65f,h*.44f);lineTo(w*.50f,h*.78f)
        },p)
        p.style=Paint.Style.FILL
    }
}

private class VainahPower(activity:Activity):View(activity){
    private val p=Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(c:Canvas){
        super.onDraw(c)
        val cx=width/2f;val cy=height/2f
        val radius=Math.min(width,height)*.45f
        p.shader=RadialGradient(cx,cy,radius,
            intArrayOf(Color.rgb(75,54,130),Color.rgb(38,28,74),Color.TRANSPARENT),
            floatArrayOf(0f,.57f,1f),Shader.TileMode.CLAMP)
        c.drawCircle(cx,cy,radius,p)
        p.shader=null;p.style=Paint.Style.STROKE
        p.color=Color.rgb(169,139,255);p.strokeWidth=width*.009f
        c.drawCircle(cx,cy,radius*.64f,p)
        p.color=Color.rgb(204,182,255);p.strokeWidth=width*.035f
        p.strokeCap=Paint.Cap.ROUND
        val r=radius*.32f
        c.drawArc(RectF(cx-r,cy-r,cx+r,cy+r),-47f,274f,false,p)
        c.drawLine(cx,cy-r*1.28f,cx,cy,p)
        p.style=Paint.Style.FILL
    }
}
