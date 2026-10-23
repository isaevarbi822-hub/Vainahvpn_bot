# Vainah VPN 0.5 — Wear OS and Apple Watch companions

The Android phone owns the real libbox tunnel. A watch must never receive
VLESS credentials or pretend to have a VPN engine.

- \`status-v1.mjs\`: allowlisted, credential-free phone-to-watch protocol
- \`apple/VainahWatchDashboard.swift\`: SwiftUI / WatchConnectivity client view
- \`wear/VainahWearController.kt\`: Wear presentation model with an injected
  paired-phone transport contract (Google Wear Data Layer is not wired yet)

Supported commands: \`status_request\` and \`disconnect\`. The authenticated
paired phone must authorize and perform a command; the watch cannot independently
start an unapproved connection.

This is source code for companion integration, **not installable watchOS or
Wear OS builds**. Before release, add the signed watch app/extension targets
and a secure counterpart on the phone, then test pairing, reachability,
disconnect authorization, and status synchronization on actual devices.
