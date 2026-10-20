import {createHmac,createHash,randomBytes,timingSafeEqual} from 'node:crypto';

export const altCookieName='__Host-vainah_alt';
export const otpCookieName='__Host-vainah_verify';
export const flowCookieName='__Host-vainah_yandex_flow';
export const cooldownCookieName='__Host-vainah_otp_cooldown';

const suffix='; Path=/; Secure; HttpOnly; SameSite=Lax';
const mac=(secret,value)=>createHmac('sha256',secret).update(value,'utf8').digest('hex');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&
  /^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&
  timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));

export function cookie(request,name){
  const found=(request.headers.get('cookie')||'').split(';').map(x=>x.trim())
    .find(x=>x.startsWith(name+'='));
  return found?.slice(name.length+1)||'';
}
export function setCookie(name,value,maxAge=604800){
  return name+'='+value+suffix+'; Max-Age='+maxAge;
}
export function issueSigned(payload,secret){
  if(!secret||secret.length<32)throw Error('SIGNING_KEY_NOT_CONFIGURED');
  const body=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
  return body+'.'+mac(secret,body);
}
export function verifySigned(token,secret,purpose,now=Date.now()){
  if(!secret||secret.length<32||typeof token!=='string'||token.length>2100)return null;
  const match=/^([a-zA-Z0-9_-]+)\.([a-f0-9]{64})$/.exec(token);
  if(!match||!equal(mac(secret,match[1]),match[2]))return null;
  try{
    const data=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));
    if(!data||data.purpose!==purpose||!Number.isSafeInteger(data.exp)||
      data.exp<=Math.floor(now/1000))return null;
    return data;
  }catch{return null}
}
export function identityHash(provider,identifier,secret){
  if(!['phone','email','yandex','clerk'].includes(provider)||!identifier||
    !secret||secret.length<32)throw Error('INVALID_IDENTITY');
  return mac(secret,provider+':'+identifier);
}
export function newAltSession(provider,identifier,secret,now=Date.now()){
  return issueSigned({purpose:'alt-session',provider,
    sub:identityHash(provider,identifier,secret),
    exp:Math.floor(now/1000)+7*86400},secret);
}
export function altSession(request,secret=process.env.SESSION_SIGNING_KEY){
  const value=verifySigned(cookie(request,altCookieName),secret,'alt-session');
  if(!value||!['phone','email','yandex','clerk'].includes(value.provider)||
    !/^[a-f0-9]{64}$/.test(value.sub||''))return null;
  return {provider:value.provider};
}
export function expectedOrigin(env,url){
  try{
    const configured=new URL(env.PUBLIC_SITE_ORIGIN).origin;
    return configured.startsWith('https://')&&new URL(url).origin===configured?configured:null;
  }catch{return null}
}
export function normalizeContact(provider,value){
  if(typeof value!=='string')return null;
  const v=value.trim();
  if(provider==='phone')return /^\+[1-9][0-9]{7,14}$/.test(v)?v:null;
  if(provider==='email'){
    const e=v.toLowerCase();
    return e.length<=254&&/^[^\s@<>]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(e)&&
      !/[\x00-\x1f\x7f]/.test(e)?e:null;
  }
  return null;
}
export function twilioConfigured(env){
  return /^AC[0-9a-fA-F]{32}$/.test(env.TWILIO_ACCOUNT_SID||'')&&
    /^VA[0-9a-fA-F]{32}$/.test(env.TWILIO_VERIFY_SERVICE_SID||'')&&
    typeof env.TWILIO_AUTH_TOKEN==='string'&&env.TWILIO_AUTH_TOKEN.length>15&&
    (env.SESSION_SIGNING_KEY||'').length>=32;
}
export function yandexConfigured(env){
  return typeof env.YANDEX_CLIENT_ID==='string'&&env.YANDEX_CLIENT_ID.length>5&&
    typeof env.YANDEX_CLIENT_SECRET==='string'&&env.YANDEX_CLIENT_SECRET.length>10&&
    (env.SESSION_SIGNING_KEY||'').length>=32;
}
export function publicMethods(env,url){
  const origin=!!expectedOrigin(env,url);
  return {
    phone:origin&&twilioConfigured(env),
    email:origin&&twilioConfigured(env),
    yandex:origin&&yandexConfigured(env),
    telegram:origin&&!!env.TELEGRAM_BOT_TOKEN&&(env.SESSION_SIGNING_KEY||'').length>=32
  };
}
export function randomSecret(){return randomBytes(32).toString('base64url')}
export function pkceChallenge(verifier){return createHash('sha256').update(verifier).digest('base64url')}
