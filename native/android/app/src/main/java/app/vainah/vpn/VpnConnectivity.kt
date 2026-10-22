package app.vainah.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.SystemClock
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.URI
import java.net.URL

/**
 * A reachable VLESS TCP port does not prove a working REALITY handshake or VPN egress.
 * Physical-network resolution is done BEFORE establishing Android TUN to avoid
 * bootstrap DNS recursion. No node URI, secrets, or IP are written to logs.
 */
object VpnConnectivity {
    data class UpstreamProbe(val numericAddress: String, val tcpLatencyMs: Int)

    fun prepareUpstream(service: VpnService, rawVless: String): UpstreamProbe {
        val node = URI(rawVless)
        require(node.scheme == "vless" && node.host != null && node.port in 1..65535)

        val connectivity = service.getSystemService(Context.CONNECTIVITY_SERVICE)
            as ConnectivityManager
        val candidates = connectivity.allNetworks.filter { network ->
            val caps = connectivity.getNetworkCapabilities(network)
            caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
        }
        val physical = candidates.firstOrNull { network ->
            connectivity.getNetworkCapabilities(network)?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        } ?: candidates.firstOrNull() ?: error("No underlying Android network")

        val addresses = physical.getAllByName(node.host).sortedBy {
            if (it is java.net.Inet4Address) 0 else 1
        }
        require(addresses.isNotEmpty()) { "No upstream address" }
        var lastFailure: Exception? = null
        for (ip in addresses) {
            try {
                physical.socketFactory.createSocket().use { socket ->
                    // The DNS and TCP test are bound to the real underlying network.
                    require(service.protect(socket)) { "Cannot protect upstream socket" }
                    val begin = SystemClock.elapsedRealtime()
                    socket.connect(InetSocketAddress(ip, node.port), 3500)
                    val latency = (SystemClock.elapsedRealtime() - begin).coerceIn(0, 60000).toInt()
                    return UpstreamProbe(ip.hostAddress.substringBefore('%'), latency)
                }
            } catch (e: Exception) {
                lastFailure = e
            }
        }
        throw IllegalStateException("H1Cloud node TCP port unreachable", lastFailure)
    }

    /**
     * Diagnostic only. The VPN app is excluded from its own tunnel by Android,
     * so a failed app-owned probe MUST NOT be treated as failed browser traffic.
     */
    fun verifyInternetThroughTunnel(service: VpnService): Boolean {
        val connectivity = service.getSystemService(Context.CONNECTIVITY_SERVICE)
            as ConnectivityManager
        val deadline = SystemClock.elapsedRealtime() + 3500L
        var vpnNetwork: Network? = null
        while (SystemClock.elapsedRealtime() < deadline) {
            vpnNetwork = connectivity.allNetworks.firstOrNull {
                connectivity.getNetworkCapabilities(it)?.hasTransport(
                    NetworkCapabilities.TRANSPORT_VPN) == true
            }
            if (vpnNetwork != null) break
            Thread.sleep(150)
        }
        val network = vpnNetwork ?: return false
        for (url in arrayOf(
            "https://cp.cloudflare.com/generate_204",
            "https://connectivitycheck.gstatic.com/generate_204"
        )) {
            val okay = runCatching {
                val connection = network.openConnection(URL(url)) as HttpURLConnection
                try {
                    connection.instanceFollowRedirects = false
                    connection.connectTimeout = 3500
                    connection.readTimeout = 3500
                    connection.useCaches = false
                    connection.responseCode == 204
                } finally {
                    connection.disconnect()
                }
            }.getOrDefault(false)
            if (okay) return true
        }
        return false
    }
}
