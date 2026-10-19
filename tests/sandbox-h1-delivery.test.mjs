import test from 'node:test';
import assert from 'node:assert/strict';
import {deliverPaidSandboxProfile,sandboxDeliveryReady} from '../netlify/functions/lib/sandbox-h1-delivery.mjs';
import {createSandboxPayment} from '../netlify/functions/lib/rollypay-sandbox.mjs';

const id='123456789';
const env={
  VAINAH_SANDBOX_TELEGRAM_ID:id,
  VAINAH_SANDBOX_H1_DELIVERY:'enabled-test-only',
  ROLLYPAY_API_KEY:'TEST-DO-NOT-USE',
  SESSION_SIGNING_KEY:'X'.repeat(48),
  PANEL_BASE_URL:'https://h1panel.example.test',
  PANEL_API_TOKEN:'H1-FAKE-TOKEN',
  PANEL_CLIENT_PREFIX:'tg',
  TELEGRAM_BOT_TOKEN:'123456789:FAKE_BOT_TOKEN_ABCDEF1234567890XYZ'
};
const now=1800000000000;
const name='vainah_sbx_'+id;
const link='https://panel.example.test/sub/private-test-link';
const goodClient={name,expires_at:Math.floor(now/1000)+86400,status:'active',sub_url:link};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}
});
async function proof(){
  const p=await createSandboxPayment(id,{env,now,fetcher:async(_url,options)=>{
    const q=JSON.parse(options.body);
    return reply({payment_id:'pay_SANDBOX1234',order_id:q.order_id,
      payment_currency:'RUB',amount:'10.00',test:true,environment:'sandbox',
      status:'created',pay_url:'https://pay.rollypay.io/pay/token_SANDBOX1234'});
  }});
  return p.proof;
}
function backend(proof,config={}) {
  const requests=[];
  const state={created:false};
  const fetcher=async(url,opts)=>{
    const method=opts?.method||'GET';
    requests.push({url,method,opts});
    if(url==='https://rollypay.io/api/v1/payments/pay_SANDBOX1234')
      return reply({payment_id:'pay_SANDBOX1234',order_id:config.orderId||'bogus',
        payment_currency:'RUB',amount:'10.00',test:true,environment:'sandbox',
        status:config.paymentStatus||'paid',...(config.paymentOverride||{})});
    if(url==='https://h1panel.example.test/api/clients/'+name)
      return state.created||config.existing?reply({ok:true,client:config.client||goodClient}):
        reply({ok:false,error:'user_not_found'},404);
    if(url==='https://h1panel.example.test/api/create') {
      state.created=true;
      return reply({ok:true,client:goodClient});
    }
    if(url.startsWith('https://api.telegram.org/bot'))
      return reply({ok:true,result:{message_id:123}});
    throw Error('Unexpected external request');
  };
  return {fetcher,requests,state};
}
test('test delivery is disabled by default and when the owner is not verified',()=>{
  assert.equal(sandboxDeliveryReady(id,{...env,VAINAH_SANDBOX_H1_DELIVERY:''}),false);
  assert.equal(sandboxDeliveryReady('987654321',env),false);
  assert.equal(sandboxDeliveryReady(id,{...env,PANEL_CLIENT_PREFIX:'vainah_sbx_'}),false);
  assert.equal(sandboxDeliveryReady(id,env),true);
});
test('paid sandbox payment creates only a reserved 1-day test profile and sends link to owner',async()=>{
  const ticket=await proof();
  const expectedOrder=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).orderId;
  const r=backend(ticket,{orderId:expectedOrder});
  const result=await deliverPaidSandboxProfile(id,ticket,{env,now,fetcher:r.fetcher});
  assert.equal(result.test,true);
  assert.equal(result.sent,true);
  assert.equal(result.created,true);
  assert.equal(r.requests.filter(x=>x.method==='POST'&&x.url.endsWith('/api/create')).length,1);
  const create=r.requests.find(x=>x.url.endsWith('/api/create'));
  assert.deepEqual(JSON.parse(create.opts.body),{name,days:1,device_limit:1});
  assert.equal(r.requests.filter(x=>x.method==='PATCH'||x.method==='DELETE').length,0);
  assert.equal(r.requests.some(x=>x.url.includes('/api/clients/tg'+id)),false);
  const sent=r.requests.find(x=>x.url.startsWith('https://api.telegram.org/'));
  const msg=JSON.parse(sent.opts.body);
  assert.equal(msg.chat_id,id);
  assert.ok(msg.text.includes(link));
  assert.doesNotMatch(JSON.stringify(result),/private-test-link|FAKE_BOT_TOKEN|TEST-DO-NOT-USE/);
});
test('a repeated check reuses test profile but never adds days',async()=>{
  const ticket=await proof();
  const expectedOrder=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).orderId;
  const r=backend(ticket,{existing:true,orderId:expectedOrder});
  const out=await deliverPaidSandboxProfile(id,ticket,{env,now,fetcher:r.fetcher});
  assert.equal(out.created,false);
  assert.equal(r.requests.filter(x=>x.url.endsWith('/api/create')).length,0);
  assert.equal(r.requests.filter(x=>x.method==='PATCH').length,0);
});
test('an unpaid test payment cannot ever create or send a profile',async()=>{
  const r=backend('any',{});
  await assert.rejects(deliverPaidSandboxProfile(id,'bad',{env,now,fetcher:r.fetcher}),
    e=>e.code==='INVALID_TEST_SESSION');
  assert.equal(r.requests.length,0);
  await assert.rejects(deliverPaidSandboxProfile(id,'bad',{env:{...env,VAINAH_SANDBOX_H1_DELIVERY:''},now,fetcher:r.fetcher}),
    e=>e.code==='TEST_DELIVERY_DISABLED');
  assert.equal(r.requests.length,0);
});
test('wrong existing profile name, excessive expiry and insecure links are rejected without Telegram delivery',async()=>{
  const ticket=await proof();
  const orderId=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).orderId;
  for(const client of [
    {...goodClient,name:'tg'+id},
    {...goodClient,expires_at:Math.floor(now/1000)+365*86400},
    {...goodClient,sub_url:'http://example.test/sub/test'},
    {...goodClient,sub_url:'https://example.test/sub/id\nsecret'}
  ]) {
    const r=backend(ticket,{orderId,existing:true,client});
    await assert.rejects(deliverPaidSandboxProfile(id,ticket,{env,now,fetcher:r.fetcher}));
    assert.equal(r.requests.some(x=>x.url.startsWith('https://api.telegram.org/')),false);
    assert.equal(r.requests.some(x=>x.method!=='GET'),false);
  }
});
test('provider says unpaid or live: H1 and Telegram must not be touched',async()=>{
  const ticket=await proof();
  const orderId=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).orderId;
  for(const status of ['created','processing','canceled']){
    const r=backend(ticket,{orderId,paymentStatus:status});
    await assert.rejects(deliverPaidSandboxProfile(id,ticket,{env,now,fetcher:r.fetcher}),
      e=>e.code==='TEST_PAYMENT_NOT_PAID');
    assert.equal(r.requests.filter(x=>x.url!=='https://rollypay.io/api/v1/payments/pay_SANDBOX1234').length,0);
  }
});

