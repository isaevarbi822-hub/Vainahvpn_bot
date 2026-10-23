import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../netlify/functions/mobile-auth.mjs';
import checkout from '../netlify/functions/mobile-checkout.mjs';
import {mobileSession,makeMobileSession,nativeChallenge,checkChallenge} from '../netlify/functions/lib/mobile-auth.mjs';
import {nativeCommerceReady,validateNativePayment} from '../netlify/functions/lib/native-commerce.mjs';
import {identityHash} from '../netlify/functions/lib/alternate-auth.mjs';
import {equalHash} from '../netlify/functions/mobile-link.mjs';
import {createHash} from 'node:crypto';

const signing='v'.repeat(48);
const sender='me@example.com';
const subject=identityHash('email',sender,signing);
test('native OTP challenge is signed and tied to only one contact',()=>{
 const challenge=nativeChallenge('email',sender,signing);
 assert.equal(checkChallenge(challenge,'email',sender,signing),true);
 assert.equal(checkChallenge(challenge,'email','other@example.com',signing),false);
 assert.equal(checkChallenge(challenge,'phone','+4798765432',signing),false);
 assert.equal(checkChallenge(challenge+'x','email',sender,signing),false);
 const link=nativeChallenge('email',sender,signing,{linkTo:subject});
 assert.equal(checkChallenge(link,'email',sender,signing,subject),true);
 assert.equal(checkChallenge(link,'email',sender,signing,null),false);
});
test('signed native bearer token is authenticated without trusting a supplied provider name',()=>{
 const token=makeMobileSession({provider:'email',subject,email:sender},signing);
 const good=new Request('https://vpn.example.test/.netlify/functions/mobile-auth',
   {headers:{Authorization:'Bearer '+token}});
 assert.deepEqual(mobileSession(good,signing),{provider:'email',subject,email:sender});
 assert.equal(mobileSession(new Request(good.url),signing),null);
 assert.equal(mobileSession(new Request(good.url,{headers:{Authorization:'Bearer '+token+'x'}}),signing),null);
});
test('mobile checkout never creates charges for unverified email or anonymous visitors',async()=>{
 const before=process.env.SESSION_SIGNING_KEY,enabled=process.env.VAINAH_NATIVE_CHECKOUT;
 process.env.SESSION_SIGNING_KEY=signing;
 process.env.VAINAH_NATIVE_CHECKOUT='approved-after-test';
 try{
   const anonymous=await checkout(new Request('https://vpn.example.test/.netlify/functions/mobile-checkout',{
     method:'POST',body:JSON.stringify({plan:'30'})}));
   assert.equal(anonymous.status,401);
   const token=makeMobileSession({provider:'phone',subject:identityHash('phone','+4798765432',signing)},signing);
   const user=await checkout(new Request('https://vpn.example.test/.netlify/functions/mobile-checkout',{
     method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({plan:'30'})}));
   assert.equal(user.status,403);
   assert.equal(nativeCommerceReady({}),false);
 }finally{
  if(before===undefined)delete process.env.SESSION_SIGNING_KEY;
  else process.env.SESSION_SIGNING_KEY=before;
  if(enabled===undefined)delete process.env.VAINAH_NATIVE_CHECKOUT;
  else process.env.VAINAH_NATIVE_CHECKOUT=enabled;
 }
});
test('paid native order must exactly match independent payment-provider confirmation',()=>{
 const order={id:'5b117019-452e-4de4-a83f-ad9248c4fb7b',payment_id:'pay_12345678',
    provider:'rollypay',currency:'RUB',amount_kopeks:21900};
 const p={payment_id:order.payment_id,order_id:order.id,payment_currency:'RUB',
     amount:'219.00',status:'paid',test:false};
 assert.equal(validateNativePayment(order,p),'paid');
 for(const invalid of [
   {...p,amount:'99.00'}, {...p,order_id:'fake'}, {...p,test:true},
   {...p,environment:'sandbox'}, {...p,payment_currency:'USD'},
   {...p,status:'unknown'}
 ])assert.throws(()=>validateNativePayment(order,invalid));
});
test('native SMS/email auth never accepts provider-unapproved checks',async()=>{
 const keys=['TWILIO_ACCOUNT_SID','TWILIO_VERIFY_SERVICE_SID','TWILIO_AUTH_TOKEN',
  'SESSION_SIGNING_KEY','PUBLIC_SITE_ORIGIN'];
 const saved=Object.fromEntries(keys.map(x=>[x,process.env[x]]));
 const fetcher=globalThis.fetch;
 Object.assign(process.env,{
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),TWILIO_VERIFY_SERVICE_SID:'VA'+'a'.repeat(32),
  TWILIO_AUTH_TOKEN:'t'.repeat(30),SESSION_SIGNING_KEY:signing,
  PUBLIC_SITE_ORIGIN:'https://vpn.example.test'
 });
 globalThis.fetch=async(url,init)=> {
   assert.match(String(url),/verify.twilio.com/);
   const form=new URLSearchParams(init.body);
   return new Response(JSON.stringify({status:form.has('Code')?'pending':'pending',
     to:form.get('To')}),{status:200,headers:{'content-type':'application/json'}});
 };
 try{
   const url='https://vpn.example.test/.netlify/functions/mobile-auth';
   const send=await auth(new Request(url,{method:'POST',body:JSON.stringify({
     action:'send',method:'email',contact:sender})}));
   assert.equal(send.status,200);
   const challenge=(await send.json()).challenge;
   assert.ok(challenge);
   const check=await auth(new Request(url,{method:'POST',body:JSON.stringify({
     action:'check',method:'email',contact:sender,code:'123456',challenge})}));
   assert.equal(check.status,403);
 }finally{
   globalThis.fetch=fetcher;
   for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});

test('one-use browser pairing uses hashed polling secret and provider-bound Telegram subject',()=>{
 const secret='a'.repeat(64),hash=createHash('sha256').update(secret).digest('hex');
 assert.equal(equalHash(hash,hash),true);
 assert.equal(equalHash(hash,'0'.repeat(64)),false);
 assert.equal(equalHash(hash,null),false);
 const tgId='123456789';
 const subject=identityHash('telegram',tgId,signing);
 const token=makeMobileSession({provider:'telegram',subject,telegramId:tgId},signing);
 const request=new Request('https://vpn.example.test/.netlify/functions/mobile-link',
   {headers:{authorization:'Bearer '+token}});
 assert.equal(mobileSession(request,signing).telegramId,tgId);
 assert.throws(()=>makeMobileSession({provider:'telegram',subject,telegramId:'987654321'},signing));
 const yandex=makeMobileSession({provider:'yandex',
   subject:identityHash('yandex','yandex-example-id',signing)},signing);
 const yandexRequest=new Request(request.url,{headers:{authorization:'Bearer '+yandex}});
 assert.equal(mobileSession(yandexRequest,signing).provider,'yandex');
});
