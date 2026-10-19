import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';

const API='https://rollypay.io/api/v1/payments';
const AMOUNT='10.00'; // Demonstration amount only. ALWAYS sandbox.
const ORDER_PREFIX='vainah-sandbox-';
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
    !/^pay_[A-Za-z0-9_-]{8,100}$/.test(data.paymentId||'')||
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
  if(Number(res.headers?.get('content-length')||0)>65536)throw new SandboxError('PROVIDER_RESPONSE_INVALID');
  let data;
  try{
    const raw=await res.text();
    if(raw.length>65536)throw Error('Oversized response');
    data=JSON.parse(raw);
  }catch{throw new SandboxError('PROVIDER_RESPONSE_INVALID')}
  if(!res.ok){
    // Never return provider payload: it can contain private merchant diagnostics.
    throw new SandboxError('PROVIDER_HTTP_'+res.status);
  }
  if(!data||typeof data!=='object')throw new SandboxError('PROVIDER_RESPONSE_INVALID');
  return data;
}
function confirmSandbox(data,{orderId,paymentId}={}){
  if(data.test!==true||data.environment!=='sandbox'||
    data.order_id!==orderId||data.payment_currency!=='RUB'||
    data.amount!==AMOUNT||typeof data.status!=='string'||!STATES.has(data.status)||
    (paymentId&&data.payment_id!==paymentId)){
    throw new SandboxError('PROVIDER_SANDBOX_MISMATCH');
  }
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
  if(!/^pay_[A-Za-z0-9_-]{8,100}$/.test(data.payment_id||''))
    throw new SandboxError('PROVIDER_RESPONSE_INVALID');
  let url;
  try{url=new URL(data.pay_url)}catch{throw new SandboxError('PROVIDER_RESPONSE_INVALID')}
  if(url.protocol!=='https:'||url.hostname!=='pay.rollypay.io'||
     url.username||url.password||url.hash||url.port||!url.pathname.startsWith('/pay/'))
    throw new SandboxError('PROVIDER_RESPONSE_INVALID');
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
