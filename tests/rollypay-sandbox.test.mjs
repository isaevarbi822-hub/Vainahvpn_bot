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
