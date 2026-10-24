import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSession} from '../netlify/functions/lib/telegram-identity.mjs';
import {readOwnH1Access} from '../netlify/functions/lib/own-h1-access.mjs';
import {H1StatusError} from '../netlify/functions/lib/h1-readonly.mjs';
import handler from '../netlify/functions/my-vpn-access.mjs';

const env={
  PANEL_BASE_URL:'https://panel.example.com/api',
  PANEL_API_TOKEN:'PRIVATE-SERVER-TOKEN',
  PANEL_CLIENT_PREFIX:'tg'
};
const expiry=2000000000;
function upstream(client,status=200){
  return new Response(JSON.stringify({ok:status===200,client}),{
    status,headers:{'content-type':'application/json'}
  });
}
const client={name:'tg123456789',expires_at:expiry,subscription_url:'https://sub.example.com/key?profile=abc',
  uuid:'DO-NOT-LEAK',devices:[{id:'SECRET'}]};

test('read-only H1 access verifies profile ownership, expiry, and HTTPS URL',async()=>{
  let queries=0;
  const result=await readOwnH1Access('123456789',{env,now:1900000000000,
    fetcher:async(url,options)=>{
      queries++;
      assert.equal(url,'https://panel.example.com/api/clients/tg123456789');
      assert.equal(options.method,'GET');
      assert.equal(options.headers.Authorization,'Bearer PRIVATE-SERVER-TOKEN');
      assert.equal(options.body,undefined);
      return upstream(client);
    }
  });
  assert.equal(queries,1);
  assert.equal(result.subscriptionUrl,'https://sub.example.com/key?profile=abc');
  assert.doesNotMatch(JSON.stringify(result),/DO-NOT-LEAK|SECRET|PRIVATE-SERVER-TOKEN/);
});

test('H1 refuses a different user, missing/expired/banned profiles and unsafe links',async()=>{
  const call=async(profile)=>readOwnH1Access('123456789',{env,now:1900000000000,
    fetcher:async()=>upstream(profile)});
  for(const bad of [
    {...client,name:'tg999999999'},
    {...client,expires_at:1600000000},
    {...client,banned:true},
    {...client,status:'disabled'},
    {...client,subscription_url:'http://insecure.example.com/key'},
    {...client,subscription_url:'https://sub.example.com/key#fragment'},
    {...client,subscription_url:'https://other:key@sub.example.com/key'}
  ]) await assert.rejects(call(bad),(error)=>error instanceof H1StatusError);
  await assert.rejects(readOwnH1Access('123/../',{env,fetcher:async()=>{throw Error('Should not request');}}),
    (error)=>error.code==='TELEGRAM_ID_INVALID');
});

test('HTTP endpoint requires signed Telegram cookie and ignores user-provided identity',async()=>{
  const before={
    SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY,
    PANEL_BASE_URL:process.env.PANEL_BASE_URL,
    PANEL_API_TOKEN:process.env.PANEL_API_TOKEN,
    PANEL_CLIENT_PREFIX:process.env.PANEL_CLIENT_PREFIX
  };
  const originalFetch=global.fetch;
  try{
    process.env.SESSION_SIGNING_KEY='test-safe-session-secret-at-least-thirty-two-characters';
    process.env.PANEL_BASE_URL=env.PANEL_BASE_URL;
    process.env.PANEL_API_TOKEN=env.PANEL_API_TOKEN;
    process.env.PANEL_CLIENT_PREFIX=env.PANEL_CLIENT_PREFIX;
    let queried;
    global.fetch=async(url)=>{queried=url;return upstream(client)};
    const without=await handler(new Request('https://app.example/.netlify/functions/my-vpn-access'));
    assert.equal(without.status,401);
    assert.equal(queried,undefined);
    const cookie='__Host-vainah_session='+makeSession({telegramId:'123456789',username:'someone'},
      process.env.SESSION_SIGNING_KEY);
    const result=await handler(new Request(
      'https://app.example/.netlify/functions/my-vpn-access?telegramId=999999999',
      {headers:{cookie}}
    ));
    assert.equal(result.status,200);
    const data=await result.json();
    assert.equal(data.subscriptionUrl,client.subscription_url);
    assert.equal(queried,'https://panel.example.com/api/clients/tg123456789');
    assert.equal(result.headers.get('cache-control'),'no-store');
    assert.doesNotMatch(JSON.stringify(data),/DO-NOT-LEAK|SECRET/);
    const post=await handler(new Request('https://app.example/.netlify/functions/my-vpn-access',{method:'POST',headers:{cookie}}));
    assert.equal(post.status,405);
  }finally{
    global.fetch=originalFetch;
    for(const [key,value] of Object.entries(before)){
      if(value===undefined)delete process.env[key]; else process.env[key]=value;
    }
  }
});
