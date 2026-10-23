package app.vainah.vpn

/**
 * Process-local owner gate for a single native VPN engine. Uses reference
 * identity, never a user ID or subscription token, to track a service.
 *
 * A late shutdown from a destroyed VpnService must not stop a newer owner's
 * tunnel. Cancellation is checked while holding the same lock as connect.
 * Does not prove real VPN traffic or internet connectivity.
 */
class OwnedTunnelGate {
    private val lock = Any()
    private var owner: Any? = null

    fun connect(
        session: Any,
        requested: () -> Boolean,
        open: () -> Result<Unit>
    ): Result<Unit> = synchronized(lock) {
        if (!requested()) {
            return@synchronized Result.failure(
                IllegalStateException("VPN connection was cancelled")
            )
        }
        if (owner != null && owner !== session) {
            return@synchronized Result.failure(
                IllegalStateException("Previous VPN session still active")
            )
        }
        val result = open()
        if (result.isSuccess) owner = session
        result
    }

    fun disconnect(session: Any, close: () -> Unit) = synchronized(lock) {
        if (owner !== session) return@synchronized
        try {
            close()
        } finally {
            owner = null
        }
    }
}
