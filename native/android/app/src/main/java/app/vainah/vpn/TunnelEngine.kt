package app.vainah.vpn

import android.net.VpnService

/**
 * Native protocol transport boundary. Not yet implemented for H1Cloud VLESS.
 * A production transport MUST establish its remote encrypted session and
 * forward BOTH directions of the VPN TUN packet stream before claiming "up".
 *
 * No mock engine is allowed to pretend packets are protected.
 */
interface TunnelEngine {
    val ready: Boolean
    suspend fun connect(service: VpnService, subscriptionUrl: String): Result<Unit>
    suspend fun disconnect()
}

object UnavailableTunnelEngine : TunnelEngine {
    override val ready: Boolean = false
    override suspend fun connect(service: VpnService, subscriptionUrl: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("H1Cloud VLESS engine not integrated"))
    override suspend fun disconnect() = Unit
}

object EngineRegistry {
    // Replace only after a reviewed, packet-forwarding VLESS engine is integrated.
    val active: TunnelEngine = UnavailableTunnelEngine
}
