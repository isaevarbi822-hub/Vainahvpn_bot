import {json} from './lib/security.mjs';
import {clerkPublicConfig} from './lib/clerk-config.mjs';

/** Public config exposes only the publishable (by-design public) key. */
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const response=json(clerkPublicConfig(process.env,request.url));
  response.headers.set('Cache-Control','no-store');
  return response;
}
