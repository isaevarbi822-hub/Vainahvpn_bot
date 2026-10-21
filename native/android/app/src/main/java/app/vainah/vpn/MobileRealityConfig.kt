package app.vainah.vpn

import java.net.URI
import java.net.URLDecoder
import java.util.Base64

/**
 * In-memory sing-box TCP/gRPC + Reality config built from an H1Cloud subscription.
 * The returned JSON contains PRIVATE CREDENTIALS. Never log it, save it to
 * preferences, send it to an activity, or include it in exception messages.
 * This converter does NOT activate Android VpnService.
 */
internal object MobileRealityConfig {
    private const val MAX_BYTES = 256 * 1024
    private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
    private val publicKey = Regex("^[a-zA-Z0-9_-]{43}$")
    private val shortId = Regex("^(?:[0-9a-f]{2}){0,8}$", RegexOption.IGNORE_CASE)
    private val hostname = Regex("^[a-zA-Z0-9.-]{1,253}$")
    private val grpcService = Regex("^[a-zA-Z0-9._/-]{1,128}$")
    private val permitted = setOf("security", "type", "sni", "pbk", "sid", "fp", "flow", "encryption", "headerType", "serviceName", "spx")
    private val fingerprints = setOf("chrome", "firefox", "safari", "ios", "android", "edge")

    private fun quote(input: String): String = buildString {
        append('"')
        input.forEach { ch ->
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (ch.code < 32) {
                    append("\\u" + ch.code.toString(16).padStart(4, '0'))
                } else append(ch)
            }
        }
        append('"')
    }

    private fun plain(input: String): String {
        require(input.toByteArray(Charsets.UTF_8).size <= MAX_BYTES) { "SUBSCRIPTION_TOO_LARGE" }
        val raw = input.trim()
        if (raw.contains("vless://")) return raw
        require(raw.matches(Regex("^[A-Za-z0-9+/=\\r\\n]+$"))) { "SUBSCRIPTION_INVALID" }
        val bytes = try { Base64.getMimeDecoder().decode(raw) }
                    catch (_: IllegalArgumentException) { throw IllegalArgumentException("SUBSCRIPTION_INVALID") }
        require(bytes.size <= MAX_BYTES) { "SUBSCRIPTION_TOO_LARGE" }
        return bytes.toString(Charsets.UTF_8)
    }

    fun fromSubscription(content: String): String {
        val lines = plain(content).lines().map { it.trim() }.filter { it.isNotEmpty() }
        require(lines.size <= 256) { "SUBSCRIPTION_TOO_LARGE" }
        // Always prefer TCP when present. gRPC is a separate supported
        // transport, never a disguised downgrade of XHTTP or Reality flow.
        for (preferred in listOf("tcp", "grpc")) {
            for (line in lines) {
                if (!line.startsWith("vless://")) continue
                val type = try {
                    URI(line).rawQuery.orEmpty().split('&')
                        .firstOrNull { it.startsWith("type=") }?.substringAfter('=')
                } catch (_: Exception) { null }
                if (type != preferred) continue
                val config = try { fromVlessLink(line) }
                             catch (_: IllegalArgumentException) { null }
                if (config != null) return config
            }
        }
        throw IllegalArgumentException("REALITY_SUPPORTED_TRANSPORT_NOT_FOUND")
    }

    fun fromVlessLink(link: String): String {
        require(link.length in 40..8192 && !link.any { it.isISOControl() }) { "PROFILE_INVALID" }
        val uri = try { URI(link) } catch (_: Exception) { throw IllegalArgumentException("PROFILE_INVALID") }
        val host = uri.host ?: throw IllegalArgumentException("PROFILE_INVALID")
        val id = uri.rawUserInfo ?: throw IllegalArgumentException("PROFILE_INVALID")
        require(uri.scheme == "vless" && uri.port in 1..65535 && host.matches(hostname) &&
            id.matches(uuid)) { "PROFILE_INVALID" }
        val query = mutableMapOf<String, String>()
        for (part in (uri.rawQuery ?: "").split('&')) {
            val eq = part.indexOf('=')
            require(eq > 0) { "PROFILE_INVALID" }
            val name = part.substring(0, eq)
            require(name in permitted && !query.containsKey(name)) { "PROFILE_UNSUPPORTED" }
            val value = try { URLDecoder.decode(part.substring(eq + 1), "UTF-8") }
                        catch (_: Exception) { throw IllegalArgumentException("PROFILE_INVALID") }
            query[name] = value
        }
        val transport = query["type"] ?: ""
        require(query["security"] == "reality" && transport in setOf("tcp", "grpc")) {
            "TRANSPORT_NOT_TESTED"
        }
        val pbk = query["pbk"] ?: ""
        val sni = query["sni"] ?: ""
        val sid = query["sid"] ?: ""
        val fp = query["fp"] ?: "chrome"
        val flow = query["flow"] ?: ""
        // Standard H1Cloud/Xray share URIs can specify spiderX='/'.
        // Accept only the inert default path (no unreviewed camouflage).
        require((query["spx"] ?: "/") == "/") { "PROFILE_UNSUPPORTED" }
        val serviceName = query["serviceName"] ?: ""
        require(pbk.matches(publicKey) && sni.matches(hostname) && sni.contains('.') &&
            sid.matches(shortId) && fp in fingerprints &&
            (if (transport == "tcp") flow in setOf("", "xtls-rprx-vision")
             else flow.isEmpty()) &&
            (if (transport == "grpc") serviceName.matches(grpcService)
             else !query.containsKey("serviceName")) &&
            (query["encryption"] ?: "none") == "none" &&
            (query["headerType"] ?: "none") == "none") { "PROFILE_UNSUPPORTED" }

        val flowField = if (flow.isNotEmpty()) ",\"flow\":" + quote(flow) else ""
        val grpcField = if (transport == "grpc") {
            ",\"transport\":{\"type\":\"grpc\",\"service_name\":" + quote(serviceName) + "}"
        } else ""
        return """{"log":{"level":"error"},"dns":{"servers":[{"type":"local","tag":"bootstrap"},{"type":"https","tag":"private-dns","server":"1.1.1.1","server_port":443,"path":"/dns-query","detour":"vainah-primary"}],"rules":[{"domain":[@HOST@],"action":"route","server":"bootstrap"}],"final":"private-dns"},"inbounds":[{"type":"tun","tag":"vainah-tun","address":["172.29.86.1/30","fd00:86:29::1/126"],"mtu":1400,"auto_route":true,"dns_mode":"hijack"}],"outbounds":[{"type":"vless","tag":"vainah-primary","server":@HOST@,"server_port":@PORT@,"uuid":@UUID@@FLOW@@GRPC@,"tls":{"enabled":true,"server_name":@SNI@,"utls":{"enabled":true,"fingerprint":@FP@},"reality":{"enabled":true,"public_key":@PBK@,"short_id":@SID@}}}],"route":{"auto_detect_interface":true,"default_domain_resolver":"bootstrap","rules":[{"protocol":"dns","action":"hijack-dns"}],"final":"vainah-primary"}}"""
            .replace("@HOST@", quote(host))
            .replace("@PORT@", uri.port.toString())
            .replace("@UUID@", quote(id))
            .replace("@FLOW@", flowField)
            .replace("@GRPC@", grpcField)
            .replace("@SNI@", quote(sni))
            .replace("@FP@", quote(fp))
            .replace("@PBK@", quote(pbk))
            .replace("@SID@", quote(sid))
    }
}
