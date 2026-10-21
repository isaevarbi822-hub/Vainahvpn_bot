package app.vainah.vpn

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

/**
 * Sing-box JSON subscriptions exported by H1Cloud.
 * Select only reviewed client-side VLESS + Reality fields. NEVER execute,
 * import or trust user-provided routes, DNS, TUN or remote management config.
 *
 * Converts candidates back to share links; MobileRealityConfig.fromVlessLink
 * remains the single strict transport / security validator.
 * Never log raw JSON, hosts, passwords, UUIDs, SNI or private links.
 */
internal object H1SingBoxJson {
    private val outboundKeys = setOf("type", "tag", "server", "server_port", "uuid", "tls", "flow", "transport")
    private val tlsKeys = setOf("enabled", "server_name", "reality", "utls", "insecure", "disable_sni")
    private val realityKeys = setOf("enabled", "public_key", "short_id")
    private val utlsKeys = setOf("enabled", "fingerprint")
    private val transportKeys = setOf("type", "service_name")

    private fun fieldsOnly(obj: JSONObject, allowed: Set<String>): Boolean =
        obj.keys().asSequence().all { it in allowed }

    private fun value(obj: JSONObject, name: String): String? =
        obj.opt(name) as? String

    private fun encoding(value: String): String =
        URLEncoder.encode(value, "UTF-8").replace("+", "%20")

    fun candidates(content: String): List<String> {
        val raw = content.trim()
        val items = try {
            if (raw.startsWith("[")) JSONArray(raw)
            else JSONObject(raw).optJSONArray("outbounds")
        } catch (_: Exception) {
            throw IllegalArgumentException("SUBSCRIPTION_JSON_INVALID")
        } ?: throw IllegalArgumentException("SUBSCRIPTION_JSON_UNSUPPORTED")

        require(items.length() <= 256) { "SUBSCRIPTION_TOO_LARGE" }
        val result = mutableListOf<String>()
        for (index in 0 until items.length()) {
            val outbound = items.optJSONObject(index) ?: continue
            if (value(outbound, "type") != "vless") continue
            val candidate = candidate(outbound)
            if (candidate != null) result.add(candidate)
        }
        if (result.isEmpty()) throw IllegalArgumentException("SUBSCRIPTION_JSON_UNSUPPORTED")
        return result
    }

    private fun candidate(o: JSONObject): String? {
        if (!fieldsOnly(o, outboundKeys)) return null
        val host = value(o, "server") ?: return null
        val id = value(o, "uuid") ?: return null
        val number = o.opt("server_port") as? Number ?: return null
        val port = number.toInt()
        if (number.toLong() != port.toLong() || port !in 1..65535) return null

        val tls = o.optJSONObject("tls") ?: return null
        if (!fieldsOnly(tls, tlsKeys) || tls.opt("enabled") != true ||
            tls.opt("insecure") == true || tls.opt("disable_sni") == true) return null
        val sni = value(tls, "server_name") ?: return null
        val reality = tls.optJSONObject("reality") ?: return null
        if (!fieldsOnly(reality, realityKeys) || reality.opt("enabled") != true) return null
        val pbk = value(reality, "public_key") ?: return null
        val sid = if (reality.has("short_id")) value(reality, "short_id") ?: return null else ""
        val utls = tls.optJSONObject("utls")
        if (utls != null && (!fieldsOnly(utls, utlsKeys) || utls.opt("enabled") != true))
            return null
        val fp = if (utls != null) value(utls, "fingerprint") ?: return null else "chrome"
        val flow = if (o.has("flow")) value(o, "flow") ?: return null else ""
        val transport = o.optJSONObject("transport")
        val type: String
        val service: String
        if (transport == null) {
            if (o.has("transport")) return null
            type = "tcp"; service = ""
        } else {
            if (!fieldsOnly(transport, transportKeys)) return null
            type = value(transport, "type") ?: return null
            if (type !in setOf("tcp", "grpc")) return null
            service = if (type == "grpc") value(transport, "service_name") ?: return null else ""
            if (type == "tcp" && transport.has("service_name")) return null
        }
        // Only predictable URI fields. Strict validation is repeated by the
        // same fromVlessLink() code used for normal H1Cloud subscriptions.
        val query = mutableListOf(
            "security=reality", "type=" + encoding(type),
            "sni=" + encoding(sni), "pbk=" + encoding(pbk),
            "sid=" + encoding(sid), "fp=" + encoding(fp)
        )
        if (flow.isNotEmpty()) query.add("flow=" + encoding(flow))
        if (type == "grpc") query.add("serviceName=" + encoding(service))
        return "vless://" + id + "@" + host + ":" + port + "?" + query.joinToString("&")
    }
}
