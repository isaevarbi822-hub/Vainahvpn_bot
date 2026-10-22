package app.vainah.vpn

import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.PlatformInterface

/**
 * Experimental compile-time adapter to the real libbox Java API.
 * Does not start a tunnel until a reviewed Android PlatformInterface
 * implements openTun, network protection, routing and DNS correctly.
 * Included only with -PvainahEnableLibbox=true.
 */
internal object LibboxNativeApi {
    fun validateConfiguration(config: String) {
        Libbox.checkConfig(config)
    }

    fun createCommandServer(
        handler: CommandServerHandler,
        platform: PlatformInterface
    ): CommandServer = CommandServer(handler, platform)

    fun start(server: CommandServer, config: String) {
        validateConfiguration(config)
        server.start()
        server.startOrReloadService(config, OverrideOptions())
    }

    fun close(server: CommandServer) {
        try { server.closeService() } finally { server.close() }
    }
}
