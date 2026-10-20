import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {clerkReady,clerkPublicConfig} from '../netlify/functions/lib/clerk-config.mjs';
import configHandler from '../netlify/functions/clerk-auth-config.mjs';
import sessionHandler from '../netlify/functions/clerk-session.mjs';
import {newAltSession,altSession,altCookieName} from '../netlify/functions/lib/alternate-auth.mjs';

const app='https://vpn.example';
const key='test_secret_repeated_'.repeat(3);
const fake={
  PUBLIC_SITE_ORIGIN:app,CLERK_PUBLISHABLE_KEY:'pk_live_'+'a'.repeat(38),
  CLERK_SECRET_KEY:'sk_live_'+'b'.repeat(38),SESSION_SIGNING_KEY:key
};
const load=name=>readFileSync(new URL('../site/'+name,import.meta.url),'utf8');
const withEnv=async(vars,work)=>{
  const prev={};for(const [k,v] of Object.entries(vars)){prev[k]=process.env[k];process.env[k]=v;}
  try{return await work()}finally{for(const k of Object.keys(vars)){
    if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];
  }}
};
test('Clerk stays disabled without a matching production configuration',()=>{
  assert.equal(clerkReady({},app),false);
  assert.equal(clerkReady({...fake,CLERK_SECRET_KEY:''},app),false);
  assert.equal(clerkReady({...fake,CLERK_SECRET_KEY:'sk_test_'+'a'.repeat(35)},app),false);
  assert.equal(clerkReady({...fake,CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(35)},app),false);
  assert.equal(clerkReady(fake,'https://attacker.example'),false);
  assert.equal(clerkReady(fake,'http://vpn.example'),false);
  assert.equal(clerkReady(fake,app+'/account.html'),true);
  assert.deepEqual(clerkPublicConfig({},app),{enabled:false});
});
test('Only the public Clerk key is ever returned to browser',async()=>{
  await withEnv(fake,async()=>{
    const response=await configHandler(new Request(app+'/.netlify/functions/clerk-auth-config'));
    const json=await response.json();
    assert.equal(json.enabled,true);
    assert.equal(json.publishableKey,fake.CLERK_PUBLISHABLE_KEY);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.ok(!JSON.stringify(json).includes(fake.CLERK_SECRET_KEY));
  });
});
test('Clerk session bridge refuses unauthenticated, wrong-origin and GET requests',async()=>{
  await withEnv(fake,async()=>{
    assert.equal((await sessionHandler(new Request(app+'/test'))).status,405);
    const missing=await sessionHandler(new Request(app+'/test',{method:'POST',
      headers:{Origin:app}}));
    assert.equal(missing.status,401);
    assert.ok(!missing.headers.get('set-cookie'));
    const spoof=await sessionHandler(new Request(app+'/test',{method:'POST',
      headers:{Origin:'https://attacker.example',Authorization:'Bearer '+'a'.repeat(80)}}));
    assert.equal(spoof.status,403);
    assert.ok(!spoof.headers.get('set-cookie'));
  });
});
test('Clerk account sessions are separated from Telegram without leaking user identifiers',()=>{
  const token=newAltSession('clerk','user_123456789012345678',key);
  assert.ok(!token.includes('user_'));
  const session=altSession(new Request(app,{headers:{Cookie:altCookieName+'='+token}}),key);
  assert.deepEqual(session,{provider:'clerk'});
  assert.equal(altSession(new Request(app,{headers:{Cookie:altCookieName+'='+token.slice(0,-1)+'0'}}),key),null);
});
test('Frontend uses official script approach, no Vite, fake phone verification or unsafe HTML injection',()=>{
  const js=load('clerk-login.js');
  const html=load('account.html');
  assert.doesNotThrow(()=>new Script(js));
  assert.match(js,/clerk-auth-config/);
  assert.match(js,/clerk-session/);
  assert.match(js,/npm\/@clerk\/ui@1\/dist\/ui\.browser\.js/);
  assert.match(js,/npm\/@clerk\/clerk-js@6\/dist\/clerk\.browser\.js/);
  assert.match(js,/\.mountSignIn\(/);
  assert.match(js,/\.getToken\(/);
  assert.doesNotMatch(js,/innerHTML\s*=/);
  assert.doesNotMatch(js,/localStorage\.setItem\(/);
  assert.match(html,/data-auth-tab="email"/);
  assert.match(html,/data-auth-tab="phone"/);
  assert.match(html,/data-auth-tab="yandex"/);
  assert.match(html,/data-auth-tab="telegram"/);
  assert.match(html,/src="clerk-login\.js" defer/);
  assert.doesNotMatch(html,/data-auth-form="phone"/);
  assert.doesNotMatch(html,/>Купить через Telegram-бота</);
  assert.match(load('account-dashboard.js'),/clerk:'Clerk/);
});
test('Clerk server bridge uses verified token, authorized party and existing signed cookie',()=>{
  const js=readFileSync(new URL('../netlify/functions/clerk-session.mjs',import.meta.url),'utf8');
  assert.match(js,/createClerkClient/);
  assert.match(js,/authenticateRequest/);
  assert.match(js,/authorizedParties/);
  assert.match(js,/acceptsToken:'session_token'/);
  assert.match(js,/verified\.isAuthenticated/);
  assert.match(js,/newAltSession\('clerk'/);
  assert.doesNotMatch(js,/telegramId|vpn_orders|website-vpn-access|DATABASE_URL/);
  assert.doesNotMatch(js,/method:'POST'|payment/);
});
