import test from 'node:test';
import assert from 'node:assert/strict';
import {clerkIdentitySubject} from '../netlify/functions/lib/mobile-auth.mjs';
import {
  startClerkSandbox,sandboxProviderFailureCode
} from '../netlify/functions/lib/clerk-rollypay-sandbox.mjs';

const userId='user_1234567890example';
const env={
 VAINAH_ROLLYPAY_SANDBOX:'enabled-for-test',
 VAINAH_SANDBOX_TESTER_CLERK_USER_ID:userId,
 CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(36),
 CLERK_SECRET_KEY:'sk_test_'+'b'.repeat(36),
 SESSION_SIGNING_KEY:'x'.repeat(48),
 PUBLIC_SITE_ORIGIN:'https://vpn.example.test',
 ROLLYPAY_API_KEY:'hidden-key-can-never-appear-in-logs',
 ROLLYPAY_SIGNING_SECRET:'s'.repeat(40)
};
const owner={provider:'clerk',
  subject:clerkIdentitySubject(userId,env.SESSION_SIGNING_KEY)};

test('RollyPay HTTP rejections are not confused with transport outages',async()=>{
 for(const httpStatus of [400,401,403,404,422,429,500,502,503,504]){
   let jsonRead=false;
   const mock=async (url,opts)=>{
     assert.equal(url,'https://rollypay.io/api/v1/payments');
     assert.equal(opts.method,'POST');
     assert.equal(opts.headers['X-API-Key'],env.ROLLYPAY_API_KEY);
     assert.equal(JSON.parse(opts.body).test,true);
     return {ok:false,status:httpStatus,
       json:async()=>{jsonRead=true;return {secret:env.ROLLYPAY_API_KEY}},
       text:async()=>{jsonRead=true;return 'merchant secret';}};
   };
   await assert.rejects(()=>startClerkSandbox(owner,env,mock),error=>{
     const expected='SANDBOX_PROVIDER_HTTP_'+httpStatus;
     assert.equal(error.message,expected);
     assert.equal(sandboxProviderFailureCode(error),expected);
     return true;
   });
   assert.equal(jsonRead,false,'must never read rejected upstream body');
 }
});
test('unexpected provider statuses and arbitrary error text do not leak internals',async()=>{
 const errorBody='private API token is '+env.ROLLYPAY_API_KEY;
 for(const [status,expected] of [
   [418,'SANDBOX_PROVIDER_HTTP_OTHER'],
   [301,'SANDBOX_PROVIDER_HTTP_OTHER']
 ]){
   const mock=async()=>({ok:false,status,text:async()=>errorBody});
   await assert.rejects(()=>startClerkSandbox(owner,env,mock),error=>{
     assert.equal(sandboxProviderFailureCode(error),expected);
     assert.ok(!error.message.includes(env.ROLLYPAY_API_KEY));
     return true;
   });
 }
 for(const message of [errorBody,'SANDBOX_PROVIDER_HTTP_1234',
   'unexpected: some query and full URL']){
   assert.equal(sandboxProviderFailureCode(Error(message)),
     'SANDBOX_PROVIDER_UNKNOWN');
 }
});
test('network, timeout, invalid provider response remain distinct safe failures',async()=>{
 const transports=[
  [async()=>{throw Error('private TLS URL and keys')},'SANDBOX_PROVIDER_NETWORK'],
  [async()=>{const e=Error('private timeout');e.name='TimeoutError';throw e;},'SANDBOX_PROVIDER_TIMEOUT'],
  [async()=>({ok:true,status:200,json:async()=>{throw Error('body has token')}}),
   'SANDBOX_PROVIDER_RESPONSE_INVALID'],
  [async()=>({ok:true,status:200,json:async()=>['invalid']}),
   'SANDBOX_PROVIDER_RESPONSE_INVALID'],
  [async()=>({ok:false}), 'SANDBOX_PROVIDER_BAD_HTTP']
 ];
 for(const [mock,expected] of transports){
  await assert.rejects(()=>startClerkSandbox(owner,env,mock),error=>{
   assert.equal(error.message,expected);
   assert.equal(sandboxProviderFailureCode(error),expected);
   return true;
  });
 }
});
test('the sandbox never creates a live invoice on retry',async()=>{
 let calls=0;
 const mock=async(_url,opts)=>{
   calls++;
   assert.equal(JSON.parse(opts.body).test,true);
   return {ok:false,status:401};
 };
 await assert.rejects(()=>startClerkSandbox(owner,env,mock),/SANDBOX_PROVIDER_HTTP_401/);
 assert.equal(calls,1);
});
