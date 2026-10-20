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
    {ok:false,provider:'unavailable'});
});
