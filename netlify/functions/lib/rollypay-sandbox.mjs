import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

const API='https://rollypay.io/api/v1/payments';
const AMOUNT='10.00'; // Demonstration amount only. ALWAYS sandbox.
const ORDER_PREFIX='vainah-sandbox-';
// RollyPay payment_id is an opaque provider-generated path segment. Do not
// assume a pay_ prefix: SDK/docs also refer to a generic payment UUID.
// Only allow unreserved URL-safe characters and a bounded length.
const PAYMENT_ID=/^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;
// PayForm is /pay/<opaque-token>, not necessarily /pay/tok_<token>.
// Permit one bounded URL-safe path segment only, on the exact RollyPay host.
const PAY_PATH=/^\/pay\/[A-Za-z0-9][A-Za-z0-9_-]{5,255}\/?$/;
const STATES=new Set(['created','processing','paid','canceled','expired']);

export class SandboxError extends Error {
  constructor(code){super(code);this.code=code;}
}
export function sandboxAllowed(userId,env=process.env){
  return /^[1-9][0-9]{0,17}$/.test(String(userId||'')) &&
    String(env.VAINAH_SANDBOX_TELEGRAM_ID||'')===String(userId) &&
    !!env.ROLLYPAY_API_KEY && String(env.SESSION_SIGNING_KEY||'').length>=32;
}
function seal(data,secret){
  const payload=Buffer.from(JSON.stringify(data)).toString('base64url');
  return payload+'.'+createHmac('sha256',secret).update(payload).digest('hex');
}
function unseal(proof,secret,telegramId,now=Date.now()){
  if(typeof proof!=='string'||proof.length>1000)throw new SandboxError('INVALID_TEST_SESSION');
  const match=/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.exec(proof);
  if(!match)throw new SandboxError('INVALID_TEST_SESSION');
  const expected=createHmac('sha256',secret).update(match[1]).digest();
  const supplied=Buffer.from(match[2],'hex');
  if(!timingSafeEqual(expected,supplied))throw new SandboxError('INVALID_TEST_SESSION');
  let data;
  try{data=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'))}
  catch{throw new SandboxError('INVALID_TEST_SESSION')}
  if(data?.id!==telegramId||!Number.isInteger(data.exp)||data.exp<now/1000||
    data.exp>now/1000+7200||
    !PAYMENT_ID.test(data.paymentId||'')||
    !/^vainah-sandbox-[0-9a-f-]{36}$/.test(data.orderId||''))throw new SandboxError('INVALID_TEST_SESSION');
  return data;
}
async function provider(path,method,body,{env,fetcher}){
  const key=String(env.ROLLYPAY_API_KEY||'').trim();
  if(!key)throw new SandboxError('ROLLYPAY_KEY_MISSING');
  let res;
  try{
    res=await fetcher(API+path,{
      method,redirect:'error',cache:'no-store',
      headers:{'X-API-Key':key,'X-Nonce':randomUUID(),Accept:'application/json',
        ...(body?{'Content-Type':'application/json'}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
      signal:AbortSignal.timeout(9000)
    });
  }catch{throw new SandboxError('PROVIDER_UNREACHABLE')}
  // Diagnose HTTP failures before JSON parsing. RollyPay or an upstream proxy
  // can return an HTML/plain-text error page, especially for invalid credentials.
  // Never copy response bodies into logs or API responses (they may contain PII).
  if(!res || typeof res.ok!=='boolean')throw new SandboxError('PROVIDER_INVALID_HTTP_RESPONSE');
  if(!res.ok) {
    const status=Number(res.status);
    if(!Number.isInteger(status)||status<400||status>599)throw new SandboxError('PROVIDER_HTTP_ERROR');
    throw new SandboxError('PROVIDER_HTTP_'+status);
  }
  if(Number(res.headers?.get('content-length')||0)>65536)throw new SandboxError('PROVIDER_RESPONSE_TOO_LARGE');
  let raw;
  try{raw=await res.text()}catch{throw new SandboxError('PROVIDER_RESPONSE_READ_FAILED')}
  if(typeof raw!=='string'||raw.length>65536)throw new SandboxError('PROVIDER_RESPONSE_TOO_LARGE');
  let data;
  try{data=JSON.parse(raw)}catch{throw new SandboxError('PROVIDER_RESPONSE_NOT_JSON')}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new SandboxError('PROVIDER_RESPONSE_FIELDS_INVALID');
  return data;
}
function rubKopeks(value) {
  // Exact integer-kopeck comparison, allowing 10, 10.0 or 10.00.
  if(typeof value!=='string'&&typeof value!=='number')return null;
  const text=String(value);
  if(!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(text))return null;
  const [rub,dec='']=text.split('.');
  return Number(rub)*100+Number(dec.padEnd(2,'0'));
}
function confirmSandbox(data,{orderId,paymentId}={}){
  // Never reveal ID, amount, URL, or raw provider data in diagnostics.
  if(data.test===undefined||data.test===null)
    throw new SandboxError('PROVIDER_TEST_FLAG_MISSING');
  if(data.test!==true)
    throw new SandboxError('PROVIDER_TEST_FLAG_NOT_TRUE');
  if(data.environment===undefined||data.environment===null)
    throw new SandboxError('PROVIDER_ENVIRONMENT_MISSING');
  if(data.environment!=='sandbox')
    throw new SandboxError('PROVIDER_ENVIRONMENT_NOT_SANDBOX');
  if(data.order_id!==orderId)
    throw new SandboxError('PROVIDER_ORDER_MISMATCH');
  const apiCurrency=data.payment_currency,eventCurrency=data.currency;
  if((apiCurrency!==undefined&&apiCurrency!=='RUB')||
     (eventCurrency!==undefined&&eventCurrency!=='RUB')||
     (apiCurrency===undefined&&eventCurrency===undefined))
    throw new SandboxError('PROVIDER_CURRENCY_MISMATCH');
  if(rubKopeks(data.amount)!==rubKopeks(AMOUNT))
    throw new SandboxError('PROVIDER_AMOUNT_MISMATCH');
  if(typeof data.status!=='string'||!STATES.has(data.status))
    throw new SandboxError('PROVIDER_STATUS_INVALID');
  if(paymentId&&data.payment_id!==paymentId)
    throw new SandboxError('PROVIDER_PAYMENT_ID_MISMATCH');
}
export async function createSandboxPayment(telegramId,{env=process.env,fetcher=fetch,now=Date.now()}={}){
  if(!sandboxAllowed(telegramId,env))throw new SandboxError('SANDBOX_NOT_ALLOWED');
  const orderId=ORDER_PREFIX+randomUUID();
  const data=await provider('','POST',{
    amount:AMOUNT,payment_currency:'RUB',order_id:orderId,
    description:'Vainah VPN — только проверка платёжной формы (без выдачи VPN)',
    customer_id:'tg_'+telegramId,
    test:true
  },{env,fetcher});
  confirmSandbox(data,{orderId});
  if(!PAYMENT_ID.test(data.payment_id||''))
    throw new SandboxError(
      typeof data.payment_id !== 'string' || !data.payment_id
        ? 'PROVIDER_PAYMENT_ID_MISSING'
        : 'PROVIDER_PAYMENT_ID_INVALID'
    );
  // The real provider returns a PayForm token in its URL. Do not impose
  // a token prefix not guaranteed by the API; never allow offsite redirects.
  if(typeof data.pay_url!=='string'||!data.pay_url||data.pay_url.length>2048)
    throw new SandboxError('PROVIDER_PAY_URL_MISSING');
  let url;
  try{url=new URL(data.pay_url)}catch{throw new SandboxError('PROVIDER_PAY_URL_MALFORMED')}
  if(url.protocol!=='https:'||url.hostname!=='pay.rollypay.io'||url.port||
    url.username||url.password||url.hash)
    throw new SandboxError('PROVIDER_PAY_URL_UNSAFE_ORIGIN');
  if(!PAY_PATH.test(url.pathname)||url.search)
    throw new SandboxError('PROVIDER_PAY_URL_UNEXPECTED_PATH');
  const proof=seal({id:telegramId,orderId,paymentId:data.payment_id,exp:Math.floor(now/1000)+3600},
    env.SESSION_SIGNING_KEY);
  return {test:true,amountRub:AMOUNT,orderId,payUrl:url.href,proof,status:data.status};
}
export async function checkSandboxPayment(telegramId,proof,{env=process.env,fetcher=fetch,now=Date.now()}={}){
  if(!sandboxAllowed(telegramId,env))throw new SandboxError('SANDBOX_NOT_ALLOWED');
  const ticket=unseal(proof,env.SESSION_SIGNING_KEY,telegramId,now);
  const data=await provider('/'+encodeURIComponent(ticket.paymentId),'GET',null,{env,fetcher});
  confirmSandbox(data,{orderId:ticket.orderId,paymentId:ticket.paymentId});
  return {test:true,orderId:ticket.orderId,status:data.status,amountRub:AMOUNT,
    note:data.status==='paid'?'Тест подтверждён. VPN не изменён.':
      data.status==='canceled'||data.status==='expired'?'Тест завершён без оплаты. VPN не изменён.':
      'Тест ожидает завершения. VPN не изменён.'};
}
