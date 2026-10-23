package app.vainah.vpn.watch

/**
 * Pure Wear OS companion presentation model. Android phone remains owner of
 * VpnService; Wear never creates a VPN tunnel or receives a VLESS credential.
 *
 * This module is a source-level companion template, not a signed Wear APK.
 * Pairing transport must be implemented and tested on the phone before release.
 */
data class WatchVpnStatus(
    val phase: String,
    val server: String,
    val tcpLatencyMs: Int,
    val verifiedBrowserEgress: Boolean
) {
    val displayPhase: String
        get() = when (phase) {
            "online" -> if (verifiedBrowserEgress) "Подтверждено телефоном" else "Туннель не проверен"
            "tun_ready" -> "Туннель не проверен"
            "starting" -> "Подключение…"
            "failed" -> "Ошибка VPN"
            else -> "VPN отключён"
        }

    companion object {
        fun fromPayload(payload: Map<String, Any?>): WatchVpnStatus {
            val allowed = setOf("off", "starting", "tun_ready", "online", "failed")
            val requested = payload["phase"] as? String
            val phase = requested?.takeIf(allowed::contains) ?: "off"
            val verified = payload["verified_browser_egress"] == true && phase == "online"
            val raw = payload["server"] as? String ?: ""
            val label = raw.takeIf {
                it.length <= 80 && it.none(Char::isISOControl) &&
                    !it.contains("://") && !it.contains('@') &&
                    !it.contains('?') && !it.contains('#')
            }.orEmpty()
            val latency = (payload["tcp_latency_ms"] as? Number)
                ?.toInt()?.takeIf { it in 0..60000 } ?: -1
            return WatchVpnStatus(
                phase = if (phase == "online" && !verified) "tun_ready" else phase,
                server = label, tcpLatencyMs = latency,
                verifiedBrowserEgress = verified
            )
        }
    }
}

enum class WatchVpnCommand(val wireName: String) {
    STATUS_REQUEST("status_request"),
    DISCONNECT("disconnect")
}

interface PairedPhoneTransport {
    /** Phone authenticates the paired watch and executes the command. */
    fun send(command: WatchVpnCommand, onReply: (Map<String, Any?>?) -> Unit)
}

class VainahWearController(private val phone: PairedPhoneTransport) {
    var current = WatchVpnStatus.fromPayload(emptyMap())
        private set

    fun refresh(onChange: (WatchVpnStatus) -> Unit) =
        request(WatchVpnCommand.STATUS_REQUEST, onChange)

    fun disconnectOnPhone(onChange: (WatchVpnStatus) -> Unit) =
        request(WatchVpnCommand.DISCONNECT, onChange)

    private fun request(command: WatchVpnCommand, onChange: (WatchVpnStatus) -> Unit) {
        phone.send(command) { reply ->
            current = WatchVpnStatus.fromPayload(reply ?: emptyMap())
            onChange(current)
        }
    }
}
