import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Android 0.5.7 includes independent RollyPay sandbox with no real charge',()=>{
 const ui=read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
 const client=read('native/android/app/src/main/java/app/vainah/vpn/NativeIdentity.kt');
 const gradle=read('native/android/app/build.gradle.kts');
 const workflow=read('.github/workflows/native-mobile.yml');
 assert.match(gradle,/versionName = "0\.5\.7"/);
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
 assert.match(workflow,/VainahVPN-0\.5\.7-Android-libbox-Clerk-RollyPay-sandbox/);
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
