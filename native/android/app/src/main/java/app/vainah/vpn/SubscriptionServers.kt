package app.vainah.vpn

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLDecoder
import java.net.URI
import java.util.Locale

/** Fetches subscription over HTTPS. Never logs bearer URLs or node credentials. */
data class VainahNode(val label: String, val uri: String)

object SubscriptionServers {
    /** Only readable labels, never expose UUID, hostname, private key or query tokens. */
    fun displayName(raw: String, index: Int): String {
        val fragment = raw.substringAfter('#', "").take(160)
        val decoded = runCatching { URLDecoder.decode(fragment.replace("+", "%2B"), "UTF-8") }
            .getOrDefault(fragment).trim()
        val clean = decoded.replace(Regex("[\\p{Cntrl}]"), "").take(60)
        if (clean.isBlank()) return "Локация $index"
        val lower = clean.lowercase(Locale.ROOT)
        val country = when {
            Regex("(^|[^a-z])(germany|deutschland|de)([^a-z]|$)").containsMatchIn(lower) ||
                "герман" in lower || "🇩🇪" in clean -> "🇩🇪 Германия"
            Regex("(^|[^a-z])(spain|espana|españa|es)([^a-z]|$)").containsMatchIn(lower) ||
                "испан" in lower || "🇪🇸" in clean -> "🇪🇸 Испания"
            Regex("(^|[^a-z])(poland|polska|pl)([^a-z]|$)").containsMatchIn(lower) ||
                "польш" in lower || "🇵🇱" in clean -> "🇵🇱 Польша"
            else -> null
        }
        return country ?: clean
    }

    fun load(raw: String): List<String> = loadNodes(raw).map { it.label }

    // Identify our own app honestly; do not impersonate third-party VPN clients
    // or weaken HTTPS to get around a legitimate H1Cloud denial.
    internal fun configureConnection(connection: HttpURLConnection) {
        connection.connectTimeout = 8000
        connection.readTimeout = 12000
        connection.instanceFollowRedirects = false
        connection.useCaches = false
        connection.setRequestProperty(
            "User-Agent", "VainahVPN-Android/" + BuildConfig.VERSION_NAME
        )
        connection.setRequestProperty(
            "Accept",
            "text/plain, application/json, application/octet-stream;q=0.9, */*;q=0.5"
        )
        connection.setRequestProperty("Cache-Control", "no-cache")
    }

    private fun sameOrigin(current: String, next: String): Boolean {
        val before = URI(current)
        val after = URI(next)
        val oldPort = if (before.port == -1) 443 else before.port
        val newPort = if (after.port == -1) 443 else after.port
        return after.scheme.equals("https", ignoreCase = true) &&
            before.host.equals(after.host, ignoreCase = true) &&
            oldPort == newPort && after.rawUserInfo == null &&
            after.rawFragment == null && SubscriptionLink.validate(next) != null
    }

    /** Follow at most 2 same-origin HTTPS redirects; never forward bearer links cross-host. */
    internal fun loadNodesWithConnection(
        raw: String,
        open: (String) -> HttpURLConnection
    ): List<VainahNode> {
        // Legitimately issued VLESS REALITY keys can be imported locally:
        // an HTTPS server declining the subscription request does not alter
        // the key's validity. No network request occurs for direct keys.
        val input = SubscriptionInput.validate(raw)
            ?: throw IllegalArgumentException("Неверная подписка или VLESS-ключ")
        if (SubscriptionInput.isDirectKey(input))
            return SubscriptionPayloadParser.nodes(input)
        var current = SubscriptionLink.validate(input)
            ?: throw IllegalArgumentException("Неверная HTTPS-подписка")
        for (hop in 0..2) {
            val connection = open(current)
            configureConnection(connection)
            try {
                val status = connection.responseCode
                if (status in listOf(301, 302, 303, 307, 308)) {
                    val redirect = connection.getHeaderField("Location")
                        ?: throw SubscriptionHttpStatus(status)
                    val next = runCatching { URI(current).resolve(redirect).toString() }
                        .getOrNull() ?: throw SubscriptionHttpStatus(status)
                    if (!sameOrigin(current, next) || hop >= 2) {
                        throw SubscriptionHttpStatus(status)
                    }
                    current = next
                    continue
                }
                if (status != 200) throw SubscriptionHttpStatus(status)
                val bytes = connection.inputStream.use { input ->
                    val output = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(4096)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        if (output.size() + n > 262144)
                            throw IllegalArgumentException("Подписка слишком большая")
                        output.write(buffer, 0, n)
                    }
                    output.toByteArray()
                }
                return SubscriptionPayloadParser.nodes(bytes.toString(Charsets.UTF_8))
            } finally {
                connection.disconnect()
            }
        }
        throw SubscriptionHttpStatus(302)
    }

    fun loadNodes(raw: String): List<VainahNode> = loadNodesWithConnection(raw) {
        URL(it).openConnection() as HttpURLConnection
    }
}
