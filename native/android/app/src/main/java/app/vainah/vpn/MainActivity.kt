package app.vainah.vpn

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.text.method.PasswordTransformationMethod
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.net.Uri

/** Pure Android UI. No hidden WebView, tracking SDK or embedded service tokens. */
class MainActivity : Activity() {
    private lateinit var vault: SecureSubscription
    private lateinit var state: TextView
    private lateinit var profile: TextView
    private lateinit var connect: Button
    private val requestVpn = 4519

    private val bg = Color.rgb(9, 12, 25)
    private val surface = Color.rgb(22, 25, 44)
    private val light = Color.rgb(245, 240, 255)
    private val dim = Color.rgb(174, 177, 202)
    private val lavender = Color.rgb(178, 149, 255)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        vault = SecureSubscription(this)
        window.statusBarColor = bg
        window.navigationBarColor = bg
        render()
    }

    private fun rounded(color: Int, radius: Float = 22f): GradientDrawable {
        return GradientDrawable().apply {
            setColor(color)
            cornerRadius = radius * resources.displayMetrics.density
        }
    }

    private fun dp(n: Int): Int = (resources.displayMetrics.density * n).toInt()
    private fun text(value: String, size: Float, color: Int, bold: Boolean = false): TextView {
        return TextView(this).apply {
            this.text = value
            textSize = size
            setTextColor(color)
            if (bold) typeface = Typeface.create("sans-serif", Typeface.BOLD)
            setPadding(0, dp(3), 0, dp(3))
        }
    }
    private fun column(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
    }
    private fun add(parent: LinearLayout, child: View, space: Int = 0) {
        parent.addView(child, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(space) })
    }
    private fun panel(): LinearLayout = column().apply {
        background = rounded(surface)
        setPadding(dp(20), dp(20), dp(20), dp(21))
    }
    private fun action(label: String, important: Boolean = false): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 15f
            setTextColor(if (important) Color.rgb(20, 13, 43) else light)
            background = rounded(if (important) lavender else Color.rgb(46, 42, 77), 16f)
            minHeight = dp(53)
            contentDescription = label
        }
    }
    private fun render() {
        val root = column().apply {
            setBackgroundColor(bg)
            setPadding(dp(20), dp(23), dp(20), dp(35))
        }
        val scroll = ScrollView(this).apply {
            fillViewport = true
            isVerticalScrollBarEnabled = false
        }
        scroll.addView(root)
        setContentView(scroll)

        add(root, text("✦ VAINAH VPN", 13f, lavender, true))
        add(root, text("Свобода\nна связи.", 37f, light, true), 13)
        add(root, text("Приложение для Android · нативная версия", 13f, dim), 5)
        val card = panel()
        add(root, card, 27)
        add(card, text("ВАШЕ СОЕДИНЕНИЕ", 11f, lavender, true))
        state = text("Не подключено", 25f, light, true)
        add(card, state, 9)
        add(card, text("Безопасное подключение появится после интеграции проверенного H1Cloud/VLESS-движка. Сейчас трафик НЕ проходит через Vainah VPN.", 13f, dim), 7)
        connect = action("⏻  Подключиться", true)
        add(card, connect, 23)
        connect.setOnClickListener { requestConnection() }
        refreshStatus()

        val saved = panel()
        add(root, saved, 17)
        add(saved, text("МОЯ ПОДПИСКА", 11f, lavender, true))
        profile = text("Профиль не добавлен", 18f, light, true)
        add(saved, profile, 11)
        val input = EditText(this).apply {
            hint = "https://... (ссылка подписки)"
            setHintTextColor(dim)
            setTextColor(light)
            textSize = 13f
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            transformationMethod = PasswordTransformationMethod.getInstance()
            setSingleLine(true)
            background = rounded(Color.rgb(15, 18, 33), 12f)
            setPadding(dp(13), dp(14), dp(13), dp(14))
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        }
        add(saved, input, 13)
        val save = action("Сохранить ссылку на устройстве")
        add(saved, save, 11)
        save.setOnClickListener {
            if (vault.save(input.text.toString())) {
                input.text.clear()
                refreshStatus()
                showNotice("Ссылка сохранена в Android Keystore. Она не отправлялась на сервер.")
            } else showNotice("Нужна корректная HTTPS-ссылка подписки из личного кабинета.")
        }
        val remove = action("Удалить ссылку с устройства")
        add(saved, remove, 9)
        remove.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Удалить VPN-профиль?")
                .setMessage("Будет удалена только локальная зашифрованная ссылка.")
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Удалить") { _, _ ->
                    vault.delete()
                    refreshStatus()
                }.show()
        }
        add(saved, text("Внимание: ссылка подписки — секрет доступа. Не публикуйте её. Самостоятельный импорт нужен только до появления безопасного входа в приложение.", 12f, dim), 14)

        val links = panel()
        add(root, links, 17)
        add(links, text("АККАУНТ И ПОМОЩЬ", 11f, lavender, true))
        val cabinet = action("Открыть личный кабинет ↗")
        add(links, cabinet, 12)
        cabinet.setOnClickListener { openHttps("https://vainahvpnbot0.netlify.app/account.html") }
        val guide = action("Инструкции и диагностика ↗")
        add(links, guide, 10)
        guide.setOnClickListener { openHttps("https://vainahvpnbot0.netlify.app/diagnostics.html") }
        add(root, text("Vainah VPN 0.1 · платформа подготовлена · VPN-движок ещё не подключён", 11f, dim), 25)
    }
    private fun openHttps(url: String) {
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    }
    private fun showNotice(message: String) {
        AlertDialog.Builder(this).setMessage(message).setPositiveButton("Понятно", null).show()
    }
    private fun refreshStatus() {
        val hasProfile = vault.load() != null
        if (::profile.isInitialized)
            profile.text = if (hasProfile) "✓ Профиль сохранён локально" else "Профиль не добавлен"
        state.text = "Не подключено"
        connect.contentDescription = "Подключить VPN (требуется VPN-движок)"
        connect.alpha = if (hasProfile) 1f else 0.8f
    }
    private fun requestConnection() {
        if (vault.load() == null) {
            showNotice("Сначала добавь HTTPS-ссылку подписки из кабинета.")
            return
        }
        if (!EngineRegistry.active.ready) {
            showNotice("Настоящее VPN-подключение пока не реализовано. VLESS-движок должен быть встроен и проверен на устройстве. Системный VPN не будет запущен.")
            return
        }
        val consent = VpnService.prepare(this)
        if (consent != null) startActivityForResult(consent, requestVpn)
        else startTunnel()
    }
    @Deprecated("Uses the compatibility permission flow; replace with Activity Result API in production.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == requestVpn) {
            if (resultCode == RESULT_OK) startTunnel()
            else showNotice("Разрешение Android на VPN не предоставлено.")
        }
    }
    private fun startTunnel() {
        if (!EngineRegistry.active.ready || vault.load() == null) return
        val intent = Intent(this, VainahVpnService::class.java).apply {
            action = VainahVpnService.ACTION_CONNECT
        }
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent)
        else startService(intent)
    }
}
