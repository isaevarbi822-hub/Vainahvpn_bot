package app.vainah.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.system.OsConstants
import io.nekohasekai.libbox.*
import io.nekohasekai.libbox.NetworkInterface as BoxNetworkInterface
import java.io.File
import java.net.NetworkInterface
import java.util.Collections

/**
 * Only compiled when the pinned native libbox.aar exists.
 * The ordinary preview remains fail-closed. A running core is not
 * evidence of encrypted packet delivery, secure DNS or IPv6 routing.
 */
class LibboxTunnelEngine : TunnelEngine {
    override val ready = true
    private var server: CommandServer? = null
    private var platform: VainahAndroidPlatform? = null
    private var privateStorage: List<File> = emptyList()

    @Synchronized
    override fun connect(service: VpnService, subscriptionUrl: String): Result<Unit> {
        if (server != null) return Result.failure(IllegalStateException("ENGINE_BUSY"))
        if (service !is VainahVpnService)
            return Result.failure(IllegalStateException("WRONG_SERVICE"))
        return try {
            // Purge prior crash leftovers BEFORE fetching a new subscription,
            // even when the H1Cloud endpoint later rejects the request.
            val base = File(service.filesDir, "libbox-base")
            val work = File(service.cacheDir, "libbox-working")
            val temp = File(service.cacheDir, "libbox-temp")
            privateStorage = listOf(base, work, temp)
            // A previous process could have crashed before its sensitive
            // libbox config snapshots were cleaned up. Remove stale private
            // state before starting a new session; fail closed if not possible.
            for (dir in privateStorage) {
                if (dir.exists() && !dir.deleteRecursively())
                    throw IllegalStateException("ENGINE_STORAGE_CLEANUP")
                if (!dir.mkdirs()) throw IllegalStateException("ENGINE_STORAGE")
            }
            val config = MobileRealityConfig.fromSubscription(H1PrivateSubscription.read(subscriptionUrl))
            // The native daemon saves a plaintext config snapshot; keep it
            // app-private and delete it when the service disconnects.
            Libbox.setup(SetupOptions().apply {
                basePath = base.absolutePath
                workingPath = work.absolutePath
                tempPath = temp.absolutePath
                commandServerListenPort = 0
                debug = false
                logMaxLines = 0
                crashReportSource = "VainahVpn"
                appVersion = "3"
                appMarketingVersion = "0.3.0-integration"
            })
            Libbox.checkConfig(config)
            val bridge = VainahAndroidPlatform(service)
            val command = CommandServer(VainahCommandHandler(service), bridge)
            platform = bridge
            server = command
            command.start()
            command.startOrReloadService(config, OverrideOptions())
            Result.success(Unit)
        } catch (_: Throwable) {
            disconnect()
            // Do not expose upstream error text: it may contain VPN secrets.
            Result.failure(IllegalStateException("ENGINE_START_FAILED"))
        }
    }

    @Synchronized
    override fun disconnect() {
        val active = server
        server = null
        try { active?.closeService() } catch (_: Throwable) {}
        try { active?.close() } catch (_: Throwable) {}
        try { platform?.shutdown() } catch (_: Throwable) {}
        platform = null
        // libbox may put sensitive configuration in base, working or temp.
        // Always clear all three, including on failed initialization.
        privateStorage.forEach { dir ->
            try { dir.deleteRecursively() } catch (_: Throwable) {}
        }
        privateStorage = emptyList()
    }
}

private class VainahCommandHandler(private val service: VainahVpnService) : CommandServerHandler {
    override fun serviceStop() { service.stopSelf() }
    override fun serviceReload() = Unit
    override fun getSystemProxyStatus(): SystemProxyStatus? = null
    override fun setSystemProxyEnabled(isEnabled: Boolean) = Unit
    override fun triggerNativeCrash() { throw IllegalStateException("NATIVE_CRASH_DISABLED") }
    override fun writeDebugMessage(message: String?) = Unit
    override fun connectSSHAgent(): Int = -1
}

