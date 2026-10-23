import test from 'node:test';
import assert from 'node:assert/strict';
import {validateProductionPayment} from '../netlify/functions/lib/reconcile-rollypay-order.mjs';
import {checkoutReady} from '../netlify/functions/lib/plan-catalog.mjs';

const order={id:'5c843713-2f4a-49c9-9e35-388a2dc36671',provider:'rollypay',
  is_test:false,payment_id:'pay_123456789abc',amount_kopeks:9900};
const payment={payment_id:order.payment_id,order_id:order.id,amount:'99.00',
  payment_currency:'RUB',status:'paid',test:false};

test('only matching provider payment can confirm production subscription',()=>{
 assert.equal(validateProductionPayment(order,payment),'paid');
 assert.equal(validateProductionPayment(order,{...payment,test:undefined}),'paid');
 for(const bad of [
   {...payment,amount:'1.00'}, {...payment,order_id:'different'},
   {...payment,payment_id:'pay_different'}, {...payment,payment_currency:'USD'},
   {...payment,test:true}, {...payment,test:'true'},
   {...payment,environment:'sandbox'}, {...payment,environment:'unknown'},
   {...payment,status:'unknown'}
 ])assert.throws(()=>validateProductionPayment(order,bad),/VERIFICATION_MISMATCH/);
 assert.throws(()=>validateProductionPayment({...order,is_test:true},payment),/VERIFICATION_MISMATCH/);
});

test('live checkout stays closed without both operator approvals and secrets',()=>{
 const env={
   DATABASE_URL:'postgres://example.invalid/db',ROLLYPAY_API_KEY:'testing-placeholder',
   ROLLYPAY_SIGNING_SECRET:'x'.repeat(32),TELEGRAM_BOT_TOKEN:'12345:token',
   SESSION_SIGNING_KEY:'y'.repeat(48),PANEL_BASE_URL:'https://panel.example.test',
   PANEL_API_TOKEN:'example',PUBLIC_SITE_ORIGIN:'https://vpn.example.test',
   VAINAH_LIVE_CHECKOUT:'enabled-after-review',
   VAINAH_PAYMENT_INTEGRATION_VERIFIED:'verified-on-production'
 };
 assert.equal(checkoutReady(env),true);
 assert.equal(checkoutReady({...env,VAINAH_PAYMENT_INTEGRATION_VERIFIED:''}),false);
 assert.equal(checkoutReady({...env,VAINAH_LIVE_CHECKOUT:'true'}),false);
 assert.equal(checkoutReady({...env,PANEL_API_TOKEN:''}),false);
 assert.equal(checkoutReady({...env,PUBLIC_SITE_ORIGIN:'http://vpn.example.test'}),false);
 assert.equal(checkoutReady({...env,SESSION_SIGNING_KEY:'weak'}),false);
});
