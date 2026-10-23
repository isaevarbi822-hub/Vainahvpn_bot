import {randomUUID} from 'node:crypto';
import {getPool,transaction} from './subscription-db.mjs';
import {checkoutReady} from './plan-catalog.mjs';
import {validPaymentId} from './rollypay-identifiers.mjs';
import {fetchPayment} from './rollypay-client.mjs';
import {clerkMobileConfigured} from './mobile-auth.mjs';

export function nativeCommerceReady(env=process.env){
  return checkoutReady(env) && clerkMobileConfigured(env) &&
    env.CLERK_PUBLISHABLE_KEY.startsWith('pk_live_') &&
    env.CLERK_SECRET_KEY.startsWith('sk_live_') &&
    env.VAINAH_NATIVE_CHECKOUT==='approved-after-test' &&
    !!env.RESEND_API_KEY && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(env.RESEND_FROM_EMAIL||'');
}
export async function accountForIdentity(user,db=null){
  if(!user || user.provider!=='clerk' ||
    !/^[a-f0-9]{64}$/.test(user.subject||''))throw Error('INVALID_IDENTITY');
  const pool=db||await getPool();
  // Identity subject is an HMAC of a verified contact, not PII or a Telegram ID.
  const result=await pool.query(
    'SELECT * FROM vpn_native_customers WHERE auth_provider=$1 AND identity_subject=$2',
    [user.provider,user.subject]);
  return result.rows[0]||null;
}
export async function createNativeOrder(user,plan){
  if(!user?.email)throw Error('VERIFIED_EMAIL_REQUIRED');
  return transaction(async db=>{
    const customerId=randomUUID();
    const name='va_'+customerId.replaceAll('-','');
    const r=await db.query(`
      INSERT INTO vpn_native_customers(id,auth_provider,identity_subject,delivery_email,client_name)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(auth_provider,identity_subject)
      DO UPDATE SET delivery_email=EXCLUDED.delivery_email,updated_at=now()
      RETURNING *`,[customerId,user.provider,user.subject,user.email,name]);
    const customer=r.rows[0];
    await db.query('SELECT id FROM vpn_native_customers WHERE id=$1 FOR UPDATE',[customer.id]);
    const pending=await db.query(`
      SELECT count(*)::int AS count FROM vpn_native_orders
      WHERE customer_id=$1 AND created_at>now()-interval '15 minutes'
      AND status IN ('created','awaiting_payment')`,[customer.id]);
    if(Number(pending.rows[0].count)>=2)return null;
    const id=randomUUID();
    await db.query(`INSERT INTO vpn_native_orders
       (id,customer_id,plan_days,device_limit,amount_kopeks,delivery_email)
       VALUES($1,$2,$3,$4,$5,$6)`,[id,customer.id,plan.days,plan.deviceLimit,plan.kopeks,user.email]);
    return {id,customerId:customer.id};
  });
}
export async function attachNativePayment(id,payment){
  const db=await getPool();
  const r=await db.query(`
    UPDATE vpn_native_orders
    SET payment_id=$2,payment_url=$3,status='awaiting_payment',updated_at=now()
    WHERE id=$1 AND status='created' AND payment_id IS NULL RETURNING id`,
    [id,payment.paymentId,payment.payUrl]);
  return r.rowCount===1;
}
export async function failNativeOrder(id){
  const db=await getPool();
  await db.query(`UPDATE vpn_native_orders SET status='error',updated_at=now()
    WHERE id=$1 AND status='created'`,[id]);
}
export async function readNativeOrder(id){
  const db=await getPool();
  const r=await db.query(`
    SELECT o.*,c.auth_provider,c.identity_subject,c.client_name,
           COALESCE(o.delivery_email,c.delivery_email) AS delivery_email
    FROM vpn_native_orders o JOIN vpn_native_customers c ON c.id=o.customer_id
    WHERE o.id=$1`,[id]);
  return r.rows[0]||null;
}
export function validateNativePayment(order,data){
  if(!order||!data||order.provider!=='rollypay'||order.currency!=='RUB'||
     !validPaymentId(order.payment_id)||data.payment_id!==order.payment_id||
     data.order_id!==String(order.id)||data.payment_currency!=='RUB' ||
     !['created','processing','paid','expired','canceled','refunded','chargeback'].includes(data.status)||
     (data.test!==undefined && data.test!==false) ||
     (data.environment!==undefined && data.environment!=='production'))
    throw Error('NATIVE_PAYMENT_MISMATCH');
  const amount=String(data.amount||'');
  if(!/^[1-9][0-9]{0,6}(?:\.[0-9]{1,2})?$/.test(amount)||
    Math.round(Number(amount)*100)!==Number(order.amount_kopeks))
    throw Error('NATIVE_AMOUNT_MISMATCH');
  return data.status;
}
export async function recordNativePayment(orderId,paymentId,status){
  return transaction(async db=>{
    const r=await db.query('SELECT * FROM vpn_native_orders WHERE id=$1 FOR UPDATE',[orderId]);
    const o=r.rows[0];
    if(!o||o.payment_id!==paymentId)return {error:'MISMATCH'};
    if(status==='paid'){
      if(o.status==='paid')return {duplicate:true};
      if(!['awaiting_payment','expired','canceled'].includes(o.status))return {error:'INVALID_STATE'};
      await db.query(`UPDATE vpn_native_orders SET status='paid',paid_at=now(),updated_at=now()
        WHERE id=$1`,[orderId]);
    } else if(['refunded','chargeback'].includes(status)){
      await db.query(`UPDATE vpn_native_orders SET status=$2,delivery_state='needs_review',updated_at=now()
         WHERE id=$1 AND status IN ('paid','refunded','chargeback')`,[orderId,status]);
    } else if(['expired','canceled'].includes(status)){
      await db.query(`UPDATE vpn_native_orders SET status=$2,updated_at=now()
        WHERE id=$1 AND status IN ('created','awaiting_payment')`,[orderId,status]);
    }
    return {ok:true};
  });
}
function panelConfig(){
  const url=new URL(process.env.PANEL_BASE_URL||'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
     !['/','/api','/api/'].includes(url.pathname)||!process.env.PANEL_API_TOKEN)throw Error('PANEL_SETTINGS');
  return url.origin;
}
async function panel(path,method='GET',body=null){
  const base=panelConfig();
  const res=await fetch(base+'/api'+path,{method,
    headers:{Authorization:'Bearer '+process.env.PANEL_API_TOKEN,Accept:'application/json',
      ...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(9000),
    redirect:'error',cache:'no-store'});
  const data=await res.json().catch(()=>({}));
  if(res.status===404&&data?.error==='user_not_found')return null;
  if(!res.ok||data?.ok!==true)throw Error('PANEL_HTTP_'+res.status);
  return data;
}
function secureSubscriptionUrl(value){
  if(typeof value!=='string'||value.length>2048||/\s/.test(value))throw Error('PANEL_LINK_INVALID');
  const url=new URL(value);
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash)throw Error('PANEL_LINK_INVALID');
  return url.href;
}
export async function readNativeVpnAccess(order){
  if(order.status!=='paid'||order.delivery_state!=='delivered')return null;
  const data=await panel('/clients/'+encodeURIComponent(order.client_name));
  const client=data?.client;
  if(!client||client.name!==order.client_name||Number(client.expires_at)*1000<=Date.now())return null;
  return secureSubscriptionUrl(client.subscription_url||client.sub_url);
}
/** Pure arithmetic for one paid renewal; no invoice state can be altered by the client. */
export function nativeRenewalTarget({nowMs,storedExpiryMs=0,panelExpiryMs=0,days}){
  if(![nowMs,storedExpiryMs,panelExpiryMs].every(
       value=>Number.isFinite(value)&&value>=0) ||
     !Number.isInteger(days)||days<1||days>365)
    throw Error('INVALID_RENEWAL_VALUES');
  const expiry=Math.max(nowMs,storedExpiryMs,panelExpiryMs)+days*86400000;
  if(!Number.isSafeInteger(expiry))throw Error('INVALID_RENEWAL_TARGET');
  return new Date(expiry);
}

