import {json,verifyRollypaySignature} from './lib/security.mjs';
import {checkoutReady,parseRubPrice} from './lib/plan-catalog.mjs';
import {fetchPayment} from './lib/rollypay-client.mjs';
import {validPaymentId} from './lib/rollypay-identifiers.mjs';
import {updateVerifiedPayment} from './lib/subscription-db.mjs';
import {fulfillPaidOrder} from './lib/h1-fulfillment.mjs';
import {nativeCommerceReady,readNativeOrder,validateNativePayment,recordNativePayment,fulfillNativePaidOrder} from './lib/native-commerce.mjs';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  // Website and Clerk-native merchant readiness are independent:
  // a mobile receipt must not be rejected merely because Telegram Login is off.
  if(!checkoutReady() && !nativeCommerceReady())
    return json({error:'Production payment processing disabled'},503);
  if(Number(request.headers.get('content-length')||0)>32768)return json({error:'Too large'},413);
  const body=await request.text();
  if(Buffer.byteLength(body,'utf8')>32768)return json({error:'Too large'},413);
  if(!verifyRollypaySignature({
    rawBody:body,timestamp:request.headers.get('x-timestamp'),
    signature:request.headers.get('x-signature'),secret:process.env.ROLLYPAY_SIGNING_SECRET
  }))return json({error:'Invalid signature'},403);
  let event;
  try{event=JSON.parse(body)}catch{return json({error:'Invalid JSON'},400)}
  if(!event||event.test!==false||typeof event.order_id!=='string' ||
    !/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(event.order_id) ||
    !validPaymentId(event.payment_id)) return json({error:'Invalid payment event'},400);
  const statuses=['paid','created','processing','canceled','expired','refunded','chargeback'];
  if(!statuses.includes(event.status)||!(event.event_type===`payment.${event.status}` || (event.event_type==='refund_request.completed' && event.status==='refunded')))return json({error:'Inconsistent payment event'},400);
  try{
    // Verify against RollyPay API independently: signed callbacks alone are not treated as fulfillment.
    const verified=await fetchPayment(event.payment_id);
    const amount=parseRubPrice(String(verified.amount||''));
    if(verified.order_id!==event.order_id || verified.payment_id!==event.payment_id ||
       verified.payment_currency!=='RUB' || amount===null ||
       verified.status!==event.status || verified.test===true || verified.environment==='sandbox'){
      return json({error:'Payment provider mismatch'},409);
    }
    // New mobile orders are separate from Telegram IDs and entitlements.
    // Native transactions must match the provider and stored invoice exactly.
    const native=await readNativeOrder(event.order_id);
    if(native){
      if(!nativeCommerceReady())
        return json({error:'Native payment processing disabled'},503);
      try {validateNativePayment(native,verified)}
      catch{return json({error:'Mobile payment provider mismatch'},409)}
      if(verified.status!==event.status || amount!==Number(native.amount_kopeks))
        return json({error:'Mobile payment amount mismatch'},409);
      const saved=await recordNativePayment(event.order_id,event.payment_id,verified.status);
      if(saved.error)return json({error:'Mobile ledger mismatch'},409);
      if(verified.status==='paid'){
        const delivered=await fulfillNativePaidOrder(event.order_id);
        if(delivered.delivery==='retry_required')
          return json({error:'Mobile delivery pending retry',paymentRecorded:true},503);
        return json({ok:true,mobile:true,delivery:delivered.delivery});
      }
      return json({ok:true,mobile:true,status:verified.status});
    }
    if(!checkoutReady())return json({error:'Website payment processing disabled'},503);
    const result=await updateVerifiedPayment({
      orderId:event.order_id,paymentId:event.payment_id,
      status:verified.status,amountKopeks:amount,currency:'RUB'
    });
    if(result.error)return json({error:result.error},409);
    if(verified.status==='paid') {
      const delivery=await fulfillPaidOrder(event.order_id);
      if(delivery.delivery==='retry_required'){
        // Payment is safely persisted; ask provider to retry notification later.
        return json({error:'Delivery pending retry',paymentRecorded:true},503);
      }
      return json({ok:true,delivery:delivery.delivery});
    }
    return json({ok:true,status:verified.status});
  }catch(error){
    console.error('RollyPay webhook verification or database failed:',error?.name||'Error');
    return json({error:'Temporary processing error'},503);
  }
}
