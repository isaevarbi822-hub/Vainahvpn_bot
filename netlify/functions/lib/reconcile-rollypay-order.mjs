import {parseRubPrice} from './plan-catalog.mjs';
import {validPaymentId} from './rollypay-identifiers.mjs';
import {fetchPayment} from './rollypay-client.mjs';
import {getInternalOrder,updateVerifiedPayment} from './subscription-db.mjs';
import {fulfillPaidOrder} from './h1-fulfillment.mjs';

const PAYMENT_STATES=new Set(['created','processing','paid','canceled','expired','refunded','chargeback']);

/**
 * Independently fetched provider data, not a browser redirect or client claims,
 * is authoritative. Missing optional provider.test on GET is supported, but
 * an explicit test payment or sandbox environment can never activate service.
 */
export function validateProductionPayment(order,payment) {
  if(!order || order.provider!=='rollypay' || order.is_test!==false ||
     typeof order.id!=='string' || !validPaymentId(order.payment_id) ||
     !payment || typeof payment!=='object' ||
     payment.payment_id!==order.payment_id ||
     payment.order_id!==order.id ||
     payment.payment_currency!=='RUB' ||
     parseRubPrice(String(payment.amount??''))!==Number(order.amount_kopeks) ||
     !PAYMENT_STATES.has(payment.status) ||
     (payment.test!==undefined && payment.test!==false) ||
     (payment.environment!==undefined && payment.environment!=='production')){
    throw Error('ROLLYPAY_VERIFICATION_MISMATCH');
  }
  return payment.status;
}

export async function reconcileRollypayOrder(orderId){
  const order=await getInternalOrder(orderId);
  if(!order || order.is_test!==false || order.provider!=='rollypay')return {state:'ignored'};
  if(order.status==='paid'){
    if(order.delivery_state==='delivered')return {state:'delivered'};
    return {state:'paid',delivery:await fulfillPaidOrder(orderId)};
  }
  if(!['awaiting_payment','canceled','expired'].includes(order.status) || !validPaymentId(order.payment_id))
    return {state:'ignored'};
  const payment=await fetchPayment(order.payment_id);
  const status=validateProductionPayment(order,payment);
  const update=await updateVerifiedPayment({
    orderId:order.id,paymentId:order.payment_id,status,
    amountKopeks:Number(order.amount_kopeks),currency:'RUB'
  });
  if(update.error)throw Error('ROLLYPAY_LEDGER_MISMATCH');
  if(status==='paid'){
    return {state:'paid',delivery:await fulfillPaidOrder(orderId)};
  }
  return {state:status};
}
