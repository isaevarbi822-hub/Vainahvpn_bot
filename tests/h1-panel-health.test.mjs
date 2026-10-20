import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{inspectH1Panel} from '../netlify/functions/h1-panel-health.mjs';

const base={PANEL_BASE_URL:'https://vpn.example.com/api',PANEL_API_TOKEN:'test-secret',PANEL_CLIENT_PREFIX:'tg'};
test('H1 health probe is GET only',async()=>{
  const r=await handler(new Request('https://example.com/.netlify/functions/h1-panel-health',{method:'POST'}));
  assert.equal(r.status,405);
});
test('successful missing-client lookup means panel and auth work, without exposing secrets',async()=>{
  let called=false;
  const result=await inspectH1Panel({env:base,fetcher:async(url,options)=>{
    called=true;
    assert.match(url,/\/api\/clients\/tg999999999999999999$/);
    assert.equal(options.method,'GET');
    assert.equal(options.headers.Authorization,'Bearer test-secret');
    return new Response(JSON.stringify({error:'user_not_found'}),{status:404,headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(called,true);
  assert.deepEqual(result,{ok:true,panel:'reachable',authentication:'accepted'});
  assert.equal(JSON.stringify(result).includes('test-secret'),false);
});
test('H1 health does not report success with a missing panel token',async()=>{
  assert.deepEqual(await inspectH1Panel({env:{PANEL_BASE_URL:base.PANEL_BASE_URL}}),{ok:false,panel:'not_configured'});
});
test('H1 health reports rejected credentials without leaking response',async()=>{
  const result=await inspectH1Panel({env:base,fetcher:async()=>new Response(JSON.stringify({error:'no',token:'private'}),{status:401})});
  assert.deepEqual(result,{ok:false,panel:'reachable',authentication:'rejected'});
});
test('H1 health does not expose network failures',async()=>{
  const result=await inspectH1Panel({env:base,fetcher:async()=>{throw Error('private backend details')}});
  assert.deepEqual(result,{ok:false,panel:'unavailable',reason:'connection_failed'});
});

test('H1 probe reports gateway errors rather than misleading JSON failures',async()=>{
  for(const status of [500,502,503,504]){
    const r=await inspectH1Panel({env:base,fetcher:async()=>new Response('<html>private error</html>',{status})});
    assert.deepEqual(r,{ok:false,panel:'unavailable',reason:'server_error'});
    assert.equal(JSON.stringify(r).includes('private'),false);
  }
});
test('H1 probe reports upstream rate limiting without exposing body',async()=>{
  const r=await inspectH1Panel({env:base,fetcher:async()=>new Response('private', {status:429})});
  assert.deepEqual(r,{ok:false,panel:'unavailable',reason:'rate_limited'});
});
test('H1 probe distinguishes invalid JSON and unexpected API response',async()=>{
  const malformed=await inspectH1Panel({env:base,fetcher:async()=>new Response('<html>oops</html>',{status:200})});
  assert.deepEqual(malformed,{ok:false,panel:'unavailable',reason:'invalid_response'});
  const apiError=await inspectH1Panel({env:base,fetcher:async()=>new Response(JSON.stringify({ok:false,error:'private'}),{status:404})});
  assert.deepEqual(apiError,{ok:false,panel:'unavailable',reason:'api_error'});
});
