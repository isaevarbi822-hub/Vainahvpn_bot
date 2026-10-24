import test from 'node:test';
import assert from 'node:assert/strict';
import {clerkIdentitySubject,mobileSession,nativeBearerOmitsAzp}
  from '../netlify/functions/lib/mobile-auth.mjs';
import {accountStatus} from '../netlify/functions/mobile-account.mjs';

const env={
 CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(30),
 CLERK_SECRET_KEY:'sk_test_'+'b'.repeat(30),
 SESSION_SIGNING_KEY:'c'.repeat(48),
 PUBLIC_SITE_ORIGIN:'https://vainahvpnbot0.netlify.app'
};
const userId='user_abcdefghijklmnopqrstuvwxyz123';
const part=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
const fakeToken=(options={})=>part({alg:'RS256',typ:'JWT'})+'.'+part({
  sub:userId,iss:'https://clerk.example.test',sid:'sess_example',
  exp:1700000000,...options
})+'.'+part({sig:'mocked-only-not-cryptographically-valid'});
const request=(token,headers={})=>new Request(
 env.PUBLIC_SITE_ORIGIN+'/.netlify/functions/mobile-account',
 {headers:{authorization:'Bearer '+token,...headers}}
);
const withLogs=async task=>{
 const oldWarn=console.warn,oldInfo=console.info,logs=[];
 console.warn=(...s)=>logs.push('WARN '+s.join(' '));
 console.info=(...s)=>logs.push('INFO '+s.join(' '));
 try{return {response:await task(),logs}}
 finally{console.warn=oldWarn;console.info=oldInfo}
};
const profile={
 id:userId,banned:false,locked:false,emailAddresses:[],primaryEmailAddressId:null
};

test('native fallback is limited to Bearer-only JWT without azp',()=>{
 const missing=request(fakeToken());
 const nullAzp=request(fakeToken({azp:null}));
 assert.equal(nativeBearerOmitsAzp(missing,missing.headers.get('authorization')),true);
 assert.equal(nativeBearerOmitsAzp(nullAzp,nullAzp.headers.get('authorization')),true);
 for(const value of ['https://untrusted.test','',false,7]){
  const r=request(fakeToken({azp:value}));
  assert.equal(nativeBearerOmitsAzp(r,r.headers.get('authorization')),false);
 }
 for(const headers of [
  {cookie:'__session=untrusted'},
  {origin:'https://untrusted.test'},
  {'sec-fetch-site':'cross-site'}
 ]){
  const r=request(fakeToken(),headers);
  assert.equal(nativeBearerOmitsAzp(r,r.headers.get('authorization')),false);
 }
 for(const token of ['not-a-jwt','aaa.'+'z'.repeat(5000)+'.bbb',
    part({alg:'RS256'})+'.'+part(null)+'.abc']){
  const r=request(token);
  assert.equal(nativeBearerOmitsAzp(r,r.headers.get('authorization')),false);
 }
});
test('missing-azp native session succeeds only after *second* Clerk verification',async()=>{
 const jwt=fakeToken(),calls=[];
 const clerk={
  authenticateRequest:async(_request,options)=>{
   calls.push(options);
   if(options.authorizedParties){
    assert.deepEqual(options.authorizedParties,[env.PUBLIC_SITE_ORIGIN]);
    return {isAuthenticated:false,reason:'token-invalid-authorized-parties'};
   }
   assert.equal(options.acceptsToken,'session_token');
   return {isAuthenticated:true,toAuth:()=>({userId})};
  },
  users:{getUser:async(id)=>{assert.equal(id,userId);return profile;}}
 };
 const {response,logs}=await withLogs(()=>mobileSession(request(jwt),env,clerk));
 assert.deepEqual(calls,[
  {authorizedParties:[env.PUBLIC_SITE_ORIGIN],acceptsToken:'session_token'},
  {acceptsToken:'session_token'}
 ]);
 assert.deepEqual(response,{
  provider:'clerk',subject:clerkIdentitySubject(userId,env.SESSION_SIGNING_KEY),
  email:null
 });
 assert.deepEqual(logs,['INFO Clerk mobile authentication: native-bearer-without-azp-verified']);
 const status=await accountStatus(request(jwt),env,async()=>response);
 assert.equal(status.status,200);
 assert.equal((await status.json()).authenticated,true);
});
test('incorrect azp can never invoke fallback, even if a mock would accept it',async()=>{
 const calls=[];
 const clerk={
  authenticateRequest:async(_request,opts)=>{
   calls.push(opts);
   return {isAuthenticated:false,reason:'token-invalid-authorized-parties'};
  },
  users:{getUser:async()=>{throw Error('should not run');}}
 };
 const jwt=fakeToken({azp:'https://evil.example.test'});
 const {response,logs}=await withLogs(()=>mobileSession(request(jwt),env,clerk));
 assert.equal(response,null);
 assert.equal(calls.length,1);
 assert.deepEqual(logs,[
  'WARN Clerk mobile authentication: token-invalid-authorized-parties',
  'WARN Clerk mobile authentication: authorized-party-origin-mismatch'
 ]);
 assert.ok(!logs.join(' ').includes(jwt));
 assert.ok(!logs.join(' ').includes('evil.example'));
});
test('native-looking forged JWT is still rejected by Clerk signature/expiry verification',async()=>{
 const jwt=fakeToken(),calls=[];
 const clerk={
  authenticateRequest:async(_request,opts)=>{
   calls.push(opts);
   return opts.authorizedParties
    ? {isAuthenticated:false,reason:'token-invalid-authorized-parties'}
    : {isAuthenticated:false,reason:'token-invalid-signature'};
  },
  users:{getUser:async()=>{throw Error('no profile for invalid token');}}
 };
 const {response,logs}=await withLogs(()=>mobileSession(request(jwt),env,clerk));
 assert.equal(response,null);
 assert.equal(calls.length,2);
 assert.deepEqual(logs,['WARN Clerk mobile authentication: token-invalid-signature']);
});
test('cookie, Origin and Fetch-Site browser requests never use native bearer exception',async()=>{
 for(const header of [
  {cookie:'__session=cookie'}, {origin:'https://evil.example.test'},
  {'sec-fetch-site':'same-site'}
 ]){
  let calls=0;
  const clerk={
   authenticateRequest:async()=>{
    calls++;return {isAuthenticated:false,reason:'token-invalid-authorized-parties'};
   },
   users:{getUser:async()=>{throw Error('should not run');}}
  };
  const {response}=await withLogs(()=>mobileSession(request(fakeToken(),header),env,clerk));
  assert.equal(response,null);
  assert.equal(calls,1);
 }
});
test('revoked/banned Clerk users do not acquire access in native fallback',async()=>{
 const clerk={
  authenticateRequest:async(_request,opts)=>opts.authorizedParties
   ? {isAuthenticated:false,reason:'token-invalid-authorized-parties'}
   : {isAuthenticated:true,toAuth:()=>({userId})},
  users:{getUser:async()=>({...profile,banned:true})}
 };
 const {response,logs}=await withLogs(()=>mobileSession(request(fakeToken()),env,clerk));
 assert.equal(response,null);
 assert.ok(logs.some(x=>x.includes('user-not-active')));
});
