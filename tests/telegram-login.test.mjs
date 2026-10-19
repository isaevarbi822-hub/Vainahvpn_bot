import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {verifyTelegramLogin,makeSession,readSession,sessionFromRequest}
  from '../netlify/functions/lib/telegram-identity.mjs';
import loginHandler from '../netlify/functions/telegram-account.mjs';
import statusHandler from '../netlify/functions/my-subscription.mjs';

const token='12345:TELEGRAM-FOR-TESTS';
const secret='test-secret-'.repeat(5);
const makeAuth=(now,extras={})=>{
 const data={id:'123456789',first_name:'Test',username:'test_user',
  auth_date:String(Math.floor(now/1000)),...extras};
 const check=Object.entries(data).sort(([a],[b])=>a.localeCompare(b,'en'))
  .map(([k,v])=>k+'='+String(v)).join('\n');
 const key=createHash('sha256').update(token).digest();
 return {...data,hash:createHmac('sha256',key).update(check).digest('hex')};
};
test('Telegram login authenticates Telegram ID, not typed username',()=>{
 const now=Date.now(),auth=makeAuth(now);
 assert.equal(verifyTelegramLogin(auth,token,now).telegramId,'123456789');
 assert.equal(verifyTelegramLogin({...auth,id:'999'},token,now),null);
 assert.equal(verifyTelegramLogin({...auth,username:'other'},token,now),null);
 assert.equal(verifyTelegramLogin(makeAuth(now-720000),token,now),null);
 assert.equal(verifyTelegramLogin(makeAuth(now,{allows_write_to_pm:true}),token,now).telegramId,'123456789');
});
test('session integrity and expiration are checked',()=>{
 const now=Date.now(),s=makeSession({telegramId:'123456789',username:'test_user'},secret,now);
 assert.equal(readSession(s,secret,now).telegramId,'123456789');
 assert.equal(readSession(s+'x',secret,now),null);
 assert.equal(readSession(s,secret,now+8*86400000),null);
 const req=new Request('https://example.com',{headers:{cookie:'__Host-vainah_session='+s}});
 assert.equal(sessionFromRequest(req,secret).telegramId,'123456789');
});
test('server only accepts signed same-origin logins; account status is safe',async()=>{
 const old={TELEGRAM_BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,
  SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY,
  PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN};
 process.env.TELEGRAM_BOT_TOKEN=token;
 process.env.SESSION_SIGNING_KEY=secret;
 process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.com';
 const url='https://vpn.example.com/.netlify/functions/telegram-account';
 try{
  const auth=makeAuth(Date.now());
  const body=JSON.stringify({action:'login',data:auth});
  const bad=new Request(url,{method:'POST',headers:{origin:'https://other.example.com'},body});
  assert.equal((await loginHandler(bad)).status,403);
  const forged=new Request(url,{method:'POST',headers:{origin:'https://vpn.example.com'},
    body:JSON.stringify({action:'login',data:{...auth,id:'999'}})});
  assert.equal((await loginHandler(forged)).status,403);
  const ok=new Request(url,{method:'POST',headers:{origin:'https://vpn.example.com'},body});
  const response=await loginHandler(ok);
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');
  assert.match(cookie,/HttpOnly/);
  assert.match(cookie,/Secure/);
  const my=new Request('https://vpn.example.com/.netlify/functions/my-subscription',
    {headers:{cookie:cookie.split(';')[0]}});
  const mine=await statusHandler(my);
  assert.equal(mine.status,200);
  const data=await mine.json();
  assert.equal(data.telegramId,'123456789');
  assert.equal(data.panelReady,false);
  assert.equal((await statusHandler(new Request(my.url))).status,401);
 }finally{
  for(const [key,value] of Object.entries(old)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
 }
});
