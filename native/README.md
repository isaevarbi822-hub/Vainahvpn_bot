# Vainah VPN — native apps for Android and iPhone

**Status: platform foundation (v0.1), NOT a working VPN tunnel.**

This is a real native mobile codebase added **alongside**, not in place of,
the existing Vainah VPN website and Telegram bot. Branch-only development;
merging is not required to keep the production site working.

| Capability | Android | iPhone / iPad |
|---|---|---|
| Native app UI | Kotlin / Android SDK | SwiftUI |
| Large Connect control | yes, honestly guarded | yes, honestly guarded |
| Native VPN system integration | `VpnService` manifest, consent + foreground service | `NEPacketTunnelProvider` extension and manager |
| Secure locally imported subscription | Android Keystore AES-256-GCM | iOS Keychain, device-only |
| Open existing authenticated web account | yes, in system browser | yes, in system browser |
| Native login / account purchase history | **not yet integrated** | **not yet integrated** |
| Actual H1Cloud/VLESS packet transport | **NOT YET** | **NOT YET** |
| App Store / Play Store release | **not submitted** | **not submitted** |

## Why the Connect button cannot be real yet

The existing server issues a private **HTTPS subscription URL** to an
authenticated owner after a paid, fulfilled website order. This is **not**
equivalent to an Android `VpnService` tunnel or iOS `NEPacketTunnelProvider`
packet engine. Its contents may reference VLESS-style proxy endpoints.
A native transport must support the exact deployed protocol (including
TCP/UDP, DNS, IPv4/IPv6, TLS/Reality or other chosen security), parse
H1Cloud subscription formats, and **forward packets in both directions**
before displaying Connected.

We have deliberately NOT:
- marked the VPN active just because a permission dialog was accepted;
- established a VPN interface and silently dropped packets;
- bundled an unreviewed third-party tunnel library;
- added any production subscription keys to the repository;
- enabled Netlify checkout or changed the H1Cloud panel.

The `EngineRegistry.active.ready = false` gate on Android and
`VLESSCore.available = false` gate on iOS make this limitation explicit.

## Layout

```text
native/
  android/
    settings.gradle.kts
    app/src/main/java/app/vainah/vpn/
      MainActivity.kt          # Native, branded UI; owner-triggered actions
      SecureSubscription.kt   # Android Keystore AES-GCM
      SubscriptionLink.kt      # Validate HTTPS bearer-URL input
      VainahVpnService.kt     # VpnService lifecycle, consent, foreground
      TunnelEngine.kt         # Packet transport contract (missing engine)
  ios/
    project.yml               # XcodeGen project specification
    Sources/App/              # SwiftUI and NETunnelProviderManager
    Sources/Shared/           # HTTPS URL validation and Keychain
    Sources/TunnelExtension/  # NEPacketTunnelProvider, fails safely
    Tests/                    # Subscription-link tests
```

## Android (development)

1. Use **Android Studio** on a computer, open `native/android`.
2. Sync Gradle (Android Gradle Plugin 8.7.3, Kotlin 2.0.21, Java 17,
   SDK API 35).
3. Run the **debug build** on a device that you own or are authorized
   to manage. No API keys are required to explore the interface.
4. The app can save and delete an HTTPS subscription URL locally; the
   VPN button **does not** establish a tunnel until a real engine is ready.

CI uses an installed Gradle distribution (`gradle -p native/android`);
no Gradle wrapper JAR is committed.

## iOS (development)

1. A **Mac with Xcode** and `xcodegen` is necessary; iOS native
   applications cannot be compiled or signed from Netlify alone.
2. Run `cd native/ios && xcodegen generate`.
3. Open the generated `VainahVPN.xcodeproj` and select a simulator for
   an initial UI build. The Network Extension requires a properly
   configured Apple Developer capability for device use.
4. Set your legal app Bundle ID, development team, and Packet Tunnel
   extension Bundle ID. Enable the Network Extensions **packet-tunnel-provider**
   entitlement and App Group under the associated developer account.
5. Run the app. Keychain local import is testable; tunnel transport is
   not implemented, so connection is not yet possible.

Store distribution requires appropriate developer programs and review;
use an authorized adult owner when required by the programs.

## Roadmap (honest milestones)

1. ✅ Android native screen, platform service and AES-GCM profile vault.
2. ✅ SwiftUI screen, PacketTunnelProvider extension and Keychain vault.
3. ✅ Separate development branch, automated source/build tests.
4. ⏳ Confirm **exact** H1Cloud subscription format with sanitized
   samples (never share a real URL/token).
5. ⏳ Select, audit and license a compatible VLESS/tun transport engine,
   integrate platform bindings and negotiate encrypted remote transport.
6. ⏳ Verify DNS, IPv4/IPv6, handover/reconnect, kill switch,
   UDP/TCP, battery use, leaks and disconnect/revoke on real devices.
7. ⏳ Build secure native login using Telegram/Yandex/Clerk via
   standards-compliant authorization, and owner-scoped entitlement API;
   do **not** re-use a web cookie or trust client-supplied Telegram ID.
8. ⏳ App store signing, privacy disclosures, staged release.

### Protecting existing users

Website order access is checked server-side against the owner’s signed
Telegram cookie and paid/delivered order. The native app must not
invent an authorization shortcut to retrieve its private URL.
Manual URL entry is temporarily supported for UI testing; after
a proper native identity flow, the link should be securely provisioned.

The RollyPay production checkout remains disabled. No API tokens,
personal subscription URLs or certificates should be committed.
