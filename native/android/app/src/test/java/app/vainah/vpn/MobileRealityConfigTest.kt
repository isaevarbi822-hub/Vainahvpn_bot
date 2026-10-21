package app.vainah.vpn

import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

class MobileRealityConfigTest {
    private val tcp = "vless://123e4567-e89b-42d3-a456-426614174000@vpn.example.org:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome&encryption=none"

    @Test fun buildsFullTunnelRealityConfig() {
        val output = MobileRealityConfig.fromVlessLink(tcp)
        assertTrue(output.contains("\"type\":\"tun\""))
        assertTrue(output.contains("\"auto_route\":true"))
        assertTrue(output.contains("\"dns_mode\":\"hijack\""))
        assertTrue(output.contains("\"type\":\"vless\""))
        assertTrue(output.contains("\"enabled\":true,\"public_key\""))
        assertTrue(output.contains("\"final\":\"vainah-primary\""))
        assertTrue(output.contains("\"detour\":\"vainah-primary\""))
    }

    @Test fun readsBase64SubscriptionAndSelectsTcp() {
        val grpc = tcp.replace("type=tcp", "type=grpc") + "&serviceName=vainah-test"
        val payload = Base64.getEncoder().encodeToString((grpc + "\n" + tcp).toByteArray())
        val output = MobileRealityConfig.fromSubscription(payload)
        assertTrue(output.contains("\"type\":\"vless\""))
        assertTrue(output.contains("\"server_port\":443"))
        assertFalse(output.contains("\"service_name\":\"vainah-test\""))
    }

    @Test fun selectsRealGrpcWhenTcpIsMissing() {
        val grpc = tcp.replace("type=tcp", "type=grpc") + "&serviceName=vainah-test"
        val xhttp = tcp.replace("type=tcp", "type=xhttp")
        val output = MobileRealityConfig.fromSubscription(xhttp + "\n" + grpc)
        assertTrue(output.contains("\"type\":\"grpc\""))
        assertTrue(output.contains("\"service_name\":\"vainah-test\""))
        assertTrue(output.contains("\"auto_route\":true"))
        assertTrue(output.contains("\"dns_mode\":\"hijack\""))
        assertTrue(output.contains("\"final\":\"vainah-primary\""))
    }

    @Test fun invalidGrpcAndXhttpFailClosed() {
        val grpc = tcp.replace("type=tcp", "type=grpc") + "&serviceName=vainah-test"
        for (bad in listOf(
            grpc + "&serviceName=other",
            grpc + "&flow=xtls-rprx-vision",
            grpc.replace("serviceName=vainah-test", "serviceName="),
            grpc + "&allowInsecure=true",
            tcp.replace("type=tcp", "type=xhttp")
        )) {
            try {
                MobileRealityConfig.fromVlessLink(bad)
                fail("Unreviewed Reality transport accepted")
            } catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun rejectsUnreviewedRealityTransportsAndSecurityOverrides() {
        for (untrusted in listOf(
            tcp.replace("type=tcp", "type=grpc"),
            tcp.replace("type=tcp", "type=xhttp"),
            tcp.replace("security=reality", "security=tls"),
            tcp + "&allowInsecure=1",
            tcp.replace("encryption=none", "encryption=aes"),
            tcp.replace("security=reality", "security=reality&security=reality")
        )) {
            try {
                MobileRealityConfig.fromVlessLink(untrusted)
                fail("Unsupported profile accepted")
            } catch (_: IllegalArgumentException) { }
        }
    }

    @Test fun acceptsDefaultSpiderXPathButRejectsCustomPath() {
        val safe = MobileRealityConfig.fromVlessLink(tcp + "&spx=%2F")
        assertTrue(safe.contains("\"type\":\"vless\""))
        try {
            MobileRealityConfig.fromVlessLink(tcp + "&spx=%2Fcustom")
            fail("Unsafe unreviewed Reality path accepted")
        } catch (_: IllegalArgumentException) { }
    }

    @Test fun singBoxJsonPrefersTcpRealityOverGrpc() {
        val grpc = tcp.replace("type=tcp", "type=grpc") + "&serviceName=vainah-test"
        val g = org.json.JSONObject(MobileRealityConfig.fromVlessLink(grpc))
            .getJSONArray("outbounds").getJSONObject(0)
        val normal = org.json.JSONObject(MobileRealityConfig.fromVlessLink(tcp))
            .getJSONArray("outbounds").getJSONObject(0)
        val json = org.json.JSONObject().put("outbounds",
            org.json.JSONArray().put(g).put(normal)).toString()
        val cfg = MobileRealityConfig.fromSubscription(json)
        assertTrue(cfg.contains("\"type\":\"vless\""))
        assertFalse(cfg.contains("\"service_name\":\"vainah-test\""))
        assertTrue(cfg.contains("\"dns_mode\":\"hijack\""))
        assertTrue(cfg.contains("\"auto_route\":true"))
    }

    @Test fun singBoxJsonGrpcFallbackAndFailClosedTlsRules() {
        val grpc = tcp.replace("type=tcp", "type=grpc") + "&serviceName=vainah-test"
        val g = org.json.JSONObject(MobileRealityConfig.fromVlessLink(grpc))
            .getJSONArray("outbounds").getJSONObject(0)
        val pureGrpc = org.json.JSONObject().put("outbounds",
            org.json.JSONArray().put(g)).toString()
        val output = MobileRealityConfig.fromSubscription(pureGrpc)
        assertTrue(output.contains("\"service_name\":\"vainah-test\""))
        val bad = org.json.JSONObject(g.toString())
        bad.getJSONObject("tls").put("insecure", true)
        val cases = listOf(
            org.json.JSONObject().put("outbounds",org.json.JSONArray().put(bad)).toString(),
            org.json.JSONObject().put("outbounds",org.json.JSONArray()
                .put(org.json.JSONObject(g.toString()).put("packet_encoding","xudp"))).toString(),
            org.json.JSONObject().put("outbounds",org.json.JSONArray()
                .put(org.json.JSONObject(g.toString()).put("transport",
                    org.json.JSONObject().put("type","xhttp")))).toString(),
            "{\"proxies\":[]}",
            "{invalid"
        )
        for (candidate in cases) {
            try {
                MobileRealityConfig.fromSubscription(candidate)
                fail("Unsafe JSON subscription was accepted")
            } catch (failure: IllegalArgumentException) {
                assertFalse(failure.message.orEmpty().contains("vpn.example.org"))
                assertFalse(failure.message.orEmpty().contains("123e4567"))
            }
        }
    }

    @Test fun errorMessagesCannotExposeCredentials() {
        try {
            MobileRealityConfig.fromSubscription("not a subscription")
            fail("Invalid subscription accepted")
        } catch (failure: IllegalArgumentException) {
            assertFalse(failure.message.orEmpty().contains("vpn.example.org"))
            assertFalse(failure.message.orEmpty().contains("123e4567"))
        }
    }
}
