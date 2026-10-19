import {getPool,findMappedClientName,getInternalOrder,claimDelivery,reserveExpiry,deliveryDone,deliveryRetry} from './subscription-db.mjs';


/** H1 /api/create requires {name,days}; custom inbound selection is optional. */
export function h1CreatePayload({name,days,inboundIds=[],deviceLimit=3,trafficLimitGb=0}){
  if(!/^[A-Za-z0-9._-]{1,64}$/.test(name)||!Number.isInteger(days)||days<1||days>3650)
    throw Error('H1_CREATE_PARAMETERS_INVALID');
  const payload={name,days};
  if(Array.isArray(inboundIds)&&inboundIds.length){
    if(inboundIds.some(x=>!/^[0-9]+$/.test(String(x))))throw Error('H1_BAD_INBOUND_IDS');
    payload.inbound_ids=[String(inboundIds[0])];
    payload.channels=[];
  }
  if(Number.isInteger(deviceLimit)&&deviceLimit>=1&&deviceLimit<=100)payload.device_limit=deviceLimit;
  if(Number.isFinite(trafficLimitGb)&&trafficLimitGb>0&&trafficLimitGb<=100000)payload.traffic_limit_gb=trafficLimitGb;
  return payload;
}

async function withCustomerDeliveryLock(telegramId,work) {
  const db=await (await getPool()).connect();
  try{
    await db.query('BEGIN');
    // A PostgreSQL advisory transaction lock serializes deliveries for one Telegram ID.
    // It prevents a slower webhook overwriting a newer expiry in H1Cloud.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1), 60481)',[telegramId]);
    const result=await work(db);
    await db.query('COMMIT');
    return result;
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}
  finally{db.release()}
}

