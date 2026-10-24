import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {clerkIdentitySubject} from '../netlify/functions/lib/mobile-auth.mjs';
import {
 clerkSandboxEnabled,clerkSandboxOwner,startClerkSandbox,
 checkClerkSandbox,checkClerkSandboxWebhook,verifyClerkSandboxPayment
} from '../netlify/functions/lib/clerk-rollypay-sandbox.mjs';
import sandboxWebhook from '../netlify/functions/clerk-sandbox-webhook.mjs';
import liveWebhook from '../netlify/functions/rollypay-live-webhook.mjs';

const uid='user_1234567890example';
const env={
 VAINAH_ROLLYPAY_SANDBOX:'enabled-for-test',
 VAINAH_SANDBOX_TESTER_CLERK_USER_ID:uid,
 CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(36),
 CLERK_SECRET_KEY:'sk_test_'+'b'.repeat(36),
 SESSION_SIGNING_KEY:'s'.repeat(48),
 PUBLIC_SITE_ORIGIN:'https://vpn.example.test',
 ROLLYPAY_API_KEY:'rpk_fake_for_unit_tests',
 ROLLYPAY_SIGNING_SECRET:'h'.repeat(40),
 VAINAH_LIVE_CHECKOUT:'',VAINAH_PAYMENT_INTEGRATION_VERIFIED:''
};
const owner={provider:'clerk',subject:clerkIdentitySubject(uid,env.SESSION_SIGNING_KEY),email:null};
const sandboxReply=(orderId)=>({
 payment_id:'pay_sandbox_test_123456789',order_id:orderId,
 amount:'10.00',payment_currency:'RUB',status:'created',
 test:true,environment:'sandbox',
 pay_url:'https://pay.rollypay.io/pay/tok_sandbox123456'
});
function providerMock(outcome='created'){
 const requests=[];
 let original;
 const mock=async (url,args)=>{
   requests.push({url,body:args.body?JSON.parse(args.body):null});
   if(args.method==='POST'){
     const body=JSON.parse(args.body);
     original=sandboxReply(body.order_id);
     return {ok:true,status:200,json:async()=>({...original,...(outcome==='wrong_test'?{test:false}:{})})};
   }
   return {ok:true,status:200,json:async()=>({...original,status:outcome==='wrong_test'?'created':outcome})};
 };
 return {requests,mock,getOriginal:()=>original};
}
test('real provider sandbox is opt-in, scoped to exactly one Clerk owner',()=>{
 assert.equal(clerkSandboxEnabled({}),false);
 assert.equal(clerkSandboxEnabled({...env,VAINAH_ROLLYPAY_SANDBOX:''}),false);
 assert.equal(clerkSandboxEnabled(env),true);
 assert.equal(clerkSandboxOwner(owner,env),true);
 assert.equal(clerkSandboxOwner({...owner,subject:'b'.repeat(64)},env),false);
 assert.equal(clerkSandboxOwner({...owner,provider:'telegram'},env),false);
});
test('sandbox creates an actual RollyPay TEST invoice, never a live one',async()=>{
 const p=providerMock();
 const result=await startClerkSandbox(owner,env,p.mock);
 assert.equal(p.requests.length,1);
 assert.equal(p.requests[0].body.test,true);
 assert.equal(p.requests[0].body.amount,'10.00');
 assert.equal(p.requests[0].body.payment_method,'sbp');
 assert.equal(result.noCharge,true);
 assert.equal(result.noVpnGranted,true);
 assert.match(result.payUrl,/^https:\/\/pay\.rollypay\.io\/pay\//);
 assert.ok(result.proof);
 assert.ok(p.requests[0].body.order_id.startsWith('vnsb_'));
 // A second anonymous user cannot query receipt belonging to another Clerk owner.
 await assert.rejects(()=>checkClerkSandbox({...owner,subject:'f'.repeat(64)},result.proof,env,p.mock));
});
test('sandbox checks paid status directly against provider without fulfillment',async()=>{
 const p=providerMock();
 const result=await startClerkSandbox(owner,env,p.mock);
 p.mock=async (url,args)=>{
   if(args.method==='GET')return {ok:true,status:200,json:async()=>({...p.getOriginal(),status:'paid'})};
   throw Error('Unwanted API operation');
 };
 const paid=await checkClerkSandbox(owner,result.proof,env,p.mock);
 assert.deepEqual(paid,{sandbox:true,noCharge:true,noVpnGranted:true,
   status:'paid',amountRub:'10.00'});
 const tampered=result.proof.slice(0,-1)+(result.proof.endsWith('0')?'1':'0');
 await assert.rejects(()=>checkClerkSandbox(owner,tampered,env,p.mock));
});
test('missing or non-sandbox provider markers always reject',async()=>{
 const p=providerMock('wrong_test');
 await assert.rejects(()=>startClerkSandbox(owner,env,p.mock),/SANDBOX_PROVIDER_MISMATCH/);
 const valid=sandboxReply('vnsb_12345678-1234-4234-8234-123456789012');
 for(const invalid of [
 {...valid,test:false},{...valid,environment:'production'},
 {...valid,amount:'11.00'},{...valid,payment_currency:'EUR'},
 {...valid,payment_id:'pay_different123456'}
 ]){
  assert.throws(()=>verifyClerkSandboxPayment(invalid,valid.order_id,valid.payment_id));
 }
});
test('signed sandbox webhooks are independently checked and never grant VPN',async()=>{
 const orderId='vnsb_12345678-1234-4234-8234-123456789012';
 const payId='pay_sandbox_test_123456789';
 const event={order_id:orderId,payment_id:payId,event_type:'payment.paid',
   amount:'10.00',status:'paid',currency:'RUB',test:true};
 const fake=async ()=>({ok:true,json:async()=>({
   ...sandboxReply(orderId),status:'paid',payment_id:payId
 })});
 assert.deepEqual(await checkClerkSandboxWebhook(event,env,fake),
 {ok:true,sandbox:true,status:'paid',accessGranted:false});
 await assert.rejects(()=>checkClerkSandboxWebhook({...event,test:false},env,fake));
});
test('sandbox callback rejects unsigned events and production callback remains closed',async()=>{
 const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 Object.assign(process.env,env);
 try{
  const body=JSON.stringify({order_id:'vnsb_12345678-1234-4234-8234-123456789012',
    payment_id:'pay_sandbox_test_123456789',event_type:'payment.paid',
    amount:'10.00',status:'paid',currency:'RUB',test:true});
  const timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',env.ROLLYPAY_SIGNING_SECRET)
   .update(timestamp+'.'+body).digest('hex');
  const headers={'x-test-mode':'true','x-timestamp':timestamp,
    'x-signature':'f'.repeat(64),'content-type':'application/json'};
  const bad=await sandboxWebhook(new Request('https://vpn.example.test/hook',
    {method:'POST',headers,body}));
  assert.equal(bad.status,403);
  const prod=await liveWebhook(new Request('https://vpn.example.test/hook',
    {method:'POST',headers:{...headers,'x-test-mode':'false'},body}));
  assert.equal(prod.status,503);
 }finally{
  for(const [key,value] of Object.entries(previous)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
