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
 * Android foreground VPN service. TUN creation is NOT an internet success.
 * This service checks VPN-bound HTTPS and fails closed on unavailable egress.
 */
class VainahVpnService : VpnService() {
    companion object {
        const val ACTION_CONNECT = "app.vainah.vpn.CONNECT"
        const val EXTRA_SELECTED_VLESS = "app.vainah.vpn.SELECTED_VLESS"
        const val EXTRA_SELECTED_LABEL = "app.vainah.vpn.SELECTED_LABEL"
        const val ACTION_DISCONNECT = "app.vainah.vpn.DISCONNECT"
        private const val CHANNEL = "vainah_connection"
        private const val ID = 2103
    }

    @Volatile private var started = false
    @Volatile private var connectionGeneration = 0

    // Synchronous checkpoints survive an abrupt native-process crash.
    private fun checkpoint(stage: String) {
        getSharedPreferences("vpn_diagnostics", MODE_PRIVATE).edit()
            .putString("last_stage", stage)
            .putBoolean("startup_pending", true)
            .commit()
    }

    private fun completeStartup() {
        getSharedPreferences("vpn_diagnostics", MODE_PRIVATE).edit()
            .putString("last_stage", "vpn_https_probe_success")
            .putBoolean("startup_pending", false)
            .commit()
    }

    private fun failure(stage: String, error: Throwable) {
        // Never log the throwable message: a native exception could contain a node credential.
        Log.e("VainahVpn", "VPN failed at $stage: ${error.javaClass.simpleName}")
        getSharedPreferences("vpn_diagnostics", MODE_PRIVATE).edit()
            .putString("last_failure", "$stage: ${error.javaClass.simpleName}")
            .putBoolean("startup_pending", false)
            .apply()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_DISCONNECT -> {
                disconnect(userRequested = true)
                return START_NOT_STICKY
            }
            ACTION_CONNECT -> {
                if (started) return START_NOT_STICKY
                checkpoint("service_received_connect")
                val rawNode = intent.getStringExtra(EXTRA_SELECTED_VLESS).orEmpty()
                val config = rawNode?.let { runCatching { VlessRealityConfig.profile(it) }.getOrNull() }
                if (!EngineRegistry.active.ready || config == null || SecureSubscription(this).load() == null) {
                    VpnConnectionState.failed(this, "Не удалось проверить подписку или сервер")
                    stopSelf()
                    return START_NOT_STICKY
                }
                val label = intent.getStringExtra(EXTRA_SELECTED_LABEL)
                    ?.take(80)?.takeIf { it.isNotBlank() } ?: "Выбранный сервер"
                VpnConnectionState.starting(this, label)
                try {
                    checkpoint("starting_foreground_notification")
                    startVisibleService()
                } catch (error: Exception) {
                    failure("foreground service", error)
                    VpnConnectionState.failed(this, "Не удалось запустить службу Android")
                    stopSelf()
                    return START_NOT_STICKY
                }
                val generation = ++connectionGeneration
                Thread({
                    try {
                        // TCP reachability is measured outside the tunnel, not called VPN ping.
                        val latency = VpnConnectivity.upstreamTcpLatency(this, rawNode)
                        if (generation != connectionGeneration) return@Thread
                        VpnConnectionState.latency(this, latency)
                        showNotification()
                        checkpoint("starting_libbox_native_engine")
                        val result = EngineRegistry.active.connect(this, config)
                        if (generation != connectionGeneration) return@Thread
                        result.exceptionOrNull()?.let { throw it }
                        VpnConnectionState.tunnelCreated(this)
                        showNotification()
                        checkpoint("checking_vpn_https_egress")
                        if (!VpnConnectivity.verifyInternetThroughTunnel(this)) {
                            VpnConnectionState.failed(this,
                                "VPN-туннель создан, но интернет недоступен (DNS или маршрутизация)")
                            disconnect(userRequested = false)
                            return@Thread
                        }
                        if (generation != connectionGeneration) return@Thread
                        completeStartup()
                        VpnConnectionState.verified(this)
                        showNotification()
                    } catch (error: Throwable) {
                        failure("VPN startup / internet verification", error)
                        VpnConnectionState.failed(this, "Ошибка запуска VPN-движка")
                        disconnect(userRequested = false)
                    }
                }, "vainah-vpn-connect").start()
            }
        }
        return START_NOT_STICKY
    }

    private fun notification(): Notification {
        val state = VpnConnectionState.read(this)
        val latency = if (state.tcpLatencyMs >= 0)
            " · TCP ${state.tcpLatencyMs} мс" else ""
        val detail = when (state.phase) {
            VpnConnectionState.ONLINE -> "Интернет через VPN проверен"
            VpnConnectionState.TUN_READY -> "Туннель создан, проверяем интернет"
            else -> "Устанавливаем соединение"
        }
        val stopIntent = Intent(this, VainahVpnService::class.java).apply {
            action = ACTION_DISCONNECT
        }
        val stopAction = PendingIntent.getService(this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val openAction = PendingIntent.getActivity(this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setContentTitle("Vainah VPN · ${state.server}")
            .setContentText("$detail$latency")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(openAction)
            .setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Отключить", stopAction)
            .setOngoing(true)
            .build()
    }

    private fun showNotification() {
        if (started) getSystemService(NotificationManager::class.java)
            .notify(ID, notification())
    }

    private fun startVisibleService() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Vainah VPN · соединение",
                NotificationManager.IMPORTANCE_LOW)
        )
        val notice = notification()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(ID, notice, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
        } else startForeground(ID, notice)
        started = true
    }

    private fun disconnect(userRequested: Boolean) {
        connectionGeneration++
        if (userRequested) VpnConnectionState.disconnected(this)
        if (started) {
            started = false
            stopForeground(STOP_FOREGROUND_REMOVE)
        }
        Thread({
            runCatching { EngineRegistry.active.disconnect() }
                .onFailure { failure("engine shutdown", it) }
        }, "vainah-vpn-shutdown").start()
        stopSelf()
    }

    override fun onRevoke() {
        disconnect(userRequested = true)
        super.onRevoke()
    }

    override fun onDestroy() {
        connectionGeneration++
        if (started) {
            started = false
            runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
            Thread({ runCatching { EngineRegistry.active.disconnect() } },
                "vainah-vpn-destroy").start()
        }
        super.onDestroy()
    }
}
