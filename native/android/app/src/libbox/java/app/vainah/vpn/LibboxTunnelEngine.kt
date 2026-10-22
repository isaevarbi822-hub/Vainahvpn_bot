package app.vainah.vpn

import android.net.VpnService
import android.os.ParcelFileDescriptor
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.TunOptions
import java.lang.reflect.Proxy

/**
 * Experimental real libbox/TUN integration. It is compiled only when
 * -PvainahEnableLibbox=true, never included in the published UI preview.
 * A successful start does NOT constitute an internet connectivity/leak test.
 */
class LibboxTunnelEngine : TunnelEngine {
    override val ready: Boolean = true
    private fun stage(service: VpnService, name: String) {
        service.getSharedPreferences("vpn_diagnostics", android.content.Context.MODE_PRIVATE)
            .edit().putString("last_stage", name).putBoolean("startup_pending", true).commit()
    }
    @Volatile private var commandServer: CommandServer? = null
    private var tun: ParcelFileDescriptor? = null

    override fun connect(service: VpnService, singBoxConfigJson: String): Result<Unit> =
        runCatching {
            check(commandServer == null) { "VPN is already running" }
            stage(service, "creating_command_handler")
            val handler = Proxy.newProxyInstance(
                CommandServerHandler::class.java.classLoader,
                arrayOf(CommandServerHandler::class.java)
            ) { _, method, _ ->
                when (method.name) {
                    "writeDebugMessage", "serviceReload" -> null
                    "serviceStop" -> {
                        // libbox may invoke this callback on its own command thread.
                        // Closing CommandServer synchronously here can deadlock or crash.
                        Thread({ disconnect() }, "vainah-libbox-shutdown").start()
                        null
                    }
                    "connectSSHAgent" -> throw UnsupportedOperationException("SSH agent is disabled")
                    "getSystemProxyStatus" -> throw UnsupportedOperationException("System proxy is disabled")
                    "setSystemProxyEnabled" -> throw UnsupportedOperationException("System proxy is disabled")
                    "triggerNativeCrash" -> throw SecurityException("Native crash is disabled")
                    "toString" -> "VainahCommandHandler"
                    else -> throw UnsupportedOperationException("Unexpected command: ${method.name}")
                }
            } as CommandServerHandler
            stage(service, "creating_platform_bridge")
            val platform = Proxy.newProxyInstance(
                PlatformInterface::class.java.classLoader,
                arrayOf(PlatformInterface::class.java)
            ) { _, method, args ->
                when (method.name) {
                    "openTun" -> {
                        stage(service, "opening_android_tun")
                        openTun(service, args!![0] as TunOptions)
                    }
                    "autoDetectInterfaceControl" -> {
                        val fd = args!![0] as Int
                        check(service.protect(fd)) { "Could not protect outgoing socket" }
                        null
                    }
                    "usePlatformAutoDetectInterfaceControl" -> true
                    "usePlatformBridge", "usePlatformShell", "useProcFS", "underNetworkExtension",
                    "includeAllNetworks" -> false
                    "clearDNSCache", "cancelNotification", "closeDefaultInterfaceMonitor",
                    "closeNeighborMonitor", "registerMyInterface" -> null
                    "toString" -> "VainahAndroidPlatform"
                    else -> throw UnsupportedOperationException(
                        "Unsupported Android platform method: ${method.name}"
                    )
                }
            } as PlatformInterface

            stage(service, "creating_libbox_command_server")
            val server = LibboxNativeApi.createCommandServer(handler, platform)
            commandServer = server
            try {
                stage(service, "validating_libbox_config")
                LibboxNativeApi.validateConfiguration(singBoxConfigJson)
                stage(service, "starting_libbox_command_server")
                server.start()
                stage(service, "loading_libbox_service")
                server.startOrReloadService(singBoxConfigJson, io.nekohasekai.libbox.OverrideOptions())
                stage(service, "verifying_android_tun")
                check(tun != null) { "libbox did not request Android TUN" }
            } catch (error: Throwable) {
                disconnect()
                throw error
            }
        }

    private fun openTun(service: VpnService, options: TunOptions): Int {
        check(tun == null) { "TUN already exists" }
        // Fail closed: no split tunneling or IPv6 fallback until audited.
        val builder = service.Builder()
            .setSession("Vainah VPN")
            .setMtu(options.mtu.takeIf { it in 1280..9000 } ?: 1500)
            .addAddress("172.19.0.1", 30)
            .addRoute("0.0.0.0", 0)
            .addAddress("fd00:19::1", 126)
            .addRoute("::", 0)
            .addDnsServer("1.1.1.1")
            .setBlocking(true)
        val fd = builder.establish() ?: error("Android refused VPN interface")
        stage(service, "android_tun_established")
        tun = fd
        // libbox owns the detached fd. Do not close it on Kotlin side.
        return fd.detachFd()
    }

    override fun disconnect() {
        val current = commandServer
        commandServer = null
        try { current?.closeService() } catch (_: Exception) {}
        try { current?.close() } catch (_: Exception) {}
        try { tun?.close() } catch (_: Exception) {}
        tun = null
    }
}
