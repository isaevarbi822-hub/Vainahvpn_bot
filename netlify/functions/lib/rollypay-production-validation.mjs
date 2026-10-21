/**
 * Pure production RollyPay callback checks.
 * NO provider requests, NO charge creation, NO credential reads.
 * Preserve strict fail-closed behavior until separately reviewed.
 */
import {parseRubPrice} from './plan-catalog.mjs';
import {validPaymentId} from './rollypay-identifiers.mjs';

const allowed=new Set(['created','processing','paid','canceled','expired','refunded','chargeback']);
const orderId=/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i;

export function validateLiveEvent(event){
  if(!event||typeof event!=='object'||Array.isArray(event)||
     event.test!==false||typeof event.order_id!=='string'||
     !orderId.test(event.order_id)||!validPaymentId(event.payment_id)||
     !allowed.has(event.status))return false;
  if(!(event.event_type===`payment.${event.status}` ||
       (event.event_type==='refund_request.completed'&&event.status==='refunded')))
    return false;
  // RollyPay callback docs include currency + amount for real payments.
  // Do not trust callback as payment confirmation; separately query API.
  return event.currency==='RUB'&&parseRubPrice(event.amount)!==null;
}
export function validateIndependentPayment(event,provider){
  if(!validateLiveEvent(event)||!provider||typeof provider!=='object'||
     provider.order_id!==event.order_id||
     provider.payment_id!==event.payment_id||
     provider.payment_currency!=='RUB'||
     provider.status!==event.status||
     provider.test===true||provider.environment==='sandbox')return null;
  const amount=parseRubPrice(String(provider.amount??''));
  if(amount===null||amount!==parseRubPrice(event.amount))return null;
  // DB must separately match order's saved payment ID, RUB and exact amount.
  return {orderId:event.order_id,paymentId:event.payment_id,
    status:provider.status,amountKopeks:amount,currency:'RUB'};
}
