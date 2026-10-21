'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {billingStatus,openBillingPlan,STATUS_URL}=require('../shared/billing-bridge.cjs');

const plans=[
 {id:'30',days:30,title:'Месяц',priceRub:'99.00',deviceLimit:3},
 {id:'60',days:60,title:'2 месяца',priceRub:'160.00',deviceLimit:3},
 {id:'90',days:90,title:'3 месяца',priceRub:'219.00',deviceLimit:3},
 {id:'180',days:180,title:'6 месяцев',priceRub:'339.00',deviceLimit:3},
 {id:'365',days:365,title:'Год',priceRub:'700.00',deviceLimit:3},
 {id:'365-family',days:365,title:'Семейный год',priceRub:'1000.00',deviceLimit:6}
];
const reply=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json'}
});
test('desktop always queries only the first-party endpoint without user credentials',async()=>{
 let path,options;
 const r=await billingStatus(async(url,opts)=>{
  path=url;options=opts;
  return reply({checkoutReady:false,plans});
 });
 assert.deepEqual(r,{ready:false,reason:'DISABLED'});
 assert.equal(path,STATUS_URL);
 assert.equal(options.method,'GET');
 assert.equal(options.credentials,'omit');
 assert.equal(options.redirect,'error');
 assert.equal(options.cache,'no-store');
 assert.equal(options.body,undefined);
});
test('server kill-switch refuses to open any payment page or charge card',async()=>{
 let opened=false;
 const result=await openBillingPlan('30',{
  fetcher:async()=>reply({checkoutReady:false,plans}),
  openExternal:()=>{opened=true}
 });
 assert.deepEqual(result,{ok:false,reason:'DISABLED'});
 assert.equal(opened,false);
});
test('even if browser opens, it never claims a paid subscription',async()=>{
 let opened;
 const result=await openBillingPlan('365-family',{
  fetcher:async()=>reply({checkoutReady:true,plans}),
  openExternal:async url=>{opened=url}
 });
 assert.equal(opened,'https://vainahvpnbot0.netlify.app/checkout.html?plan=365-family');
 assert.deepEqual(result,{ok:true,checkoutOpened:true,paymentConfirmed:false});
});
test('arbitrary renderer plan IDs, duplicate catalog or guessed prices cannot open checkout',async()=>{
 let count=0;
 const openExternal=()=>{count++};
 const fetcher=async()=>reply({checkoutReady:true,plans});
 for(const id of ['invalid','../index.html','30&amount=1','https://example.org',
                       null,3,'365-family#trick']){
  assert.deepEqual(await openBillingPlan(id,{fetcher,openExternal}),
    {ok:false,reason:'INVALID_PLAN'});
 }
 assert.equal(count,0);
 for(const change of [
  plans.slice(0,-1),
  [...plans.slice(0,5),plans[0]],
  plans.map(p=>p.id==='30'?{...p,priceRub:'free'}:p),
  [...plans,{id:'admin',days:1,title:'Admin',priceRub:'1.00',deviceLimit:3}]
 ]){
  const status=await billingStatus(async()=>reply({checkoutReady:true,plans:change}));
  assert.deepEqual(status,{ready:false,reason:'INVALID_CATALOG'});
 }
});
test('network failure, redirect, broken JSON, and disabled backend all fail closed',async()=>{
 assert.equal((await billingStatus(async()=>{throw Error('network')})).ready,false);
 assert.equal((await billingStatus(async()=>new Response(null,{status:302}))).ready,false);
 assert.equal((await billingStatus(async()=>new Response('<html>login</html>'))).ready,false);
 assert.deepEqual(await openBillingPlan('30',{
  fetcher:async()=>reply({checkoutReady:true,plans}),
  openExternal:async()=>{throw Error('browser blocked')}
 }),{ok:false,reason:'BROWSER_UNAVAILABLE'});
});
