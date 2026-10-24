import test from 'node:test';
import assert from 'node:assert/strict';
import {readH1ClientStatus,panelSettings,H1StatusError} from '../netlify/functions/lib/h1-readonly.mjs';
import handler from '../netlify/functions/my-subscription.mjs';

const env={
  PANEL_BASE_URL:'https://vpn-panel.example.com/api',
  PANEL_API_TOKEN:'TEST-TOKEN-DO-NOT-USE',
  PANEL_CLIENT_PREFIX:'tg'
};
const response=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}
});
test('read H1 profile: only GET under authenticated Telegram ID; no keys escape',async()=>{
  let seen=0;
  const privateData={name:'tg123456789',expires_at:1893456000,status:'active',banned:false,
    device_limit:6,uuid:'SECRET-UUID',subscription_url:'https://vpn-panel.example/sub/SECRET',
    links:{ws:'vless://VERY-SECRET-ACCESS'},devices:[{id:'sensitive'}]};
  const result=await readH1ClientStatus('123456789',{env,now:1800000000000,
    fetcher:async(url,options)=>{
      seen++;
      assert.equal(url,'https://vpn-panel.example.com/api/clients/tg123456789');
      assert.equal(options.method,'GET');
      assert.equal(options.redirect,'error');
      assert.equal(options.headers.Authorization,'Bearer TEST-TOKEN-DO-NOT-USE');
      assert.equal(options.body,undefined);
      return response({ok:true,client:privateData});
    }
  });
  assert.equal(seen,1);
  assert.deepEqual(result,{
    panelReady:true,found:true,active:true,banned:false,
    expiresAt:'2030-01-01T00:00:00.000Z',deviceLimit:6
  });
  assert.doesNotMatch(JSON.stringify(result),/SECRET|vless|links|devices|uuid/i);
});
test('H1 missing exact client returns only safe not-found state',async()=>{
  const result=await readH1ClientStatus('123456789',{env,
    fetcher:async()=>response({ok:false,error:'user_not_found'},404)});
  assert.deepEqual(result,{panelReady:true,found:false,active:false,expiresAt:null});
});
test('unrecognized HTTP 404 is NOT confused with no client',async()=>{
  await assert.rejects(
    readH1ClientStatus('123456789',{env,fetcher:async()=>response({error:'not_found'},404)}),
    err=>err instanceof H1StatusError && err.code==='PANEL_API_ERROR');
});
test('expired and banned H1 profiles are never shown active',async()=>{
  for(const client of [
    {name:'tg123456789',expires_at:1000000000,status:'active'},
    {name:'tg123456789',expires_at:1893456000,status:'banned'}
  ]) {
    const s=await readH1ClientStatus('123456789',{env,now:1800000000000,
      fetcher:async()=>response({ok:true,client})});
    assert.equal(s.active,false);
  }
});
test('invalid H1 identity and malformed backend response do not leak data',async()=>{
  const noFetch=async()=>{throw Error('should not connect')};
  await assert.rejects(readH1ClientStatus('123/../../etc',{env,fetcher:noFetch}),
    err=>err.code==='TELEGRAM_ID_INVALID');
  await assert.rejects(readH1ClientStatus('123456789',{
    env:{...env,PANEL_BASE_URL:'http://insecure.example.com'},fetcher:noFetch}),
    err=>err.code==='PANEL_URL_INVALID');
  await assert.rejects(readH1ClientStatus('123456789',{
    env:{...env,PANEL_CLIENT_PREFIX:'tg/../../'},fetcher:noFetch}),
    err=>err.code==='PANEL_PREFIX_INVALID');
  await assert.rejects(readH1ClientStatus('123456789',{env,
    fetcher:async()=>response({ok:true,client:{name:'different-name',expires_at:1893456000}})}),
    err=>err.code==='PANEL_INVALID_RESPONSE');
  const omitted=await readH1ClientStatus('123456789',{env:{},fetcher:noFetch});
  assert.equal(omitted.panelReady,false);
});
test('unauthenticated read-only endpoint makes no H1 request',async()=>{
  const previous=process.env.SESSION_SIGNING_KEY;
  delete process.env.SESSION_SIGNING_KEY;
  try{
    const req=new Request('https://vpn.example.com/.netlify/functions/my-subscription');
    const result=await handler(req);
    assert.equal(result.status,401);
  }finally{
    if(previous===undefined)delete process.env.SESSION_SIGNING_KEY;
    else process.env.SESSION_SIGNING_KEY=previous;
  }
});
