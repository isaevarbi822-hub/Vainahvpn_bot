import {parseRubPrice} from './plan-catalog.mjs';
import {randomUUID} from 'node:crypto';
const API='https://rollypay.io/api/v1/payments';
async function requestRollypay(path,options={}) {
  const key=process.env.ROLLYPAY_API_KEY;
  if(!key) throw Error('ROLLYPAY_API_KEY_MISSING');
  const res=await fetch(API+path,{
    ...options,
    headers:{'X-API-Key':key,'X-Nonce':randomUUID(),'Content-Type':'application/json',...(options.headers||{})},
    signal:AbortSignal.timeout(9500)
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) {
    console.error('RollyPay HTTP:',res.status); // Never log keys, PII or payment URL.
    throw Error('ROLLYPAY_HTTP_'+res.status);
  }
  return data;
}
export async function createInvoice({orderId,amountKopeks,telegramId,description}) {
  const origin=process.env.PUBLIC_SITE_ORIGIN;
  if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin||'')) throw Error('SITE_ORIGIN_INVALID');
  const amount=(amountKopeks/100).toFixed(2);
  const data=await requestRollypay('',{
    method:'POST',body:JSON.stringify({
      order_id:orderId,amount,payment_currency:'RUB',
      customer_id:'tg_'+telegramId,
      description,
      success_redirect_url:origin+'/payment-result.html?order='+encodeURIComponent(orderId),
      fail_redirect_url:origin+'/payment-result.html?order='+encodeURIComponent(orderId),
      test:false
    })
  });
  // RollyPay's documented create response omits the optional test field.
  if(data.test===true || data.environment==='sandbox' || data.order_id!==orderId || data.payment_currency!=='RUB'||parseRubPrice(String(data.amount??''))!==amountKopeks) {
    throw Error('ROLLYPAY_INVOICE_MISMATCH');
  }
  if(typeof data.payment_id!=='string'||!/^pay_[\w-]{8,100}$/.test(data.payment_id))throw Error('ROLLYPAY_BAD_PAYMENT_ID');
  if(typeof data.pay_url!=='string')throw Error('ROLLYPAY_BAD_PAYMENT_URL');
  const url=new URL(data.pay_url);
  if(url.protocol!=='https:'||url.hostname!=='pay.rollypay.io'||url.port||url.username||url.password||url.search||url.hash||!/^\/pay\/[a-zA-Z0-9_-]{6,256}\/?$/.test(url.pathname))throw Error('ROLLYPAY_BAD_PAYMENT_URL');
  return {paymentId:data.payment_id,payUrl:data.pay_url};
}
export async function fetchPayment(paymentId) {
  if(!/^pay_[\w-]{8,100}$/.test(paymentId||'')) throw Error('INVALID_PAYMENT_ID');
  return requestRollypay('/'+encodeURIComponent(paymentId));
}
