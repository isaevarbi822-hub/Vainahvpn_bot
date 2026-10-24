'use strict';
/**
 * Preserve the user's selected H1 location when its credentials rotate.
 * This logic stays inside the main process. Renderer only receives labels.
 */
function endpoint(profile){
  const outbound=profile?.outbounds?.find(o=>o?.protocol==='vless');
  const next=outbound?.settings?.vnext?.[0];
  const real=outbound?.streamSettings?.realitySettings;
  if(!next||typeof next.address!=='string'||!Number.isInteger(next.port)||!real)return null;
  return [next.address.toLowerCase(),next.port,String(real.serverName||'').toLowerCase()].join('|');
}
function reconcileSubscriptionSelection(previous,profiles){
  if(!Array.isArray(profiles)||!profiles.length||!previous)return null;
  const old=JSON.stringify(previous);
  const exact=profiles.find(p=>JSON.stringify(p)===old);
  if(exact)return exact;
  const oldEndpoint=endpoint(previous);
  if(!oldEndpoint)return null;
  return profiles.find(p=>endpoint(p)===oldEndpoint)||null;
}
module.exports={endpoint,reconcileSubscriptionSelection};
