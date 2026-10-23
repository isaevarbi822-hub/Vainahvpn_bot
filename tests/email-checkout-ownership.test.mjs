import test from 'node:test';
import assert from 'node:assert/strict';
import checkout from '../netlify/functions/subscription-checkout.mjs';
import {newAltSession,altCookieName} from '../netlify/functions/lib/alternate-auth.mjs';

test('email-only login must not create an unowned Telegram checkout',async()=>{
  const before={
    PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN,
    SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY
  };
  const origin='https://vpn.example.test';
  const secret='email-checkout-test-secret-'.repeat(3);
  process.env.PUBLIC_SITE_ORIGIN=origin;
  process.env.SESSION_SIGNING_KEY=secret;
  try {
    const emailSession=newAltSession('email','user@example.test',secret);
    const request=new Request(origin+'/.netlify/functions/subscription-checkout',{
      method:'POST',
      headers:{
        origin,
        cookie:altCookieName+'='+emailSession,
        'content-type':'application/json'
      },
      body:JSON.stringify({plan:'30'})
    });
    const response=await checkout(request);
    assert.equal(response.status,401);
    const result=await response.json();
    assert.equal(typeof result.error,'string');
    assert.equal(Object.hasOwn(result,'payUrl'),false);
  }finally{
    for(const [k,v] of Object.entries(before)){
      if(v===undefined)delete process.env[k]; else process.env[k]=v;
    }
  }
});
