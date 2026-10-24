import {panelSettings,H1StatusError} from './h1-readonly.mjs';

/**
 * Returns only the currently authenticated owner's existing, active HTTPS
 * subscription URL. No database lookup, creation, renewal or mutation.
 *
 * Caller must derive telegramId from a signed, HttpOnly login session.
 */
export async function readOwnH1Access(telegramId,{env=process.env,fetcher=fetch,now=Date.now()}={}){
  if(!/^[1-9][0-9]{0,17}$/.test(String(telegramId||'')))
    throw new H1StatusError('TELEGRAM_ID_INVALID');
  const settings=panelSettings(env);
  if(!settings)throw new H1StatusError('PANEL_NOT_CONFIGURED');
  const name=settings.prefix+String(telegramId);
  let res;
  try{
    res=await fetcher(settings.apiOrigin+'/api/clients/'+encodeURIComponent(name),{
      method:'GET',
      headers:{Authorization:'Bearer '+settings.token,Accept:'application/json'},
      redirect:'error',
      cache:'no-store',
      signal:AbortSignal.timeout(8000)
    });
  }catch{throw new H1StatusError('PANEL_UNREACHABLE');}
  if(res.status===401||res.status===403)throw new H1StatusError('PANEL_UNAUTHORIZED');
  if(res.status===429)throw new H1StatusError('PANEL_RATE_LIMITED');
  if(res.status>=500)throw new H1StatusError('PANEL_SERVER_ERROR');
  let data;
  try{
    if(Number(res.headers?.get('content-length')||0)>100000)throw Error('Too large');
    const raw=await res.text();
    if(raw.length>100000)throw Error('Too large');
    data=JSON.parse(raw);
  }catch{throw new H1StatusError('PANEL_INVALID_RESPONSE');}
  if(res.status===404&&data?.error==='user_not_found')
    throw new H1StatusError('PANEL_CLIENT_NOT_FOUND');
  if(!res.ok||data?.ok!==true)
    throw new H1StatusError('PANEL_API_ERROR');
  const client=data.client;
  if(!client||typeof client!=='object'||Array.isArray(client)||client.name!==name)
    throw new H1StatusError('PANEL_INVALID_RESPONSE');
  const expiry=Number(client.expires_at);
  if(!Number.isSafeInteger(expiry)||expiry<0||expiry>4102444800)
    throw new H1StatusError('PANEL_INVALID_RESPONSE');
  if(client.banned===true||['banned','disabled'].includes(client.status)||expiry*1000<=now)
    throw new H1StatusError('PANEL_CLIENT_INACTIVE');
  const rawUrl=client.subscription_url||client.sub_url;
  if(typeof rawUrl!=='string'||rawUrl.length<10||rawUrl.length>2048||/\s/.test(rawUrl))
    throw new H1StatusError('PANEL_LINK_MISSING');
  let url;
  try{url=new URL(rawUrl);}catch{throw new H1StatusError('PANEL_LINK_MISSING');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash||url.href!==rawUrl)
    throw new H1StatusError('PANEL_LINK_MISSING');
  return {subscriptionUrl:rawUrl,expiresAt:new Date(expiry*1000).toISOString()};
}
