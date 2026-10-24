import {json,verifyRollypaySignature} from './lib/security.mjs';
import {clerkSandboxEnabled,checkClerkSandboxWebhook} from './lib/clerk-rollypay-sandbox.mjs';

/** Sandbox callback: verifies signature and provider, NEVER provisions VPN. */
export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!clerkSandboxEnabled())return json({error:'Sandbox disabled'},503);
  if(Number(request.headers.get('content-length')||0)>32768)
    return json({error:'Too large'},413);
  const raw=await request.text();
  if(Buffer.byteLength(raw,'utf8')>32768)return json({error:'Too large'},413);
  if(request.headers.get('x-test-mode')!=='true')
    return json({error:'Only sandbox events allowed'},403);
  if(!verifyRollypaySignature({
    rawBody:raw,timestamp:request.headers.get('x-timestamp'),
    signature:request.headers.get('x-signature'),
    secret:process.env.ROLLYPAY_SIGNING_SECRET
  }))return json({error:'Invalid signature'},403);
  let event;
  try{event=JSON.parse(raw)}catch{return json({error:'Invalid JSON'},400)}
  try{return json(await checkClerkSandboxWebhook(event))}
  catch{return json({error:'Sandbox verification mismatch'},409)}
}
