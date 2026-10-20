import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {
  normalizeContact,issueSigned,verifySigned,identityHash,
  newAltSession,altSession,setCookie,otpCookieName,altCookieName,
  flowCookieName,publicMethods,expectedOrigin,pkceChallenge
} from '../netlify/functions/lib/alternate-auth.mjs';
import alternateLogin from '../netlify/functions/alternate-login.mjs';
import yandexStart,{yandexAuthorizationUrl} from '../netlify/functions/yandex-start.mjs';
import yandexCallback from '../netlify/functions/yandex-callback.mjs';

const secret='test_'.repeat(11);
const site='https://vpn.example';
const fakeEnv={
  PUBLIC_SITE_ORIGIN:site,SESSION_SIGNING_KEY:secret,
  TELEGRAM_BOT_TOKEN:'123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklm',
  TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),
  TWILIO_VERIFY_SERVICE_SID:'VA'+'b'.repeat(32),
  TWILIO_AUTH_TOKEN:'test_auth_token_is_not_real_123456',
  YANDEX_CLIENT_ID:'test-client-id-12345',
  YANDEX_CLIENT_SECRET:'not-a-real-yandex-secret-12345'
};
async function withEnv(settings,work){
  const previous={};
  for(const [key,value] of Object.entries(settings)){
    previous[key]=process.env[key];
    process.env[key]=value;
  }
  try{return await work()}finally{
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
}
function req(path,body,cookies=''){
  return new Request(site+path,{
    method:body?'POST':'GET',
    headers:{
      ...(body?{'Content-Type':'application/json',Origin:site}:{}),
      ...(cookies?{Cookie:cookies}:{})
    },
    body:body?JSON.stringify(body):undefined
  });
}
test('contact input is validated before any SMS or email is sent',()=>{
  assert.equal(normalizeContact('phone','+4712345678'),'+4712345678');
  assert.equal(normalizeContact('phone','12345'),null);
  assert.equal(normalizeContact('phone','+000123456789'),null);
  assert.equal(normalizeContact('phone','+12345678901234567'),null);
  assert.equal(normalizeContact('email',' Test@Example.COM '),'test@example.com');
  assert.equal(normalizeContact('email','not-an-address'),null);
  assert.equal(normalizeContact('email','x@evil.com\nBcc:other@example.org'),null);
});

test('sessions are signed, provider isolated, scoped and expire',()=>{
  const valid=issueSigned({purpose:'test-only',exp:Math.floor(Date.now()/1000)+300},secret);
  assert.ok(verifySigned(valid,secret,'test-only'));
  assert.equal(verifySigned(valid,'wrong'.repeat(15),'test-only'),null);
  assert.equal(verifySigned(valid,secret,'alt-session'),null);
  const expired=issueSigned({purpose:'test-only',exp:1},secret);
  assert.equal(verifySigned(expired,secret,'test-only'),null);
  const phone=newAltSession('phone','+4712345678',secret);
  const email=newAltSession('email','test@example.com',secret);
  assert.notEqual(phone,email);
  assert.notEqual(identityHash('phone','+4712345678',secret),
    identityHash('email','+4712345678',secret));
  const r=req('/.netlify/functions/alternate-login',null,
    altCookieName+'='+phone);
  assert.deepEqual(altSession(r,secret),{provider:'phone'});
  assert.equal(altSession(req('/.netlify/functions/alternate-login',null,
    altCookieName+'='+phone.replace(/.$/,'0')),secret),null);
  assert.ok(!phone.includes('4712345678'));
});

test('public availability returns no keys or secrets and denies wrong origin',()=>{
  const flags=publicMethods(fakeEnv,site+'/account.html');
  assert.deepEqual(flags,{phone:true,email:true,yandex:true,telegram:true});
  assert.equal(publicMethods(fakeEnv,'https://other.example').phone,false);
  assert.equal(expectedOrigin(fakeEnv,'https://other.example'),null);
  const js=JSON.stringify(flags);
  assert.ok(!js.includes(fakeEnv.TWILIO_AUTH_TOKEN));
});

test('unconfigured email and SMS cannot forge a login',async()=>{
  await withEnv({
    PUBLIC_SITE_ORIGIN:site,SESSION_SIGNING_KEY:secret,
    TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_VERIFY_SERVICE_SID:''
  },async()=>{
    const response=await alternateLogin(req('/.netlify/functions/alternate-login',{
      action:'check',method:'email',contact:'test@example.com',code:'123456'
    }));
    assert.equal(response.status,503);
    assert.equal((await response.json()).authenticated,undefined);
    assert.ok(!response.headers.get('set-cookie'));
  });
});

test('phone/email use real provider approval and signed recipient challenge',async()=>{
  await withEnv(fakeEnv,async()=>{
    const oldFetch=globalThis.fetch;
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;
      assert.ok(url.startsWith('https://verify.twilio.com/v2/Services/VA'));
      assert.equal(options.method,'POST');
      assert.ok(options.headers.Authorization.startsWith('Basic '));
      const params=new URLSearchParams(options.body);
      if(url.endsWith('/Verifications')){
        assert.equal(params.get('Channel'),'sms');
        assert.equal(params.get('To'),'+4712345678');
        return new Response(JSON.stringify({status:'pending'}),{
          status:201,headers:{'Content-Type':'application/json'}
        });
      }
      assert.equal(params.get('Code'),'123456');
      return new Response(JSON.stringify({status:'approved',to:params.get('To')}),{
        status:200,headers:{'Content-Type':'application/json'}
      });
    };
    try{
      const sent=await alternateLogin(req('/.netlify/functions/alternate-login',{
        action:'send',method:'phone',contact:'+4712345678'
      }));
      assert.equal(sent.status,200);
      assert.equal((await sent.json()).sent,true);
      assert.match(sent.headers.get('set-cookie'),/__Host-vainah_verify=/);
      const pending=issueSigned({purpose:'otp-pending',method:'phone',
        sub:identityHash('phone','+4712345678',secret),
        exp:Math.floor(Date.now()/1000)+600},secret);
      const cookieValue=otpCookieName+'='+pending;
      const wrong=await alternateLogin(req('/.netlify/functions/alternate-login',{
        action:'check',method:'phone',contact:'+4712345679',code:'123456'
      },cookieValue));
      assert.equal(wrong.status,403);
      assert.equal(calls,1,'different recipient must be rejected before provider call');
      const ok=await alternateLogin(req('/.netlify/functions/alternate-login',{
        action:'check',method:'phone',contact:'+4712345678',code:'123456'
      },cookieValue));
      assert.equal(ok.status,200);
      assert.equal((await ok.json()).authenticated,true);
      assert.match(ok.headers.get('set-cookie'),/__Host-vainah_alt=/);
      assert.equal(calls,2);
    }finally{globalThis.fetch=oldFetch}
  });
});

