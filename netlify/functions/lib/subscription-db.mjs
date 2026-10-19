let singletonPool;
export async function getPool() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL not configured');
  if (!singletonPool) {
    const {Pool}=await import('pg');
    singletonPool=new Pool({connectionString:process.env.DATABASE_URL,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:5000});
  }
  return singletonPool;
}
export async function transaction(work) {
  const pool=await getPool(),db=await pool.connect();
  try{
    await db.query('BEGIN');
    const result=await work(db);
    await db.query('COMMIT');
    return result;
  }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
  finally{db.release()}
}
export async function insertCheckout({id,telegramId,username,plan}) {
  return transaction(async db=>{
    await db.query(
      `INSERT INTO vpn_customers(telegram_id,username) VALUES($1,$2)
       ON CONFLICT(telegram_id) DO UPDATE SET username=EXCLUDED.username,updated_at=now()`,
       [telegramId,username||'']);
    // Serialise rate check per Telegram account to avoid many unpaid invoices.
    await db.query('SELECT telegram_id FROM vpn_customers WHERE telegram_id=$1 FOR UPDATE',[telegramId]);
    const outstanding=await db.query(
      `SELECT count(*)::integer AS count FROM vpn_orders
       WHERE telegram_id=$1 AND created_at>now()-interval '15 minutes'
       AND status IN ('created','awaiting_payment')`,[telegramId]);
    if(outstanding.rows[0].count>=2) return null;
    await db.query(
      `INSERT INTO vpn_orders(id,telegram_id,plan_days,amount_kopeks,currency,provider,source,is_test)
       VALUES($1,$2,$3,$4,'RUB','rollypay','website',false)`,
       [id,telegramId,plan.days,plan.kopeks]);
    return {id};
  });
}
export async function attachPayment({id,paymentId,url}) {
  const pool=await getPool();
  const response=await pool.query(
    `UPDATE vpn_orders SET payment_id=$2,payment_url=$3,status='awaiting_payment',updated_at=now()
     WHERE id=$1 AND status='created' AND payment_id IS NULL RETURNING id`,
     [id,paymentId,url]);
  return response.rowCount===1;
}
export async function markOrderFailed(id) {
  const pool=await getPool();
  await pool.query("UPDATE vpn_orders SET status='error',updated_at=now() WHERE id=$1 AND status='created'",[id]);
}
export async function getCustomerOrder(id,telegramId) {
  const pool=await getPool();
  const result=await pool.query(
    `SELECT id,telegram_id,provider,plan_days,amount_kopeks,currency,status,delivery_state,
      target_expires_at,created_at,notification_sent_at
      FROM vpn_orders WHERE id=$1 AND telegram_id=$2`,[id,telegramId]);
  return result.rows[0]||null;
}
export async function getInternalOrder(id) {
  const pool=await getPool();
  const response=await pool.query('SELECT * FROM vpn_orders WHERE id=$1',[id]);
  return response.rows[0]||null;
}
export async function updateVerifiedPayment({orderId,paymentId,status,amountKopeks,currency}) {
  return transaction(async db=>{
    const r=await db.query('SELECT * FROM vpn_orders WHERE id=$1 FOR UPDATE',[orderId]);
    const order=r.rows[0];
    if(!order || order.provider!=='rollypay'||order.is_test || order.payment_id!==paymentId ||
      order.currency!==currency || Number(order.amount_kopeks)!==amountKopeks) return {error:'Mismatch'};
    if(status==='paid') {
      if(order.status==='paid') return {order,duplicate:true};
      if(!['awaiting_payment'].includes(order.status)) return {error:'Unexpected payment state'};
      const done=await db.query(
        `UPDATE vpn_orders SET status='paid',paid_at=now(),updated_at=now()
         WHERE id=$1 RETURNING *`,[orderId]);
      return {order:done.rows[0],duplicate:false};
    }
    if(['refunded','chargeback'].includes(status)) {
      await db.query(
        `UPDATE vpn_orders SET status=$2,delivery_state='needs_review',updated_at=now()
         WHERE id=$1 AND status IN ('paid','refunded','chargeback')`,[orderId,status]);
      return {review:true};
    }
    if(['canceled','expired'].includes(status)) {
      await db.query(
        `UPDATE vpn_orders SET status=$2,updated_at=now()
         WHERE id=$1 AND status IN ('created','awaiting_payment')`,[orderId,status]);
      return {ignored:true};
    }
    return {ignored:true};
  });
}
export async function reserveExpiry(orderId,existingPanelExpiryMs=0) {
  return transaction(async db=>{
    const found=await db.query('SELECT * FROM vpn_orders WHERE id=$1 FOR UPDATE',[orderId]);
    const order=found.rows[0];
    if(!order || order.status!=='paid') return null;
    if(order.target_expires_at) return order;
    if(order.is_test) return null;
    // Serialize different orders for the same customer.
    await db.query('SELECT telegram_id FROM vpn_customers WHERE telegram_id=$1 FOR UPDATE',[order.telegram_id]);
    const current=await db.query('SELECT expires_at FROM vpn_entitlements WHERE telegram_id=$1 FOR UPDATE',[order.telegram_id]);
    const dbExpiry=current.rows[0]?.expires_at ? new Date(current.rows[0].expires_at).getTime() : 0;
    const base=Math.max(Date.now(),dbExpiry,existingPanelExpiryMs);
    const target=new Date(base+order.plan_days*86400000);
    await db.query(
      `INSERT INTO vpn_entitlements(telegram_id,expires_at) VALUES($1,$2)
       ON CONFLICT(telegram_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,updated_at=now()`,
       [order.telegram_id,target]);
    const updated=await db.query(
      `UPDATE vpn_orders SET target_expires_at=$2,updated_at=now()
       WHERE id=$1 RETURNING *`,[orderId,target]);
    return updated.rows[0];
  });
}
export async function claimDelivery(orderId) {
  const pool=await getPool();
  const r=await pool.query(
    `UPDATE vpn_orders SET delivery_state='processing',
       delivery_lease_until=now()+interval '90 seconds',updated_at=now()
     WHERE id=$1 AND status='paid' AND (
       delivery_state = 'pending' OR
       (delivery_state = 'retry' AND updated_at < now()-interval '90 seconds') OR
       (delivery_state='processing' AND delivery_lease_until<now()))
     RETURNING *`,[orderId]);
  return r.rows[0]||null;
}
export async function deliveryDone(orderId) {
  const pool=await getPool();
  await pool.query(
    `UPDATE vpn_orders SET delivery_state='delivered',notification_sent_at=now(),
       delivery_lease_until=NULL,last_delivery_error=NULL,updated_at=now()
       WHERE id=$1 AND delivery_state='processing'`,[orderId]);
}
export async function deliveryRetry(orderId,reason='DELIVERY_FAILED') {
  const pool=await getPool();
  await pool.query(
    `UPDATE vpn_orders SET delivery_state='retry',delivery_lease_until=NULL,
       last_delivery_error=$2,updated_at=now()
       WHERE id=$1 AND delivery_state='processing'`,[orderId,reason]);
}

export async function findMappedClientName(telegramId) {
  if(!process.env.DATABASE_URL)return null;
  const pool=await getPool();
  const response=await pool.query(
    'SELECT client_name FROM vpn_customers WHERE telegram_id=$1',[telegramId]
  );
  return response.rows[0]?.client_name||null;
}
