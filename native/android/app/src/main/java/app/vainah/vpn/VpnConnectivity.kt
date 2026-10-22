package app.vainah.vpn

import android.net.VpnService
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.content.Context
import android.os.SystemClock
import java.net.HttpURLConnection
import java.net.InetSocketAddress
import java.net.Socket
import java.net.URI
import java.net.URL

/** Tests are independent: TCP reachability does NOT prove working VPN traffic. */
object VpnConnectivity {
    fun upstreamTcpLatency(service: VpnService, rawVless: String): Int {
        return runCatching {
            val node = URI(rawVless)
            require(node.scheme == "vless" && node.host != null && node.port in 1..65535)
            Socket().use { socket ->
                require(service.protect(socket)) { "Cannot protect upstream latency socket" }
                val start = SystemClock.elapsedRealtime()
                socket.connect(InetSocketAddress(node.host, node.port), 2500)
                (SystemClock.elapsedRealtime() - start).coerceIn(0, 60000).toInt()
            }
        }.getOrDefault(-1)
    }

    /** Unprotected HTTPS requests must pass through the TUN and exit via VPN. */
    fun verifyInternetThroughTunnel(service: VpnService): Boolean {
        val connectivity = service.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        // Bind to VPN explicitly: the VPN app's own default network can differ.
        val deadline = SystemClock.elapsedRealtime() + 3500L
        var vpnNetwork: android.net.Network? = null
        while (SystemClock.elapsedRealtime() < deadline) {
            vpnNetwork = connectivity.allNetworks.firstOrNull {
                connectivity.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
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
                val connection = (network.openConnection(URL(url)) as HttpURLConnection)
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
