import {randomUUID} from 'node:crypto';
import {json} from './lib/security.mjs';

// Check merchant credentials with a documented read-only GET.
// Never send balances, terminal identifiers, API keys, or raw provider responses to the browser.
let cached=null;
export async function inspectRollypay({env=process.env,fetcher=fetch,now=Date.now()}={}){
  const key=String(env.ROLLYPAY_API_KEY||'').trim();
  if(!key)return {ok:false,provider:'not_configured'};
  // Optional in RollyPay docs, but certain terminal configurations may require it.
  const terminalId=String(env.ROLLYPAY_TERMINAL_ID||'').trim();
  if(terminalId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(terminalId))
    return {ok:false,provider:'invalid_configuration',field:'ROLLYPAY_TERMINAL_ID'};
  // Coalesce ordinary repeated public checks on a warm function instance.
  // Cache only sanitized status, and only for the real server environment.
  if(env===process.env && fetcher===fetch && cached && now-cached.at<60000)return cached.result;
  const result=await (async()=>{
    let response;
    try{
      response=await fetcher('https://rollypay.io/api/v1/balance'+(terminalId?'?terminal_id='+encodeURIComponent(terminalId):''),{
        method:'GET',redirect:'error',cache:'no-store',
        headers:{'X-API-Key':key,'X-Nonce':randomUUID(),Accept:'application/json'},
        signal:AbortSignal.timeout(8000)
      });
    }catch(error){
      const timeout=error?.name==='TimeoutError'||error?.name==='AbortError'||
        error?.cause?.code==='ETIMEDOUT';
      return {ok:false,provider:'unavailable',reason:timeout?'timeout':'network_error'};
    }
    if(response?.status===401)return {ok:false,provider:'reachable',authentication:'rejected'};
    if(response?.status===403)return {ok:false,provider:'reachable',authentication:'forbidden'};
    if(response?.status===429)return {ok:false,provider:'rate_limited'};
    if(response?.status===400){
      // RollyPay documents {"error":"..."}; return only a fixed diagnostic code.
      // Never reflect an arbitrary provider-supplied message or merchant information.
      let reason='bad_request';
      try {
        if(Number(response.headers?.get('content-length')||0)<=1024){
          const raw=await response.text();
          if(raw.length<=1024){
            const value=JSON.parse(raw)?.error;
            if(typeof value==='string'){
              if(/^terminal_id is required$/i.test(value.trim()))reason='terminal_id_required';
              else if(/^terminal not found$/i.test(value.trim()))reason='terminal_not_found';
            }
          }
        }
      }catch{}
      return {ok:false,provider:'http_error',httpStatus:400,reason};
    }
    if(!response?.ok){
      // Status code is safe to disclose; response bodies may contain private account data.
      const code=Number(response?.status);
      return {ok:false,provider:'http_error',httpStatus:
        Number.isInteger(code)&&code>=300&&code<=599?code:null};
    }
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
