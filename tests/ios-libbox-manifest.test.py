#!/usr/bin/env python3
"""Guard against XcodeGen manifest drift breaking the expensive iOS libbox build."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[1]
script = root / "native/ios/scripts/link-libbox-preview.py"
manifest = (root / "native/ios/project.yml").read_text()

def attempt(config):
    with tempfile.TemporaryDirectory(prefix="vainah-ios-link-smoke-") as folder:
        dest = Path(folder) / "native/ios"
        (dest / "scripts").mkdir(parents=True)
        shutil.copy2(script, dest / "scripts/link-libbox-preview.py")
        (dest / "project.yml").write_text(config)
        framework = Path(folder) / "source/Libbox.xcframework"
        framework.mkdir(parents=True)
        result = subprocess.run(
            [sys.executable, str(dest / "scripts/link-libbox-preview.py"), str(framework)],
            capture_output=True, text=True
        )
        return result, (dest / "project.yml").read_text()

result, patched = attempt(manifest)
assert result.returncode == 0, f"Valid native iOS manifest rejected: {result.stderr} {result.stdout}"
assert patched.count("- framework: Libbox.xcframework") == 1, "Native core must link exactly once"
assert patched.count("- sdk: UIKit.framework") == 1, "Existing UIKit dependency must remain"
assert "- target: VainahPacketTunnel" in patched, "App/extension linkage lost"
assert manifest.count("- framework: Libbox.xcframework") == 0, "Tracked iOS project should stay clean"

result, _ = attempt(manifest.replace("      - sdk: UIKit.framework\n", ""))
assert result.returncode != 0, "Unexpected manifest change was accepted"
print("iOS XcodeGen patch regression test passed (no native framework needed)")
