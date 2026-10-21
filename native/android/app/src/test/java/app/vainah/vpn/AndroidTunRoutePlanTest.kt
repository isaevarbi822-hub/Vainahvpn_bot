package app.vainah.vpn

import org.junit.Assert.*
import org.junit.Test

class AndroidTunRoutePlanTest {
    @Test fun routePlanRequiresBothFamiliesAndExplicitDns() {
        assertTrue(AndroidTunRoutePlan.validForFullTunnel())
        assertEquals("172.29.86.1", AndroidTunRoutePlan.IPV4_ADDRESS)
        assertEquals(30, AndroidTunRoutePlan.IPV4_PREFIX)
        assertEquals("fd00:86:29::1", AndroidTunRoutePlan.IPV6_ADDRESS)
        assertEquals(126, AndroidTunRoutePlan.IPV6_PREFIX)
        assertEquals("1.1.1.1", AndroidTunRoutePlan.DNS_SERVER)
    }

    @Test fun engineConfigAndOsPlanMatch() {
        val link = "vless://123e4567-e89b-42d3-a456-426614174000@vpn.example.org:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome"
        val json = MobileRealityConfig.fromVlessLink(link)
        assertTrue(json.contains(AndroidTunRoutePlan.IPV4_ADDRESS + "/" + AndroidTunRoutePlan.IPV4_PREFIX))
        assertTrue(json.contains(AndroidTunRoutePlan.IPV6_ADDRESS + "/" + AndroidTunRoutePlan.IPV6_PREFIX))
        assertTrue(json.contains(AndroidTunRoutePlan.DNS_SERVER))
    }
}
