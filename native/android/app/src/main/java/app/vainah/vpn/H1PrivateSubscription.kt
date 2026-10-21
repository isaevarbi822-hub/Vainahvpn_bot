package app.vainah.vpn

import java.net.HttpURLConnection
import java.net.URL

/**
 * Reads the authenticated H1Cloud bearer subscription only in the VPN worker,
 * not in the UI. No caching, redirects, raw error messages or logging.
 * Caller must never print, persist or expose the returned plaintext.
 */
internal object H1PrivateSubscription {
    private const val MAX_BYTES = 256 * 1024

    fun read(url: String): String {
        val safe = SubscriptionLink.validate(url)
            ?: throw IllegalArgumentException("SUBSCRIPTION_INVALID")
        val connection = try {
            (URL(safe).openConnection() as HttpURLConnection)
        } catch (_: Exception) {
            throw IllegalStateException("SUBSCRIPTION_FAILED")
        }
        try {
            connection.requestMethod = "GET"
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 8000
            connection.readTimeout = 8000
            connection.useCaches = false
            connection.setRequestProperty("Accept", "text/plain")
            if (connection.responseCode != HttpURLConnection.HTTP_OK ||
                connection.contentLengthLong > MAX_BYTES) {
                throw IllegalStateException("SUBSCRIPTION_FAILED")
            }
            val bytes = connection.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val buffer = ByteArray(8192)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    if (count == 0) continue
                    if (out.size() + count > MAX_BYTES) {
                        throw IllegalStateException("SUBSCRIPTION_FAILED")
                    }
                    out.write(buffer, 0, count)
                }
                out.toByteArray()
            }
            return bytes.toString(Charsets.UTF_8)
        } catch (_: Exception) {
            throw IllegalStateException("SUBSCRIPTION_FAILED")
        } finally {
            connection.disconnect()
        }
    }
}
