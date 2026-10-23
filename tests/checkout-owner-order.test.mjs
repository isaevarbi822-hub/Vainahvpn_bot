import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkoutOwner} from '../netlify/functions/lib/checkout-owner.mjs';
import {newAltSession,altCookieName} from '../netlify/functions/lib/alternate-auth.mjs';
import checkout from '../netlify/functions/subscription-checkout.mjs';

test('the invoice code persists a verified owner and does not accept arbitrary client owner IDs',()=>{
 const code=readFileSync(new URL('../netlify/functions/subscription-checkout.mjs',import.meta.url),'utf8');
 const db=readFileSync(new URL('../netlify/functions/lib/subscription-db.mjs',import.meta.url),'utf8');
 assert.match(code,/findOrCreateOwner\(identity\)/);
 assert.match(code,/insertCheckout\(\{id,telegramId:user\.telegramId,username:user\.username,plan,ownerId\}\)/);
 assert.match(db,/OWNER_MISMATCH/);
 assert.match(db,/VALUES\(\$1,\$2,\$3,\$4,\$5,'RUB','rollypay','website',false,\$6\)/);
});

test('email-only session never gets charged before delivery owner migration',async()=>{
 const old={PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN,SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY};
 const secret='test-owner-checkout-key-'.repeat(3);
 const origin='https://vpn.example.test';
 process.env.PUBLIC_SITE_ORIGIN=origin;
 process.env.SESSION_SIGNING_KEY=secret;
 try{
  const token=newAltSession('email','buyer@example.test',secret);
  const response=await checkout(new Request(origin+'/.netlify/functions/subscription-checkout',{
   method:'POST',
   headers:{origin,cookie:altCookieName+'='+token,'content-type':'application/json'},
   body:JSON.stringify({plan:'30',ownerId:'00000000-0000-0000-0000-000000000000'})
  }));
  assert.equal(response.status,503);
  const payload=await response.json();
  assert.equal(payload.payUrl,undefined);
 }finally{
  for(const [k,v] of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;
 }
});
