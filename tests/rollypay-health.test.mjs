import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{inspectRollypay} from '../netlify/functions/rollypay-health.mjs';

const env={ROLLYPAY_API_KEY:'private-test-key'};
test('RollyPay health check is GET only',async()=>{
  const r=await handler(new Request('https://example.com/.netlify/functions/rollypay-health',{method:'POST'}));
  assert.equal(r.status,405);
});
test('reports missing API key without calling provider',async()=>{
  assert.deepEqual(await inspectRollypay({env:{},fetcher:()=>{throw Error('must not fetch')}}),
    {ok:false,provider:'not_configured'});
});
test('checks key via read-only balance GET, returns no financial or secret data',async()=>{
  const r=await inspectRollypay({env,fetcher:async(url,options)=>{
    assert.equal(url,'https://rollypay.io/api/v1/balance');
    assert.equal(options.method,'GET');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-API-Key'],env.ROLLYPAY_API_KEY);
    assert.match(options.headers['X-Nonce'],/^[0-9a-f-]{36}$/);
    assert.equal(options.body,undefined);
    return new Response(JSON.stringify({
      terminal_id:'terminal-private',available_usdt:'1234.56',hold_usdt:'10.00'
    }),{status:200});
  }});
  assert.deepEqual(r,{ok:true,provider:'reachable',authentication:'accepted'});
  assert.ok(!JSON.stringify(r).includes('1234.56'));
  assert.ok(!JSON.stringify(r).includes('private'));
});
test('does not accept 401 or 403',async()=>{
  for(const status of [401,403]){
    const result=await inspectRollypay({env,fetcher:async()=>new Response('secret',{status})});
    assert.equal(result.ok,false);
    assert.equal(result.authentication,status===401?'rejected':'forbidden');
    assert.ok(!JSON.stringify(result).includes('secret'));
  }
});
test('does not accept unexpected body or network failure',async()=>{
  assert.deepEqual(await inspectRollypay({env,fetcher:async()=>new Response('wrong',{status:200})}),
    {ok:false,provider:'invalid_response'});
  assert.deepEqual(await inspectRollypay({env,fetcher:async()=>{throw Error('secret trace')}}),
    {ok:false,provider:'unavailable',reason:'network_error'});
});

test('distinguishes HTTP 404 and 502 from invalid keys without leaking upstream responses',async()=>{
  for(const code of [404,502]){
    const result=await inspectRollypay({env,fetcher:async()=>new Response('PRIVATE PROVIDER RESPONSE',{status:code})});
    assert.deepEqual(result,{ok:false,provider:'http_error',httpStatus:code});
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  }
});
test('reports rate limiting and connection timeout separately',async()=>{
  assert.deepEqual(await inspectRollypay({env,fetcher:async()=>new Response('',{status:429})}),
    {ok:false,provider:'rate_limited'});
  assert.deepEqual(await inspectRollypay({env,fetcher:async()=>{const e=Error('private');e.name='TimeoutError';throw e;}}),
    {ok:false,provider:'unavailable',reason:'timeout'});
});

test('recognizes documented terminal ID errors but never reflects arbitrary error bodies',async()=>{
  const required=await inspectRollypay({env,fetcher:async()=>new Response(
    JSON.stringify({error:'terminal_id is required',secret:'do-not-expose'}),{status:400})});
  assert.deepEqual(required,{ok:false,provider:'http_error',httpStatus:400,reason:'terminal_id_required'});
  const missing=await inspectRollypay({env,fetcher:async()=>new Response(
    JSON.stringify({error:'terminal not found',secret:'do-not-expose'}),{status:400})});
  assert.equal(missing.reason,'terminal_not_found');
  const unknown=await inspectRollypay({env,fetcher:async()=>new Response(
    JSON.stringify({error:'private account 123',secret:'do-not-expose'}),{status:400})});
  assert.deepEqual(unknown,{ok:false,provider:'http_error',httpStatus:400,reason:'bad_request'});
  assert.ok(!JSON.stringify(unknown).includes('private'));
});
test('supports explicit terminal UUID without exposing it in the result',async()=>{
  const id='d290f1ee-6c54-4b01-90e6-d701748f0851';
  const result=await inspectRollypay({env:{...env,ROLLYPAY_TERMINAL_ID:id},fetcher:async(url)=>{
    assert.equal(url,'https://rollypay.io/api/v1/balance?terminal_id='+id);
    return new Response(JSON.stringify({terminal_id:id,available_usdt:'0',hold_usdt:'0'}));
  }});
  assert.deepEqual(result,{ok:true,provider:'reachable',authentication:'accepted'});
  assert.ok(!JSON.stringify(result).includes(id));
});
test('invalid terminal ID stops before request',async()=>{
  const result=await inspectRollypay({env:{...env,ROLLYPAY_TERMINAL_ID:'not a uuid'},fetcher:()=>{throw Error('should not fetch')}});
  assert.deepEqual(result,{ok:false,provider:'invalid_configuration',field:'ROLLYPAY_TERMINAL_ID'});
});
