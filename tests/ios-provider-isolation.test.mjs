import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const controller=fs.readFileSync('native/ios/Sources/App/TunnelController.swift','utf8');

test('iOS selects existing Vainah PacketTunnel without replacing an unrelated VPN',()=>{
 assert.match(controller,/managers\.first\(where:\s*\{/);
 assert.match(controller,/providerBundleIdentifier\s*==\s*"app\.vainah\.vpn\.PacketTunnel"/);
 assert.doesNotMatch(controller,/let manager = managers\.first \?\? NETunnelProviderManager\(\)/);
});

test('iOS disconnect must not stop unrelated VPN provider configurations',()=>{
 assert.match(controller,/guard provider\?\.providerBundleIdentifier == "app\.vainah\.vpn\.PacketTunnel" else/);
 assert.match(controller,/manager\.connection\.stopVPNTunnel\(\)/);
});

test('iOS never claims secure egress merely from NetworkExtension connected status',()=>{
 assert.match(controller,/state = \.testing/);
 assert.match(controller,/DNS\/IPv6 пока НЕ проверены/);
});
