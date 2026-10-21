import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ios = readFileSync('native/ios/Sources/TunnelExtension/PacketTunnelProvider.swift','utf8');
const iosPlatform = readFileSync('native/ios/Sources/TunnelExtension/VainahLibboxPlatform.swift','utf8');
const android = readFileSync('native/android/app/src/engine/java/app/vainah/vpn/LibboxTunnelEngine.kt','utf8');

test('iOS native startup and teardown share a lock and stop waits for cleanup',()=>{
  assert.match(ios,/private let nativeLock = NSLock\(\)/);
  const start = ios.slice(ios.indexOf('private func startNative('),ios.indexOf('private func stopNative('));
  assert.match(start,/nativeLock\.lock\(\)/);
  assert.match(start,/defer \{ nativeLock\.unlock\(\) \}/);
  assert.match(start,/guard keepRunning\(\) else \{ throw CancellationError\(\) \}/);
  assert.match(start,/try engine\.start\(config\)/);
  assert.match(start,/catch \{\s*engine\.stop\(\)/);
  const stop = ios.slice(ios.indexOf('private func stopNative('),ios.indexOf('override func startTunnel('));
  assert.match(stop,/nativeLock\.lock\(\)/);
  assert.match(stop,/runtime\?\.stop\(\)/);
  assert.match(ios,/startup\?\.cancel\(\)/);
  assert.match(ios,/try startNative\(config, keepRunning: \{ !Task\.isCancelled \}\)/);
  assert.match(ios,/stopNative\(\)\s*completionHandler\(\)/);
});

test('iOS removes stale libbox credentials before native setup, and removes runtime cache on stop',()=>{
  const start=iosPlatform.indexOf('final class VainahLibboxRuntime');
  const cache=iosPlatform.indexOf('temporaryStorage = base',start);
  const purge=iosPlatform.indexOf('try files.removeItem(at: base)',cache);
  const setup=iosPlatform.indexOf('LibboxSetup(setup, &error)',purge);
  assert.ok(start>=0&&cache>start&&purge>cache&&setup>purge);
  assert.match(iosPlatform,/if files\.fileExists\(atPath: base\.path\) \{/);
  assert.match(iosPlatform,/try\? FileManager\.default\.removeItem\(at: privateDirectory\)/);
  assert.match(iosPlatform,/resourceValues\.isExcludedFromBackup = true/);
  assert.match(iosPlatform,/FileProtectionType\.completeUntilFirstUserAuthentication/);
});

test('Android removes all plaintext native snapshots before download and after stop',()=>{
  const start = android.indexOf('privateStorage = listOf(base, work, temp)');
  const wipe = android.indexOf('dir.deleteRecursively()',start);
  const fetch = android.indexOf('H1PrivateSubscription.read(subscriptionUrl)',start);
  assert.ok(start>=0 && wipe>start && fetch>wipe,'native config cleanup must precede private fetch');
  assert.match(android,/if \(dir\.exists\(\) && !dir\.deleteRecursively\(\)\)/);
  const disconnect=android.slice(android.indexOf('override fun disconnect()'));
  assert.match(disconnect,/active\?\.closeService\(\)/);
  assert.match(disconnect,/platform\?\.shutdown\(\)/);
  assert.match(disconnect,/privateStorage\.forEach \{ dir ->[\s\S]*dir\.deleteRecursively\(\)/);
  assert.match(disconnect,/privateStorage = emptyList\(\)/);
});

test('Android passes complete physical network address, DNS and gateway lists to libbox',()=>{
  assert.match(android,/private val items = values\.toList\(\)/);
  assert.match(android,/override fun len\(\): Int = items\.size/);
  assert.match(android,/override fun hasNext\(\) = iterator\.hasNext\(\)/);
  assert.match(android,/override fun next\(\): String = iterator\.next\(\)/);
  assert.match(android,/addresses = VainahStrings\(/);
  assert.match(android,/dnsServer = VainahStrings\(/);
  assert.match(android,/gateway = VainahStrings\(/);
});
