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
/**
 * Keep auth failures private. The only values allowed in Netlify logs are
 * fixed diagnostic labels; never include JWT, Clerk IDs, token claims or SDK
 * error messages, which may contain private data.
 */
const clerkRejectionReasons=new Set([
  'token-expired',
  'token-invalid-issuer',
  'token-invalid-signature',
  'token-invalid-authorized-parties',
  'token-not-active-yet',
  'token-iat-in-the-future',
  'session-token-missing',
  'session-token-expired',
  'session-token-invalid',
  'session-token-unsupported',
  'session-token-revoked',
  'session-token-not-active-yet',
  'signed-out'
]);
export function safeClerkRejectionLabel(reason){
  return clerkRejectionReasons.has(reason)?reason:'session-not-accepted';
}
/**
 * JWT claims are *unverified* here and only used to log a yes/no mismatch.
 * ALL authentication and user ownership continue to depend exclusively on
 * Clerk's cryptographic authenticateRequest() result.
 */
export function nativeAuthorizedPartyMismatch(bearer,origins) {
  if(typeof bearer!=='string'||bearer.length>8192||!Array.isArray(origins))return false;
  try{
    const parts=bearer.split('.');
    if(parts.length!==3||parts[1].length>4096)return false;
    const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return typeof claims?.azp==='string'&&
      claims.azp.length>0&&!origins.includes(claims.azp);
  }catch{return false;}
}

/**
 * Clerk Native API can issue session JWTs with no azp/Origin claim.
 * Recognize ONLY this absence, never an unexpected non-empty azp.
 *
 * This reads untrusted claims to select a verification path; it does not
 * authenticate anything. The selected path must still verify Clerk's
 * signature, issuer, expiry and active session before any user is returned.
 * Native endpoints accept explicit Bearer tokens only (no cookies or Origin).
 */
export function nativeBearerOmitsAzp(request,authorization){
  if(typeof authorization!=='string'||
     !/^Bearer [A-Za-z0-9._-]{40,8192}$/.test(authorization)||
     request.headers.has('cookie')||
     request.headers.has('origin')||
     request.headers.has('sec-fetch-site'))return false;
  try{
    const jwt=authorization.slice(7);
    const parts=jwt.split('.');
    if(parts.length!==3||!parts.every(p=>p.length>0)||parts[1].length>4096)
      return false;
    const data=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
    return !!data && typeof data==='object' && !Array.isArray(data) &&
      (data.azp===undefined||data.azp===null);
  }catch{return false;}
}

export async function mobileSession(request,env=process.env,clientOverride=null){
  if(!clerkMobileConfigured(env))return null;
  const authorization=request.headers.get('authorization')||'';
  if(!authorization)return null; // Anonymous browser probes are normal.
  if(!/^Bearer [A-Za-z0-9._-]{40,8192}$/.test(authorization)){
    console.warn('Clerk mobile authentication: bearer-format-invalid');
    return null;
  }
  try{
    const {createClerkClient}=clientOverride?{}:await import('@clerk/backend');
    const client=clientOverride||createClerkClient({
      secretKey:env.CLERK_SECRET_KEY,publishableKey:env.CLERK_PUBLISHABLE_KEY
    });
    // Always enforce configured origins on normal Clerk sessions.
    const origins=String(env.CLERK_AUTHORIZED_PARTIES||env.PUBLIC_SITE_ORIGIN)
      .split(',').map(x=>x.trim()).filter(Boolean);
    if(!origins.length)return null;
    let verified=await client.authenticateRequest(request,{
      authorizedParties:origins,acceptsToken:'session_token'
    });
    if(!verified.isAuthenticated &&
       verified.reason==='token-invalid-authorized-parties' &&
       nativeBearerOmitsAzp(request,authorization)){
      // Native API Bearer JWTs have no browser Origin/azp to compare against.
      // Only on this narrow path, Clerk verifies the complete session token
      // without the browser-specific azp allowlist. This MUST NOT accept a
      // cookie, browser Origin, or a different/non-empty azp claim.
      const nativeVerified=await client.authenticateRequest(request,{
        acceptsToken:'session_token'
      });
      if(nativeVerified.isAuthenticated){
        verified=nativeVerified;
        console.info('Clerk mobile authentication: native-bearer-without-azp-verified');
      }else{
        console.warn('Clerk mobile authentication:',
          safeClerkRejectionLabel(nativeVerified.reason));
        return null;
      }
    }
    if(!verified.isAuthenticated){
      console.warn('Clerk mobile authentication:',
        safeClerkRejectionLabel(verified.reason));
      if(nativeAuthorizedPartyMismatch(authorization.slice(7),origins))
        console.warn('Clerk mobile authentication: authorized-party-origin-mismatch');
      return null;
    }
    const userId=verified.toAuth()?.userId;
    const subject=clerkIdentitySubject(userId,env.SESSION_SIGNING_KEY);
    const profile=await client.users.getUser(userId);
    if(!profile||profile.id!==userId||profile.banned===true||profile.locked===true){
      console.warn('Clerk mobile authentication: user-not-active');
      return null;
    }
    return {provider:'clerk',subject,email:verifiedPrimaryEmail(profile)};
  }catch{
    console.warn('Clerk mobile authentication: backend-verification-failed');
    return null;
  }
}
export async function limitedJson(request){
  if(Number(request.headers.get('content-length')||0)>1024)return null;
  const raw=await request.text();
  if(Buffer.byteLength(raw,'utf8')>1024)return null;
  try{const data=JSON.parse(raw);return data&&!Array.isArray(data)&&typeof data==='object'?data:null}
  catch{return null}
}
