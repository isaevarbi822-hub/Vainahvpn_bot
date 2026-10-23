import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { watchStatus, WATCH_COMMANDS } from '../native/watches/status-v1.mjs';
const read = file => readFileSync(new URL('../native/watches/'+file,import.meta.url),'utf8');

test('Watch companion source contains neither standalone VPN startup nor secrets',()=>{
  const ios=read('apple/VainahWatchDashboard.swift');
  const wear=read('wear/VainahWearController.kt');
  for(const code of [ios,wear]){
    assert.match(code,/status_request/);
    assert.match(code,/disconnect/);
    assert.doesNotMatch(code,/startVPNTunnel\(|VpnService\.Builder|PANEL_API_TOKEN|ROLLYPAY_API_KEY/);
    assert.doesNotMatch(code,/vless:\/\/[A-Za-z0-9]/);
  }
  assert.match(ios,/WCSession/);
  assert.match(wear,/PairedPhoneTransport/);
  assert.deepEqual(WATCH_COMMANDS,['status_request','disconnect']);
});

test('Watch online claims require independent browser egress proof',()=>{
  const status=watchStatus({phase:'online',server:'Spain',
    tcp_latency_ms:44,verified_browser_egress:false,token:'secret'});
  assert.equal(status.phase,'tun_ready');
  assert.equal(status.server,'Spain');
  assert.equal('token' in status,false);
  assert.equal(watchStatus({phase:'online',verified_browser_egress:true}).phase,'online');
});
