import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { verifyTelegramLogin, makeSession, readSession } from '../netlify/functions/lib/telegram-identity.mjs';
import { parseRubPrice, planById, checkoutReady } from '../netlify/functions/lib/plan-catalog.mjs';

const botToken='123456789:TELEGRAM-TEST-TOKEN-ONLY';
function signedLogin(now,override={}) {
  const user={id:'123456789',first_name:'User',username:'vpn_user',auth_date:String(Math.floor(now/1000)),...override};
  const check=Object.entries(user).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>k+'='+v).join('\n');
  const key=createHash('sha256').update(botToken).digest();
  return {...user,hash:createHmac('sha256',key).update(check).digest('hex')};
}
test('Telegram signed login identifies real Telegram ID and rejects alteration',()=>{
  const now=Date.now();
  const login=signedLogin(now);
  assert.deepEqual(verifyTelegramLogin(login,botToken,now),{telegramId:'123456789',username:'vpn_user',firstName:'User'});
  assert.equal(verifyTelegramLogin({...login,id:'999'},botToken,now),null);
  assert.equal(verifyTelegramLogin(signedLogin(now-720000),botToken,now),null);
  assert.equal(verifyTelegramLogin(signedLogin(now+720000),botToken,now),null);
  assert.equal(verifyTelegramLogin({...login,extra:'trick'},botToken,now),null);
});
test('Session MAC protects Telegram ID and respects expiry',()=>{
  const key='secret'.repeat(10),now=Date.now();
  const cookie=makeSession({telegramId:'123456789',username:'vpn_user'},key,now);
  assert.equal(readSession(cookie,key,now).telegramId,'123456789');
  const parts=cookie.split('.');
  assert.equal(readSession(parts[0]+'x.'+parts[1],key,now),null);
  assert.equal(readSession(cookie,key,now+8*86400*1000),null);
  assert.equal(readSession(cookie,'different-secret'.repeat(3),now),null);
});
test('Prices always come from operator environment, never browser',()=>{
  assert.equal(parseRubPrice('1500.00'),150000);
  assert.equal(parseRubPrice('149.5'),14950);
  for(const val of ['0','-10','Infinity','1e9','1.999',' 100','10000000'])assert.equal(parseRubPrice(val),null);
  const plan=planById('30',{VAINAH_PRICE_30_RUB:'199.00'});
  assert.equal(plan.kopeks,19900);
  assert.equal(checkoutReady({}),false);
});
