import {panelSettings,H1StatusError} from './h1-readonly.mjs';

/**
 * User-initiated delivery of their ALREADY existing H1 subscription URL.
 * Authenticated caller's numeric Telegram ID must match the H1 client name;
 * no mutation, payment, new user or extension is possible here.
 */
export async function deliverOwnExistingH1Subscription(telegramId,options={}) {
  const {env=process.env,fetcher=fetch,now=Date.now()}=options;
  if(!/^[1-9][0-9]{0,17}$/.test(String(telegramId||'')))throw new H1StatusError('TELEGRAM_ID_INVALID');
  const settings=panelSettings(env);
  if(!settings)throw new H1StatusError('PANEL_NOT_CONFIGURED');
  const botToken=String(env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!/^[0-9]{5,15}:[A-Za-z0-9_-]{20,}$/.test(botToken))throw new H1StatusError('BOT_NOT_CONFIGURED');
  const clientName=settings.prefix+telegramId;
  let result;
  try{
    result=await fetcher(settings.apiOrigin+'/api/clients/'+encodeURIComponent(clientName),{
      method:'GET',
      headers:{Authorization:'Bearer '+settings.token,Accept:'application/json'},
      signal:AbortSignal.timeout(8000),
      redirect:'error',
      cache:'no-store'
    });
  }catch{throw new H1StatusError('PANEL_UNREACHABLE');}
  let raw;
  try{
    if(Number(result.headers?.get('content-length')||0)>100000)throw Error('Too large');
    const text=await result.text();
    if(text.length>100000)throw Error('Too large');
    raw=JSON.parse(text);
  }catch{throw new H1StatusError('PANEL_INVALID_RESPONSE');}
  if(result.status===404&&raw?.error==='user_not_found')throw new H1StatusError('PANEL_CLIENT_NOT_FOUND');
  if(!result.ok||raw?.ok!==true)throw new H1StatusError('PANEL_API_ERROR');
  const client=raw?.client;
  if(!client||client.name!==clientName)throw new H1StatusError('PANEL_INVALID_RESPONSE');
  const expiry=Number(client.expires_at);
  if(!Number.isSafeInteger(expiry)||expiry<0||expiry>4102444800)throw new H1StatusError('PANEL_INVALID_RESPONSE');
  if(client.banned===true||client.status==='banned'||client.status==='disabled'||expiry*1000<=now)throw new H1StatusError('PANEL_CLIENT_INACTIVE');
  const urlText=client.sub_url||client.subscription_url;
  if(typeof urlText!=='string'||urlText.length>2048)throw new H1StatusError('PANEL_LINK_MISSING');
  let link;
  try{link=new URL(urlText);}catch{throw new H1StatusError('PANEL_LINK_MISSING');}
  if(link.protocol!=='https:'||!link.hostname||link.username||link.password||
     /[\r\n\s]/.test(urlText)||link.hash)throw new H1StatusError('PANEL_LINK_MISSING');
  // Do not return, print, cache or embed the URL in the website response.
  let telegram;
  try{
    const response=await fetcher('https://api.telegram.org/bot'+botToken+'/sendMessage',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        chat_id:telegramId,
        text:'Vainah VPN 💜\n\nТвоя действующая подписка до '+new Date(expiry*1000).toLocaleDateString('ru-RU',{timeZone:'UTC'})+
          ':\n'+urlText+'\n\nНе передавай эту личную ссылку другим.',
        disable_web_page_preview:true
      }),
      signal:AbortSignal.timeout(8000),
      redirect:'error',
      cache:'no-store'
    });
    telegram={status:response.status,body:await response.json()};
  }catch{throw new H1StatusError('TELEGRAM_UNREACHABLE');}
  if(telegram.status===403 || telegram.status===400){
    throw new H1StatusError('TELEGRAM_START_BOT_FIRST');
  }
  if(telegram.status!==200||telegram.body?.ok!==true)throw new H1StatusError('TELEGRAM_SEND_FAILED');
  return {sent:true,expiresAt:new Date(expiry*1000).toISOString()};
}
