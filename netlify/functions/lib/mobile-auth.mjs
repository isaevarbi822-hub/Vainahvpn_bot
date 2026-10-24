import {createHmac} from 'node:crypto';

// Clerk is the ONLY account authority for mobile purchases. No local OTP,
// fabricated SMS/email code, unsigned identity or Telegram fallback.
/** Only variable NAMES may be logged; never credential values. */
export function clerkConfigurationProblems(env=process.env){
  const issues=[];
  const pk=String(env.CLERK_PUBLISHABLE_KEY||'');
  const sk=String(env.CLERK_SECRET_KEY||'');
  const mode=/^pk_(test|live)_[A-Za-z0-9_-]{18,}$/.exec(pk)?.[1];
  if(!mode)issues.push('CLERK_PUBLISHABLE_KEY');
  const skValid=/^sk_(test|live)_[A-Za-z0-9_-]{18,}$/.test(sk);
  if(!skValid || !mode || !sk.startsWith('sk_'+mode+'_'))
    issues.push('CLERK_SECRET_KEY (same environment as publishable key)');
  if(typeof env.SESSION_SIGNING_KEY!=='string'||env.SESSION_SIGNING_KEY.length<32)
    issues.push('SESSION_SIGNING_KEY (minimum 32 characters)');
  try{
    const origin=new URL(env.PUBLIC_SITE_ORIGIN);
    if(origin.protocol!=='https:'||origin.origin!==env.PUBLIC_SITE_ORIGIN)
      issues.push('PUBLIC_SITE_ORIGIN (exact HTTPS origin)');
  }catch{issues.push('PUBLIC_SITE_ORIGIN (exact HTTPS origin)')}
  return issues;
}

export function clerkMobileConfigured(env=process.env){
  const pk=String(env.CLERK_PUBLISHABLE_KEY||'');
  const sk=String(env.CLERK_SECRET_KEY||'');
  const match=/^pk_(test|live)_[A-Za-z0-9_-]{18,}$/.exec(pk);
  if(!match||!new RegExp('^sk_'+match[1]+'_[A-Za-z0-9_-]{18,}$').test(sk))return false;
  if(!env.SESSION_SIGNING_KEY||env.SESSION_SIGNING_KEY.length<32)return false;
  try{
    const site=new URL(env.PUBLIC_SITE_ORIGIN);
    return site.protocol==='https:' && site.origin===env.PUBLIC_SITE_ORIGIN;
  }catch{return false}
}
export function clerkIdentitySubject(userId,secret){
  if(typeof userId!=='string'||!/^(user_)[a-zA-Z0-9]{10,120}$/.test(userId)||
    typeof secret!=='string'||secret.length<32)throw Error('INVALID_CLERK_USER');
  return createHmac('sha256',secret).update('clerk:'+userId,'utf8').digest('hex');
}
export function verifiedPrimaryEmail(user){
  const primary=(user?.emailAddresses||[]).find(x=>
    x.id===user.primaryEmailAddressId && x.verification?.status==='verified');
  const email=String(primary?.emailAddress||'').trim().toLowerCase();
  return email.length<=254 && /^[^\s@<>]{1,64}@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(email)
    ? email : null;
}
/**
 * Verifies Clerk session JWT and retrieves its OWN user from Clerk backend.
 * A client cannot claim an email by sending it in the request body.
 * Pass a configured @clerk/backend client in tests only.
 */
export async function mobileSession(request,env=process.env,clientOverride=null){
  if(!clerkMobileConfigured(env))return null;
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]{40,8192}$/.test(authorization))return null;
  try{
    const {createClerkClient}=clientOverride?{}:await import('@clerk/backend');
    const client=clientOverride||createClerkClient({
      secretKey:env.CLERK_SECRET_KEY,publishableKey:env.CLERK_PUBLISHABLE_KEY
    });
    const origins=String(env.CLERK_AUTHORIZED_PARTIES||env.PUBLIC_SITE_ORIGIN)
      .split(',').map(x=>x.trim()).filter(Boolean);
    if(!origins.length)return null;
    const verified=await client.authenticateRequest(request,{
      authorizedParties:origins,acceptsToken:'session_token'
    });
    if(!verified.isAuthenticated)return null;
    const userId=verified.toAuth()?.userId;
    const subject=clerkIdentitySubject(userId,env.SESSION_SIGNING_KEY);
    const profile=await client.users.getUser(userId);
    if(!profile||profile.id!==userId||profile.banned===true||profile.locked===true)return null;
    return {provider:'clerk',subject,email:verifiedPrimaryEmail(profile)};
  }catch{return null}
}
export async function limitedJson(request){
  if(Number(request.headers.get('content-length')||0)>1024)return null;
  const raw=await request.text();
  if(Buffer.byteLength(raw,'utf8')>1024)return null;
  try{const data=JSON.parse(raw);return data&&!Array.isArray(data)&&typeof data==='object'?data:null}
  catch{return null}
}