test('signed paid sandbox receipt with omitted GET fields creates only separate 1-day demo and notifies Telegram',async()=>{
 const ticket=await proof();
 const orderId=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).orderId;
 const backendCase=backend(ticket,{orderId,paymentOverride:{
   test:undefined,environment:undefined,amount:undefined,payment_currency:undefined
 }});
 const result=await deliverPaidSandboxProfile(id,ticket,{env,now,fetcher:backendCase.fetcher});
 assert.equal(result.test,true);
 assert.equal(result.sent,true);
 assert.equal(result.created,true);
 assert.equal(backendCase.requests.filter(x=>x.url.endsWith('/api/create')).length,1);
 assert.equal(backendCase.requests.filter(x=>x.method==='PATCH'||x.method==='DELETE').length,0);
 assert.equal(backendCase.requests.some(x=>x.url.includes('/api/clients/tg'+id)),false);
});
test('different explicit paid amount never reaches H1Cloud or Telegram',async()=>{
 const ticket=await proof();
 const orderId=JSON.parse(Buffer.from(ticket.split('.')[0],'base64url')).orderId;
 const backendCase=backend(ticket,{orderId,paymentOverride:{
   amount:'1000',test:undefined,environment:undefined
 }});
 await assert.rejects(deliverPaidSandboxProfile(id,ticket,{
   env,now,fetcher:backendCase.fetcher
 }),e=>e.code==='PROVIDER_AMOUNT_MISMATCH');
 assert.equal(backendCase.requests.filter(x=>!x.url.startsWith('https://rollypay.io/')).length,0);
});
