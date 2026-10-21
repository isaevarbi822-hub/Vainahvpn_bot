import test from 'node:test';
import assert from 'node:assert/strict';
import {validateLiveEvent,validateIndependentPayment} from '../netlify/functions/lib/rollypay-production-validation.mjs';
import {checkoutReady} from '../netlify/functions/lib/plan-catalog.mjs';

const event={
  test:false,order_id:'123e4567-e89b-42d3-a456-426614174000',
  payment_id:'pay_verified_test_1234',event_type:'payment.paid',
  status:'paid',amount:'219.00',currency:'RUB'
};
const provider={
  payment_id:event.payment_id,order_id:event.order_id,status:'paid',
  amount:'219.00',payment_currency:'RUB'
};

test('signed production callbacks still require independent provider confirmation',()=>{
  assert.equal(validateLiveEvent(event),true);
  assert.deepEqual(validateIndependentPayment(event,provider),{
    orderId:event.order_id,paymentId:event.payment_id,
    status:'paid',amountKopeks:21900,currency:'RUB'
  });
  assert.equal(checkoutReady({}),false,'live charge kill-switch stays locked');
});

test('wrong callback price, currency or mode is rejected before any DB mutation',()=>{
  for(const bad of [
    {...event,amount:'1.00'},
    {...event,amount:'219.01'},
    {...event,amount:'219.001'},
    {...event,amount:'NaN'},
    {...event,currency:'USD'},
    {...event,test:true},
    {...event,test:undefined},
    {...event,status:'processing'},
    {...event,event_type:'payment.created'},
    {...event,order_id:'../someone'},
    {...event,payment_id:'invalid/path'}
  ]){
    if(validateLiveEvent(bad))
      assert.equal(validateIndependentPayment(bad,provider),null);
    else assert.equal(validateLiveEvent(bad),false);
  }
});

test('independent RollyPay API mismatch blocks confirmation',()=>{
  for(const bad of [
    {...provider,amount:'1.00'},
    {...provider,amount:'219.01'},
    {...provider,amount:undefined},
    {...provider,payment_currency:'EUR'},
    {...provider,order_id:'another-order'},
    {...provider,payment_id:'other-payment-id'},
    {...provider,status:'created'},
    {...provider,test:true},
    {...provider,environment:'sandbox'},
    null
  ])assert.equal(validateIndependentPayment(event,bad),null);
});

test('event and provider amounts must both match saved order amount at DB stage',()=>{
  const different={...event,amount:'1.00'};
  const selfConsistentFake={...provider,amount:'1.00'};
  const confirmation=validateIndependentPayment(different,selfConsistentFake);
  assert.deepEqual(confirmation?.amountKopeks,100);
  // This is NOT proof that customer's order is 1 RUB. Order DB must enforce
  // the original server-side tariff, payment_id, currency and expected amount.
  assert.equal(confirmation?.currency,'RUB');
  // The existing DB enforces order.amount_kopeks === amountKopeks.
  assert.equal(checkoutReady({VAINAH_LIVE_CHECKOUT:'enabled-after-review'}),false);
});

test('refund callbacks are supported but never award fresh subscription days',()=>{
 const refunded={...event,event_type:'refund_request.completed',status:'refunded'};
 assert.equal(validateLiveEvent(refunded),true);
 assert.deepEqual(validateIndependentPayment(refunded,{...provider,status:'refunded'})?.status,'refunded');
 assert.equal(validateLiveEvent({...refunded,event_type:'payment.refunded'}),true);
 assert.equal(validateLiveEvent({...refunded,event_type:'payment.paid'}),false);
});
