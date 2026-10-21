import Foundation
import Network
import NetworkExtension

#if canImport(Libbox)
import Libbox

/// The real libbox PlatformInterface for iOS NetworkExtension. Unsupported
/// shell/bridge operations FAIL rather than accidentally acquiring privileges.
/// Does not print VPN configuration, UUIDs or server names.
final class VainahLibboxPlatform: NSObject, LibboxPlatformInterfaceProtocol,
                                   LibboxCommandServerHandlerProtocol {
    private weak var provider: PacketTunnelProvider?
    private var pathMonitor: NWPathMonitor?
    private var settings: NEPacketTunnelNetworkSettings?

    init(_ provider: PacketTunnelProvider) {
        self.provider = provider
    }

    private func unavailable(_ code: Int = 1) -> NSError {
        NSError(domain: "app.vainah.vpn.NativeEngine", code: code)
    }

    func openTun(
        _ options: LibboxTunOptionsProtocol?,
        ret0_: UnsafeMutablePointer<Int32>?
    ) throws {
        guard let provider, let options, let ret0_ else {
            throw unavailable(11)
        }
        // Only accept full IPv4/IPv6 routes with an explicit TUN DNS mode.
        guard options.getAutoRoute(), options.getMTU() >= 1280 else {
            throw unavailable(12)
        }
        let proposed = MobileTunnelRoutePlan.proposedSettings()
        let semaphore = DispatchSemaphore(value: 0)
        var completedError: Error?
        provider.setTunnelNetworkSettings(proposed) { error in
            completedError = error
            semaphore.signal()
        }
        guard semaphore.wait(timeout: .now() + 20) == .success,
              completedError == nil else {
            provider.setTunnelNetworkSettings(nil) { _ in }
            throw unavailable(13)
        }
        settings = proposed
        // Obtain the actual OS-created packet descriptor. No fake fd and
        // no success if NetworkExtension refuses to provide it.
        if let fd = provider.packetFlow.value(forKeyPath: "socket.fileDescriptor") as? Int32,
           fd >= 0 {
            ret0_.pointee = fd
            return
        }
        let fd = LibboxGetTunnelFileDescriptor()
        guard fd >= 0 else {
            provider.setTunnelNetworkSettings(nil) { _ in }
            throw unavailable(14)
        }
        ret0_.pointee = fd
    }

    func usePlatformAutoDetectControl() -> Bool { false }
    func autoDetectControl(_ fd: Int32) throws {}
    func useProcFS() -> Bool { false }
    func writeLog(_ message: String?) {
        // Native logs can include credentials and are never forwarded.
    }
    func findConnectionOwner(
        _ ipProtocol: Int32, sourceAddress: String?, sourcePort: Int32,
        destinationAddress: String?, destinationPort: Int32
    ) throws -> LibboxConnectionOwner {
        throw unavailable(20)
    }

    func startDefaultInterfaceMonitor(
        _ listener: LibboxInterfaceUpdateListenerProtocol?
    ) throws {
        guard let listener else { throw unavailable(21) }
        pathMonitor?.cancel()
        let monitor = NWPathMonitor()
        pathMonitor = monitor
        let ready = DispatchSemaphore(value: 0)
        var first = true
        monitor.pathUpdateHandler = { path in
            // Go needs the physical interface for Reality socket egress.
            if path.status == .satisfied, let interface = path.availableInterfaces.first {
                listener.updateDefaultInterface(
                    interface.name, interfaceIndex: Int32(interface.index),
                    isExpensive: path.isExpensive, isConstrained: path.isConstrained
                )
            } else {
                listener.updateDefaultInterface(
                    "", interfaceIndex: -1,
                    isExpensive: false, isConstrained: false
                )
            }
            if first { first = false; ready.signal() }
        }
        monitor.start(queue: DispatchQueue.global(qos: .userInitiated))
        if ready.wait(timeout: .now() + 12) != .success {
            monitor.cancel()
            pathMonitor = nil
            throw unavailable(22)
        }
    }

    func closeDefaultInterfaceMonitor(
        _ listener: LibboxInterfaceUpdateListenerProtocol?
    ) throws {
        pathMonitor?.cancel()
        pathMonitor = nil
    }

    func getInterfaces() throws -> LibboxNetworkInterfaceIteratorProtocol {
        let path = pathMonitor?.currentPath
        var interfaces: [LibboxNetworkInterface] = []
        if let path, path.status == .satisfied {
            for item in path.availableInterfaces {
                let result = LibboxNetworkInterface()
                result.name = item.name
                result.index = Int32(item.index)
                switch item.type {
                case .wifi: result.type = LibboxInterfaceTypeWIFI
                case .cellular: result.type = LibboxInterfaceTypeCellular
                case .wiredEthernet: result.type = LibboxInterfaceTypeEthernet
                default: result.type = LibboxInterfaceTypeOther
                }
                interfaces.append(result)
            }
        }
        return NativeInterfaceIterator(interfaces)
    }

    private class NativeInterfaceIterator: NSObject, LibboxNetworkInterfaceIteratorProtocol {
        private var items: IndexingIterator<[LibboxNetworkInterface]>
        private var current: LibboxNetworkInterface?
        init(_ interfaces: [LibboxNetworkInterface]) {
            items = interfaces.makeIterator()
        }
        func hasNext() -> Bool {
            current = items.next()
            return current != nil
        }
        func next() -> LibboxNetworkInterface? { current }
    }

    func underNetworkExtension() -> Bool { true }
    func includeAllNetworks() -> Bool { false }
    func clearDNSCache() {
        // Changes to NE settings must not occur behind the app's back.
    }
    func readWIFIState() -> LibboxWIFIState? { nil }
    func readWIFISSID() -> String? { nil }
    func connectSSHAgent(_ ret0_: UnsafeMutablePointer<Int32>?) throws {
        throw unavailable(30)
    }

    func serviceStop() throws {
        provider?.cancelTunnelWithError(unavailable(31))
    }
    func serviceReload() throws { throw unavailable(32) }
    func getSystemProxyStatus() throws -> LibboxSystemProxyStatus {
        LibboxSystemProxyStatus()
    }
    func setSystemProxyEnabled(_ isEnabled: Bool) throws {
        throw unavailable(33)
    }
    func triggerNativeCrash() throws { throw unavailable(34) }
    func writeDebugMessage(_ message: String?) {}

    func send(_ notification: LibboxNotification?) throws {}
    func cancelNotification(_ identifier: String?, typeID: Int32) throws {}
    func startNeighborMonitor(_ listener: LibboxNeighborUpdateListenerProtocol?) throws {}
    func registerMyInterface(_ name: String?) {}
    func closeNeighborMonitor(_ listener: LibboxNeighborUpdateListenerProtocol?) throws {}

    func localDNSTransport() -> (any LibboxLocalDNSTransportProtocol)? { nil }
    func systemCertificates() -> (any LibboxStringIteratorProtocol)? { nil }
    func usePlatformShell() -> Bool { false }
    func checkPlatformShell() throws { throw unavailable(40) }
    func openShellSession(
        _ user: LibboxPlatformUser?, command: String?,
        environ: (any LibboxStringIteratorProtocol)?, term: String?,
        rows: Int32, cols: Int32
    ) throws -> any LibboxShellSessionProtocol {
        throw unavailable(41)
    }
    func readSystemSSHHostKey(_ error: NSErrorPointer) -> String {
        error?.pointee = unavailable(42)
        return ""
    }
    func lookupSFTPServer(_ error: NSErrorPointer) -> String {
        error?.pointee = unavailable(43)
        return ""
    }
    func tailscaleHostname() -> String { "Vainah VPN" }
    func usePlatformBridge() -> Bool { false }
    func createBridge(_ options: LibboxBridgeOptions?) throws -> any LibboxBridgeSessionProtocol {
        throw unavailable(44)
    }
    func lookupUser(_ username: String?) throws -> LibboxPlatformUser {
        throw unavailable(45)
    }

    func shutDown() {
        pathMonitor?.cancel()
        pathMonitor = nil
        settings = nil
        // Fail closed after a failed startup or native service shutdown:
        // tear down OS-level routes rather than retaining a dead TUN.
        provider?.setTunnelNetworkSettings(nil) { _ in }
    }
}

