import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {clerkMobileConfigured,clerkIdentitySubject} from './mobile-auth.mjs';
import {validPaymentId,PAY_URL_PATH_PATTERN} from './rollypay-identifiers.mjs';

const API='https://rollypay.io/api/v1/payments';
const AMOUNT='10.00';
const AMOUNT_KOPEKS=1000;
const ORDER_PREFIX='vnsb_';
const STATES=new Set(['created','processing','paid','canceled','expired']);

export function clerkSandboxEnabled(env=process.env){
  return env.VAINAH_ROLLYPAY_SANDBOX==='enabled-for-test' &&
    clerkMobileConfigured(env) && !!String(env.ROLLYPAY_API_KEY||'').trim() &&
    !!String(env.ROLLYPAY_SIGNING_SECRET||'').trim() &&
    /^user_[a-zA-Z0-9]{10,120}$/.test(env.VAINAH_SANDBOX_TESTER_CLERK_USER_ID||'');
}
export function clerkSandboxOwner(owner,env=process.env){
  if(!clerkSandboxEnabled(env)||owner?.provider!=='clerk')return false;
  try{return owner.subject===clerkIdentitySubject(
    env.VAINAH_SANDBOX_TESTER_CLERK_USER_ID,env.SESSION_SIGNING_KEY);
  }catch{return false;}
}
function mac(text,secret){
  return createHmac('sha256',secret).update('vainah-clerk-sandbox-v1:'+text).digest();
}
function receipt(data,owner,env,now=Date.now()){
  const payload=Buffer.from(JSON.stringify({v:1,...data,
    owner:owner.subject,exp:now+3600000})).toString('base64url');
  return payload+'.'+mac(payload,env.SESSION_SIGNING_KEY).toString('hex');
}
function openReceipt(proof,owner,env,now=Date.now()){
  if(typeof proof!=='string'||proof.length>3000)return null;
  const match=/^([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.exec(proof);
  if(!match)return null;
  const valid=mac(match[1],env.SESSION_SIGNING_KEY);
  if(!timingSafeEqual(valid,Buffer.from(match[2],'hex')))return null;
  try{
    const data=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));
    if(data.v!==1||data.owner!==owner.subject||
      !Number.isSafeInteger(data.exp)||data.exp<now||data.exp>now+3600000||
      typeof data.orderId!=='string'||!/^vnsb_[a-f0-9-]{36}$/.test(data.orderId)||
      !validPaymentId(data.paymentId)||data.amountKopeks!==AMOUNT_KOPEKS)
      return null;
    return data;
  }catch{return null;}
}
export function verifyClerkSandboxPayment(data,orderId,paymentId){
  if(data?.test!==true||data?.environment!=='sandbox' ||
    data?.order_id!==orderId ||
    (paymentId && data.payment_id!==paymentId) ||
    data?.payment_currency!=='RUB' ||
    String(data.amount??'')!==AMOUNT ||
    !STATES.has(data.status))throw Error('SANDBOX_PROVIDER_MISMATCH');
  return data.status;
}
async function requestProvider(path,method,body,env,fetcher){
  const res=await fetcher(API+path,{
    method,redirect:'error',cache:'no-store',
    headers:{'X-API-Key':env.ROLLYPAY_API_KEY,
      'X-Nonce':randomUUID(),'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(9000)
  });
  if(!res?.ok)throw Error('SANDBOX_PROVIDER_UNAVAILABLE');
  const data=await res.json().catch(()=>null);
  if(!data||typeof data!=='object'||Array.isArray(data))
    throw Error('SANDBOX_PROVIDER_RESPONSE_INVALID');
  return data;
}
function exactPayUrl(input){
  if(typeof input!=='string'||input.length>2048)throw Error('SANDBOX_PAY_URL_MISSING');
  const url=new URL(input);
  if(url.protocol!=='https:'||url.hostname!=='pay.rollypay.io'||
    url.port||url.username||url.password||url.search||url.hash||
    !PAY_URL_PATH_PATTERN.test(url.pathname))throw Error('SANDBOX_PAY_URL_INVALID');
  return url.href;
}
export async function startClerkSandbox(owner,env=process.env,fetcher=fetch){
  if(!clerkSandboxOwner(owner,env))throw Error('SANDBOX_FORBIDDEN');
  const orderId=ORDER_PREFIX+randomUUID();
  const body={
    amount:AMOUNT,payment_currency:'RUB',payment_method:'sbp',
    order_id:orderId,customer_id:'vnsb_'+owner.subject.slice(0,24),
    description:'Vainah VPN - ТЕСТ без реальной оплаты и VPN',
    success_redirect_url:env.PUBLIC_SITE_ORIGIN+'/mobile-payment-result.html',
    fail_redirect_url:env.PUBLIC_SITE_ORIGIN+'/mobile-payment-result.html',
    test:true
  };
  const p=await requestProvider('','POST',body,env,fetcher);
  if(!validPaymentId(p.payment_id))throw Error('SANDBOX_PROVIDER_ID_INVALID');
  verifyClerkSandboxPayment(p,orderId,p.payment_id);
  const payUrl=exactPayUrl(p.pay_url);
  return {sandbox:true,noCharge:true,noVpnGranted:true,amountRub:AMOUNT,
    orderId,payUrl,proof:receipt({orderId,paymentId:p.payment_id,
      amountKopeks:AMOUNT_KOPEKS},owner,env)};
}
export async function checkClerkSandbox(owner,proof,env=process.env,fetcher=fetch){
  if(!clerkSandboxOwner(owner,env))throw Error('SANDBOX_FORBIDDEN');
  const data=openReceipt(proof,owner,env);
  if(!data)throw Error('SANDBOX_PROOF_INVALID');
  const result=await requestProvider('/'+encodeURIComponent(data.paymentId),
    'GET',null,env,fetcher);
  const status=verifyClerkSandboxPayment(result,data.orderId,data.paymentId);
  return {sandbox:true,noCharge:true,noVpnGranted:true,status,amountRub:AMOUNT};
}
/**
 * Acknowledge a signed sandbox callback, after independently rechecking
 * RollyPay. No writes to DB or H1Cloud, no key dispatch, no real fulfillment.
 */
export async function checkClerkSandboxWebhook(event,env=process.env,fetcher=fetch){
  if(!clerkSandboxEnabled(env)||event?.test!==true||
    typeof event.order_id!=='string'||!/^vnsb_[a-f0-9-]{36}$/.test(event.order_id)||
    !validPaymentId(event.payment_id)||!STATES.has(event.status)||
    event.event_type!=='payment.'+event.status||
    event.currency!=='RUB'||String(event.amount)!==AMOUNT)
    throw Error('SANDBOX_EVENT_INVALID');
  const provider=await requestProvider('/'+encodeURIComponent(event.payment_id),
    'GET',null,env,fetcher);
  if(provider.status!==event.status)throw Error('SANDBOX_EVENT_STATUS_CHANGED');
  verifyClerkSandboxPayment(provider,event.order_id,event.payment_id);
  return {ok:true,sandbox:true,status:event.status,accessGranted:false};
}
