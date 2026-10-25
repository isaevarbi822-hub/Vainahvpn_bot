package app.vainah.vpn

import android.content.Context

/**
 * HTTP User-Agent configured by a user for their own subscription provider.
 * OFF by default. No client/device identity is ever copied from Happ.
 * Provider-approved values only; do not use to bypass device limits or login.
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
    // Do not allow URLs, bearer tokens, control characters, or header injection.
    fun valid(value: String?): Boolean {
        if (value == null || value.length !in 3..160 ||
            value.first() == ' ' || value.last() == ' ') return false
        if (value.any { it.code !in 32..126 } ||
            "://" in value || "@" in value ||
            value.contains("token=", ignoreCase = true) ||
            value.contains("bearer ", ignoreCase = true)) return false
        return true
    }
}
