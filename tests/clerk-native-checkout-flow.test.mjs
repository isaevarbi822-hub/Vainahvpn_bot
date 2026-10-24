import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import account from '../netlify/functions/mobile-account.mjs';
import order from '../netlify/functions/mobile-order.mjs';
import {checkoutReady,paymentInfrastructureReady} from '../netlify/functions/lib/plan-catalog.mjs';
import {nativeCommerceReady} from '../netlify/functions/lib/native-commerce.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Clerk native infrastructure gate is independent from Telegram bot',()=>{
  const env={
    DATABASE_URL:'postgresql://db.example.test/vpn',
    ROLLYPAY_API_KEY:'example-value-not-a-real-key',
    ROLLYPAY_SIGNING_SECRET:'x'.repeat(50),
    SESSION_SIGNING_KEY:'y'.repeat(50),
    PANEL_BASE_URL:'https://panel.example.test',
    PANEL_API_TOKEN:'example-not-a-real-token',
    PUBLIC_SITE_ORIGIN:'https://vpn.example.test',
    VAINAH_LIVE_CHECKOUT:'enabled-after-review',
    VAINAH_PAYMENT_INTEGRATION_VERIFIED:'verified-on-production'
  };
  assert.equal(paymentInfrastructureReady(env),true);
  assert.equal(checkoutReady(env),false); // Site still needs Telegram.
  assert.equal(nativeCommerceReady(env),false); // Native needs Clerk+Resend+approval.
  assert.equal(checkoutReady({...env,TELEGRAM_BOT_TOKEN:'test-value'}),true);
  assert.equal(paymentInfrastructureReady({...env,VAINAH_LIVE_CHECKOUT:''}),false);
});

test('Clerk account delivery-email readiness never leaks contact or tokens',async()=>{
  const response=await account(new Request('https://vpn.example.test/.netlify/functions/mobile-account'));
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{
    error:'CLERK_SERVER_SETUP_REQUIRED',authenticated:false,emailVerified:false
  });
  const posted=await account(new Request('https://vpn.example.test/.netlify/functions/mobile-account',
     {method:'POST',body:'{}'}));
  assert.equal(posted.status,405);
  const missing=await order(new Request('https://vpn.example.test/.netlify/functions/mobile-order?order=valid'));
  assert.equal(missing.status,401);
});

test('Only provider confirmed paid invoice can import a VPN; payment return is not receipt',()=>{
  const main=read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
  const mobile=read('native/android/app/src/main/java/app/vainah/vpn/NativeIdentity.kt');
  const wh=read('netlify/functions/rollypay-live-webhook.mjs');
  const plans=read('netlify/functions/lib/plan-catalog.mjs');
  assert.match(main,/NativeIdentity\.account\(token\)/);
  assert.match(main,/verifiedDeliveryEmail/);
  assert.match(main,/CustomTabsIntent\.Builder\(\)/);
  assert.match(main,/checkoutReturnPending=true/);
  assert.match(main,/NativeIdentity\.readOrder\(token,id\)/);
  assert.match(main,/order\.status=="paid"&&order\.delivery=="delivered"/);
  assert.match(mobile,/exchange\("mobile-order\?order="\+id,JSONObject\(\),jwt\)/);
  assert.match(mobile,/ids\.contains\(preferredId\)/);
  assert.match(wh,/if\(!checkoutReady\(\) && !nativeCommerceReady\(\)\)/);
  assert.match(wh,/if\(!nativeCommerceReady\(\)\)/);
  assert.match(wh,/if\(!checkoutReady\(\)\)return json\(\{error:'Website payment processing disabled'/);
  assert.match(plans,/paymentInfrastructureReady/);
});
