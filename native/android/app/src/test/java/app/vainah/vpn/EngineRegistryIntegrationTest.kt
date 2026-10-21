package app.vainah.vpn

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class EngineRegistryIntegrationTest {
    @Test fun onlyNativeAarBuildCanLoadTheRealEngine() {
        val linked = runCatching {
            Class.forName("app.vainah.vpn.LibboxTunnelEngine")
        }.isSuccess
        assertEquals(linked, EngineRegistry.active.ready)
        if (!linked) {
            assertFalse(EngineRegistry.active.ready)
        }
        // This checks installation of the adapter, never live VPN traffic.
    }
}
