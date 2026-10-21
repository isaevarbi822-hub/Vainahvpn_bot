package app.vainah.vpn

import java.net.HttpURLConnection
import java.net.URL
import java.util.Base64

/**
 * Read-only H1Cloud subscription discovery. No secrets or raw URLs in
 * return values, exceptions, notifications or logs.
 * NO VPN tunnel or packet routing is started here.
 */
object H1SubscriptionDiscovery {
    enum class Transport { TCP, GRPC, XHTTP }
    data class Summary(val profiles: Int, val realityProfiles: Int, val transports: Set<Transport>)

    private const val MAX_BYTES = 256 * 1024

    fun inspect(subscriptionUrl: String): Result<Summary> = runCatching {
        val safe = SubscriptionLink.validate(subscriptionUrl)
            ?: throw IllegalArgumentException("INVALID_SUBSCRIPTION")
        val connection = (URL(safe).openConnection() as HttpURLConnection)
        try {
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.setRequestProperty("Accept", "text/plain")
            if (connection.responseCode != HttpURLConnection.HTTP_OK)
                throw IllegalStateException("SUBSCRIPTION_UNAVAILABLE")
            val declaredLength = connection.contentLengthLong
            if (declaredLength > MAX_BYTES) throw IllegalStateException("SUBSCRIPTION_TOO_LARGE")
            val payload = connection.inputStream.use { source ->
                val output = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = source.read(buffer)
                    if (count < 0) break
                    if (count == 0) continue
                    if (output.size() + count > MAX_BYTES) {
                        throw IllegalStateException("SUBSCRIPTION_TOO_LARGE")
                    }
                    output.write(buffer, 0, count)
                }
                output.toString(Charsets.UTF_8.name())
            }
            parse(payload)
        } finally {
            connection.disconnect()
        }
    }.recoverCatching {
        // Never reveal user-specific hosts, paths, subscription URLs or exceptions.
        throw IllegalStateException("SUBSCRIPTION_DISCOVERY_FAILED")
    }

    fun parse(payload: String): Summary {
        if (payload.length > MAX_BYTES) throw IllegalArgumentException("SUBSCRIPTION_TOO_LARGE")
        val normalized = payload.trim()
        val body = if (normalized.startsWith("{") || normalized.startsWith("[")) {
            // Discovery reports only reviewed Reality profiles for JSON.
            H1SingBoxJson.candidates(normalized).joinToString("\n")
        } else if (normalized.startsWith("vless://") || normalized.contains("\n")) normalized else {
            try { String(Base64.getMimeDecoder().decode(normalized), Charsets.UTF_8) }
            catch (_: IllegalArgumentException) { throw IllegalArgumentException("INVALID_SUBSCRIPTION_FORMAT") }
        }
        val links = body.lines().map { it.trim() }.filter { it.isNotEmpty() }
        if (links.size > 256) throw IllegalArgumentException("TOO_MANY_PROFILES")
        val transports = mutableSetOf<Transport>()
        var reality = 0
        for (line in links) {
            if (!line.startsWith("vless://")) continue
            // java.net.URI allows decoding the URI without logging secrets.
            val uri = try { java.net.URI(line) } catch (_: Exception) { continue }
            val params = uri.rawQuery.orEmpty().split('&').mapNotNull {
                val parts = it.split('=', limit = 2)
                if (parts.size != 2) null else parts[0] to parts[1]
            }.toMap()
            if (params["security"] != "reality") continue
            reality++
            when (params["type"]) {
                "tcp" -> transports.add(Transport.TCP)
                "grpc" -> transports.add(Transport.GRPC)
                "xhttp" -> transports.add(Transport.XHTTP)
            }
        }
        return Summary(links.size, reality, transports.toSet())
    }
}
