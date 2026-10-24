import {json,verifyRollypaySignature} from './lib/security.mjs';
import clerkSandboxWebhook from './clerk-sandbox-webhook.mjs';
import {checkoutReady,parseRubPrice} from './lib/plan-catalog.mjs';
import {fetchPayment} from './lib/rollypay-client.mjs';
import {validPaymentId} from './lib/rollypay-identifiers.mjs';
import {updateVerifiedPayment,getInternalOrder} from './lib/subscription-db.mjs';
import {validateProductionPayment} from './lib/reconcile-rollypay-order.mjs';
import {fulfillPaidOrder} from './lib/h1-fulfillment.mjs';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  // Provider callbacks for TEST payments use the SAME configured terminal URL.
  // They are verified separately and can NEVER reach the production ledger.
  if(request.headers.get('x-test-mode')==='true')
    return clerkSandboxWebhook(request);
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
  if(!event||event.test!==false||typeof event.order_id!=='string' ||
    !/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(event.order_id) ||
    !validPaymentId(event.payment_id)) return json({error:'Invalid payment event'},400);
  const statuses=['paid','created','processing','canceled','expired','refunded','chargeback'];
  if(!statuses.includes(event.status)||!(event.event_type===`payment.${event.status}` || (event.event_type==='refund_request.completed' && event.status==='refunded')))return json({error:'Inconsistent payment event'},400);
  try{
    // Verify against RollyPay API independently: signed callbacks alone are not treated as fulfillment.
    const verified=await fetchPayment(event.payment_id);
    const amount=parseRubPrice(String(verified.amount||''));
    const order=await getInternalOrder(event.order_id);
    try {validateProductionPayment(order,verified);}
    catch {return json({error:'Payment provider mismatch'},409);}
    if(verified.status!==event.status || amount===null ||
       verified.payment_id!==event.payment_id){
      return json({error:'Payment provider mismatch'},409);
    }
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
