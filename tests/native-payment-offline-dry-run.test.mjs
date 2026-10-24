import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCatalog} from '../netlify/functions/lib/plan-catalog.mjs';
import {verifiedPrimaryEmail,clerkMobileConfigured} from '../netlify/functions/lib/mobile-auth.mjs';
import {
  validateNativePayment,recordNativePayment,nativeRenewalTarget,nativeCommerceReady
} from '../netlify/functions/lib/native-commerce.mjs';
import mobileCheckout from '../netlify/functions/mobile-checkout.mjs';
import mobileOrder from '../netlify/functions/mobile-order.mjs';

// SAFE OFFLINE TEST: fixed fictitious identities and provider replies.
// This does not issue RollyPay invoices, charge a card, call H1Cloud,
// send email, or reach a production database.
const orderId='5b117019-452e-4de4-a83f-ad9248c4fb7b';
const paymentId='pay_sandbox_mock_12345678';
const orderFixture={
  id:orderId,payment_id:paymentId,provider:'rollypay',
  currency:'RUB',amount_kopeks:9900,status:'awaiting_payment',
  delivery_state:'pending'
};
const fakeProvider={
  order_id:orderId,payment_id:paymentId,status:'paid',
  payment_currency:'RUB',amount:'99.00',test:false,environment:'production'
};
const localDryRunTransactor=(state)=>{
  let paidWrites=0;
  let refundWrites=0;
  const db={
    async query(sql,params){
      if(sql.includes('SELECT * FROM vpn_native_orders')){
        return {rows:[{...state}]};
      }
      if(sql.includes("SET status='paid'")){
        paidWrites++;
        state.status='paid';
        return {rowCount:1};
      }
      if(sql.includes("SET status=$2,delivery_state='needs_review'")){
        refundWrites++;
        state.status=params[1];
        state.delivery_state='needs_review';
        return {rowCount:1};
      }
      if(sql.includes('SET status=$2')&&params){
        state.status=params[1];
        return {rowCount:1};
      }
      throw Error('Unexpected SQL in isolated mock transaction');
    }
  };
  return {
    transact:async callback=>callback(db),
    getStats:()=>({paidWrites,refundWrites})
  };
};

test('dry-run: all server-owned plan prices and devices are immutable',()=>{
  const plans=planCatalog();
  assert.deepEqual(plans.map(x=>[x.id,x.kopeks,x.days,x.deviceLimit]),[
    ['30',9900,30,3],['60',16000,60,3],['90',21900,90,3],
    ['180',33900,180,3],['365',70000,365,3],
    ['365-family',100000,365,6]
  ]);
  assert.equal(nativeCommerceReady({}),false);
});

test('dry-run: verified Clerk primary email only (phone-only signup is allowed)',()=>{
  assert.equal(verifiedPrimaryEmail({
    primaryEmailAddressId:null,emailAddresses:[]
  }),null);
  assert.equal(verifiedPrimaryEmail({
    primaryEmailAddressId:'verified',
    emailAddresses:[
      {id:'unverified',emailAddress:'unverified@example.test',
        verification:{status:'unverified'}},
      {id:'verified',emailAddress:'owner@example.test',
        verification:{status:'verified'}}
    ]
  }),'owner@example.test');
  assert.equal(clerkMobileConfigured({}),false);
});

test('dry-run: anonymous mobile payment endpoints refuse to create orders or leak keys',async()=>{
  const start=await mobileCheckout(new Request(
    'https://test.example.net/.netlify/functions/mobile-checkout',
    {method:'POST',headers:{'content-type':'application/json'},body:'{"plan":"30"}'}
  ));
  assert.equal(start.status,401);
  const check=await mobileOrder(new Request(
    'https://test.example.net/.netlify/functions/mobile-order?order='+orderId,
    {method:'POST'}
  ));
  assert.equal(check.status,401);
});

test('dry-run: provider amount, currency, order and test/live environment are verified',()=>{
  assert.equal(validateNativePayment(orderFixture,fakeProvider),'paid');
  const bad=[
    {...fakeProvider,amount:'98.99'}, // short by a kopek
    {...fakeProvider,amount:'100.00'},
    {...fakeProvider,payment_currency:'USD'},
    {...fakeProvider,order_id:'00000000-0000-4000-8000-000000000000'},
    {...fakeProvider,payment_id:'pay_another_mock_12345678'},
    {...fakeProvider,test:true},
    {...fakeProvider,environment:'sandbox'},
    {...fakeProvider,status:'unknown'}
  ];
  for(const reply of bad)assert.throws(()=>validateNativePayment(orderFixture,reply));
});

test('dry-run: a second paid webhook cannot grant the same purchase twice',async()=>{
  const state={...orderFixture};
  const db=localDryRunTransactor(state);
  const first=await recordNativePayment(orderId,paymentId,
    validateNativePayment(state,fakeProvider),db.transact);
  assert.deepEqual(first,{ok:true});
  assert.equal(state.status,'paid');
  const second=await recordNativePayment(orderId,paymentId,'paid',db.transact);
  assert.deepEqual(second,{duplicate:true});
  assert.equal(db.getStats().paidWrites,1);
  const wrong=await recordNativePayment(orderId,'pay_wrong_12345678','paid',db.transact);
  assert.deepEqual(wrong,{error:'MISMATCH'});
  assert.equal(db.getStats().paidWrites,1);
});

test('dry-run: refunds move an existing paid order to manual review',async()=>{
  const state={...orderFixture,status:'paid'};
  const db=localDryRunTransactor(state);
  assert.deepEqual(await recordNativePayment(orderId,paymentId,'refunded',db.transact),
    {ok:true});
  assert.equal(state.status,'refunded');
  assert.equal(state.delivery_state,'needs_review');
  assert.equal(db.getStats().refundWrites,1);
});

test('dry-run: H1Cloud renewal target is calculated once from latest expiry',()=>{
  const day=86400000,now=2000000000000;
  const target=nativeRenewalTarget({
    nowMs:now,storedExpiryMs:now+10*day,panelExpiryMs:now+8*day,days:30
  });
  assert.equal(target.getTime(),now+40*day);
  // Target is durably written before H1Cloud PATCH; retry must reuse same date.
  const commerce=readFileSync(new URL('../netlify/functions/lib/native-commerce.mjs',import.meta.url),'utf8');
  assert.match(commerce,/const target=await reserveNativeExpiry\(orderId\)/);
  assert.ok(commerce.indexOf('const target=await reserveNativeExpiry(orderId)')<
    commerce.indexOf('result=await fulfillH1(orderId)'));
  assert.match(commerce,/order\.target_expires_at\?new Date\(order\.target_expires_at\)/);
});

test('dry-run: email delivery is after paid-and-delivered state only',()=>{
  const source=readFileSync(new URL('../netlify/functions/lib/native-commerce.mjs',import.meta.url),'utf8');
  assert.match(source,/WHERE id=\$1 AND status='paid' AND delivery_state='delivered'/);
  assert.match(source,/\[order\.delivery_email\]/);
  assert.match(source,/Idempotency-Key/);
  // A claimed browser redirect is never accepted in place of RollyPay API proof.
  const callback=readFileSync(new URL('../netlify/functions/rollypay-live-webhook.mjs',import.meta.url),'utf8');
  assert.match(callback,/verifyRollypaySignature/);
  assert.match(callback,/await fetchPayment\(event\.payment_id\)/);
});
