import test from 'node:test';
import assert from 'node:assert/strict';
import {clerkConfigurationProblems,clerkMobileConfigured}
  from '../netlify/functions/lib/mobile-auth.mjs';
import {accountStatus} from '../netlify/functions/mobile-account.mjs';

const baseline={
 CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(24),
 CLERK_SECRET_KEY:'sk_test_'+'b'.repeat(24),
 SESSION_SIGNING_KEY:'c'.repeat(44),
 PUBLIC_SITE_ORIGIN:'https://vainahvpnbot0.netlify.app'
};
const req=new Request('https://vainahvpnbot0.netlify.app/.netlify/functions/mobile-account');

test('server diagnostics agree with strict Clerk configuration gate',()=>{
 assert.equal(clerkMobileConfigured(baseline),true);
 assert.deepEqual(clerkConfigurationProblems(baseline),[]);
 assert.equal(clerkMobileConfigured({}),false);
 assert.deepEqual(clerkConfigurationProblems({}),[
   'CLERK_PUBLISHABLE_KEY',
   'CLERK_SECRET_KEY (must match publishable key environment)',
   'SESSION_SIGNING_KEY (minimum 32 characters)',
   'PUBLIC_SITE_ORIGIN (exact HTTPS origin)'
 ]);
 const wrong={...baseline,CLERK_SECRET_KEY:'sk_live_'+'d'.repeat(24)};
 assert.equal(clerkMobileConfigured(wrong),false);
 assert.deepEqual(clerkConfigurationProblems(wrong),
   ['CLERK_SECRET_KEY (must match publishable key environment)']);
 const invalid={...baseline,PUBLIC_SITE_ORIGIN:'https://vainahvpnbot0.netlify.app/'};
 assert.equal(clerkMobileConfigured(invalid),false);
 assert.deepEqual(clerkConfigurationProblems(invalid),
   ['PUBLIC_SITE_ORIGIN (exact HTTPS origin)']);
});

test('missing configuration appears only by variable names in private logs',async()=>{
 const original=console.warn;
 const collected=[];
 const injected={...baseline,SESSION_SIGNING_KEY:'privately-do-not-log'};
 console.warn=(...parts)=>collected.push(parts.join(' '));
 try{
   const response=await accountStatus(req,injected,async()=>{throw Error('Should not verify JWT')});
   assert.equal(response.status,503);
   assert.deepEqual(await response.json(),{
    error:'CLERK_SERVER_SETUP_REQUIRED',authenticated:false,emailVerified:false
   });
   assert.match(collected.join(' '),/SESSION_SIGNING_KEY/);
   assert.doesNotMatch(collected.join(' '),/privately-do-not-log/);
 }finally{console.warn=original}
});
