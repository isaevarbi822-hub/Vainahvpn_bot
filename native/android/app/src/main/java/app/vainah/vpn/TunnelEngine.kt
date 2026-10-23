package app.vainah.vpn

import android.net.VpnService

/**
 * Adapter for a future H1Cloud/VLESS packet-forwarding engine.
 * No mock or fake success: ready is false until a reviewed transport ships.
 */
interface TunnelEngine {
    val ready: Boolean
    fun connect(service: VpnService, singBoxConfigJson: String): Result<Unit>
    fun disconnect()
}

object UnavailableTunnelEngine : TunnelEngine {
    override val ready = false
    override fun connect(service: VpnService, singBoxConfigJson: String): Result<Unit> =
        Result.failure(UnsupportedOperationException("VLESS engine not integrated"))
    override fun disconnect() = Unit
}

object EngineRegistry {
    // Replace only after VPN egress/DNS/IPv6/leak tests pass.
    val active: TunnelEngine by lazy {
        // The experimental adapter class is excluded from normal APK builds.
        // Never display a connected state when the real engine is absent.
        runCatching {
            Class.forName("app.vainah.vpn.LibboxTunnelEngine")
                .getDeclaredConstructor().newInstance() as TunnelEngine
        }.getOrDefault(UnavailableTunnelEngine)
    }

    // VPN services can be recreated during a rapid stop/start sequence.
    // A delayed shutdown from the OLD service must never close a NEW tunnel.
    private val lifecycleLock = Any()
    private var owner: VpnService? = null

    fun connectOwned(
        service: VpnService,
        config: String,
        isStillRequested: () -> Boolean
    ): Result<Unit> = synchronized(lifecycleLock) {
        if (!isStillRequested()) {
            return@synchronized Result.failure(
                IllegalStateException("VPN connection was cancelled")
            )
        }
        if (owner != null && owner !== service) {
            return@synchronized Result.failure(
                IllegalStateException("Previous VPN session still active")
            )
        }
        val result = active.connect(service, config)
        if (result.isSuccess) owner = service
        result
    }

    fun disconnectOwned(service: VpnService) = synchronized(lifecycleLock) {
        // If the service never successfully opened this engine, it does not
        // have permission to close another service's established session.
        if (owner !== service) return@synchronized
        try {
            active.disconnect()
        } finally {
            owner = null
        }
    }
}
