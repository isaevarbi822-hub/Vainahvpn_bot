import {randomUUID} from 'node:crypto';
import {json} from './lib/security.mjs';

// Check merchant credentials with a documented read-only GET.
// Never send balances, terminal identifiers, API keys, or raw provider responses to the browser.
let cached=null;
export async function inspectRollypay({env=process.env,fetcher=fetch,now=Date.now()}={}){
  const key=String(env.ROLLYPAY_API_KEY||'').trim();
  if(!key)return {ok:false,provider:'not_configured'};
  // Coalesce ordinary repeated public checks on a warm function instance.
  // Cache only sanitized status, and only for the real server environment.
  if(env===process.env && fetcher===fetch && cached && now-cached.at<60000)return cached.result;
  const result=await (async()=>{
    let response;
    try{
      response=await fetcher('https://rollypay.io/api/v1/balance',{
        method:'GET',redirect:'error',cache:'no-store',
        headers:{'X-API-Key':key,'X-Nonce':randomUUID(),Accept:'application/json'},
        signal:AbortSignal.timeout(8000)
      });
    }catch{return {ok:false,provider:'unavailable'}}
    if(response?.status===401)return {ok:false,provider:'reachable',authentication:'rejected'};
    if(response?.status===403)return {ok:false,provider:'reachable',authentication:'forbidden'};
    if(!response?.ok)return {ok:false,provider:'unavailable'};
    try{
      if(Number(response.headers?.get('content-length')||0)>8192)
        return {ok:false,provider:'invalid_response'};
      const raw=await response.text();
      if(raw.length>8192)return {ok:false,provider:'invalid_response'};
      const data=JSON.parse(raw);
      if(!data || typeof data!=='object' || Array.isArray(data) ||
         typeof data.terminal_id!=='string' || typeof data.available_usdt!=='string' ||
         typeof data.hold_usdt!=='string')
        return {ok:false,provider:'invalid_response'};
      return {ok:true,provider:'reachable',authentication:'accepted'};
    }catch{return {ok:false,provider:'invalid_response'}}
  })();
  if(env===process.env && fetcher===fetch)cached={at:now,result};
  return result;
}
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const status=await inspectRollypay();
  return json(status,status.ok?200:503);
}
