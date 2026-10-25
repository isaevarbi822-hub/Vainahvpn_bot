package app.vainah.vpn

import java.net.HttpURLConnection
import java.net.URL
import org.junit.Assert.*
import org.junit.Test

class SubscriptionUserAgentHeadersTest {
    private class Fake(url: String = "https://provider.example/sub") : HttpURLConnection(URL(url)) {
        override fun disconnect() {}
        override fun connect() {}
        override fun usingProxy() = false
    }

    @Test fun defaultClientIdentityRemainsVainahVpn() {
        val request = Fake()
        SubscriptionServers.configureConnection(request)
        assertEquals("VainahVPN-Android/" + BuildConfig.VERSION_NAME,
            request.getRequestProperty("User-Agent"))
        assertNull(request.getRequestProperty("X-HWID"))
    }

    @Test fun explicitlyApprovedSafeUserAgentIsPassedUnmodified() {
        val request = Fake()
        val approved = "VainahVPN/0.5.14 (Android; provider-approved)"
        SubscriptionServers.configureConnection(request, approvedUserAgent = approved)
        assertEquals(approved, request.getRequestProperty("User-Agent"))
        assertNull(request.getRequestProperty("X-HWID"))
    }

    @Test fun controlCharactersBearerUrlsAndHeaderInjectionAreRejected() {
        val unsafe = listOf(
            "Happ/4.8.0\r\nAuthorization: secret",
            "Authorization: Bearer private",
            "VPN https://subscription.example/token=secret",
            "Bad@UserAgent",
            "x".repeat(200), "", " ")
        for (value in unsafe) {
            assertFalse("unsafe UA accepted: " + value.take(12),
                SubscriptionUserAgentValue.valid(value))
            val request = Fake()
            SubscriptionServers.configureConnection(request, approvedUserAgent = value)
            assertTrue(request.getRequestProperty("User-Agent").startsWith("VainahVPN-Android/"))
        }
    }

    @Test fun identityHeadersAreIndependentOfApprovedUserAgent() {
        val request = Fake()
        val hwid = "b23d22bc-6188-4ffd-8dce-f7c5ee9ca10a"
        SubscriptionServers.configureConnection(
            request,
            SubscriptionHwidHeaders.build(hwid, "16", "SM-S938B"),
            "VainahVPN/0.5.14"
        )
        assertEquals(hwid, request.getRequestProperty("X-HWID"))
        assertEquals("VainahVPN/0.5.14", request.getRequestProperty("User-Agent"))
    }
}