private class VainahAndroidPlatform(private val service: VainahVpnService) : PlatformInterface {
    private val networkManager =
        service.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private var tun: ParcelFileDescriptor? = null
    private var watcher: ConnectivityManager.NetworkCallback? = null

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true
    override fun autoDetectInterfaceControl(fd: Int) {
        check(service.protect(fd)) { "SOCKET_PROTECT_FAILED" }
    }
    @Synchronized
    override fun openTun(options: TunOptions): Int {
        check(tun == null) { "TUN_ALREADY_OPEN" }
        // libbox takes the fd and duplicates it for packet exchange.
        val opened = AndroidTunRoutePlan.openForReadyEngine(service)
        tun = opened
        return opened.fd
    }
    override fun localDNSTransport(): LocalDNSTransport? = null
    override fun useProcFS(): Boolean = false
    override fun findConnectionOwner(
        ipProtocol: Int, sourceAddress: String?, sourcePort: Int,
        destinationAddress: String?, destinationPort: Int
    ): ConnectionOwner = ConnectionOwner()

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = report(network, listener)
            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) =
                report(network, listener)
        }
        watcher = callback
        networkManager.registerDefaultNetworkCallback(callback)
        networkManager.activeNetwork?.let { report(it, listener) }
    }
    private fun report(network: Network, listener: InterfaceUpdateListener) {
        val capability = networkManager.getNetworkCapabilities(network) ?: return
        if (capability.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return
        val name = networkManager.getLinkProperties(network)?.interfaceName ?: return
        val index = NetworkInterface.getByName(name)?.index ?: return
        listener.updateDefaultInterface(
            name, index,
            !capability.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED), false
        )
    }
    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        watcher?.let { try { networkManager.unregisterNetworkCallback(it) } catch (_: Exception) {} }
        watcher = null
    }
    override fun getInterfaces(): NetworkInterfaceIterator {
        val locals = Collections.list(NetworkInterface.getNetworkInterfaces()).associateBy { it.name }
        val found = mutableListOf<BoxNetworkInterface>()
        for (network in networkManager.allNetworks) {
            val caps = networkManager.getNetworkCapabilities(network) ?: continue
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue
            val link = networkManager.getLinkProperties(network) ?: continue
            val name = link.interfaceName ?: continue
            val item = locals[name] ?: continue
            val profile = BoxNetworkInterface().apply {
                this.name = name
                index = item.index
                mtu = try { item.mtu } catch (_: Exception) { 1500 }
                type = when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
                    else -> Libbox.InterfaceTypeOther
                }
                flags = OsConstants.IFF_UP or OsConstants.IFF_RUNNING
                metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                addresses = VainahStrings(item.interfaceAddresses.mapNotNull {
                    val addr = it.address.hostAddress?.substringBefore('%') ?: return@mapNotNull null
                    addr + "/" + it.networkPrefixLength
                })
                dnsServer = VainahStrings(link.dnsServers.mapNotNull { it.hostAddress })
                gateway = VainahStrings(link.routes.filter {
                    it.destination.prefixLength == 0
                }.mapNotNull { it.gateway?.hostAddress })
            }
            found.add(profile)
        }
        return object : NetworkInterfaceIterator {
            private val iterator = found.iterator()
            override fun hasNext() = iterator.hasNext()
            override fun next(): BoxNetworkInterface = iterator.next()
        }
    }
    override fun underNetworkExtension() = false
    override fun includeAllNetworks() = false
    override fun readWIFIState(): WIFIState? = null
    override fun clearDNSCache() = Unit
    override fun sendNotification(notification: Notification) = Unit
    override fun cancelNotification(identifier: String?, typeID: Int) = Unit
    override fun startNeighborMonitor(listener: NeighborUpdateListener?) = Unit
    override fun closeNeighborMonitor(listener: NeighborUpdateListener?) = Unit
    override fun registerMyInterface(name: String?) = Unit
    override fun usePlatformShell() = false
    override fun checkPlatformShell() { throw IllegalStateException("SHELL_DISABLED") }
    override fun openShellSession(
        user: PlatformUser?, command: String?, environ: StringIterator?,
        term: String?, rows: Int, cols: Int
    ): ShellSession = throw IllegalStateException("SHELL_DISABLED")
    override fun lookupUser(username: String?): PlatformUser =
        throw IllegalStateException("USER_LOOKUP_DISABLED")
    override fun lookupSFTPServer(): String = throw IllegalStateException("SFTP_DISABLED")
    override fun readSystemSSHHostKey(): String = throw IllegalStateException("SHELL_DISABLED")
    override fun tailscaleHostname(): String = "Vainah VPN"
    override fun usePlatformBridge() = false
    override fun createBridge(options: BridgeOptions?): BridgeSession =
        throw IllegalStateException("BRIDGE_DISABLED")

    fun shutdown() {
        watcher?.let { try { networkManager.unregisterNetworkCallback(it) } catch (_: Exception) {} }
        watcher = null
        try { tun?.close() } catch (_: Exception) {}
        tun = null
    }
}
private class VainahStrings(values: List<String>) : StringIterator {
    private val iterator = values.iterator()
    override fun hasNext() = iterator.hasNext()
    override fun next(): String = iterator.next()
    override fun len(): Int = 0
}
