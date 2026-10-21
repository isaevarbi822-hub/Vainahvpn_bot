import Foundation

#if canImport(Libbox)
import Libbox
#endif

/// Checks a private VLESS+Reality config with the actual gomobile libbox core.
/// Does not store the input, open a system tunnel, or assert packet protection.
/// The framework is present only in the isolated source-built engine workflow.
enum NativeRealityPreflight {
    static var nativeCoreLinked: Bool {
        #if canImport(Libbox)
        true
        #else
        false
        #endif
    }

    static func check(_ subscription: String) -> Bool {
        do {
            let json = try MobileRealityConfig.fromSubscription(subscription)
            #if canImport(Libbox)
            var error: NSError?
            LibboxCheckConfig(json, &error)
            return error == nil
            #else
            _ = json
            return false
            #endif
        } catch {
            // The Go error can contain private server data, so do not
            // return or log error.localizedDescription.
            return false
        }
    }
}
