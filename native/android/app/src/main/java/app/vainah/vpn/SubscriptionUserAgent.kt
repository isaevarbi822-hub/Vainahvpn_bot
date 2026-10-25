package app.vainah.vpn

import android.content.Context

/**
 * First-party HTTP User-Agent format approved by the user's subscription provider.
 * OFF by default. No client/device identity is ever copied from Happ.
 * VainahVPN identity only, never mimics another app or bypasses device checks.
 */
class SubscriptionUserAgent(context: Context) {
    private val prefs = context.getSharedPreferences(
        "vainah_subscription_client_headers", Context.MODE_PRIVATE
    )
    fun current(): String? =
        prefs.getString("approved_agent", null)?.takeIf(SubscriptionUserAgentValue::valid)

    fun save(value: String): Boolean {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) return prefs.edit().remove("approved_agent").commit()
        if (!SubscriptionUserAgentValue.valid(trimmed)) return false
        return prefs.edit().putString("approved_agent", trimmed).commit()
    }
}

object SubscriptionUserAgentValue {
    // First-party only: never impersonate Happ or another VPN client,
    // and never treat User-Agent as a substitute for device authorization.
    private val approvedFormat =
        Regex("^VainahVPN(?:-Android)?/[A-Za-z0-9._+-]{1,32}(?: \\(Android(?:; [A-Za-z0-9 ._-]{1,60})?\\))?$")
    fun valid(value: String?): Boolean =
        value != null && value.length <= 120 && approvedFormat.matches(value)
}
