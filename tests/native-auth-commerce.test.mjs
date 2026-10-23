import test from 'node:test';
import assert from 'node:assert/strict';
import auth from '../netlify/functions/mobile-auth.mjs';
import checkout from '../netlify/functions/mobile-checkout.mjs';
import {mobileSession,clerkMobileConfigured,clerkIdentitySubject,verifiedPrimaryEmail} from '../netlify/functions/lib/mobile-auth.mjs';
import {nativeCommerceReady,validateNativePayment} from '../netlify/functions/lib/native-commerce.mjs';

const fakeEnv={
  CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(35),
  CLERK_SECRET_KEY:'sk_test_'+'b'.repeat(35),
  PUBLIC_SITE_ORIGIN:'https://vpn.example.test',
  SESSION_SIGNING_KEY:'v'.repeat(48)
};
const id='user_123456789012345678';
const sampleUser={
 id,primaryEmailAddressId:'em_verified',
 emailAddresses:[
   {id:'em_verified',emailAddress:'Buyer@Example.com',verification:{status:'verified'}},
   {id:'em_unverified',emailAddress:'attacker@example.com',verification:{status:'unverified'}}
 ]
};
const request=(bearer='eyJ.'+'a'.repeat(110)+'.'+'b'.repeat(60))=>
 new Request('https://vpn.example.test/.netlify/functions/mobile-auth',
  {headers:{Authorization:'Bearer '+bearer}});
const mockClient=(verified=true,user=sampleUser)=>({
 authenticateRequest:async (_request,opts)=>{
   assert.equal(opts.acceptsToken,'session_token');
   assert.deepEqual(opts.authorizedParties,[fakeEnv.PUBLIC_SITE_ORIGIN]);
   return {isAuthenticated:verified,toAuth:()=>({userId:id})};
 },
 users:{getUser:async()=>user}
});

test('Clerk backend fails closed without matching instance or secret',()=>{
 assert.equal(clerkMobileConfigured({}),false);
 assert.equal(clerkMobileConfigured({...fakeEnv,CLERK_SECRET_KEY:'sk_live_bad'}),false);
 assert.equal(clerkMobileConfigured(fakeEnv),true);
 assert.notEqual(clerkIdentitySubject(id,fakeEnv.SESSION_SIGNING_KEY),
  clerkIdentitySubject(id,'z'.repeat(48)));
 assert.throws(()=>clerkIdentitySubject('fake',fakeEnv.SESSION_SIGNING_KEY));
});

test('Only a Clerk-verified primary email may receive a purchased VPN',()=>{
 assert.equal(verifiedPrimaryEmail(sampleUser),'buyer@example.com');
 assert.equal(verifiedPrimaryEmail({
  ...sampleUser,emailAddresses:[
   {id:'em_verified',emailAddress:'Buyer@Example.com',verification:{status:'unverified'}}
  ]
 }),null);
 assert.equal(verifiedPrimaryEmail({...sampleUser,primaryEmailAddressId:'em_unverified'}),null);
});

test('Verified Clerk session belongs to a single user, no user-supplied email',async()=>{
 const customer=await mobileSession(request(),fakeEnv,mockClient());
 assert.deepEqual(customer,{
  provider:'clerk',subject:clerkIdentitySubject(id,fakeEnv.SESSION_SIGNING_KEY),
  email:'buyer@example.com'
 });
 assert.equal(await mobileSession(request(),fakeEnv,mockClient(false)),null);
 assert.equal(await mobileSession(request(),fakeEnv,mockClient(true,{
   ...sampleUser,id:'user_ANOTHER_ID_1234567890'
 })),null);
 assert.equal(await mobileSession(new Request('https://vpn.example.test'),fakeEnv,mockClient()),null);
 assert.equal(await mobileSession(request(),fakeEnv,mockClient(true,{
   ...sampleUser,emailAddresses:[],primaryEmailAddressId:null
 })).then(x=>x?.email),null);
});

test('Legacy OTP endpoints cannot mint a competing session or send Twilio messages',async()=>{
 const response=await auth(new Request('https://vpn.example.test/.netlify/functions/mobile-auth',{
  method:'POST',body:JSON.stringify({action:'send',method:'email',contact:'me@example.com'})
 }));
 assert.equal(response.status,405);
 assert.equal((await response.json()).error.includes('Clerk'),true);
});

test('Mobile checkout with no Clerk bearer never creates invoices',async()=>{
 const anon=await checkout(new Request('https://vpn.example.test/.netlify/functions/mobile-checkout',{
  method:'POST',body:JSON.stringify({plan:'30'})}));
 assert.equal(anon.status,401);
 assert.equal(nativeCommerceReady({}),false);
});

test('RollyPay confirmation still requires exact order, amount and live environment',()=>{
 const order={id:'5b117019-452e-4de4-a83f-ad9248c4fb7b',
  payment_id:'pay_12345678',provider:'rollypay',currency:'RUB',amount_kopeks:21900};
 const p={payment_id:order.payment_id,order_id:order.id,payment_currency:'RUB',
  amount:'219.00',status:'paid',test:false};
 assert.equal(validateNativePayment(order,p),'paid');
 for(const invalid of [{...p,amount:'99.00'},{...p,order_id:'fake'},
  {...p,test:true},{...p,environment:'sandbox'},
  {...p,payment_currency:'USD'},{...p,status:'unknown'}])
  assert.throws(()=>validateNativePayment(order,invalid));
});
