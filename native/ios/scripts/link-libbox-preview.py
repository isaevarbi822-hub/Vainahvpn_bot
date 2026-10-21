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
# Anchor under the packet-extension dependency section: keep UIKit,
# which is required by a small iOS support symbol in libbox.
needle = '''        PRODUCT_BUNDLE_IDENTIFIER: app.vainah.vpn.PacketTunnel
        GENERATE_INFOPLIST_FILE: NO
    dependencies:
'''
if config.count(needle) != 1 or config.count("      - sdk: UIKit.framework") != 1:
    raise SystemExit("Unexpected XcodeGen manifest; refusing unsafe mutation")
replacement = needle + '''      - framework: Libbox.xcframework
        embed: false
'''
updated = config.replace(needle, replacement)
# App activation is never enabled in the normal four-platform UI preview.
# It only becomes available with the embedded real libbox extension.
app_needle = '''        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
    dependencies:
'''
if updated.count(app_needle) != 1:
    raise SystemExit("Unexpected app target settings; refusing to enable native core")
updated = updated.replace(app_needle, '''        ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon
        SWIFT_ACTIVE_COMPILATION_CONDITIONS: "$(inherited) VAINAH_NATIVE_LIBBOX"
    dependencies:
''')
project.write_text(updated)
print("iOS test: native libbox extension linked, app starts only the native integration tunnel")
