import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSession} from '../netlify/functions/lib/telegram-identity.mjs';
import handler from '../netlify/functions/send-my-vpn.mjs';
import {deliverOwnExistingH1Subscription} from '../netlify/functions/lib/vpn-link-delivery.mjs';

const env={
  PANEL_BASE_URL:'https://panel.example.test',
  PANEL_API_TOKEN:'test-secret-never-live',
  PANEL_CLIENT_PREFIX:'tg',
  TELEGRAM_BOT_TOKEN:'123456789:TEST_BOT_TOKEN_ABCDEFGHIJKLMNOPQRSTUVWXYZ'
};
const expiry=1893456000;
const link='https://vpn.example.test/sub/my-private-uuid';
const respond=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('user can request only their own existing active VPN; H1 receives GET; Telegram receives link',async()=>{
  const seen=[];
  const result=await deliverOwnExistingH1Subscription('123456789',{env,now:1800000000000,
    fetcher:async(url,opts)=>{
      seen.push({url,opts});
      if(seen.length===1)return respond({ok:true,client:{
        name:'tg123456789',expires_at:expiry,status:'active',
        sub_url:link,uuid:'PRIVATE',links:{ws:'vless://PRIVATE'}
      }});
      return respond({ok:true,result:{message_id:1}},200);
    }
  });
  assert.equal(seen.length,2);
  assert.equal(seen[0].url,'https://panel.example.test/api/clients/tg123456789');
  assert.equal(seen[0].opts.method,'GET');
  assert.equal(seen[1].opts.method,'POST');
  assert.match(seen[1].url,/^https:\/\/api\.telegram\.org\/bot/);
  const msg=JSON.parse(seen[1].opts.body);
  assert.equal(msg.chat_id,'123456789');
  assert.ok(msg.text.includes(link));
  assert.equal(result.sent,true);
  assert.doesNotMatch(JSON.stringify(result),/private|uuid|vless|token|vpn\.example/i);
});
test('does not send when another H1 client is returned',async()=>{
  let count=0;
  await assert.rejects(deliverOwnExistingH1Subscription('123456789',{env,now:1800000000000,
    fetcher:async()=>{count++;return respond({ok:true,client:{name:'tg999999999',expires_at:expiry,sub_url:link}})}
  }),err=>err.code==='PANEL_INVALID_RESPONSE');
  assert.equal(count,1);
});
test('does not send expired/blocked profile or insecure subscription link',async()=>{
  for(const client of [
    {name:'tg123456789',expires_at:1700000000,sub_url:link},
    {name:'tg123456789',expires_at:expiry,banned:true,sub_url:link},
    {name:'tg123456789',expires_at:expiry,sub_url:'http://no-tls.example/sub/test'},
  ]){
    let requests=0;
    await assert.rejects(deliverOwnExistingH1Subscription('123456789',{env,now:1800000000000,
      fetcher:async()=>{requests++;return respond({ok:true,client});}}));
    assert.equal(requests,1);
  }
});
test('Telegram rejection returns a safe error, without revealing secret link',async()=>{
  let requests=0;
  await assert.rejects(deliverOwnExistingH1Subscription('123456789',{env,now:1800000000000,
    fetcher:async()=>{requests++;return requests===1?
      respond({ok:true,client:{name:'tg123456789',expires_at:expiry,sub_url:link}}):
      respond({ok:false,description:'Forbidden: bot was blocked by the user'},403);}
  }),err=>err.code==='TELEGRAM_START_BOT_FIRST');
});
test('endpoint rejects requests without authentic session and same-origin confirmation',async()=>{
  const secret='safe-test-key-'.repeat(4);
  const old={PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN,SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY};
  try{
    process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.test';
    process.env.SESSION_SIGNING_KEY=secret;
    const url='https://vpn.example.test/.netlify/functions/send-my-vpn';
    const session=makeSession({telegramId:'123456789',username:'test'},secret);
    assert.equal((await handler(new Request(url,{method:'GET'}))).status,405);
    assert.equal((await handler(new Request(url,{method:'POST',headers:{origin:'https://vpn.example.test'}}))).status,401);
    assert.equal((await handler(new Request(url,{method:'POST',headers:{origin:'https://evil.example',cookie:'__Host-vainah_session='+session}}))).status,403);
  }finally{
    for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v}
  }
});