/// Runs the pinned native Go packet engine inside PacketTunnelProvider.
/// Security result remains UNVERIFIED until actual H1Cloud + DNS/IPv6 tests.
final class VainahLibboxRuntime {
    private let provider: PacketTunnelProvider
    private var command: LibboxCommandServer?
    private var bridge: VainahLibboxPlatform?
    private var temporaryStorage: URL?

    init(_ provider: PacketTunnelProvider) { self.provider = provider }

    func start(_ config: String) throws {
        let files = FileManager.default
        // libbox can persist a config snapshot containing H1Cloud credentials.
        // Keep it in device-private, non-backed-up cache, not Documents.
        let base = files.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("VainahNativeEngine", isDirectory: true)
        let working = base.appendingPathComponent("Working", isDirectory: true)
        let temp = base.appendingPathComponent("Temp", isDirectory: true)
        for directory in [base, working, temp] {
            try files.createDirectory(at: directory, withIntermediateDirectories: true)
            try files.setAttributes([
                .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication
            ], ofItemAtPath: directory.path)
        }
        var privateDirectory = base
        var resourceValues = URLResourceValues()
        resourceValues.isExcludedFromBackup = true
        try privateDirectory.setResourceValues(resourceValues)
        temporaryStorage = base
        let setup = LibboxSetupOptions()
        setup.basePath = base.path
        setup.workingPath = working.path
        setup.tempPath = temp.path
        setup.debug = false
        setup.logMaxLines = 0
        setup.crashReportSource = "VainahPacketTunnel"
        setup.appVersion = "3"
        setup.appMarketingVersion = "0.3-test"
        var error: NSError?
        LibboxSetup(setup, &error)
        if error != nil { throw NSError(domain: "VainahLibbox", code: 100) }
        error = nil
        LibboxCheckConfig(config, &error)
        if error != nil { throw NSError(domain: "VainahLibbox", code: 101) }
        let platform = VainahLibboxPlatform(provider)
        bridge = platform
        let native = LibboxNewCommandServer(platform, platform, &error)
        if error != nil || native == nil { throw NSError(domain: "VainahLibbox", code: 102) }
        command = native
        do {
            try native!.start()
            try native!.startOrReloadService(config, options: LibboxOverrideOptions())
        } catch {
            stop()
            throw NSError(domain: "VainahLibbox", code: 103)
        }
    }

    func stop() {
        try? command?.closeService()
        command?.close()
        command = nil
        bridge?.shutDown()
        bridge = nil
        if let privateDirectory = temporaryStorage {
            try? FileManager.default.removeItem(at: privateDirectory)
        }
        temporaryStorage = nil
    }
}
#endif
