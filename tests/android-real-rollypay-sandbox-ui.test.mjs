import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Android 0.5.8 includes independent RollyPay sandbox with no real charge',()=>{
 const ui=read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
 const client=read('native/android/app/src/main/java/app/vainah/vpn/NativeIdentity.kt');
 const gradle=read('native/android/app/build.gradle.kts');
 const workflow=read('.github/workflows/native-mobile.yml');
 assert.match(gradle,/versionName = "0\.5\.8"/);
 assert.match(ui,/Тест RollyPay · 10 ₽/);
 assert.match(ui,/Запустить тестовый платёж/);
 assert.match(ui,/Проверить тестовый платёж/);
 assert.match(ui,/sandboxReturnPending=true/);
 assert.match(ui,/NativeIdentity\.startSandbox\(token\)/);
 assert.match(ui,/NativeIdentity\.sandboxStatus\(token,proof\)/);
 assert.match(ui,/НЕ спишутся/);
 assert.match(client,/exchange\("clerk-payment-sandbox",JSONObject\(\)\.put\("action","start"\),jwt\)/);
 assert.match(client,/data\.optBoolean\("noVpnGranted",false\)/);
 assert.match(client,/data\.optBoolean\("noCharge",false\)/);
 assert.match(workflow,/-PvainahEnableLibbox=true/);
 assert.match(workflow,/-PvainahEnableClerk=true/);
 assert.match(workflow,/VainahVPN-0\.5\.8-Android-libbox-Clerk-RollyPay-sandbox/);
});

test('Sandbox credential is an owner-bound proof, not a VPN subscription',()=>{
 const ui=read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
 const client=read('native/android/app/src/main/java/app/vainah/vpn/NativeIdentity.kt');
 const start=ui.indexOf('private fun startSandboxPayment()');
 const end=ui.indexOf('private fun checkNativeOrder()',start);
 const body=ui.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.doesNotMatch(body,/vault\.save|VainahVpnService|createInvoice\(/);
 assert.doesNotMatch(client,/ROLLYPAY_API_KEY|ROLLYPAY_SIGNING_SECRET|CLERK_SECRET_KEY/);
});

test('Android 0.5.8 reports sandbox root causes safely instead of generic errors',()=>{
 const ui=read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
 const client=read('native/android/app/src/main/java/app/vainah/vpn/NativeIdentity.kt');
 for(const code of [
  'SANDBOX_DISABLED_ON_SERVER','SANDBOX_PROVIDER_NOT_READY',
  'SANDBOX_SESSION_REJECTED','SANDBOX_ACCOUNT_NOT_ALLOWED',
  'SANDBOX_ENDPOINT_NOT_DEPLOYED','SANDBOX_RATE_LIMITED'
 ]){
  assert.match(client,new RegExp(code));
  assert.match(ui,new RegExp(code));
 }
 for(const indicator of ['SB-401','SB-403','SB-503A','SB-503B']){
  assert.match(ui,new RegExp(indicator));
 }
 assert.match(ui,/notice\(sandboxFailureText\(error\)\)/);
 assert.doesNotMatch(ui,/Sandbox не запущен\. Проверь серверный режим теста/);
 assert.match(client,/val bytes=ByteArray\(2048\)/);
 assert.match(client,/serverError=="Тестовый режим платежей выключен"/);
 assert.doesNotMatch(ui,/notice\(.*error\.message/);
});
