package app.vainah.vpn

import android.net.VpnService

/**
 * Adapter for a future H1Cloud/VLESS packet-forwarding engine.
 * No mock or fake success: ready is false until a reviewed transport ships.
 */
interface TunnelEngine {
    val ready: Boolean
    fun connect(service: VpnService, subscriptionUrl: String): Result<Unit>
    fun disconnect()
}

object UnavailableTunnelEngine : TunnelEngine {
    override val ready = false
    override fun connect(service: VpnService, subscriptionUrl: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("VLESS engine not integrated"))
    override fun disconnect() = Unit
}

object EngineRegistry {
    // Replace only after VPN egress/DNS/IPv6/leak tests pass.
    val active: TunnelEngine = UnavailableTunnelEngine
}
