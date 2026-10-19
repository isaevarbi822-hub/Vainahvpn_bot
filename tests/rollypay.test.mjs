import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { safeEqual, verifyRollypaySignature, isAdminRequest } from '../netlify/functions/lib/security.mjs';
import testHandler from '../netlify/functions/rollypay-test.mjs';
import webhookHandler from '../netlify/functions/rollypay-webhook.mjs';

test('constant-time equality rejects different values', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'ab'), false);
});
test('signature verification uses timestamp and raw body', () => {
  const timestamp = '1770000000';
  const rawBody = '{"event_type":"payment.paid"}';
  const secret = 'unit-test-secret';
  const signature = createHmac('sha256',secret).update(timestamp+'.'+rawBody).digest('hex');
  const now = Number(timestamp)*1000;
  assert.equal(verifyRollypaySignature({timestamp,rawBody,signature,secret,now}),true);
  assert.equal(verifyRollypaySignature({timestamp,rawBody:rawBody+' ',signature,secret,now}),false);
  assert.equal(verifyRollypaySignature({timestamp,rawBody,signature,secret,now:now+400000}),false);
});
test('test endpoint requires a secret admin password', async () => {
  const previous = process.env.ROLLYPAY_TEST_TOKEN;
  delete process.env.ROLLYPAY_TEST_TOKEN;
  try {
    const request = new Request('https://example.com/.netlify/functions/rollypay-test');
    assert.equal((await testHandler(request)).status,403);
    assert.equal(isAdminRequest(request),false);
  } finally {
    if(previous===undefined) delete process.env.ROLLYPAY_TEST_TOKEN;
    else process.env.ROLLYPAY_TEST_TOKEN=previous;
  }
});
test('sandbox payment enforces test=true and ignores client prices', async () => {
  const oldToken=process.env.ROLLYPAY_TEST_TOKEN;
  const oldKey=process.env.ROLLYPAY_API_KEY;
  const oldTerminal=process.env.ROLLYPAY_TERMINAL_ID;
  const oldFetch=globalThis.fetch;
  let payload;
  process.env.ROLLYPAY_TEST_TOKEN='this-is-a-long-private-test-password';
  process.env.ROLLYPAY_API_KEY='not-a-real-key';
  process.env.ROLLYPAY_TERMINAL_ID='test-uuid';
  globalThis.fetch=async (url,init)=>{
    payload=JSON.parse(init.body);
    assert.equal(new URL(url).hostname,'rollypay.io');
    assert.equal(init.method,'POST');
    return new Response(JSON.stringify({environment:'sandbox',test:true,payment_id:'pay_1234567890',status:'created',pay_url:'https://pay.rollypay.io/pay/test'}),{status:200});
  };
  try {
    const request=new Request('https://example.com/.netlify/functions/rollypay-test',{method:'POST',headers:{'x-vainah-test-token':process.env.ROLLYPAY_TEST_TOKEN},body:JSON.stringify({amount:'999999',test:false})});
    const response=await testHandler(request);
    assert.equal(response.status,200);
    assert.equal(payload.test,true);
    assert.equal(payload.amount,'1500.00');
    assert.equal(payload.payment_currency,'RUB');
  } finally {
    globalThis.fetch=oldFetch;
    for (const [key,value] of [['ROLLYPAY_TEST_TOKEN',oldToken],['ROLLYPAY_API_KEY',oldKey],['ROLLYPAY_TERMINAL_ID',oldTerminal]]) {
      if(value===undefined) delete process.env[key]; else process.env[key]=value;
    }
  }
});
test('webhook rejects bad signature', async () => {
  const oldSecret=process.env.ROLLYPAY_SIGNING_SECRET;
  process.env.ROLLYPAY_SIGNING_SECRET='test-secret';
  try {
    const req=new Request('https://example.com/.netlify/functions/rollypay-webhook',{method:'POST',headers:{'content-type':'application/json','x-timestamp':String(Math.floor(Date.now()/1000)),'x-signature':'00'.repeat(32)},body:'{"test":true}'});
    assert.equal((await webhookHandler(req)).status,403);
  } finally {
    if(oldSecret===undefined) delete process.env.ROLLYPAY_SIGNING_SECRET;else process.env.ROLLYPAY_SIGNING_SECRET=oldSecret;
  }
});
test('signed real payment callback remains disabled', async () => {
  const secret='test-webhook-secret';
  const oldSecret=process.env.ROLLYPAY_SIGNING_SECRET;
  process.env.ROLLYPAY_SIGNING_SECRET=secret;
  try {
    const rawBody=JSON.stringify({test:false,event_type:'payment.paid',payment_id:'pay_abc123456',order_id:'real_order'});
    const timestamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',secret).update(timestamp+'.'+rawBody).digest('hex');
    const req=new Request('https://example.com/.netlify/functions/rollypay-webhook',{method:'POST',headers:{'content-type':'application/json','x-timestamp':timestamp,'x-signature':signature},body:rawBody});
    assert.equal((await webhookHandler(req)).status,503);
  } finally {
    if(oldSecret===undefined) delete process.env.ROLLYPAY_SIGNING_SECRET;else process.env.ROLLYPAY_SIGNING_SECRET=oldSecret;
  }
});
