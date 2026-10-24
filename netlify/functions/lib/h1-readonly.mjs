/**
 * Read-only H1 VLESS panel adapter.
 * The panel responds to GET /api/clients/{name} with {ok:true,client:{...}}.
 * Never expose client UUID, VPN link, device identifiers or private settings.
 */
export class H1StatusError extends Error {
  constructor(code) { super(code); this.code=code; }
}
export function panelSettings(env=process.env) {
  const raw=String(env.PANEL_BASE_URL||'').trim();
  const token=String(env.PANEL_API_TOKEN||'').trim();
  if(!raw || !token) return null;
  let url;
  try{url=new URL(raw);}catch{throw new H1StatusError('PANEL_URL_INVALID');}
  if(url.protocol!=='https:' || !url.hostname || url.username || url.password ||
    url.search || url.hash || !['/','/api','/api/'].includes(url.pathname)){
    throw new H1StatusError('PANEL_URL_INVALID');
  }
  const prefix=String(env.PANEL_CLIENT_PREFIX??'tg').trim();
  if(!/^[A-Za-z0-9_.-]{1,24}$/.test(prefix)){
    throw new H1StatusError('PANEL_PREFIX_INVALID');
  }
  return {apiOrigin:url.origin,token,prefix};
}
export async function readH1ClientStatus(telegramId,options={}) {
  if(!/^[1-9][0-9]{0,17}$/.test(String(telegramId||''))){
    throw new H1StatusError('TELEGRAM_ID_INVALID');
  }
  const {env=process.env,fetcher=fetch,now=Date.now()}=options;
  const settings=panelSettings(env);
  if(!settings) return {panelReady:false,found:false,active:false,expiresAt:null};
  const name=settings.prefix+telegramId;
  const url=settings.apiOrigin+'/api/clients/'+encodeURIComponent(name);
  let response;
  try{
    response=await fetcher(url,{
      method:'GET',
      headers:{Authorization:'Bearer '+settings.token,Accept:'application/json'},
      redirect:'error',
      cache:'no-store',
      signal:AbortSignal.timeout(8000)
    });
  }catch{throw new H1StatusError('PANEL_UNREACHABLE');}
  // Classify HTTP failures before parsing. H1 or its proxy may return an
  // HTML error page during an outage, which is not an invalid client response.
  if(response.status===401 || response.status===403)
    throw new H1StatusError('PANEL_UNAUTHORIZED');
  if(response.status===429)
    throw new H1StatusError('PANEL_RATE_LIMITED');
  if(Number.isInteger(response.status) && response.status>=500 && response.status<=599)
    throw new H1StatusError('PANEL_SERVER_ERROR');
  let data;
  try{
    if(Number(response.headers?.get('content-length')||0)>100000)throw Error('Too large');
    const raw=await response.text();
    if(raw.length>100000)throw Error('Too large');
    data=JSON.parse(raw);
  }catch{throw new H1StatusError('PANEL_INVALID_RESPONSE');}
  if(response.status===404 && data?.error==='user_not_found'){
    return {panelReady:true,found:false,active:false,expiresAt:null};
  }
  if(!response.ok || data?.ok!==true){
    throw new H1StatusError('PANEL_API_ERROR');
  }
  const client=data?.client;
  if(!client || typeof client!=='object' || Array.isArray(client) || client.name!==name){
    throw new H1StatusError('PANEL_INVALID_RESPONSE');
  }
  const seconds=Number(client.expires_at);
  if(!Number.isSafeInteger(seconds) || seconds<0 || seconds>4102444800){
    throw new H1StatusError('PANEL_INVALID_RESPONSE');
  }
  const banned=client.banned===true || client.status==='banned' || client.status==='disabled';
  return {
    panelReady:true,
    found:true,
    active:!banned && seconds*1000>now,
    banned,
    expiresAt:seconds>0?new Date(seconds*1000).toISOString():null,
    // Device limit is safe account metadata, NOT connected-device information.
    // Only include a validated positive integer; never invent a value.
    ...(Number.isSafeInteger(Number(client.device_limit))&&
        Number(client.device_limit)>=1&&Number(client.device_limit)<=100
       ?{deviceLimit:Number(client.device_limit)}:{})
  };
}
