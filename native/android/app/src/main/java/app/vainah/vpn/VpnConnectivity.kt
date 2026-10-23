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
        if (candidates.isEmpty()) error("No underlying Android network")
        // A phone can have Wi-Fi and mobile data simultaneously. A DNS or
        // TCP failure on one must not prevent trying the other. Prefer
        // Android-validated physical networks, never a VPN as its upstream.
        val physicalNetworks = candidates.sortedByDescending { network ->
            connectivity.getNetworkCapabilities(network)?.hasCapability(
                NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
        }
        for (physical in physicalNetworks) {
            // The lookup belongs to this specific physical network, not to
            // Android's current default VPN network.
            val addresses = runCatching { physical.getAllByName(node.host) }
                .getOrNull()?.sortedBy { if (it is java.net.Inet4Address) 0 else 1 }
                ?: continue
            for (ip in addresses) {
                val success = runCatching {
                    physical.socketFactory.createSocket().use { socket ->
                        require(service.protect(socket)) { "Cannot protect upstream socket" }
                        val begin = SystemClock.elapsedRealtime()
                        socket.connect(InetSocketAddress(ip, node.port), 3500)
                        val latency = (SystemClock.elapsedRealtime() - begin)
                            .coerceIn(0, 60000).toInt()
                        UpstreamProbe(ip.hostAddress.substringBefore('%'), latency)
                    }
                }.getOrNull()
                if (success != null) return success
            }
        }
        // No network, server address, UUID or credential in error diagnostics.
        throw IllegalStateException("H1Cloud TCP endpoint unreachable on physical networks")
    }

    /**
     * Diagnostic only. The VPN app is excluded from its own tunnel by Android,
     * so a failed app-owned probe MUST NOT be treated as failed browser traffic.
     */
    data class TunnelProbe(val reachable: Boolean, val reason: String)

    /**
     * A self-probe from the VPN owner UID is sometimes excluded by Android.
     * Failure never proves other apps lack egress. No endpoints or secrets
     * appear in the result.
     */
    fun diagnoseTunnel(service: VpnService): TunnelProbe {
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
        val network = vpnNetwork ?: return TunnelProbe(false, "vpn_network_not_visible_to_app")
        var lastReason = "https_probe_unavailable"
        for (url in arrayOf(
            "https://cp.cloudflare.com/generate_204",
            "https://connectivitycheck.gstatic.com/generate_204"
        )) {
            val result = runCatching {
                val connection = network.openConnection(URL(url)) as HttpURLConnection
                try {
                    connection.instanceFollowRedirects = false
                    connection.connectTimeout = 3500
                    connection.readTimeout = 3500
                    connection.useCaches = false
                    connection.responseCode
                } finally {
                    connection.disconnect()
                }
            }
            if (result.getOrNull() == 204) return TunnelProbe(true, "https_204")
            lastReason = result.exceptionOrNull()?.let {
                HttpsProbeFailure.classify(it)
            } ?: "https_unexpected_status"
        }
        return TunnelProbe(false, lastReason)
    }

    fun verifyInternetThroughTunnel(service: VpnService): Boolean =
        diagnoseTunnel(service).reachable
}
