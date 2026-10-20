import {createHmac} from 'node:crypto';
import {json,verifyRollypaySignature} from './lib/security.mjs';
import {checkoutReady} from './lib/plan-catalog.mjs';

/**
 * Read-only configuration test. Never accepts a payment payload, sends a
 * request to RollyPay, or accesses customer orders.
 * This proves only that Netlify has a secret and the local HMAC verifier works.
 * A real callback from RollyPay is still needed to validate that the secret
 * matches the provider's signing_secret.
 */
export function inspectWebhookConfig(env=process.env,now=Date.now()){
  const secret=env.ROLLYPAY_SIGNING_SECRET;
  const configured=typeof secret==='string'&&secret.trim().length>0;
  let localSignatureCheck='not_run';
  if(configured){
    const timestamp=String(Math.floor(now/1000));
    const body='{"probe":"config-only","test":true}';
    const signature=createHmac('sha256',secret)
      .update(timestamp+'.'+body,'utf8').digest('hex');
    const valid=verifyRollypaySignature({
      rawBody:body,timestamp,signature,secret,now
    });
    const tampered=verifyRollypaySignature({
      rawBody:body+' ',timestamp,signature,secret,now
    });
    localSignatureCheck=valid&&!tampered?'passed':'failed';
  }
  const enabled=checkoutReady(env);
  return {
    ok:configured&&localSignatureCheck==='passed',
    signingSecretConfigured:configured,
    localSignatureCheck,
    providerCallbackVerified:false,
    liveCheckoutEnabled:enabled
  };
}
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const state=inspectWebhookConfig();
  return json(state,state.ok?200:503);
}
