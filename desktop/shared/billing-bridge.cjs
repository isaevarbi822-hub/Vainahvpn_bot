'use strict';
/**
 * Vainah VPN desktop BUY FLOW — browser-only, no card entry inside Electron.
 * All prices and actual payment state belong to the authenticated server.
 * No RollyPay secret, token, callback, payment URL or purchase verification
 * is ever handled inside the VPN client.
 *
 * Every attempt rechecks the exact first-party public endpoint; if the
 * server-side checkout kill-switch is on (currently it is), do not open a
 * checkout page or claim billing is available.
 */
const {SITE}=require('./official.cjs');
const PLAN_IDS=new Set(['30','60','90','180','365','365-family']);
const STATUS_URL=SITE+'/.netlify/functions/subscription-plans';

function validPlan(id){return typeof id==='string'&&PLAN_IDS.has(id)}

async function billingStatus(fetcher=fetch){
  try{
    const response=await fetcher(STATUS_URL,{
      method:'GET',redirect:'error',cache:'no-store',
      credentials:'omit',signal:AbortSignal.timeout(7000),
      headers:{Accept:'application/json'}
    });
    if(!response||!response.ok||
       Number(response.headers?.get('content-length')||0)>16384)
      return {ready:false,reason:'UNAVAILABLE'};
    const text=await response.text();
    if(text.length>16384)return {ready:false,reason:'UNAVAILABLE'};
    const data=JSON.parse(text);
    if(!data||data.checkoutReady!==true||!Array.isArray(data.plans))
      return {ready:false,reason:'DISABLED'};
    const all=PLAN_IDS;
    const safe=data.plans.every(p=>p&&validPlan(p.id)&&
      Number.isInteger(p.days)&&p.days>0&&p.days<=365&&
      typeof p.title==='string'&&p.title.length<=70&&
      typeof p.priceRub==='string'&&/^\d{1,6}\.\d{2}$/.test(p.priceRub)&&
      [3,6].includes(p.deviceLimit)) &&
      data.plans.length===all.size &&
      new Set(data.plans.map(x=>x.id)).size===all.size;
    // Any unexpected or missing catalog row blocks payment instead of
    // guessing the price or falling back to a hand-written checkout URL.
    if(!safe)return {ready:false,reason:'INVALID_CATALOG'};
    return {ready:true,reason:'READY'};
  }catch{return {ready:false,reason:'UNAVAILABLE'}}
}

async function openBillingPlan(planId,{fetcher=fetch,openExternal}={}){
  if(!validPlan(planId))return {ok:false,reason:'INVALID_PLAN'};
  const status=await billingStatus(fetcher);
  if(!status.ready)return {ok:false,reason:status.reason};
  if(typeof openExternal!=='function')return {ok:false,reason:'BROWSER_UNAVAILABLE'};
  const target=SITE+'/checkout.html?plan='+encodeURIComponent(planId);
  try{
    await openExternal(target);
    // Browser opened, not invoice created; never claim payment success.
    return {ok:true,checkoutOpened:true,paymentConfirmed:false};
  }catch{return {ok:false,reason:'BROWSER_UNAVAILABLE'}}
}
module.exports={PLAN_IDS,STATUS_URL,validPlan,billingStatus,openBillingPlan};
