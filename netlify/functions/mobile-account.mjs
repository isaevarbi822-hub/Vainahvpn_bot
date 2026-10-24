import {json} from './lib/security.mjs';
import {clerkMobileConfigured,mobileSession} from './lib/mobile-auth.mjs';

/**
 * Readiness for a native Clerk account. This returns NO phone, email, JWT,
 * key or purchase data. User identity and email verification come from Clerk,
 * not user input. The app can explain why phone-only signups cannot yet pay.
 */
export default async function handler(request) {
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  if(!clerkMobileConfigured())return json({
    error:'CLERK_SERVER_SETUP_REQUIRED',
    authenticated:false,emailVerified:false
  },503);
  const owner=await mobileSession(request);
  if(!owner)return json({authenticated:false,emailVerified:false},401);
  return json({authenticated:true,emailVerified:!!owner.email,
    deliveryEmailRequired:true});
}
