import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{inspectWebhookConfig} from '../netlify/functions/rollypay-webhook-health.mjs';

test('webhook configuration health is read-only GET only',async()=>{
  const result=await handler(new Request('https://example.com/.netlify/functions/rollypay-webhook-health',{method:'POST'}));
  assert.equal(result.status,405);
});
test('missing signing secret reports not configured',()=>{
  assert.deepEqual(inspectWebhookConfig({},Date.now()),{
    ok:false,signingSecretConfigured:false,localSignatureCheck:'not_run',
    providerCallbackVerified:false,liveCheckoutEnabled:false
  });
});
test('locally validates the HMAC implementation without exposing provider secrets',()=>{
  const secret='a private signing secret, not for display';
  const result=inspectWebhookConfig({ROLLYPAY_SIGNING_SECRET:secret},Date.now());
  assert.deepEqual(result,{
    ok:true,signingSecretConfigured:true,localSignatureCheck:'passed',
    providerCallbackVerified:false,liveCheckoutEnabled:false
  });
  assert.equal(JSON.stringify(result).includes(secret),false);
});
test('even with all environment flags, the production kill-switch stays on',()=>{
  const config={ROLLYPAY_SIGNING_SECRET:'correct-only-in-local-self-test',
    VAINAH_LIVE_CHECKOUT:'enabled-after-review'};
  for(const k of ['DATABASE_URL','ROLLYPAY_API_KEY','TELEGRAM_BOT_TOKEN',
    'SESSION_SIGNING_KEY','PANEL_BASE_URL','PANEL_API_TOKEN','PUBLIC_SITE_ORIGIN']){
      config[k]='some-value';
    }
  assert.equal(inspectWebhookConfig(config).liveCheckoutEnabled,false);
});
