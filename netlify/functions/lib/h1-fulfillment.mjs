import {getPool,getInternalOrder,claimDelivery,reserveExpiry,deliveryDone,deliveryRetry} from './subscription-db.mjs';

async function withCustomerDeliveryLock(telegramId,work) {
  const db=await (await getPool()).connect();
  try{
    await db.query('BEGIN');
    // A PostgreSQL advisory transaction lock serializes deliveries for one Telegram ID.
    // It prevents a slower webhook overwriting a newer expiry in H1Cloud.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1), 60481)',[telegramId]);
    const result=await work();
    await db.query('COMMIT');
    return result;
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
  finally{db.release()}
}

function panelConfig(){
  const base=(process.env.PANEL_BASE_URL||'').replace(/\/+$/,'');
  if(!/^https:\/\/[a-z0-9.-]+(?::[0-9]+)?(?:\/[a-z0-9_-]+)*$/i.test(base) ||
      !process.env.PANEL_API_TOKEN) throw Error('H1_PANEL_NOT_CONFIGURED');
  const ids=(process.env.PANEL_INBOUND_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x));
  if(!ids.length)throw Error('H1_INBOUNDS_NOT_CONFIGURED');
  return {base,ids};
}
async function panel(path,options={}) {
  const {base}=panelConfig();
  const res=await fetch(base+'/api'+path,{
    ...options,signal:AbortSignal.timeout(9000),
    headers:{Authorization:'Bearer '+process.env.PANEL_API_TOKEN,Accept:'application/json',
      ...(options.body?{'Content-Type':'application/json'}:{})}
  });
  const data=await res.json().catch(()=>({}));
  if(res.status===404) return null;
  if(!res.ok||data.ok===false) throw Error('H1_HTTP_'+res.status);
  return data;
}
function userClientName(order) {
  const prefix=process.env.PANEL_CLIENT_PREFIX||'tg_';
  const name=prefix+order.telegram_id;
  if(!/^[a-zA-Z0-9_.-]{1,64}$/.test(name))throw Error('H1_BAD_CLIENT_NAME');
  return name;
}
async function telegramSend(chatId,text) {
  if(!process.env.TELEGRAM_BOT_TOKEN)throw Error('TELEGRAM_BOT_TOKEN_MISSING');
  const res=await fetch('https://api.telegram.org/bot'+process.env.TELEGRAM_BOT_TOKEN+'/sendMessage',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
    signal:AbortSignal.timeout(8000)
  });
  const result=await res.json().catch(()=>({}));
  if(!res.ok || result.ok!==true)throw Error('TELEGRAM_DELIVERY_FAILED');
  return true;
}
export async function assertTelegramChat(telegramId) {
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)throw Error('TELEGRAM_BOT_TOKEN_MISSING');
  const response=await fetch('https://api.telegram.org/bot'+token+'/getChat?chat_id='+encodeURIComponent(telegramId),{
    signal:AbortSignal.timeout(7000)
  });
  const result=await response.json().catch(()=>({}));
  return response.ok&&result.ok===true&&result.result?.type==='private'&&String(result.result.id)===telegramId;
}
export async function fulfillPaidOrder(orderId) {
  // Claiming is atomic: parallel callbacks will not trigger two deliveries.
  const claim=await claimDelivery(orderId);
  if(!claim) return {accepted:true,delivery:'already_processing_or_finished'};
  let stage='PANEL_SYNC_FAILED';
  try{
    const order=await getInternalOrder(orderId);
    if(!order || order.status!=='paid' || order.is_test)throw Error('ORDER_NOT_PAID');
    return await withCustomerDeliveryLock(order.telegram_id,async()=> {
    const name=userClientName(order);
    const existing=(await panel('/clients/'+encodeURIComponent(name)))?.client||null;
    const prior=Number(existing?.expires_at||0);
    const booked=await reserveExpiry(orderId,prior>0?prior*1000:0);
    if(!booked?.target_expires_at)throw Error('BOOKING_FAILED');
    const expiresAt=Math.max(Math.floor(new Date(booked.target_expires_at).getTime()/1000),prior);
    let client=existing;
    if(client){
      // Absolute expiry is idempotent; never add days twice on retries.
      const result=await panel('/clients/'+encodeURIComponent(name),{
        method:'PATCH',body:JSON.stringify({expires_at:expiresAt})
      });
      client=result?.client||client;
    } else{
      const {ids}=panelConfig();
      const result=await panel('/create',{
        method:'POST',body:JSON.stringify({
          name,expires_at:expiresAt,manual:true,inbound_ids:[ids[0]],
          device_limit:Number(process.env.DEVICE_LIMIT||3),traffic_limit_gb:Number(process.env.TRAFFIC_LIMIT_GB||0),channels:[]
        })
      });
      client=result?.client||(await panel('/clients/'+encodeURIComponent(name)))?.client;
    }
    // Confirm the panel sees the intended expiry before sending any access URL.
    const fresh=(await panel('/clients/'+encodeURIComponent(name)))?.client||client;
    if(!fresh || Number(fresh.expires_at||0)<expiresAt)throw Error('H1_EXPIRY_NOT_CONFIRMED');
    const profile=fresh.subscription_url||fresh.sub_url;
    if(!profile || typeof profile!=='string'||!/^https:\/\//.test(profile))throw Error('H1_SUBSCRIPTION_URL_MISSING');
    stage='TELEGRAM_DELIVERY_FAILED';
    await telegramSend(order.telegram_id,
      'Vainah VPN 💜\nПлатёж подтверждён! Подписка активна до '+new Date(expiresAt*1000).toLocaleDateString('ru-RU',{timeZone:'UTC'})+
      '.\n\nТвоя личная ссылка для VPN-клиента:\n'+profile+
      '\n\nНе пересылай эту ссылку другим людям. Если не удаётся подключиться, открой раздел помощи на сайте.');
    await deliveryDone(orderId);
    return {accepted:true,delivery:'delivered'};
    });
  }catch(error){
    // Do not log customer subscription URLs, bot token or payment credentials.
    console.error('Vainah delivery status:',stage);
    await deliveryRetry(orderId,stage).catch(()=>{});
    return {accepted:true,delivery:'retry_required'};
  }
}