/**
 * DURABLY reserve paid days before any H1Cloud creation/PATCH.
 * A later database/HTTP failure must never mint the same days again on retry.
 * Advisory lock is per Clerk customer, so concurrent renewals reserve in order.
 */
export async function reserveNativeExpiry(orderId){
  return transaction(async db=>{
    const r=await db.query(`SELECT o.*,c.client_name FROM vpn_native_orders o
      JOIN vpn_native_customers c ON c.id=o.customer_id
      WHERE o.id=$1 FOR UPDATE OF o`,[orderId]);
    const order=r.rows[0];
    if(!order||order.status!=='paid'||order.delivery_state!=='processing')return null;
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1),71911)',[String(order.customer_id)]);
    if(order.target_expires_at)return order.target_expires_at;
    const existing=(await panel('/clients/'+encodeURIComponent(order.client_name)))?.client||null;
    if(existing&&existing.name!==order.client_name)throw Error('H1_CUSTOMER_MISMATCH');
    const current=await db.query(
      'SELECT expires_at FROM vpn_native_entitlements WHERE customer_id=$1 FOR UPDATE',
      [order.customer_id]);
    const savedMs=current.rows[0]?.expires_at?new Date(current.rows[0].expires_at).getTime():0;
    const panelMs=Number(existing?.expires_at||0)*1000;
    const target=nativeRenewalTarget({
      nowMs:Date.now(),storedExpiryMs:savedMs,
      panelExpiryMs:Number.isFinite(panelMs)?panelMs:0,
      days:Number(order.plan_days)
    });
    await db.query(`INSERT INTO vpn_native_entitlements(customer_id,expires_at)
      VALUES($1,$2) ON CONFLICT(customer_id) DO UPDATE
      SET expires_at=GREATEST(vpn_native_entitlements.expires_at,EXCLUDED.expires_at),
          updated_at=now()`,[order.customer_id,target]);
    await db.query(`UPDATE vpn_native_orders
      SET target_expires_at=$2,updated_at=now()
      WHERE id=$1 AND target_expires_at IS NULL`,[orderId,target]);
    return target;
  });
}

