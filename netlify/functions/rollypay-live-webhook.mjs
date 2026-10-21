import {json,verifyRollypaySignature} from './lib/security.mjs';
import {checkoutReady} from './lib/plan-catalog.mjs';
import {validateLiveEvent,validateIndependentPayment} from './lib/rollypay-production-validation.mjs';
import {fetchPayment} from './lib/rollypay-client.mjs';
import {updateVerifiedPayment} from './lib/subscription-db.mjs';
import {fulfillPaidOrder} from './lib/h1-fulfillment.mjs';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!checkoutReady())return json({error:'Production payment processing disabled'},503);
  if(Number(request.headers.get('content-length')||0)>32768)return json({error:'Too large'},413);
  const body=await request.text();
  if(Buffer.byteLength(body,'utf8')>32768)return json({error:'Too large'},413);
  if(!verifyRollypaySignature({
    rawBody:body,timestamp:request.headers.get('x-timestamp'),
    signature:request.headers.get('x-signature'),secret:process.env.ROLLYPAY_SIGNING_SECRET
  }))return json({error:'Invalid signature'},403);
  let event;
  try{event=JSON.parse(body)}catch{return json({error:'Invalid JSON'},400)}
  if(!validateLiveEvent(event))return json({error:'Invalid payment event'},400);
  try{
    // Verify against RollyPay API independently: signed callbacks alone are not treated as fulfillment.
    const verified=await fetchPayment(event.payment_id);
    const confirmed=validateIndependentPayment(event,verified);
    if(!confirmed)return json({error:'Payment provider mismatch'},409);
    const result=await updateVerifiedPayment(confirmed);
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
