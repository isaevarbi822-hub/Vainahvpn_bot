# Vainah VPN Apple libbox 1.14.2

This workflow builds the official SagerNet sing-box v1.14.2 Apple framework from
commit af6e64c3b69e6132ebaee0e1a3d24e93903f6709 with
gomobile/gobind v0.1.13. The resulting Libbox.xcframework is an unsigned
dependency, NOT an installable IPA or a working VPN.

This pinned artifact is the next input for the iPhone, iPad and macOS
NetworkExtension work. Integration must implement the actual libbox platform
interface to create a real TUN fd, configure DNS, MTU, IPv4/IPv6 routes,
track physical network changes, start encrypted forwarding and stop cleanly.
The existing Apple extensions intentionally fail closed in the meantime.

Never put VPN subscription URLs, private node addresses or payment credentials
in artifacts. After real core integration, test on signed devices with correct
Apple NetworkExtension entitlements. Passing unsigned compilation is not proof
of external traffic protection.

IMPORTANT: Upstream sing-box and sing-box-for-apple use GPL-3.0+ licensing.
Review legal obligations to provide corresponding source and assess the
chosen distribution mechanism before releasing any linked apps.
