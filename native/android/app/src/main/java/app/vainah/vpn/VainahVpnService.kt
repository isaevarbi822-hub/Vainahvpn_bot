package app.vainah.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.util.Log

/**
 * OS-level VPN service registered with BIND_VPN_SERVICE.
 * NEVER opens a TUN interface while the real packet transport is missing.
 */
class VainahVpnService : VpnService() {
    companion object {
        const val ACTION_CONNECT = "app.vainah.vpn.CONNECT"
        const val EXTRA_SELECTED_VLESS = "app.vainah.vpn.SELECTED_VLESS"
        const val ACTION_DISCONNECT = "app.vainah.vpn.DISCONNECT"
        private const val CHANNEL = "vainah_connection"
        private const val ID = 2103
    }
    private var started = false
    private fun failure(stage: String, error: Throwable) {
        Log.e("VainahVpn", "VPN failed at $stage", error)
        getSharedPreferences("vpn_diagnostics", MODE_PRIVATE).edit()
            .putString("last_failure", "$stage: ${error.javaClass.simpleName}")
            .apply()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISCONNECT -> {
                disconnect()
                return START_NOT_STICKY
            }
            ACTION_CONNECT -> {
                val node = intent.getStringExtra(EXTRA_SELECTED_VLESS)
                val config = node?.let { runCatching { VlessRealityConfig.profile(it) }.getOrNull() }
                if (!EngineRegistry.active.ready || config == null || SecureSubscription(this).load() == null) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                try {
                    startVisibleService()
                } catch (error: Exception) {
                    failure("foreground service", error)
                    stopSelf()
                    return START_NOT_STICKY
                }
                Thread {
                    try {
                        // A future real engine must route authenticated packets
                        // before reporting Result.success.
                        val result = EngineRegistry.active.connect(this, config)
                        result.exceptionOrNull()?.let { failure("libbox startup", it) }
                        if (result.isFailure) disconnect()
                    } catch (error: Throwable) {
                        failure("unexpected tunnel error", error)
                        disconnect()
                    }
                }.start()
            }
        }
        return START_NOT_STICKY
    }
    private fun startVisibleService() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Vainah VPN", NotificationManager.IMPORTANCE_LOW)
        )
        val stopIntent = Intent(this, VainahVpnService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        val pending = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = Notification.Builder(this, CHANNEL)
            .setContentTitle("Vainah VPN — подключение")
            .setContentText("Запуск зашифрованного туннеля…")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отключить", pending)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
        } else startForeground(ID, notification)
        started = true
    }
    private fun disconnect() {
        try { Thread { runCatching { EngineRegistry.active.disconnect() }
            .onFailure { failure("engine shutdown", it) } }.start() }
        catch (error: Exception) { failure("shutdown thread", error) }
        if (started) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            started = false
        }
        stopSelf()
    }
    override fun onRevoke() {
        disconnect()
        super.onRevoke()
    }
    override fun onDestroy() {
        // Do not call stopSelf() recursively from the destroy lifecycle callback.
        if (started) {
            started = false
            runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
            Thread { runCatching { EngineRegistry.active.disconnect() } }.start()
        }
        super.onDestroy()
    }
}
