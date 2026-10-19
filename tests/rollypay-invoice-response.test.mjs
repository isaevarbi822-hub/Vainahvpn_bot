import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvoice} from '../netlify/functions/lib/rollypay-client.mjs';

test('invoice creation accepts documented response with no test field', async()=>{
  const oldFetch=globalThis.fetch;
  const oldKey=process.env.ROLLYPAY_API_KEY;
  const oldOrigin=process.env.PUBLIC_SITE_ORIGIN;
  process.env.ROLLYPAY_API_KEY='unit-test-key';
  process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.com';
  const orderId='2cc7e0ca-a7e7-44ba-ac6c-2805db647e27';
  globalThis.fetch=async (_url,options)=>{
    const request=JSON.parse(options.body);
    assert.equal(request.amount,'99.00');
    assert.equal(request.test,false);
    return new Response(JSON.stringify({
      payment_id:'pay_a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      order_id:orderId,
      status:'created',
      pay_url:'https://pay.rollypay.io/pay/tok_9f8e7d6c5b4a3210',
      amount:'99.00',payment_currency:'RUB'
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const result=await createInvoice({orderId,amountKopeks:9900,telegramId:'123456789',description:'Test'});
    assert.equal(result.payUrl,'https://pay.rollypay.io/pay/tok_9f8e7d6c5b4a3210');
  }finally{
    globalThis.fetch=oldFetch;
    if(oldKey===undefined)delete process.env.ROLLYPAY_API_KEY;else process.env.ROLLYPAY_API_KEY=oldKey;
    if(oldOrigin===undefined)delete process.env.PUBLIC_SITE_ORIGIN;else process.env.PUBLIC_SITE_ORIGIN=oldOrigin;
  }
});
