'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {plans}=require('../shared/catalog.cjs');
const {parseStatus,readCheckoutStatus}=require('../shared/checkout-status.cjs');
const catalog=(checkoutReady=false)=>JSON.stringify({
  checkoutReady,plans:plans.map(x=>({id:x.id,days:x.days,deviceLimit:x.deviceLimit,priceRub:x.priceRub.toFixed(2)}))
});
test('Desktop billing status validates all six server prices without creating invoices',()=>{
  assert.deepEqual(parseStatus(catalog()),{ready:false,catalogMatches:true});
  assert.deepEqual(parseStatus(catalog(true)),{ready:true,catalogMatches:true});
  const o=JSON.parse(catalog(true));o.plans[0].priceRub='0.01';
  assert.deepEqual(parseStatus(JSON.stringify(o)),{ready:false,catalogMatches:false});
  assert.deepEqual(parseStatus('{}'),{ready:false,catalogMatches:false});
});
test('Remote errors, redirects and HTTP failures always disable billing',async()=>{
  assert.deepEqual(await readCheckoutStatus({request:async()=>({status:302})}),{ready:false,catalogMatches:false});
  assert.deepEqual(await readCheckoutStatus({request:async()=>{throw Error('offline')}}),{ready:false,catalogMatches:false});
  assert.deepEqual(await readCheckoutStatus({request:async()=>({status:200,
    arrayBuffer:async()=>Buffer.from(catalog())})}),{ready:false,catalogMatches:true});
});
