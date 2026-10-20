import test from 'node:test';
import assert from 'node:assert/strict';
import {validPaymentId,PAY_URL_PATH_PATTERN} from '../netlify/functions/lib/rollypay-identifiers.mjs';
import {fetchPayment,createInvoice} from '../netlify/functions/lib/rollypay-client.mjs';

test('accepts opaque UUID and pay_ IDs returned by RollyPay',()=>{
  assert.equal(validPaymentId('2cc7e0ca-a7e7-44ba-ac6c-2805db647e27'),true);
  assert.equal(validPaymentId('pay_a1b2c3d4-e5f6-7890-abcd-ef1234567890'),true);
  assert.equal(PAY_URL_PATH_PATTERN.test('/pay/abcdef_123456'),true);
});
test('rejects unsafe payment IDs and URLs',()=>{
  for(const id of ['',null,'../admin','pay/id?x=y','pay/id%2Fother','a b','line\nfeed','a'.repeat(129)]){
    assert.equal(validPaymentId(id),false,String(id));
  }
  for(const path of ['/pay/../secret','/pay/a b','/pay/id?token=1','/pay/abc','//evil.com/pay/abcdef']){
    assert.equal(PAY_URL_PATH_PATTERN.test(path),false,path);
  }
});
test('lookup supports provider-issued UUID as one encoded path segment',async()=>{
  const oldFetch=globalThis.fetch,key=process.env.ROLLYPAY_API_KEY;
  const id='2cc7e0ca-a7e7-44ba-ac6c-2805db647e27';
  process.env.ROLLYPAY_API_KEY='local-test-only';
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'https://rollypay.io/api/v1/payments/'+id);
    assert.equal(options.headers['X-API-Key'],'local-test-only');
    return new Response(JSON.stringify({payment_id:id,status:'paid'}),{status:200});
  };
  try{assert.equal((await fetchPayment(id)).payment_id,id)}
  finally{
    globalThis.fetch=oldFetch;
    if(key===undefined)delete process.env.ROLLYPAY_API_KEY;else process.env.ROLLYPAY_API_KEY=key;
  }
});
test('checkout validates opaque RollyPay response without rejecting UUIDs',async()=>{
  const oldFetch=globalThis.fetch,key=process.env.ROLLYPAY_API_KEY,origin=process.env.PUBLIC_SITE_ORIGIN;
  const id='2cc7e0ca-a7e7-44ba-ac6c-2805db647e27';
  const orderId='85f4948d-39bc-4ee5-89ce-f8a8ce2b5b42';
  process.env.ROLLYPAY_API_KEY='local-test-only';
  process.env.PUBLIC_SITE_ORIGIN='https://vpn.example.com';
  globalThis.fetch=async (url,options)=>{
    assert.equal(options.method,'POST');
    return new Response(JSON.stringify({
      payment_id:id,order_id:orderId,status:'created',amount:'99.00',
      payment_currency:'RUB',pay_url:'https://pay.rollypay.io/pay/some_safe_token_123'
    }),{status:200});
  };
  try{
    const result=await createInvoice({orderId,amountKopeks:9900,telegramId:'123456789',description:'Test'});
    assert.equal(result.paymentId,id);
  }finally{
    globalThis.fetch=oldFetch;
    if(key===undefined)delete process.env.ROLLYPAY_API_KEY;else process.env.ROLLYPAY_API_KEY=key;
    if(origin===undefined)delete process.env.PUBLIC_SITE_ORIGIN;else process.env.PUBLIC_SITE_ORIGIN=origin;
  }
});
