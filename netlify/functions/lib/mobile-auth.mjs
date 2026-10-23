import {identityHash,normalizeContact,issueSigned,verifySigned,twilioConfigured} from './alternate-auth.mjs';

const MAX_BODY=1024;
export function mobileSession(request,secret=process.env.SESSION_SIGNING_KEY) {
  const header=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]{10,2100}$/.test(header))return null;
  const session=verifySigned(header.slice(7),secret,'mobile-session');
  if(!session || !['email','phone'].includes(session.provider) ||
     !/^[a-f0-9]{64}$/.test(session.sub||''))return null;
  if(session.email!==undefined && normalizeContact('email',session.email)!==session.email)return null;
  return {provider:session.provider,subject:session.sub,email:session.email||null};
}
export function makeMobileSession({provider,subject,email=null},secret,now=Date.now()) {
  if(!['email','phone'].includes(provider)||!/^[a-f0-9]{64}$/.test(subject||''))throw Error('INVALID_SUBJECT');
  if(email!==null && normalizeContact('email',email)!==email)throw Error('INVALID_EMAIL');
  return issueSigned({purpose:'mobile-session',provider,sub:subject,
    ...(email?{email}:{}),exp:Math.floor(now/1000)+7*86400},secret);
}
export function nativeChallenge(method,contact,secret,{linkTo=null,now=Date.now()}={}) {
  const normalized=normalizeContact(method,contact);
  if(!normalized)throw Error('INVALID_CONTACT');
  return issueSigned({purpose:'mobile-otp',method,
    sub:identityHash(method,normalized,secret),
    ...(linkTo?{linkTo}:{}),
    exp:Math.floor(now/1000)+600},secret);
}
export function checkChallenge(token,method,contact,secret,linkTo=null) {
  const normalized=normalizeContact(method,contact);
  const data=verifySigned(token,secret,'mobile-otp');
  if(!normalized||!data||data.method!==method||
     data.sub!==identityHash(method,normalized,secret)||
     (data.linkTo||null)!==(linkTo||null))return false;
  return true;
}
export async function twilioVerify({start,method,contact,code},env=process.env,fetcher=fetch) {
  if(!twilioConfigured(env))throw Error('AUTH_PROVIDER_NOT_CONFIGURED');
  const path=start?'Verifications':'VerificationCheck';
  const endpoint='https://verify.twilio.com/v2/Services/'+env.TWILIO_VERIFY_SERVICE_SID+'/'+path;
  const body=new URLSearchParams({To:contact});
  if(start)body.set('Channel',method==='phone'?'sms':'email');
  else body.set('Code',code);
  const reply=await fetcher(endpoint,{method:'POST',headers:{
    Authorization:'Basic '+Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN).toString('base64'),
    'Content-Type':'application/x-www-form-urlencoded'
  },body:body.toString(),signal:AbortSignal.timeout(10000)});
  return {ok:reply.ok,status:reply.status,data:await reply.json().catch(()=>({}))};
}
export async function limitedJson(request) {
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)return null;
  const raw=await request.text();
  if(Buffer.byteLength(raw,'utf8')>MAX_BODY)return null;
  try{const data=JSON.parse(raw);return data&&!Array.isArray(data)&&typeof data==='object'?data:null}catch{return null}
}
