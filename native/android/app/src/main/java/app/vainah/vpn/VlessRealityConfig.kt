package app.vainah.vpn

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLDecoder
import java.util.UUID

/**
 * Build a sing-box VLESS TCP REALITY outbound from a selected node.
 * Contains credentials: never log or display the returned JSON.
 * Not itself a VPN engine; libbox still needs to own the Android VPN TUN.
 */
object VlessRealityConfig {
    fun outbound(raw: String, resolvedAddress: String? = null): JSONObject {
        require(raw.length <= 8192) { "Invalid node" }
        val uri = URI(raw)
        require(uri.scheme == "vless" && uri.host != null && uri.port in 1..65535)
        val uuid = uri.rawUserInfo ?: throw IllegalArgumentException("Missing UUID")
        UUID.fromString(uuid)
        val params = uri.rawQuery.orEmpty().split('&').mapNotNull { entry ->
            val pos = entry.indexOf('=')
            if (pos < 0) null else {
                val key = URLDecoder.decode(entry.substring(0, pos), "UTF-8")
                val value = URLDecoder.decode(entry.substring(pos + 1), "UTF-8")
                key to value
            }
        }.toMap()
        require(params["security"] == "reality") { "REALITY required" }
        require(params["type"] in listOf(null, "tcp", "raw")) { "TCP required" }
        val sni = params["sni"]?.takeIf { it.isNotBlank() }
            ?: throw IllegalArgumentException("Missing SNI")
        val publicKey = params["pbk"]?.takeIf { it.isNotBlank() }
            ?: throw IllegalArgumentException("Missing REALITY key")
        return JSONObject().apply {
            put("type", "vless")
            put("tag", "vainah-selected")
            put("server", resolvedAddress ?: uri.host)
            put("server_port", uri.port)
            put("uuid", uuid)
            // Bootstrap domain resolution must not recurse into the VLESS tunnel.
            put("domain_resolver", "dns-bootstrap")
            params["flow"]?.takeIf { it.isNotBlank() }?.let { put("flow", it) }
            put("tls", JSONObject().apply {
                put("enabled", true)
                put("server_name", sni)
                put("utls", JSONObject().put("enabled", true)
                    .put("fingerprint", params["fp"]?.takeIf { it.isNotBlank() } ?: "chrome"))
                put("reality", JSONObject().apply {
                    put("enabled", true)
                    put("public_key", publicKey)
                    put("short_id", params["sid"].orEmpty())
                })
            })
        }
    }

    fun profile(node: String, resolvedAddress: String? = null): String = JSONObject().apply {
        put("log", JSONObject().put("level", "warn"))
        // Android TUN DNS is hijacked to this resolver. Queries to
        // 1.1.1.1 travel over HTTPS inside the VLESS outbound.
        put("dns", JSONObject().apply {
            put("servers", JSONArray()
                .put(JSONObject()
                    .put("type", "local")
                    .put("tag", "dns-bootstrap"))
                .put(JSONObject()
                    .put("type", "https")
                    .put("tag", "dns-via-vless")
                    .put("server", "1.1.1.1")
                    .put("server_port", 443)
                    .put("path", "/dns-query")
                    .put("detour", "vainah-selected")))
            put("final", "dns-via-vless")
            put("strategy", "prefer_ipv4")
        })
        put("inbounds", JSONArray().put(JSONObject().apply {
            put("type", "tun")
            put("tag", "vainah-tun")
            put("address", JSONArray().put("172.19.0.1/30").put("fd00:19::1/126"))
            put("auto_route", true)
            put("dns_mode", "hijack")
        }))
        put("outbounds", JSONArray().put(outbound(node, resolvedAddress))
            .put(JSONObject().put("type", "direct").put("tag", "direct")))
        put("route", JSONObject().put("final", "vainah-selected")
            .put("auto_detect_interface", true)
            .put("rules", JSONArray().put(JSONObject()
                .put("protocol", "dns").put("action", "hijack-dns"))))
    }.toString()
}
