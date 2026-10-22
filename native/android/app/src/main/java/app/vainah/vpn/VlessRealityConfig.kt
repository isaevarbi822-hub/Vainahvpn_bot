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
    fun outbound(raw: String): JSONObject {
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
            put("server", uri.host)
            put("server_port", uri.port)
            put("uuid", uuid)
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

    fun profile(node: String): String = JSONObject().apply {
        put("log", JSONObject().put("level", "warn"))
        put("inbounds", JSONArray().put(JSONObject().apply {
            put("type", "tun")
            put("tag", "vainah-tun")
            put("address", JSONArray().put("172.19.0.1/30").put("fd00:19::1/126"))
            put("auto_route", true)
        }))
        put("outbounds", JSONArray().put(outbound(node))
            .put(JSONObject().put("type", "direct").put("tag", "direct")))
        put("route", JSONObject().put("final", "vainah-selected")
            .put("auto_detect_interface", true))
    }.toString()
}
