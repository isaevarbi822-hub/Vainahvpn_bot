import {json} from './lib/security.mjs';
import {clerkMobileConfigured,mobileSession} from './lib/mobile-auth.mjs';

/**
 * Readiness for a native Clerk account. This returns NO phone, email, JWT,
 * key or purchase data. User identity and email verification come from Clerk,
 * not user input. The app can explain why phone-only signups cannot yet pay.
 */
export async function accountStatus(request,env=process.env,readSession=mobileSession) {
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(!clerkMobileConfigured(env))return json({
    error:'CLERK_SERVER_SETUP_REQUIRED',
    authenticated:false,emailVerified:false
  },503);
  const owner=await readSession(request,env);
  if(!owner)return json({authenticated:false,emailVerified:false},401);
  return json({authenticated:true,emailVerified:!!owner.email,
    deliveryEmailRequired:true});
}
export default function handler(request){
  return accountStatus(request);
}
