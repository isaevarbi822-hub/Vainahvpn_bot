package app.vainah.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.ParcelFileDescriptor
import io.nekohasekai.libbox.*
import java.net.NetworkInterface as JavaNetworkInterface

/**
 * Complete, typed bridge for the libbox 1.14.0 PlatformInterface contract.
 * A missing callback must not throw through Go's JNI interface unexpectedly.
 */
internal class LibboxAndroidPlatform(
    private val service: VpnService,
    private val onStage: (String) -> Unit
) : PlatformInterface {
    private val connectivity = service.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private var tun: ParcelFileDescriptor? = null
    private var callback: ConnectivityManager.NetworkCallback? = null

    override fun localDNSTransport(): LocalDNSTransport? = null
    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true
    override fun autoDetectInterfaceControl(fd: Int) {
        check(service.protect(fd)) { "Cannot protect upstream socket from VPN recursion" }
    }
    override fun useProcFS(): Boolean = false
    override fun underNetworkExtension(): Boolean = false
    override fun includeAllNetworks(): Boolean = false
    override fun usePlatformShell(): Boolean = false
    override fun usePlatformBridge(): Boolean = false

    override fun openTun(options: TunOptions): Int {
        check(tun == null) { "TUN already opened" }
        onStage("opening_android_tun")
        val mtu = options.mtu.takeIf { it in 1280..9000 } ?: 1500
        val builder = service.Builder().setSession("Vainah VPN")
            .setMtu(mtu)
            .addAddress("172.19.0.1", 30)
            .addRoute("0.0.0.0", 0)
            .addAddress("fd00:19::1", 126)
            .addRoute("::", 0)
            .addDnsServer("1.1.1.1")
            .setBlocking(true)
        val fd = builder.establish() ?: error("Android denied TUN")
        tun = fd
        onStage("android_tun_established")
        // Go duplicates this descriptor; retain our copy until disconnect.
        return fd.fd
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
            .build()
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { updateDefault(listener) }
            override fun onLost(network: Network) { updateDefault(listener) }
            override fun onLinkPropertiesChanged(network: Network, props: android.net.LinkProperties) {
                updateDefault(listener)
            }
        }
        connectivity.registerNetworkCallback(request, cb)
        callback = cb
        updateDefault(listener)
    }

    private fun updateDefault(listener: InterfaceUpdateListener) {
        // Never select our own VPN tunnel as an upstream interface.
        val network = connectivity.allNetworks.firstOrNull { net ->
            val caps = connectivity.getNetworkCapabilities(net)
            caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
        }
        val name = network?.let { connectivity.getLinkProperties(it)?.interfaceName }
        val index = name?.let { JavaNetworkInterface.getByName(it)?.index } ?: -1
        listener.updateDefaultInterface(name.orEmpty(), index, false, false)
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        callback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        callback = null
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
        val items = mutableListOf<io.nekohasekai.libbox.NetworkInterface>()
        val all = JavaNetworkInterface.getNetworkInterfaces()
        while (all != null && all.hasMoreElements()) {
            val itf = all.nextElement()
            val obj = io.nekohasekai.libbox.NetworkInterface().apply {
                index = itf.index
                name = itf.name
                mtu = itf.mtu.coerceAtLeast(1280)
                flags = (if (itf.isUp) 1 else 0) or
                    (if (itf.isLoopback) 8 else 0) or
                    (if (itf.isPointToPoint) 16 else 0) or
                    (if (itf.supportsMulticast()) 4096 else 0)
                type = when {
                    itf.name.startsWith("wlan") -> Libbox.InterfaceTypeWIFI
                    itf.name.startsWith("rmnet") || itf.name.startsWith("ccmni") ->
                        Libbox.InterfaceTypeCellular
                    else -> Libbox.InterfaceTypeOther
                }
                addresses = strings(itf.interfaceAddresses.mapNotNull { a ->
                    val host = a.address?.hostAddress?.substringBefore('%') ?: return@mapNotNull null
                    "$host/${a.networkPrefixLength}"
                })
                dnsServer = strings(emptyList())
                gateway = strings(emptyList())
                metered = false
            }
            items.add(obj)
        }
        val iterator = items.iterator()
        return object : NetworkInterfaceIterator {
            override fun hasNext() = iterator.hasNext()
            override fun next() = iterator.next()
        }
    }

    private fun strings(values: List<String>): StringIterator {
        val iterator = values.iterator()
        return object : StringIterator {
            override fun hasNext(): Boolean = iterator.hasNext()
            override fun next(): String = iterator.next()
            override fun len(): Int = values.size
        }
    }

    override fun readWIFIState(): WIFIState? = null
    override fun clearDNSCache() = Unit
    override fun registerMyInterface(name: String) = Unit
    override fun sendNotification(notification: Notification) = Unit
    override fun cancelNotification(identifier: String, typeID: Int) = Unit
    override fun startNeighborMonitor(listener: NeighborUpdateListener) = Unit
    override fun closeNeighborMonitor(listener: NeighborUpdateListener) = Unit
    override fun findConnectionOwner(
        ipProtocol: Int, sourceAddress: String, sourcePort: Int,
        destinationAddress: String, destinationPort: Int
    ): ConnectionOwner = throw UnsupportedOperationException("Per-app routing is not available")
    override fun lookupSFTPServer(): String = throw UnsupportedOperationException("SFTP disabled")
    override fun readSystemSSHHostKey(): String = throw UnsupportedOperationException("SSH disabled")
    override fun tailscaleHostname(): String = ""
    override fun checkPlatformShell(): Unit = throw UnsupportedOperationException("Shell disabled")
    override fun lookupUser(username: String): PlatformUser =
        throw UnsupportedOperationException("User lookup disabled")
    override fun openShellSession(
        user: PlatformUser, command: String, environ: StringIterator,
        term: String, rows: Int, cols: Int
    ): ShellSession = throw UnsupportedOperationException("Shell disabled")
    override fun createBridge(options: BridgeOptions): BridgeSession =
        throw UnsupportedOperationException("Bridge disabled")

    fun hasTun(): Boolean = tun != null

    fun close() {
        callback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        callback = null
        runCatching { tun?.close() }
        tun = null
    }
}
