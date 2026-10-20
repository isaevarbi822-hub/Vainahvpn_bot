package app.vainah.vpn

import org.junit.Assert.*
import org.junit.Test
import java.util.Base64

class H1SubscriptionDiscoveryTest {
    private val tcp = "vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=tcp#demo"
    private val grpc = "vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=grpc#demo"
    private val xhttp = "vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=xhttp#demo"

    @Test fun detectsAllThreeRealityTransports() {
        val summary = H1SubscriptionDiscovery.parse(listOf(tcp, grpc, xhttp).joinToString("\n"))
        assertEquals(3, summary.profiles)
        assertEquals(3, summary.realityProfiles)
        assertEquals(H1SubscriptionDiscovery.Transport.entries.toSet(), summary.transports)
    }

    @Test fun acceptsBase64SubscriptionFormat() {
        val encoded = Base64.getEncoder().encodeToString(tcp.toByteArray())
        val summary = H1SubscriptionDiscovery.parse(encoded)
        assertEquals(setOf(H1SubscriptionDiscovery.Transport.TCP), summary.transports)
    }

    @Test fun unknownTransportCannotBecomeTcpByGuessing() {
        val summary = H1SubscriptionDiscovery.parse(tcp.replace("type=tcp", "type=unknown"))
        assertTrue(summary.transports.isEmpty())
    }

    @Test fun credentialsNeverAppearInSummary() {
        val summary = H1SubscriptionDiscovery.parse(tcp)
        assertFalse(summary.toString().contains("123e4567"))
        assertFalse(summary.toString().contains("vpn.invalid"))
    }
}
