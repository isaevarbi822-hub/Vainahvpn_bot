import {panelSettings} from './h1-readonly.mjs';
import {sandboxAllowed,checkSandboxPayment} from './rollypay-sandbox.mjs';

const TEST_CLIENT_PREFIX='vainah_sbx_';
const TEST_DAYS=1;
const MAX_EXPIRY_SEC=48*3600;

export class SandboxDeliveryError extends Error {
  constructor(code){super(code);this.code=code;}
}
export function sandboxDeliveryReady(telegramId,env=process.env) {
  if(!sandboxAllowed(telegramId,env)||env.VAINAH_SANDBOX_H1_DELIVERY!=='enabled-test-only')
    return false;
  const bot=String(env.TELEGRAM_BOT_TOKEN||'').trim();
  if(!/^[0-9]{5,15}:[A-Za-z0-9_-]{20,}$/.test(bot))return false;
  try{
    const settings=panelSettings(env);
    return !!settings && settings.prefix+telegramId!==TEST_CLIENT_PREFIX+telegramId;
  }catch{return false;}
}
function safeClientName(id) {
  if(!/^[1-9][0-9]{0,17}$/.test(id))throw new SandboxDeliveryError('TEST_OWNER_INVALID');
  return TEST_CLIENT_PREFIX+id;
}
async function requestPanel(path,{settings,fetcher,method='GET',payload}){
  let response;
  try{
    response=await fetcher(settings.apiOrigin+'/api'+path,{
      method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000),
      headers:{
        Authorization:'Bearer '+settings.token,Accept:'application/json',
        ...(payload?{'Content-Type':'application/json'}:{})
      },
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
  }catch{throw new SandboxDeliveryError('TEST_PANEL_UNREACHABLE')}
  if(!response || typeof response.ok!=='boolean')throw new SandboxDeliveryError('TEST_PANEL_INVALID_RESPONSE');
  if(response.status===401||response.status===403)throw new SandboxDeliveryError('TEST_PANEL_UNAUTHORIZED');
  if(Number(response.headers?.get('content-length')||0)>100000)
    throw new SandboxDeliveryError('TEST_PANEL_INVALID_RESPONSE');
  let data;
  try{
    const raw=await response.text();
    if(raw.length>100000)throw Error('Too long');
    data=JSON.parse(raw);
  }catch{throw new SandboxDeliveryError('TEST_PANEL_INVALID_RESPONSE')}
  if(method==='GET'&&response.status===404&&data?.error==='user_not_found')
    return null;
  if(!response.ok||data?.ok!==true)
    throw new SandboxDeliveryError(method==='POST'?'TEST_PANEL_CREATE_FAILED':'TEST_PANEL_READ_FAILED');
  return data;
}
function validateProfile(raw,name,now) {
  const client=raw?.client;
  if(!client||typeof client!=='object'||Array.isArray(client)||client.name!==name)
    throw new SandboxDeliveryError('TEST_PANEL_PROFILE_MISMATCH');
  const expiry=Number(client.expires_at);
  if(!Number.isSafeInteger(expiry)||expiry<=now/1000||expiry>now/1000+MAX_EXPIRY_SEC)
    throw new SandboxDeliveryError('TEST_PANEL_PROFILE_UNSAFE');
  if(client.banned===true||client.status==='banned'||client.status==='disabled')
    throw new SandboxDeliveryError('TEST_PANEL_PROFILE_UNSAFE');
  const str=client.sub_url||client.subscription_url;
  if(typeof str!=='string'||str.length>2048||/[\r\n\s]/.test(str))
    throw new SandboxDeliveryError('TEST_PANEL_LINK_INVALID');
  let link;
  try{link=new URL(str)}catch{throw new SandboxDeliveryError('TEST_PANEL_LINK_INVALID')}
  if(link.protocol!=='https:'||!link.hostname||link.username||link.password||link.hash)
    throw new SandboxDeliveryError('TEST_PANEL_LINK_INVALID');
  return {expiresAt:new Date(expiry*1000).toISOString(),link:str};
}
/**
 * Strictly sandbox-only provisioning:
 *   - signed Telegram session and owner allowlist
 *   - short-lived signed order proof AND fresh paid sandbox API response
 *   - exactly one reserved 1-day test client name, never tg<ID>
 *   - no PATCH/DELETE, no addition of days on repeated confirmations
 *   - link leaves server only via Telegram to the verified owner
 *
 * No DB / delivery state: messages may be repeated on retries. Never use
 * this adapter for real orders or claim exactly-once notifications.
 */
export async function deliverPaidSandboxProfile(telegramId,proof,{
  env=process.env,fetcher=fetch,now=Date.now(),checkPayment=checkSandboxPayment
}={}) {
  const id=String(telegramId||'');
  if(!sandboxDeliveryReady(id,env))
    throw new SandboxDeliveryError('TEST_DELIVERY_DISABLED');
  const payment=await checkPayment(id,proof,{env,fetcher,now});
  if(payment?.test!==true||payment.status!=='paid')
    throw new SandboxDeliveryError('TEST_PAYMENT_NOT_PAID');

  const settings=panelSettings(env);
  const name=safeClientName(id);
  if(name===settings.prefix+id)
    throw new SandboxDeliveryError('TEST_CLIENT_NAME_COLLISION');
  const path='/clients/'+encodeURIComponent(name);
  let raw=await requestPanel(path,{settings,fetcher});
  let created=false;
  if(raw===null) {
    // A separate profile, independent of the existing tg<ID> real subscription.
    // There is intentionally no renew/extend path in this module.
    await requestPanel('/create',{
      settings,fetcher,method:'POST',
      payload:{name,days:TEST_DAYS,device_limit:1}
    });
    created=true;
    raw=await requestPanel(path,{settings,fetcher});
    if(!raw)throw new SandboxDeliveryError('TEST_PANEL_CREATE_NOT_VISIBLE');
  }
  const profile=validateProfile(raw,name,now);

  const bot=String(env.TELEGRAM_BOT_TOKEN).trim();
  let response;
  try{
    response=await fetcher('https://api.telegram.org/bot'+bot+'/sendMessage',{
      method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(9000),
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        chat_id:id,
        text:'🧪 Vainah VPN — ТЕСТОВАЯ ВЫДАЧА\n\nОплата RollyPay проверена в тестовом режиме.\n'+
          'Создан отдельный демонстрационный профиль на 1 день (либо использован уже созданный).'+
          '\nОсновная подписка не изменена.\n\n'+
          'Ссылка для VPN-клиента:\n'+profile.link+
          '\n\nНе пересылай свою личную ссылку другим людям.',
        disable_web_page_preview:true
      })
    });
  }catch{throw new SandboxDeliveryError('TEST_TELEGRAM_UNREACHABLE')}
  if(response.status===400||response.status===403)
    throw new SandboxDeliveryError('TEST_TELEGRAM_START_BOT');
  let sent;
  try{sent=await response.json()}catch{throw new SandboxDeliveryError('TEST_TELEGRAM_SEND_FAILED')}
  if(!response.ok||sent?.ok!==true)
    throw new SandboxDeliveryError('TEST_TELEGRAM_SEND_FAILED');
  return {test:true,sent:true,created,expiresAt:profile.expiresAt};
}
