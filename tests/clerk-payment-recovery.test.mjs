import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import mobileOrders from '../netlify/functions/mobile-orders.mjs';
import {nativeRenewalTarget,nativeCommerceReady} from '../netlify/functions/lib/native-commerce.mjs';

test('native renewed paid days begin at latest stored or H1 expiry, not at last webhook',()=>{
 const day=86_400_000,now=2_000_000_000_000;
 assert.equal(nativeRenewalTarget({nowMs:now,storedExpiryMs:now+5*day,
   panelExpiryMs:now+3*day,days:30}).getTime(),now+35*day);
 assert.equal(nativeRenewalTarget({nowMs:now,storedExpiryMs:now+2*day,
   panelExpiryMs:now+8*day,days:60}).getTime(),now+68*day);
 assert.equal(nativeRenewalTarget({nowMs:now,days:365}).getTime(),now+365*day);
 for(const days of [0,366,-1,1.5,NaN,'30',null])
   assert.throws(()=>nativeRenewalTarget({nowMs:now,days}));
 assert.throws(()=>nativeRenewalTarget({nowMs:now,storedExpiryMs:-10,days:30}));
});

test('owner-only recovery rejects anonymous requests without touching the order ledger',async()=>{
 const res=await mobileOrders(new Request('https://vpn.example.test/.netlify/functions/mobile-orders'));
 assert.equal(res.status,401);
 assert.match((await res.json()).error,/Authentication required/);
 const badMethod=await mobileOrders(new Request('https://vpn.example.test/.netlify/functions/mobile-orders',
   {method:'POST',body:'{}'}));
 assert.equal(badMethod.status,405);
});

test('release starts with native checkout disabled even if client has a saved Clerk login',()=>{
 assert.equal(nativeCommerceReady({}),false);
 assert.equal(nativeCommerceReady({VAINAH_NATIVE_CHECKOUT:'approved-after-test'}),false);
});

test('a native order snapshots verified Clerk email; delivery date is durably reserved first',()=>{
 const server=readFileSync(new URL('../netlify/functions/lib/native-commerce.mjs',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../database/migrations/005-native-order-email-snapshot.sql',import.meta.url),'utf8');
 const android=readFileSync(new URL('../native/android/app/src/main/java/app/vainah/vpn/NativeIdentity.kt',import.meta.url),'utf8');
 assert.match(server,/amount_kopeks,delivery_email\)/);
 assert.match(server,/plan\.kopeks,user\.email\]/);
 assert.match(server,/COALESCE\(o\.delivery_email,c\.delivery_email\)/);
 assert.match(migration,/ALTER TABLE vpn_native_orders ADD COLUMN IF NOT EXISTS delivery_email/);
 assert.match(server,/const target=await reserveNativeExpiry\(orderId\)/);
 assert.ok(server.indexOf('const target=await reserveNativeExpiry(orderId)')<
   server.indexOf('result=await fulfillH1(orderId)'));
 assert.match(server,/ON CONFLICT\(customer_id\) DO UPDATE[\s\S]*?GREATEST\(/);
 assert.match(android,/fun latestOrder\(jwt:String,preferredId:String\?=null\)/);
 assert.match(android,/exchange\("mobile-orders",null,jwt\)/);
 assert.doesNotMatch(android,/ROLLYPAY_API_KEY|CLERK_SECRET_KEY|RESEND_API_KEY|PANEL_API_TOKEN/);
});
