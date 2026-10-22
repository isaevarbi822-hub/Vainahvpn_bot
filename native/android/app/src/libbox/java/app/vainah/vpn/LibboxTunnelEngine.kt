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
    private var commandServer: CommandServer? = null
    private var tun: ParcelFileDescriptor? = null

    @Synchronized
    override fun connect(service: VpnService, singBoxConfigJson: String): Result<Unit> =
        runCatching {
            check(commandServer == null) { "VPN is already running" }
            val handler = Proxy.newProxyInstance(
                CommandServerHandler::class.java.classLoader,
                arrayOf(CommandServerHandler::class.java)
            ) { _, method, _ ->
                when (method.name) {
                    "writeDebugMessage", "serviceReload" -> null
                    "serviceStop" -> { disconnect(); null }
                    "connectSSHAgent" -> throw UnsupportedOperationException("SSH agent is disabled")
                    "getSystemProxyStatus" -> throw UnsupportedOperationException("System proxy is disabled")
                    "setSystemProxyEnabled" -> throw UnsupportedOperationException("System proxy is disabled")
                    "triggerNativeCrash" -> throw SecurityException("Native crash is disabled")
                    "toString" -> "VainahCommandHandler"
                    else -> throw UnsupportedOperationException("Unexpected command: ${method.name}")
                }
            } as CommandServerHandler
            val platform = Proxy.newProxyInstance(
                PlatformInterface::class.java.classLoader,
                arrayOf(PlatformInterface::class.java)
            ) { _, method, args ->
                when (method.name) {
                    "openTun" -> openTun(service, args!![0] as TunOptions)
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

            val server = LibboxNativeApi.createCommandServer(handler, platform)
            commandServer = server
            try {
                LibboxNativeApi.start(server, singBoxConfigJson)
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
        tun = fd
        // libbox owns the detached fd. Do not close it on Kotlin side.
        return fd.detachFd()
    }

    @Synchronized
    override fun disconnect() {
        val current = commandServer
        commandServer = null
        try { current?.closeService() } catch (_: Exception) {}
        try { current?.close() } catch (_: Exception) {}
        try { tun?.close() } catch (_: Exception) {}
        tun = null
    }
}
