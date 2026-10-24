import test from 'node:test';
import assert from 'node:assert/strict';
import {clerkMobileConfigured,clerkIdentitySubject,mobileSession,
  safeClerkRejectionLabel,nativeAuthorizedPartyMismatch
} from '../netlify/functions/lib/mobile-auth.mjs';
import {accountStatus} from '../netlify/functions/mobile-account.mjs';

const env={
  CLERK_PUBLISHABLE_KEY:'pk_test_'+'p'.repeat(28),
  CLERK_SECRET_KEY:'sk_test_'+'s'.repeat(28),
  SESSION_SIGNING_KEY:'q'.repeat(48),
  PUBLIC_SITE_ORIGIN:'https://vainahvpnbot0.netlify.app'
};
const uid='user_abcdefghijklmnopq12345';
const bearer=(azp)=>{
 const part=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
 return part({alg:'RS256',typ:'JWT'})+'.'+part({
    sub:uid,iss:'https://clerk.example.test',
    iat:1800000000,exp:1800000300,azp
 })+'.'+part({sig:'only-for-logs-never-trust'});
};
const makeRequest=(jwt)=>new Request(
 'https://vainahvpnbot0.netlify.app/.netlify/functions/mobile-account',
 {headers:{authorization:'Bearer '+jwt}}
);
const capture=async execute=>{
 const old=console.warn,records=[];
 console.warn=(...items)=>records.push(items.map(String).join(' '));
 try {return {response:await execute(),records}}
 finally{console.warn=old}
};
test('Clerk logs fixed categories only, not untrusted arbitrary exception messages',()=>{
 assert.equal(safeClerkRejectionLabel('token-invalid-authorized-parties'),
   'token-invalid-authorized-parties');
 assert.equal(safeClerkRejectionLabel('token-invalid-issuer'),'token-invalid-issuer');
 assert.equal(safeClerkRejectionLabel('My email is private@example.com'),'session-not-accepted');
 assert.equal(safeClerkRejectionLabel(''), 'session-not-accepted');
});
test('origin-mismatch diagnostic never authorizes a JWT or reveals azp',()=>{
 const site=env.PUBLIC_SITE_ORIGIN,other='https://mobile.example.test';
 assert.equal(nativeAuthorizedPartyMismatch(bearer(other),[site]),true);
 assert.equal(nativeAuthorizedPartyMismatch(bearer(other),[site,other]),false);
 assert.equal(nativeAuthorizedPartyMismatch(bearer(site),[site]),false);
 assert.equal(nativeAuthorizedPartyMismatch('not-a-jwt',[site]),false);
 assert.equal(nativeAuthorizedPartyMismatch('A.'+'z'.repeat(5000)+'.B',[site]),false);
});
test('Clerk signed-out reason and origin mismatch are logged without leaking JWT',async()=>{
 assert.equal(clerkMobileConfigured(env),true);
 const other='https://native.example.test',jwt=bearer(other);
 const client={
  authenticateRequest:async(_request,opts)=>{
   assert.deepEqual(opts.authorizedParties,[env.PUBLIC_SITE_ORIGIN]);
   assert.equal(opts.acceptsToken,'session_token');
   return {isAuthenticated:false,reason:'token-invalid-authorized-parties'};
  },
  users:{getUser:async()=>{throw Error('should not be called')}}
 };
 const result=await capture(()=>mobileSession(makeRequest(jwt),env,client));
 assert.equal(result.response,null);
 assert.deepEqual(result.records,[
   'Clerk mobile authentication: token-invalid-authorized-parties',
   'Clerk mobile authentication: authorized-party-origin-mismatch'
 ]);
 const logs=result.records.join(' ');
 assert.equal(logs.includes(jwt),false);
 assert.equal(logs.includes(other),false);
 assert.equal(logs.includes(uid),false);
});
test('valid Clerk-backed session still succeeds; no diagnostics needed',async()=>{
 const jwt=bearer(env.PUBLIC_SITE_ORIGIN);
 const client={
  authenticateRequest:async()=>
   ({isAuthenticated:true,toAuth:()=>({userId:uid})}),
  users:{getUser:async()=>
   ({id:uid,banned:false,locked:false,emailAddresses:[],primaryEmailAddressId:null})}
 };
 const result=await capture(()=>mobileSession(makeRequest(jwt),env,client));
 assert.equal(result.records.length,0);
 assert.deepEqual(result.response,{
   provider:'clerk',subject:clerkIdentitySubject(uid,env.SESSION_SIGNING_KEY),
   email:null
 });
 const page=await accountStatus(makeRequest(jwt),env,async()=>result.response);
 assert.equal(page.status,200);
 assert.deepEqual(await page.json(),{
   authenticated:true,emailVerified:false,deliveryEmailRequired:true
 });
});
test('server fails closed on missing bearer or user-profile lookup failure',async()=>{
 const client={
   authenticateRequest:async()=>({isAuthenticated:true,toAuth:()=>({userId:uid})}),
   users:{getUser:async()=>{throw Error('secret-BAD-example')}}
 };
 const noAuth=await capture(()=>mobileSession(new Request(env.PUBLIC_SITE_ORIGIN),env,client));
 assert.equal(noAuth.response,null);
 assert.deepEqual(noAuth.records,[]);
 const lookup=await capture(()=>mobileSession(makeRequest(bearer(env.PUBLIC_SITE_ORIGIN)),env,client));
 assert.equal(lookup.response,null);
 assert.deepEqual(lookup.records,['Clerk mobile authentication: backend-verification-failed']);
 assert.ok(!lookup.records.join().includes('secret-BAD-example'));
});
