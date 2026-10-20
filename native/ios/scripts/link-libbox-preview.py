#!/usr/bin/env python3
"""CI-only XcodeGen test: link source-built GPL libbox to iOS extension.

Does not change the tracked project.yml, does not start a tunnel, and does
not install/sign an iPhone app.
"""
from pathlib import Path
import shutil
import sys

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else None
if source is None or not source.is_dir() or not source.name.endswith(".xcframework"):
    raise SystemExit("Expected the source-built libbox XCFramework directory")

target = root / "Libbox.xcframework"
if target.exists():
    raise SystemExit("Refusing to overwrite a preexisting framework")
shutil.copytree(source, target)

project = root / "project.yml"
config = project.read_text()
needle = '''        PRODUCT_BUNDLE_IDENTIFIER: app.vainah.vpn.PacketTunnel
        GENERATE_INFOPLIST_FILE: NO

  VainahVPNTests:
'''
replacement = '''        PRODUCT_BUNDLE_IDENTIFIER: app.vainah.vpn.PacketTunnel
        GENERATE_INFOPLIST_FILE: NO
    dependencies:
      - framework: Libbox.xcframework
        embed: false

  VainahVPNTests:
'''
if config.count(needle) != 1:
    raise SystemExit("Unexpected XcodeGen manifest; cannot safely insert dependency")
project.write_text(config.replace(needle, replacement))
print("iOS test: libbox XCFramework linked into PacketTunnel target (VPN remains inactive)")
