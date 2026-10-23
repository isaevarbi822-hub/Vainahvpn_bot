package app.vainah.vpn

/**
 * Support report with an intentionally tiny, credential-free schema.
 * No subscription URL, UUID, host, token, username or config JSON may cross
 * the clipboard. Only safe internal codes and the Android API level.
 */
object VpnDiagnosticReport {
    private val safeCode = Regex("^[a-z][a-z0-9_]{0,63}$")
    private val phases = setOf("off", "starting", "tun_ready", "online", "failed")

    private fun code(raw: String?): String =
        raw?.takeIf { safeCode.matches(it) } ?: "unknown"

    fun create(
        phase: String?,
        lastStage: String?,
        probeReason: String?,
        androidApiLevel: Int,
        serviceRunning: Boolean
    ): String {
        val safePhase = phase?.takeIf { it in phases } ?: "unknown"
        val safeApi = androidApiLevel.takeIf { it in 26..99 }?.toString() ?: "unknown"
        return listOf(
            "Vainah VPN Android diagnostic v1",
            "android_api=$safeApi",
            "phase=$safePhase",
            "service_running=${if (serviceRunning) "yes" else "no"}",
            "last_stage=${code(lastStage)}",
            "https_probe=${code(probeReason)}",
            "vpn_egress=not_verified_on_device"
        ).joinToString("\n")
    }
}
