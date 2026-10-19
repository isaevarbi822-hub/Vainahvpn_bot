import {json,verifyRollypaySignature} from './lib/security.mjs';
import {checkoutReady,parseRubPrice} from './lib/plan-catalog.mjs';
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
  if(!event||event.test!==false||typeof event.order_id!=='string' ||
    !/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(event.order_id) ||
    !/^pay_[a-zA-Z0-9_-]{8,100}$/.test(event.payment_id||'')) return json({error:'Invalid payment event'},400);
  const statuses=['paid','created','processing','canceled','expired','refunded','chargeback'];
  if(!statuses.includes(event.status)||event.event_type!==`payment.${event.status}`)return json({error:'Inconsistent payment event'},400);
  try{
    // Verify against RollyPay API independently: signed callbacks alone are not treated as fulfillment.
    const verified=await fetchPayment(event.payment_id);
    const amount=parseRubPrice(String(verified.amount||''));
    if(verified.order_id!==event.order_id || verified.payment_id!==event.payment_id ||
       verified.payment_currency!=='RUB' || amount===null ||
       verified.status!==event.status || verified.test===true || verified.environment==='sandbox'){
      return json({error:'Payment provider mismatch'},409);
    }
    const result=await updateVerifiedPayment({
      orderId:event.order_id,paymentId:event.payment_id,
      status:verified.status,amountKopeks:amount,currency:'RUB'
    });
    if(result.error)return json({error:result.error},409);
    if(verified.status==='paid') {
      const delivery=await fulfillPaidOrder(event.order_id);
      return json({ok:true,delivery:delivery.delivery});
    }
    return json({ok:true,status:verified.status});
  }catch(error){
    console.error('RollyPay webhook verification or database failed:',error?.name||'Error');
    return json({error:'Temporary processing error'},503);
  }
}
