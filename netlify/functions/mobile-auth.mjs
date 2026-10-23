import {json} from './lib/security.mjs';
import {mobileSession,clerkMobileConfigured} from './lib/mobile-auth.mjs';

// Clerk owns OTP verification. Never run a second SMS or email provider.
export default async function handler(request){
  if(request.method!=='GET')return json({
    error:'Используй Clerk SDK для входа по email или телефону.'
  },405);
  if(!clerkMobileConfigured())return json({authenticated:false,available:false});
  const session=await mobileSession(request);
  return json({authenticated:!!session,provider:session?.provider||null,
    emailVerified:!!session?.email,available:true});
}
