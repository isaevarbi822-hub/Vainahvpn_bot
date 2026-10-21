package app.vainah.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicInteger

/**
 * OS-level VPN service registered with BIND_VPN_SERVICE.
 * NEVER opens a TUN interface while the real packet transport is missing.
 */
class VainahVpnService : VpnService() {
    // Process-local state only. Never equate the engine being started with
    // proven packet routing or privacy protection.
    enum class Phase { OFF, STARTING, UNVERIFIED, STOPPING, FAILED }

    companion object {
        @Volatile var phase: Phase = Phase.OFF
            private set
        const val ACTION_CONNECT = "app.vainah.vpn.CONNECT"
        const val ACTION_DISCONNECT = "app.vainah.vpn.DISCONNECT"
        private const val CHANNEL = "vainah_connection"
        private const val ID = 2103
    }
    @Volatile private var started = false
    // A disconnect invalidates any in-flight HTTPS fetch/core initialization.
    // Never allow a stale worker to leave the VPN running afterward.
    private val session = AtomicInteger(0)

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISCONNECT -> {
                disconnect()
                return START_NOT_STICKY
            }
            ACTION_CONNECT -> {
                if (started || phase == Phase.STOPPING) return START_NOT_STICKY
                val link = SecureSubscription(this).load()
                if (!EngineRegistry.active.ready || link == null) {
                    phase = Phase.FAILED
                    stopSelf()
                    return START_NOT_STICKY
                }
                val ticket = session.incrementAndGet()
                startVisibleService()
                Thread {
                    try {
                        // If the stop button was pressed while starting, do
                        // not bring the native core up afterward.
                        if (session.get() != ticket) return@Thread
                        val result = EngineRegistry.active.connect(this, link)
                        if (session.get() != ticket) {
                            EngineRegistry.active.disconnect()
                            return@Thread
                        }
                        if (result.isFailure) disconnect(failed = true)
                        else updateUnverifiedNotice()
                    } catch (_: Throwable) {
                        if (session.get() == ticket) disconnect(failed = true)
                        else EngineRegistry.active.disconnect()
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
            .setContentTitle("Vainah VPN — тест движка")
            .setContentText("Защита трафика ещё не проверена")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отключить", pending)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
        } else startForeground(ID, notification)
        started = true
        phase = Phase.STARTING
    }
    private fun updateUnverifiedNotice() {
        if (!started || phase != Phase.STARTING) return
        phase = Phase.UNVERIFIED
        val stopIntent = Intent(this, VainahVpnService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        val pending = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notice = Notification.Builder(this, CHANNEL)
            .setContentTitle("Vainah VPN — движок запущен")
            .setContentText("DNS, IPv6 и маршрутизация не проверены")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отключить", pending)
            .setOngoing(true)
            .build()
        getSystemService(NotificationManager::class.java).notify(ID, notice)
    }

    @Synchronized
    private fun disconnect(failed: Boolean = false) {
        // The OS notification must remain until the native packet engine has
        // actually released the TUN; don't silently show OFF while it runs.
        if (phase == Phase.STOPPING) return
        val ticket = session.incrementAndGet()
        phase = Phase.STOPPING
        Thread {
            try { EngineRegistry.active.disconnect() } catch (_: Throwable) {}
            Handler(Looper.getMainLooper()).post {
                if (session.get() != ticket) return@post
                if (started) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    started = false
                }
                phase = if (failed) Phase.FAILED else Phase.OFF
                stopSelf()
            }
        }.start()
    }
    override fun onRevoke() {
        disconnect()
        super.onRevoke()
    }
    override fun onDestroy() {
        if (started) disconnect()
        super.onDestroy()
    }
}
