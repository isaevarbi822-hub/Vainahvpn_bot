import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const service=readFileSync('native/android/app/src/main/java/app/vainah/vpn/VainahVpnService.kt','utf8');
const ui=readFileSync('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt','utf8');

test('Android UI displays only actual engine phases and never calls a running core protected',()=>{
  assert.match(service,/enum class Phase \{ OFF, STARTING, UNVERIFIED, STOPPING, FAILED \}/);
  assert.match(service,/@Volatile var phase: Phase = Phase\.OFF/);
  assert.match(service,/phase = Phase\.STARTING/);
  assert.match(service,/phase = Phase\.UNVERIFIED/);
  assert.match(ui,/homeState\?\.text = title/);
  assert.match(ui,/homeExplanation\?\.text = details/);
  assert.match(ui,/Туннель запущен — не проверен/);
  assert.match(ui,/DNS, IPv4\/IPv6 и передача пакетов через H1Cloud ещё НЕ проверены/);
  assert.doesNotMatch(ui,/Туннель защищён|Защита включена|Весь трафик защищён/);
});

test('Android disconnect remains available during startup; stopping notification waits for core teardown',()=>{
  assert.match(ui,/VainahVpnService\.Phase\.STARTING, VainahVpnService\.Phase\.UNVERIFIED ->\s*stopTunnel\(\)/);
  assert.match(ui,/VainahVpnService\.ACTION_DISCONNECT/);
  assert.match(service,/@Synchronized\s+private fun disconnect/);
  const stop=service.slice(service.indexOf('private fun disconnect('),service.indexOf('override fun onRevoke()'));
  const guard=stop.indexOf('if (phase == Phase.STOPPING) return');
  const ticket=stop.indexOf('val ticket = session.incrementAndGet()');
  const close=stop.indexOf('EngineRegistry.active.disconnect()');
  const fg=stop.indexOf('stopForeground(STOP_FOREGROUND_REMOVE)');
  assert.ok(guard>=0&&ticket>guard&&close>ticket&&fg>close,
    'stop must be single-flight and wait until TUN has actually closed');
  assert.match(stop,/phase = if \(failed\) Phase\.FAILED else Phase\.OFF/);
});

test('Android live-status updates do not destroy user-entered subscription field',()=>{
  assert.match(ui,/statusHandler\.postDelayed\(this, 1200\)/);
  const tick=ui.slice(ui.indexOf('private fun updateHomeConnection()'),ui.indexOf('override fun onResume()'));
  assert.doesNotMatch(tick,/renderPage\(\)|setContentView\(/);
  assert.match(ui,/statusHandler\.removeCallbacks\(statusTicker\)/);
});