function panelConfig(){
  const raw=String(process.env.PANEL_BASE_URL||'').trim();
  if(!raw||!process.env.PANEL_API_TOKEN)throw Error('H1_PANEL_NOT_CONFIGURED');
  let u;
  try{u=new URL(raw)}catch{throw Error('H1_PANEL_URL_INVALID')}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
     !['/','/api','/api/'].includes(u.pathname))throw Error('H1_PANEL_URL_INVALID');
  const base=u.origin;
  const ids=(process.env.PANEL_INBOUND_IDS||'').split(',').map(x=>x.trim()).filter(x=>/^\d+$/.test(x));
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
  if(res.status===404 && data?.error==='user_not_found')return null;
  if(!res.ok||data?.ok!==true)throw Error('H1_HTTP_'+res.status);
  return data;
}
async function userClientName(order,lockedDb=null) {
  const prefix=process.env.PANEL_CLIENT_PREFIX??'tg';
  const mapped=await findMappedClientName(order.telegram_id,lockedDb);
  const name=mapped||prefix+order.telegram_id;
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
  if(!claim) {
    // A callback received during the retry backoff must not acknowledge
    // unfinished fulfillment as delivered to the payment provider.
    const current=await getInternalOrder(orderId);
    return {accepted:true,delivery:current?.delivery_state==='delivered'?'delivered':'retry_required'};
  }
  let stage='PANEL_SYNC_FAILED';
  try{
    const order=await getInternalOrder(orderId);
    if(!order || order.status!=='paid' || order.is_test)throw Error('ORDER_NOT_PAID');
    const outcome=await withCustomerDeliveryLock(order.telegram_id,async(db)=> {
    const name=await userClientName(order,db);
    const existing=(await panel('/clients/'+encodeURIComponent(name)))?.client||null;
    const prior=Number(existing?.expires_at||0);
    const booked=await reserveExpiry(orderId,prior>0?prior*1000:0,db);
    if(!booked?.target_expires_at)throw Error('BOOKING_FAILED');
    // Reservation must commit even if the external panel or notification fails.
    try {
    const expiresAt=Math.max(Math.floor(new Date(booked.target_expires_at).getTime()/1000),prior);
    let client=existing;
    if(client){
      // Absolute expiry is idempotent; never add days twice on retries.
      // Existing profile device limits must be managed carefully by a reviewed
      // upgrade path; do not silently downgrade a family subscription.
      const nextLimit=Math.max(Number(existing.device_limit)||3,Number(order.device_limit)||3);
      const result=await panel('/clients/'+encodeURIComponent(name),{
        method:'PATCH',body:JSON.stringify({expires_at:expiresAt,device_limit:nextLimit})
      });
      client=result?.client||client;
    } else{
      const {ids}=panelConfig();
      // H1Cloud /create REQUIRES days (not expires_at); apply the booked
      // absolute expiry afterward with PATCH for safe retries and renewals.
      const payload=h1CreatePayload({name,days:order.plan_days,inboundIds:ids,
        deviceLimit:Number(order.device_limit),
        trafficLimitGb:Number(process.env.TRAFFIC_LIMIT_GB||0)});
      const result=await panel('/create',{method:'POST',body:JSON.stringify(payload)});
      client=result?.client||(await panel('/clients/'+encodeURIComponent(name)))?.client;
      if(!client)throw Error('H1_CREATE_NOT_CONFIRMED');
      if(Number(client.expires_at)!==expiresAt){
        const patched=await panel('/clients/'+encodeURIComponent(name),{
          method:'PATCH',body:JSON.stringify({expires_at:expiresAt})
        });
        client=patched?.client||client;
      }
    }
    // Confirm the panel sees the intended expiry before sending any access URL.
    const fresh=(await panel('/clients/'+encodeURIComponent(name)))?.client||client;
    if(!fresh || Number(fresh.expires_at||0)<expiresAt)throw Error('H1_EXPIRY_NOT_CONFIRMED');
    if(Number(fresh.device_limit||0)<Number(order.device_limit||3))throw Error('H1_DEVICE_LIMIT_NOT_CONFIRMED');
    const profile=fresh.subscription_url||fresh.sub_url;
    if(!profile || typeof profile!=='string'||!/^https:\/\//.test(profile))throw Error('H1_SUBSCRIPTION_URL_MISSING');
    stage='TELEGRAM_DELIVERY_FAILED';
    await telegramSend(order.telegram_id,
      'Vainah VPN 💜\nПлатёж подтверждён! Подписка активна до '+new Date(expiresAt*1000).toLocaleDateString('ru-RU',{timeZone:'UTC'})+
      '.\n\nТвоя личная ссылка для VPN-клиента:\n'+profile+
      '\n\nНе пересылай эту ссылку другим людям. Если не удаётся подключиться, открой раздел помощи на сайте.');
    await deliveryDone(orderId,db);
    return {accepted:true,delivery:'delivered'};
    } catch(error) {
      // Keep the booked expiry committed; retry must never add paid days twice.
      return {accepted:true,delivery:'retry_required',stage};
    }
    });
    if(outcome.delivery==='retry_required')await deliveryRetry(orderId,outcome.stage).catch(()=>{});
    return {accepted:true,delivery:outcome.delivery};
  }catch(error){
    // Do not log customer subscription URLs, bot token or payment credentials.
    console.error('Vainah delivery status:',stage);
    await deliveryRetry(orderId,stage).catch(()=>{});
    return {accepted:true,delivery:'retry_required'};
  }
}

export async function readSharedH1Subscription(telegramId) {
  if(!/^[1-9][0-9]{0,17}$/.test(telegramId||''))throw Error('INVALID_TELEGRAM_ID');
  const name=await userClientName({telegram_id:telegramId});
  const client=(await panel('/clients/'+encodeURIComponent(name)))?.client||null;
  if(!client)return {found:false,active:false,expiresAt:null};
  const seconds=Number(client.expires_at||0);
  const valid=Number.isFinite(seconds)&&seconds>0;
  return {found:true,active:valid && seconds*1000>Date.now(),
    expiresAt:valid?new Date(seconds*1000).toISOString():null};
}
