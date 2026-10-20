import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{presentWebsiteAccount} from '../netlify/functions/website-account-overview.mjs';
import {websiteAccountOverview} from '../netlify/functions/lib/subscription-db.mjs';

const order={
 id:'2cc7e0ca-a7e7-44ba-ac6c-2805db647e27',plan_days:365,device_limit:6,
 amount_kopeks:100000,currency:'RUB',status:'paid',delivery_state:'delivered',
 created_at:new Date('2026-01-01T10:00:00Z'),
 paid_at:new Date('2026-01-01T10:01:00Z'),
 target_expires_at:new Date('2027-01-01T10:00:00Z')
};
test('anonymous account history is not accessible',async()=>{
 const r=await handler(new Request('https://vpn.example.com/.netlify/functions/website-account-overview'));
 assert.equal(r.status,401);
 assert.equal((await r.json()).error,'Войди через Telegram');
});
test('account overview is GET-only',async()=>{
 const r=await handler(new Request('https://vpn.example.com/.netlify/functions/website-account-overview',{method:'POST'}));
 assert.equal(r.status,405);
});
test('database query only fetches website orders belonging to signed-in Telegram ID',async()=>{
 let queried=0;
 const db={query:async(sql,args)=>{
   queried++;
   assert.deepEqual(args,['123456789']);
   if(sql.includes('FROM vpn_orders')){
     assert.match(sql,/telegram_id=\$1/);
     assert.match(sql,/source='website'/);
     assert.match(sql,/is_test=false/);
     assert.match(sql,/LIMIT 30/);
     assert.doesNotMatch(sql,/SELECT\s+\*/i);
     return {rows:[order]};
   }
   assert.match(sql,/vpn_entitlements/);
   return {rows:[{expires_at:new Date('2027-01-01T10:00:00Z')}]};
 }};
 const result=await websiteAccountOverview('123456789',db);
 assert.equal(queried,2);
 assert.equal(result.orders.length,1);
 assert.equal(result.latestDeliveredOrderId,order.id);
 await assert.rejects(()=>websiteAccountOverview('123; DROP TABLE vpn_orders',db),/INVALID_CUSTOMER_ID/);
});
test('public response shows family tariff and dates, never payment/private data',()=>{
 const result=presentWebsiteAccount({
   orders:[{...order,payment_id:'super-private',payment_url:'https://example.com/private',telegram_id:'12345'}],
   latestDeliveredOrderId:order.id,
   entitlementExpiresAt:new Date('2027-02-01T10:00:00Z')
 },new Date('2026-10-20T00:00:00Z').getTime());
 assert.deepEqual(result.subscription,{
   planDays:365,deviceLimit:6,expiresAt:'2027-02-01T10:00:00.000Z',
   active:true,accessOrderId:order.id
 });
 assert.equal(result.orders[0].amountRub,'1000.00');
 assert.equal(result.orders[0].currency,'RUB');
 for(const privateValue of ['super-private','example.com/private','12345'])
   assert.ok(!JSON.stringify(result).includes(privateValue));
});
test('unpaid orders never grant access and expired records never claim active',()=>{
 const unpaid={...order,status:'awaiting_payment',delivery_state:'pending'};
 const result=presentWebsiteAccount({orders:[unpaid],latestDeliveredOrderId:null,entitlementExpiresAt:null});
 assert.equal(result.subscription,null);
 const old=presentWebsiteAccount({orders:[order],latestDeliveredOrderId:order.id,entitlementExpiresAt:'2025-01-01T00:00:00Z'},Date.now());
 assert.equal(old.subscription.active,false);
});
