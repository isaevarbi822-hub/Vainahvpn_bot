import {json} from './lib/security.mjs';
import {sameOrigin} from './lib/telegram-identity.mjs';
import {newAltSession,setCookie,altCookieName} from './lib/alternate-auth.mjs';
import {clerkReady} from './lib/clerk-config.mjs';

function respond(data,status=200,cookie=null){
  const response=json(data,status);
  if(cookie)response.headers.set('Set-Cookie',cookie);
  response.headers.set('Cache-Control','no-store');
  return response;
}

/**
 * Clerk-issued JWT is never trusted directly. Backend SDK verifies its signature,
 * expiry, token type and frontend authorized party. No Telegram ID is inferred.
 */
export default async function handler(request){
  if(request.method!=='POST')return respond({error:'Method not allowed'},405);
  if(!sameOrigin(request)||!clerkReady(process.env,request.url))
    return respond({error:'Authentication unavailable'},403);
  const authorization=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]{40,8192}$/.test(authorization))
    return respond({error:'Missing valid session token'},401);
  try{
    const {createClerkClient}=await import('@clerk/backend');
    const client=createClerkClient({
      secretKey:process.env.CLERK_SECRET_KEY,
      publishableKey:process.env.CLERK_PUBLISHABLE_KEY
    });
    const verified=await client.authenticateRequest(request,{
      authorizedParties:[new URL(process.env.PUBLIC_SITE_ORIGIN).origin],
      acceptsToken:'session_token'
    });
    if(!verified.isAuthenticated)
      return respond({error:'Unauthenticated'},401);
    const auth=verified.toAuth();
    const subject=auth.userId;
    if(typeof subject!=='string'||!/^user_[A-Za-z0-9]{10,120}$/.test(subject))
      return respond({error:'Invalid user'},401);
    return respond({authenticated:true,provider:'clerk'},200,
      setCookie(altCookieName,newAltSession('clerk',subject,process.env.SESSION_SIGNING_KEY)));
  }catch{
    return respond({error:'Clerk session could not be verified'},401);
  }
}
