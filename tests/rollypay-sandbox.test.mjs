import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandboxPayment,checkSandboxPayment,sandboxAllowed} from '../netlify/functions/lib/rollypay-sandbox.mjs';
import endpoint from '../netlify/functions/rollypay-sandbox.mjs';
import {makeSession} from '../netlify/functions/lib/telegram-identity.mjs';

const id='123456789';
const env={VAINAH_SANDBOX_TELEGRAM_ID:id,ROLLYPAY_API_KEY:'fake-rpk-test-do-not-use',
  SESSION_SIGNING_KEY:'S'.repeat(48)};
const response=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}});
const jsonPayment=(req,overrides={})=>({
  payment_id:'pay_123456789',order_id:req.order_id,status:'created',test:true,
  environment:'sandbox',amount:'10.00',payment_currency:'RUB',
  pay_url:'https://pay.rollypay.io/pay/tok_TEST789',...overrides
});
test('only configured owner can test with existing Telegram session',()=>{
  assert.equal(sandboxAllowed(id,env),true);
  assert.equal(sandboxAllowed('999999',env),false);
  assert.equal(sandboxAllowed(id,{...env,VAINAH_SANDBOX_TELEGRAM_ID:''}),false);
  assert.equal(sandboxAllowed(id,{...env,ROLLYPAY_API_KEY:''}),false);
});
test('sandbox create ALWAYS sends test=true and uses fake demo amount; never connects to H1Cloud',async()=>{
  let sent;
  const fetcher=async(url,options)=>{
    assert.equal(url,'https://rollypay.io/api/v1/payments');
    assert.equal(options.method,'POST');
    assert.equal(options.redirect,'error');
    assert.equal(options.headers['X-API-Key'],env.ROLLYPAY_API_KEY);
    sent=JSON.parse(options.body);
    assert.equal(sent.test,true);
    assert.equal(sent.amount,'10.00');
    assert.equal(sent.payment_currency,'RUB');
    assert.match(sent.order_id,/^vainah-sandbox-/);
    return response(jsonPayment(sent));
  };
  const created=await createSandboxPayment(id,{env,fetcher,now:1800000000000});
  assert.equal(created.test,true);
  assert.equal(created.payUrl,'https://pay.rollypay.io/pay/tok_TEST789');
  assert.ok(created.proof);
  assert.doesNotMatch(JSON.stringify(created),/fake-rpk-test|H1Cloud|VLESS/i);
  const result=await checkSandboxPayment(id,created.proof,{env,now:1800000000000,
    fetcher:async(url,options)=>{
      assert.equal(options.method,'GET');
      assert.equal(url,'https://rollypay.io/api/v1/payments/pay_123456789');
      return response(jsonPayment(sent,{status:'paid'}));
    }});
  assert.equal(result.status,'paid');
  assert.match(result.note,/VPN не изменён/);
});
test('sandbox rejects provider responses that do not confirm test environment',async()=>{
  for(const overrides of [
    {test:false,environment:'prod'},
    {test:true,environment:'prod'},
    {order_id:'not-our-order'},
    {amount:'999.00'},
    {pay_url:'https://example.org/phishing'},
    {pay_url:'http://pay.rollypay.io/pay/abc'},
  ]){
    await assert.rejects(createSandboxPayment(id,{env,
      fetcher:async(_url,opts)=>response(jsonPayment(JSON.parse(opts.body),overrides))}));
  }
});
test('sandbox proof is bound to verified user and cannot be tampered with',async()=>{
  let requestBody;
  const p=await createSandboxPayment(id,{env,now:1800000000000,
    fetcher:async(_url,opts)=>{
      requestBody=JSON.parse(opts.body);return response(jsonPayment(requestBody));}});
  const never=async()=>{throw Error('Must not hit provider');};
  await assert.rejects(checkSandboxPayment('888888',p.proof,{env,now:1800000000000,fetcher:never}),
    e=>e.code==='SANDBOX_NOT_ALLOWED');
  await assert.rejects(checkSandboxPayment(id,p.proof.slice(0,-1)+(p.proof.at(-1)==='0'?'1':'0'),{
    env,now:1800000000000,fetcher:never}),e=>e.code==='INVALID_TEST_SESSION');
  await assert.rejects(checkSandboxPayment(id,p.proof,{env,now:1800000000000+7200000,fetcher:never}),
    e=>e.code==='INVALID_TEST_SESSION');
});
test('public handler denies anonymous and cross-site requests before any payment',async()=>{
  const old={SESSION_SIGNING_KEY:process.env.SESSION_SIGNING_KEY,
    VAINAH_SANDBOX_TELEGRAM_ID:process.env.VAINAH_SANDBOX_TELEGRAM_ID,
    ROLLYPAY_API_KEY:process.env.ROLLYPAY_API_KEY,PUBLIC_SITE_ORIGIN:process.env.PUBLIC_SITE_ORIGIN};
  Object.assign(process.env,{...env,PUBLIC_SITE_ORIGIN:'https://vpn.example.test'});
  try{
    const u='https://vpn.example.test/.netlify/functions/rollypay-sandbox';
    assert.equal((await endpoint(new Request(u,{method:'POST',headers:{origin:'https://vpn.example.test'},body:'{"action":"create"}'}))).status,401);
    const session=makeSession({telegramId:id},env.SESSION_SIGNING_KEY);
    assert.equal((await endpoint(new Request(u,{method:'POST',headers:{
      origin:'https://other.example.test',cookie:'__Host-vainah_session='+session},
      body:'{"action":"create"}'}))).status,403);
    const ready=await endpoint(new Request(u,{headers:{cookie:'__Host-vainah_session='+session}}));
    assert.equal((await ready.json()).allowed,true);
  }finally{
    for(const [k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
});

test('HTML error pages are recognized by HTTP status before JSON parsing',async()=>{
  let calls=0;
  await assert.rejects(createSandboxPayment(id,{env,
    fetcher:async()=>{calls++;return new Response('<html>401 Unauthorized</html>',{
      status:401,headers:{'content-type':'text/html'}});}
  }),e=>e.code==='PROVIDER_HTTP_401');
  assert.equal(calls,1);
});
test('200 HTML response produces a safe distinct diagnostic without leaking HTML',async()=>{
  await assert.rejects(createSandboxPayment(id,{env,fetcher:async()=>new Response(
    '<html>private-data</html>',{status:200,headers:{'content-type':'text/html'}})}),
    e=>e.code==='PROVIDER_RESPONSE_NOT_JSON'&&!String(e).includes('private-data'));
});
test('Malformed payment ID, unsafe/missing pay URL receive separate diagnostic codes',async()=>{
  for(const testCase of [
    {fields:{payment_id:''},code:'PROVIDER_PAYMENT_ID_MISSING'},
    {fields:{pay_url:null},code:'PROVIDER_PAY_URL_INVALID'},
    {fields:{pay_url:'https://wrong.example/pay/tok_abcdefgh'},code:'PROVIDER_PAY_URL_INVALID'},
    {fields:{pay_url:'https://pay.rollypay.io/pay/../admin'},code:'PROVIDER_PAY_URL_INVALID'}
  ]){
    await assert.rejects(createSandboxPayment(id,{env,
      fetcher:async(_url,options)=>response(jsonPayment(JSON.parse(options.body),testCase.fields))}),
      e=>e.code===testCase.code);
  }
});
test('missing required sandbox markers are still rejected',async()=>{
  for(const fields of [
    {test:false}, {environment:'prod'}, {test:undefined}, {environment:undefined}
  ]){
    await assert.rejects(createSandboxPayment(id,{env,
      fetcher:async(_url,options)=>response(jsonPayment(JSON.parse(options.body),fields))}),
      e=>e.code==='PROVIDER_SANDBOX_MISMATCH');
  }
});

test('Accepts bounded URL-safe opaque provider payment IDs, not just pay_ prefix',async()=>{
  for(const providerId of [
    '6a92dcb3-dbf2-4aca-872d-0d34cc3b482a',
    '01JAV3M97MX07CKJSBQ6G0T79W',
    'pay_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'sand_ABC-123456789',
  ]){
    let originalBody;
    const created=await createSandboxPayment(id,{env,now:1800000000000,
      fetcher:async(_url,options)=>{
        originalBody=JSON.parse(options.body);
        return response(jsonPayment(originalBody,{payment_id:providerId}));
      }});
    assert.ok(created.proof);
    const checked=await checkSandboxPayment(id,created.proof,{env,now:1800000000000,
      fetcher:async(url,options)=>{
        assert.equal(url,'https://rollypay.io/api/v1/payments/'+providerId);
        assert.equal(options.method,'GET');
        return response(jsonPayment(originalBody,{payment_id:providerId,status:'paid'}));
      }});
    assert.equal(checked.status,'paid');
    assert.equal(checked.test,true);
  }
});
test('Rejects provider ID path traversal, URL injection, unbounded IDs and missing IDs',async()=>{
  for(const providerId of [null,123,'','/admin','pay_../../private',
    'pay_x?debug=1','pay_x#anchor','pay_x%2Fprivate','x'.repeat(129),'x','a b']){
    await assert.rejects(createSandboxPayment(id,{env,
      fetcher:async(_url,options)=>response(jsonPayment(JSON.parse(options.body),{payment_id:providerId}))}),
      e=>e.code===((typeof providerId!=='string'||!providerId)?'PROVIDER_PAYMENT_ID_MISSING':'PROVIDER_PAYMENT_ID_INVALID'));
  }
});