async function fulfillH1(orderId){
  const pool=await getPool(),db=await pool.connect();
  let delivery='retry_required',lastError='H1_DELIVERY_FAILED';
  try{
    await db.query('BEGIN');
    const raw=await db.query(`SELECT o.*,c.client_name FROM vpn_native_orders o
      JOIN vpn_native_customers c ON c.id=o.customer_id
      WHERE o.id=$1 FOR UPDATE OF o`,[orderId]);
    const order=raw.rows[0];
    if(!order||order.status!=='paid'||order.delivery_state!=='processing'){
      await db.query('COMMIT');return {delivery:'not_claimed'};
    }
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1),71911)',[String(order.customer_id)]);
    try {
      const existing=(await panel('/clients/'+encodeURIComponent(order.client_name)))?.client||null;
      const prior=Number(existing?.expires_at||0);
      const target=order.target_expires_at?new Date(order.target_expires_at):null;
      if(!target||!Number.isFinite(target.getTime()))
        throw Error('NATIVE_EXPIRY_MUST_BE_RESERVED_FIRST');
      const expires_at=Math.max(Math.floor(target.getTime()/1000),prior);
      const limit=Math.max(Number(existing?.device_limit)||3,Number(order.device_limit)||3);
      if(existing) {
        await panel('/clients/'+encodeURIComponent(order.client_name),'PATCH',{expires_at,device_limit:limit});
      } else {
        const ids=(process.env.PANEL_INBOUND_IDS||'').split(',').filter(x=>/^\d+$/.test(x.trim()));
        await panel('/create','POST',{
          name:order.client_name,days:Number(order.plan_days),device_limit:limit,
          ...(ids.length?{inbound_ids:[ids[0]],channels:[]}:{})
        });
        await panel('/clients/'+encodeURIComponent(order.client_name),'PATCH',{expires_at,device_limit:limit});
      }
      const current=(await panel('/clients/'+encodeURIComponent(order.client_name)))?.client;
      if(!current||current.name!==order.client_name||Number(current.expires_at)<expires_at||Number(current.device_limit)<Number(order.device_limit))
        throw Error('PANEL_NOT_CONFIRMED');
      secureSubscriptionUrl(current.subscription_url||current.sub_url);
      await db.query(`UPDATE vpn_native_orders SET delivery_state='delivered',
        delivery_lease_until=NULL,last_delivery_error=NULL,updated_at=now()
        WHERE id=$1 AND delivery_state='processing'`,[orderId]);
      delivery='delivered';
    }catch(error){
      lastError='PANEL_SYNC_FAILED';
      await db.query(`UPDATE vpn_native_orders SET delivery_state='retry',
         delivery_lease_until=NULL,last_delivery_error=$2,updated_at=now()
         WHERE id=$1 AND delivery_state='processing'`,[orderId,lastError]);
    }
    await db.query('COMMIT');
  }catch{
    await db.query('ROLLBACK').catch(()=>{});
    await pool.query(`UPDATE vpn_native_orders SET delivery_state='retry',delivery_lease_until=NULL,
      last_delivery_error='PANEL_SYNC_FAILED',updated_at=now()
      WHERE id=$1 AND delivery_state='processing'`,[orderId]).catch(()=>{});
  }finally{db.release();}
  return {delivery};
}
export async function fulfillNativePaidOrder(orderId) {
  const db=await getPool();
  const claimed=await db.query(`UPDATE vpn_native_orders SET delivery_state='processing',
    delivery_lease_until=now()+interval '90 seconds',updated_at=now()
    WHERE id=$1 AND status='paid' AND
    (delivery_state='pending' OR
      (delivery_state='retry' AND updated_at<now()-interval '90 seconds') OR
      (delivery_state='processing' AND delivery_lease_until<now()))
    RETURNING id`,[orderId]);
  let result={delivery:'not_claimed'};
  if(claimed.rowCount===1){
    try {
      // Transactional reservation MUST commit before talking to H1Cloud.
      const target=await reserveNativeExpiry(orderId);
      if(!target)throw Error('NATIVE_RESERVATION_UNAVAILABLE');
      result=await fulfillH1(orderId);
    }catch{
      await db.query(`UPDATE vpn_native_orders
        SET delivery_state='retry',delivery_lease_until=NULL,
            last_delivery_error='RESERVATION_FAILED',updated_at=now()
        WHERE id=$1 AND status='paid' AND delivery_state='processing'`,[orderId]).catch(()=>{});
      result={delivery:'retry_required'};
    }
  }
  if(result.delivery==='delivered'||result.delivery==='not_claimed')
    await sendNativeEmailIfDue(orderId).catch(()=>{});
  return result;
}
export async function sendNativeEmailIfDue(orderId){
  if(!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)return {sent:false};
  const db=await getPool();
  const claimed=await db.query(`UPDATE vpn_native_orders SET email_state='sending',
     email_lease_until=now()+interval '2 minutes'
    WHERE id=$1 AND status='paid' AND delivery_state='delivered' AND
    (email_state IN ('pending','retry') OR
     (email_state='sending' AND email_lease_until<now()))
    RETURNING id`,[orderId]);
  if(!claimed.rowCount)return {sent:false};
  try {
    const order=await readNativeOrder(orderId);
    if(!order?.delivery_email)throw Error('NO_VERIFIED_EMAIL');
    const link=await readNativeVpnAccess(order);
    if(!link)throw Error('VPN_LINK_MISSING');
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,
        'Content-Type':'application/json','Idempotency-Key':'vainah-native-'+orderId},
      body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[order.delivery_email],
        subject:'Твоя подписка Vainah VPN готова',
        text:'Спасибо за покупку! Твоя личная VPN-подписка:\n'+link+
          '\n\nНе пересылай эту ссылку другим. Если не совершал покупку, обратись в поддержку.'}),
      signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('EMAIL_PROVIDER_'+response.status);
    await db.query(`UPDATE vpn_native_orders SET email_state='sent',email_sent_at=now(),
      email_lease_until=NULL,updated_at=now() WHERE id=$1 AND email_state='sending'`,[orderId]);
    return {sent:true};
  }catch(error){
    await db.query(`UPDATE vpn_native_orders SET email_state='retry',email_lease_until=NULL,
       updated_at=now() WHERE id=$1 AND email_state='sending'`,[orderId]).catch(()=>{});
    return {sent:false};
  }
}
export async function verifyNativeProvider(orderId){
  const order=await readNativeOrder(orderId);
  if(!order || !validPaymentId(order.payment_id))return {ok:false};
  const p=await fetchPayment(order.payment_id);
  const status=validateNativePayment(order,p);
  const outcome=await recordNativePayment(orderId,order.payment_id,status);
  if(outcome.error)throw Error('LEDGER_ERROR');
  if(status==='paid')await fulfillNativePaidOrder(orderId);
  return {ok:true,status};
}
