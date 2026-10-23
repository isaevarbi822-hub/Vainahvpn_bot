package app.vainah.vpn

import org.junit.Assert.*
import org.junit.Test

class OwnedTunnelGateTest {
    @Test fun cancelledAttemptNeverStartsEngine() {
        val gate = OwnedTunnelGate()
        val first = Any()
        var starts = 0
        val result = gate.connect(first, { false }) {
            starts++
            Result.success(Unit)
        }
        assertTrue(result.isFailure)
        assertEquals(0, starts)
    }

    @Test fun oldServiceCannotCloseNewServiceTunnel() {
        val gate = OwnedTunnelGate()
        val oldService = Any()
        val newService = Any()
        var stops = 0
        assertTrue(gate.connect(oldService, { true }) { Result.success(Unit) }.isSuccess)
        gate.disconnect(oldService) { stops++ }
        assertEquals(1, stops)
        assertTrue(gate.connect(newService, { true }) { Result.success(Unit) }.isSuccess)
        // Old destroyed service may complete its shutdown after new connect.
        gate.disconnect(oldService) { stops++ }
        assertEquals(1, stops)
        gate.disconnect(newService) { stops++ }
        assertEquals(2, stops)
    }

    @Test fun secondOwnerCannotStealLiveEngine() {
        val gate = OwnedTunnelGate()
        val first = Any()
        val second = Any()
        var starts = 0
        assertTrue(gate.connect(first, { true }) {
            starts++
            Result.success(Unit)
        }.isSuccess)
        assertTrue(gate.connect(second, { true }) {
            starts++
            Result.success(Unit)
        }.isFailure)
        assertEquals(1, starts)
    }

    @Test fun failedOpenDoesNotAcquireOwnership() {
        val gate = OwnedTunnelGate()
        val first = Any()
        val next = Any()
        var stops = 0
        assertTrue(gate.connect(first, { true }) {
            Result.failure(IllegalStateException("engine unavailable"))
        }.isFailure)
        gate.disconnect(first) { stops++ }
        assertEquals(0, stops)
        assertTrue(gate.connect(next, { true }) { Result.success(Unit) }.isSuccess)
        gate.disconnect(next) { stops++ }
        assertEquals(1, stops)
    }

    @Test fun disconnectAlwaysReleasesOwnershipEvenWhenEngineCloseThrows() {
        val gate = OwnedTunnelGate()
        val first = Any()
        val next = Any()
        assertTrue(gate.connect(first, { true }) { Result.success(Unit) }.isSuccess)
        assertThrows(IllegalStateException::class.java) {
            gate.disconnect(first) { throw IllegalStateException("close failed") }
        }
        assertTrue(gate.connect(next, { true }) { Result.success(Unit) }.isSuccess)
    }

    @Test fun differentThreadsShareSingleEngineOwner() {
        val gate = OwnedTunnelGate()
        val a = Any()
        val b = Any()
        val firstEntering = java.util.concurrent.CountDownLatch(1)
        val releaseFirst = java.util.concurrent.CountDownLatch(1)
        val results = java.util.concurrent.atomic.AtomicInteger(0)
        val firstThread = Thread {
            if (gate.connect(a, { true }) {
                firstEntering.countDown()
                check(releaseFirst.await(4, java.util.concurrent.TimeUnit.SECONDS))
                Result.success(Unit)
            }.isSuccess) results.incrementAndGet()
        }
        val secondThread = Thread {
            if (gate.connect(b, { true }) { Result.success(Unit) }.isSuccess) {
                results.incrementAndGet()
            }
        }
        firstThread.start()
        assertTrue(firstEntering.await(4, java.util.concurrent.TimeUnit.SECONDS))
        secondThread.start()
        releaseFirst.countDown()
        firstThread.join(4000)
        secondThread.join(4000)
        assertFalse(firstThread.isAlive)
        assertFalse(secondThread.isAlive)
        assertEquals(1, results.get())
    }
}