test('OTP approval for a DIFFERENT provider recipient never authenticates',async()=>{
  await withEnv(fakeEnv,async()=>{
    const before=globalThis.fetch;
    globalThis.fetch=async()=>new Response(JSON.stringify({
      status:'approved',to:'attacker@example.com'
    }),{status:200,headers:{'Content-Type':'application/json'}});
    try{
      const email='valid@example.com';
      const challenge=issueSigned({purpose:'otp-pending',method:'email',
        sub:identityHash('email',email,secret),
        exp:Math.floor(Date.now()/1000)+600},secret);
      const result=await alternateLogin(req('/.netlify/functions/alternate-login',{
        action:'check',method:'email',contact:email,code:'999999'
      },otpCookieName+'='+challenge));
      assert.equal(result.status,403);
      assert.ok(!result.headers.get('set-cookie'));
    }finally{globalThis.fetch=before}
  });
});

test('Yandex uses authorization code + PKCE + state and a fixed callback',async()=>{
  const url=new URL(yandexAuthorizationUrl(fakeEnv,site,'random-state','secret-verifier'));
  assert.equal(url.origin,'https://oauth.yandex.ru');
  assert.equal(url.searchParams.get('response_type'),'code');
  assert.equal(url.searchParams.get('scope'),'login:info');
  assert.equal(url.searchParams.get('state'),'random-state');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('code_challenge'),pkceChallenge('secret-verifier'));
  assert.equal(url.searchParams.get('redirect_uri'),
    site+'/.netlify/functions/yandex-callback');
  await withEnv(fakeEnv,async()=>{
    const start=await yandexStart(req('/.netlify/functions/yandex-start'));
    assert.equal(start.status,302);
    assert.match(start.headers.get('location'),/^https:\/\/oauth\.yandex\.ru\/authorize/);
    assert.match(start.headers.get('set-cookie'),/__Host-vainah_yandex_flow=/);
  });
});

