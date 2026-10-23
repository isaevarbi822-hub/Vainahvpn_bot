import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('macOS native app uses NetworkExtension, separate from Electron preview',()=>{
  const project=read('native/macos/project.yml');
  const controller=read('native/macos/Sources/App/MacTunnelController.swift');
  assert.match(project,/type: app-extension/);
  assert.match(project,/platform: macOS/);
  assert.match(project,/packet-tunnel-provider/);
  assert.match(project,/keychain-access-groups/);
  assert.match(controller,/NETunnelProviderManager/);
  assert.match(controller,/providerBundleIdentifier == extensionID/);
  assert.match(controller,/SharedTunnelProfile\.save/);
  assert.match(controller,/hasVerifiedCore = false/);
});
test('macOS rejects empty Packet Tunnel and never puts credentials in logs',()=>{
  const extension=read('native/macos/Sources/TunnelExtension/PacketTunnelProvider.swift');
  const screen=read('native/macos/Sources/App/MacDashboard.swift');
  assert.match(extension,/SharedTunnelProfile\.load/);
  assert.match(extension,/completionHandler\(NSError/);
  assert.doesNotMatch(extension,/completionHandler\(nil\)/);
  assert.match(screen,/SecureField/);
  assert.match(screen,/profileInput = ""/);
  for(const source of [screen,extension]){
    assert.doesNotMatch(source,/UserDefaults|print\(.+uri|os_log\(.+profile/);
  }
});
