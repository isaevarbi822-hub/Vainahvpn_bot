import test from 'node:test';
import assert from 'node:assert/strict';
import {accountStatus} from '../netlify/functions/mobile-account.mjs';
import {verifiedPrimaryEmail,clerkMobileConfigured} from '../netlify/functions/lib/mobile-auth.mjs';

const url='https://vpn.example.test/.netlify/functions/mobile-account';
const env={
  CLERK_PUBLISHABLE_KEY:'pk_test_'+ 'x'.repeat(20),
  CLERK_SECRET_KEY:'sk_test_'+ 'y'.repeat(20),
  SESSION_SIGNING_KEY:'z'.repeat(40),
  PUBLIC_SITE_ORIGIN:'https://vpn.example.test'
};
const req=()=>new Request(url,{headers:{authorization:'Bearer '+ 'a'.repeat(80)}});

test('server account verification is disabled without configured Clerk',async()=>{
  const res=await accountStatus(req(),{});
  assert.equal(res.status,503);
  assert.deepEqual(await res.json(),{
    error:'CLERK_SERVER_SETUP_REQUIRED',authenticated:false,emailVerified:false
  });
  const method=await accountStatus(new Request(url,{method:'POST'}),{});
  assert.equal(method.status,405);
});

test('an invalid or expired session cannot claim email verification',async()=>{
  assert.equal(clerkMobileConfigured(env),true);
  const res=await accountStatus(req(),env,async()=>null);
  assert.equal(res.status,401);
  assert.deepEqual(await res.json(),{authenticated:false,emailVerified:false});
});

test('email is only considered verified after owning Clerk backend confirms it',async()=>{
  const phone=await accountStatus(req(),env,async()=>({provider:'clerk',subject:'f'.repeat(64),email:null}));
  assert.equal(phone.status,200);
  assert.deepEqual(await phone.json(),{
    authenticated:true,emailVerified:false,deliveryEmailRequired:true
  });
  const email=await accountStatus(req(),env,async()=>({provider:'clerk',subject:'f'.repeat(64),email:'verified@example.test'}));
  assert.equal(email.status,200);
  assert.deepEqual(await email.json(),{
    authenticated:true,emailVerified:true,deliveryEmailRequired:true
  });
  assert.equal(verifiedPrimaryEmail({
    primaryEmailAddressId:'email_1',
    emailAddresses:[{id:'email_1',emailAddress:'claimed@example.com',verification:{status:'unverified'}}]
  }),null);
  assert.equal(verifiedPrimaryEmail({
    primaryEmailAddressId:'email_1',
    emailAddresses:[{id:'email_1',emailAddress:'verified@example.com',verification:{status:'verified'}}]
  }),'verified@example.com');
});
