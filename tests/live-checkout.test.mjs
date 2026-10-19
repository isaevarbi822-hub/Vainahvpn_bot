import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import account from '../netlify/functions/telegram-account.mjs';
import checkout from '../netlify/functions/subscription-checkout.mjs';
import webhook from '../netlify/functions/rollypay-live-webhook.mjs';
import {makeSession} from '../netlify/functions/lib/telegram-identity.mjs';

test('anonymous customers cannot create payment invoices',async()=>{
  const old=process.env.PUBLIC_SITE_ORIGIN;
  process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.com';
  try{
    const req=new Request('https://vpn.example.com/.netlify/functions/subscription-checkout',{
      method:'POST',headers:{origin:'https://vpn.example.com','content-type':'application/json'},
      body:JSON.stringify({plan:'30',amount:'1.00',telegramId:'999999'})
    });
    const response=await checkout(req);
    assert.equal(response.status,401);
  }finally{if(old===undefined)delete process.env.PUBLIC_SITE_ORIGIN;else process.env.PUBLIC_SITE_ORIGIN=old}
});
test('checkout is hard-disabled until all real payment, panel and DB settings are ready',async()=>{
  const old={PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN,
    SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY,
    VAINAH_LIVE_CHECKOUT:process.env.VAINAH_LIVE_CHECKOUT};
  const secret='a'.repeat(45);
  process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.com';
  process.env.SESSION_SIGNING_KEY=secret;
  delete process.env.VAINAH_LIVE_CHECKOUT;
  try{
    const session=makeSession({telegramId:'123456789',username:'owner'},secret);
    const request=new Request('https://vpn.example.com/.netlify/functions/subscription-checkout',{
      method:'POST',headers:{origin:'https://vpn.example.com',
        cookie:'__Host-vainah_session='+session,'content-type':'application/json'},
      body:JSON.stringify({plan:'30'})
    });
    assert.equal((await checkout(request)).status,503);
  }finally{
    for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}
  }
});
test('production RollyPay webhook is unavailable without explicit live review flag',async()=>{
  const previous=process.env.VAINAH_LIVE_CHECKOUT;
  delete process.env.VAINAH_LIVE_CHECKOUT;
  try{
    const req=new Request('https://vpn.example.com/.netlify/functions/rollypay-live-webhook',{
      method:'POST',body:'{}',headers:{'content-type':'application/json'}
    });
    assert.equal((await webhook(req)).status,503);
  }finally{if(previous===undefined)delete process.env.VAINAH_LIVE_CHECKOUT;else process.env.VAINAH_LIVE_CHECKOUT=previous}
});
test('Telegram account endpoint rejects forged and cross-site authentication',async()=>{
  const old={PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN,
    TELEGRAM_BOT_TOKEN:process.env.TELEGRAM_BOT_TOKEN,
    SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY};
  process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.com';
  process.env.TELEGRAM_BOT_TOKEN='not-really-a-bot-token';
  process.env.SESSION_SIGNING_KEY='random-secret'.repeat(5);
  try{
    const payload={id:'123456789',auth_date:String(Math.floor(Date.now()/1000)),
      first_name:'Name',hash:'0'.repeat(64)};
    const req=new Request('https://vpn.example.com/.netlify/functions/telegram-account',{
      method:'POST',headers:{origin:'https://vpn.example.com','content-type':'application/json'},
      body:JSON.stringify({action:'login',data:payload})
    });
    assert.equal((await account(req)).status,403);
    const cross=new Request('https://vpn.example.com/.netlify/functions/telegram-account',{
      method:'POST',headers:{origin:'https://malicious.example.com','content-type':'application/json'},
      body:JSON.stringify({action:'login',data:payload})
    });
    assert.equal((await account(cross)).status,403);
  }finally{for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});

import {planCatalog,planById} from '../netlify/functions/lib/plan-catalog.mjs';
test('six Vainah plans have exact server-side prices and device counts',()=>{
  const plans=planCatalog();
  assert.deepEqual(plans.map(p=>[p.id,p.days,p.kopeks,p.deviceLimit]),[
    ['30',30,9900,3],['60',60,16000,3],['90',90,21900,3],
    ['180',180,33900,3],['365',365,70000,3],['365-family',365,100000,6]
  ]);
  assert.equal(planById('365-family').priceRub,'1000.00');
  assert.equal(planById('bad'),undefined);
});

test('server price catalog cannot be changed by spoofed environment price values',()=>{
  const plans=planCatalog({VAINAH_PRICE_30_RUB:'1.00',VAINAH_PRICE_365_RUB:'1.00'});
  assert.equal(plans.find(p=>p.id==='30').kopeks,9900);
  assert.equal(plans.find(p=>p.id==='365').kopeks,70000);
  assert.equal(plans.find(p=>p.id==='365-family').deviceLimit,6);
});
