package app.vainah.vpn

import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor

/**
 * Android TUN routing settings matching the private sing-box config.
 * This is NOT a VPN engine and MUST NOT be invoked until libbox is ready to
 * exchange packets; otherwise Android would black-hole all device traffic.
 */
internal object AndroidTunRoutePlan {
    const val IPV4_ADDRESS = "172.29.86.1"
    const val IPV4_PREFIX = 30
    const val IPV6_ADDRESS = "fd00:86:29::1"
    const val IPV6_PREFIX = 126
    const val DNS_SERVER = "1.1.1.1"
    const val MTU = 1400

    fun validForFullTunnel(): Boolean =
        IPV4_PREFIX in 1..32 &&
        IPV6_PREFIX in 1..128 &&
        MTU in 1280..9000 &&
        DNS_SERVER.isNotBlank()

    /**
     * The resulting descriptor belongs to the native engine's lifetime.
     * Do not close or report a connected state before verified forwarding.
     * Never call this from MainActivity or the UI-only fallback engine.
     */
    fun openForReadyEngine(service: VpnService): ParcelFileDescriptor {
        check(validForFullTunnel()) { "INVALID_TUN_PLAN" }
        check(VpnService.prepare(service) == null) { "VPN_PERMISSION_REQUIRED" }
        val builder = service.Builder()
            .setSession("Vainah VPN")
            .setMtu(MTU)
            .addAddress(IPV4_ADDRESS, IPV4_PREFIX)
            .addAddress(IPV6_ADDRESS, IPV6_PREFIX)
            .addRoute("0.0.0.0", 0)
            .addRoute("::", 0)
            .addDnsServer(DNS_SERVER)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }
        return builder.establish() ?: throw IllegalStateException("TUN_UNAVAILABLE")
    }
}