test('Yandex callback rejects missing or forged state without contacting provider',async()=>{
  await withEnv(fakeEnv,async()=>{
    const callback=req('/.netlify/functions/yandex-callback?code=xyz&state=forged');
    const r=await yandexCallback(callback);
    assert.equal(r.status,303);
    assert.equal(r.headers.get('location'),site+'/account.html?alt_login=error');
    assert.ok(!r.headers.get('set-cookie').includes('__Host-vainah_alt='));
  });
});

test('Yandex callback verifies user app ID before issuing account cookie',async()=>{
  await withEnv(fakeEnv,async()=>{
    const oldFetch=globalThis.fetch;
    const flow=issueSigned({purpose:'yandex-flow',state:'our-state',
      verifier:'our-verifier',exp:Math.floor(Date.now()/1000)+300},secret);
    let queries=0;
    globalThis.fetch=async(url,options)=>{
      queries++;
      if(url.includes('/token')){
        assert.equal(options.method,'POST');
        assert.equal(new URLSearchParams(options.body).get('code_verifier'),'our-verifier');
        return new Response(JSON.stringify({access_token:'fake-test-access'}),{
          status:200,headers:{'Content-Type':'application/json'}
        });
      }
      assert.equal(options.headers.Authorization,'OAuth fake-test-access');
      return new Response(JSON.stringify({id:'12345678',
        client_id:fakeEnv.YANDEX_CLIENT_ID}),{
          status:200,headers:{'Content-Type':'application/json'}
      });
    };
    try{
      const response=await yandexCallback(req(
        '/.netlify/functions/yandex-callback?code=legitimate&state=our-state',null,
        flowCookieName+'='+flow));
      assert.equal(response.status,303);
      assert.equal(response.headers.get('location'),
        site+'/account.html?alt_login=success');
      assert.equal(queries,2);
      const joined=response.headers.get('set-cookie');
      assert.match(joined,/__Host-vainah_alt=/);
      assert.ok(!joined.includes('fake-test-access'));
    }finally{globalThis.fetch=oldFetch}
  });
});

test('account page has four visible methods and never links to bot purchase',()=>{
  const html=readFileSync(new URL('../site/account.html',import.meta.url),'utf8');
  const client=readFileSync(new URL('../site/account-login.js',import.meta.url),'utf8');
  const widget=readFileSync(new URL('../site/telegram-login-widget.js',import.meta.url),'utf8');
  assert.equal((html.match(/data-auth-tab=/g)||[]).length,4);
  for(const method of ['telegram','phone','email','yandex'])
    assert.ok(html.includes('data-auth-pane="'+method+'"'));
  assert.match(html,/id="account-telegram-retry"/);
  assert.match(html,/id="account-alt-private"[^>]*hidden/);
  assert.match(html,/id="account-yandex-start"/);
  const clerk=readFileSync(new URL('../site/clerk-login.js',import.meta.url),'utf8');
  assert.match(clerk,/\.mountSignIn\(/);
  assert.match(clerk,/clerk-auth-config/);
  assert.match(clerk,/clerk-session/);
  assert.match(html,/id="account-clerk-email"/);
  assert.match(html,/id="account-clerk-phone"/);
  assert.match(client,/alternate-login/);
  assert.match(widget,/data-telegram-login/);
  assert.doesNotMatch(client,/innerHTML\s*=/);
  assert.doesNotMatch(widget,/innerHTML\s*=/);
  assert.doesNotMatch(html,/>Купить через Telegram-бота</);
  assert.doesNotThrow(()=>new Script(client));
  assert.doesNotThrow(()=>new Script(widget));
});
