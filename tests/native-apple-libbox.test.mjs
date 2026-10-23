import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Official Apple Libbox is source-pinned and credential free',()=>{
  const build=read('.github/workflows/apple-libbox.yml');
  assert.match(build,/af6e64c3b69e6132ebaee0e1a3d24e93903f6709/);
  assert.match(build,/gomobile@v0\.1\.13/);
  assert.match(build,/gobind@v0\.1\.13/);
  assert.match(build,/ios,iossimulator,macos/);
  assert.match(build,/test -d Libbox\.xcframework/);
  assert.match(build,/LICENSE/);
  assert.doesNotMatch(build,/ROLLYPAY_API_KEY|PANEL_API_TOKEN|secrets\./);
});
test('Building framework does not falsely unlock VPN connections',()=>{
  const ios=read('native/ios/Sources/App/TunnelController.swift');
  const mac=read('native/macos/Sources/App/MacTunnelController.swift');
  const ext=read('native/ios/Sources/TunnelExtension/PacketTunnelProvider.swift');
  const macExt=read('native/macos/Sources/TunnelExtension/PacketTunnelProvider.swift');
  assert.match(ios,/available = false/);
  assert.match(mac,/hasVerifiedCore = false/);
  assert.doesNotMatch(ext,/completionHandler\(nil\)/);
  assert.doesNotMatch(macExt,/completionHandler\(nil\)/);
  assert.match(read('native/apple-libbox/README.md'),/GPL-3\.0/);
});
