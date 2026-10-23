import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base='native/android/';
const read=(path)=>readFileSync(path,'utf8');

test('Android standalone checkout remains off unless explicitly built in',()=>{
 const gradle=read(base+'app/build.gradle.kts');
 assert.match(gradle,/vainahStandaloneCheckout/);
 assert.match(gradle,/VAINAH_DIRECT_CHECKOUT_ENABLED/);
 assert.match(gradle,/androidx\.browser:browser:1\.8\.0/);
 const main=read(base+'app/src/main/java/app/vainah/vpn/MainActivity.kt');
 assert.match(main,/BuildConfig\.VAINAH_DIRECT_CHECKOUT_ENABLED/);
 assert.match(main,/NativeCheckout\.fetchAvailability/);
 assert.match(main,/CustomTabsIntent\.Builder/);
 assert.match(main,/tab\.launchUrl\(this, Uri\.parse\(url\)\)/);
 const target=main.slice(main.indexOf('private fun attemptCheckout'),main.indexOf('private fun account('));
 assert.doesNotMatch(target,/startActivity\(Intent\(Intent\.ACTION_VIEW/);
 assert.doesNotMatch(target,/WebView|ROLLYPAY_API_KEY|PANEL_API_TOKEN/);
});

test('Checkout redirects only from known plan identifiers and never charges on mobile',()=>{
 const model=read(base+'app/src/main/java/app/vainah/vpn/NativeCheckout.kt');
 assert.match(model,/VainahPlans\.all\.none/);
 assert.match(model,/checkout\.html\?plan=\$planId/);
 assert.doesNotMatch(model,/createInvoice|PANEL_API_TOKEN|ROLLYPAY_API_KEY/);
});
