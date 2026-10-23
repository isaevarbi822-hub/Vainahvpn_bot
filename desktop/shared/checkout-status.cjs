'use strict';
const {plans}=require('./catalog.cjs');
// RollyPay keys and invoice creation exist only on the server. This module
// must fail closed if the canonical backend catalogue is unavailable.
const URL_STATUS='https://vainahvpnbot0.netlify.app/.netlify/functions/subscription-plans';
function parseStatus(body){
  try {
    const payload=JSON.parse(body);
    if(!Array.isArray(payload.plans)||payload.plans.length!==plans.length)return Object.freeze({ready:false,catalogMatches:false});
    const ids=new Set();
    for(const item of payload.plans){
      const plan=plans.find(p=>p.id===item?.id);
      if(!plan||ids.has(plan.id)||item.days!==plan.days||
         item.deviceLimit!==plan.deviceLimit||
         item.priceRub!==plan.priceRub.toFixed(2))return Object.freeze({ready:false,catalogMatches:false});
      ids.add(plan.id);
    }
    return Object.freeze({ready:payload.checkoutReady===true,catalogMatches:true});
  }catch{return Object.freeze({ready:false,catalogMatches:false});}
}
async function readCheckoutStatus({request=globalThis.fetch}={}){
  try{
    const response=await request(URL_STATUS,{method:'GET',redirect:'manual',
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000)});
    if(response.status!==200)return Object.freeze({ready:false,catalogMatches:false});
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength>20000)return Object.freeze({ready:false,catalogMatches:false});
    return parseStatus(Buffer.from(bytes).toString('utf8'));
  }catch{return Object.freeze({ready:false,catalogMatches:false});}
}
module.exports={parseStatus,readCheckoutStatus};
