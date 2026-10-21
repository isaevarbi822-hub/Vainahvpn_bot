# Vainah VPN native desktop engine (integration preview)

This directory is populated by GitHub Actions **at build time**, using
unmodified official [sing-box v1.14.3](https://github.com/SagerNet/sing-box/releases/tag/v1.14.3)
binaries. The zip/tar archives are verified against GitHub's published SHA-256
digests before extracting. No VPN binary or subscription secret is committed.

* Windows x64: `sing-box.exe`
* macOS x64: `sing-box-darwin-amd64`
* macOS Apple Silicon: `sing-box-darwin-arm64`
* Upstream GPL-3.0: `sing-box-GPL-3.0.txt` (bundled by CI)

Source code for the independently executed engine:
https://github.com/SagerNet/sing-box/tree/v1.14.3

This experiment is not a signed release. TUN route installation may require
OS approval/privileges. A successful engine launch never implies the device
is protected, and no production release is created by these workflows.
