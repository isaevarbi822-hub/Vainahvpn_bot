package app.vainah.vpn

import android.content.Context

/**
 * Local, credential-free VPN status. An Android VPN profile/TUN alone is not
 * proof that encrypted packets reach the internet.
 */
object VpnConnectionState {
    const val OFF = "off"
    const val STARTING = "starting"
    const val TUN_READY = "tun_ready"
    const val ONLINE = "online"
    const val FAILED = "failed"

    data class Snapshot(
        val phase: String,
        val server: String,
        val tcpLatencyMs: Int,
        val detail: String
    ) {
        val canDisconnect: Boolean
            get() = phase == STARTING || phase == TUN_READY || phase == ONLINE
    }

    private const val PREF = "vainah_vpn_session"

    fun read(context: Context): Snapshot {
        val prefs = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
        return Snapshot(
            prefs.getString("phase", OFF) ?: OFF,
            prefs.getString("server", "").orEmpty(),
            prefs.getInt("tcp_latency_ms", -1),
            prefs.getString("detail", "").orEmpty()
        )
    }

    private fun save(context: Context, phase: String, detail: String,
                     server: String? = null, latencyMs: Int? = null) {
        val editor = context.getSharedPreferences(PREF, Context.MODE_PRIVATE)
            .edit().putString("phase", phase).putString("detail", detail)
        if (server != null) editor.putString("server", server.take(80))
        if (latencyMs != null) editor.putInt("tcp_latency_ms", latencyMs)
        // commit is intentional: even an abrupt native crash must not leave
        // the UI saying "online" on restart.
        editor.commit()
    }

    fun starting(context: Context, label: String) {
        save(context, STARTING, "Запуск VPN-движка", label, -1)
    }

    fun latency(context: Context, millis: Int) {
        context.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putInt("tcp_latency_ms", millis).apply()
    }

    fun tunnelCreated(context: Context) =
        save(context, TUN_READY, "VPN-туннель открыт, проверяем интернет")

    fun verified(context: Context) =
        save(context, ONLINE, "Проверен доступ к интернету через VPN")

    fun failed(context: Context, detail: String) =
        save(context, FAILED, detail.take(120))

    fun disconnected(context: Context) =
        save(context, OFF, "VPN отключён")
}
