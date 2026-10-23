import {getPool} from './subscription-db.mjs';

// Atomically reserve the expiry of a verified, paid owner-scoped order.
// A recorded target expiry is reused on every retry.
export async function reserveOwnerEntitlement(orderId,pool=null){
 const db=await (pool||await getPool()).connect();
 try{
  await db.query('BEGIN');
  const found=await db.query('SELECT * FROM vpn_orders WHERE id=$1 FOR UPDATE',[orderId]);
  const order=found.rows[0];
  if(!order||order.status!=='paid'||order.is_test||!order.owner_id){
   await db.query('ROLLBACK');
   return null;
  }
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1), 61932)',[String(order.owner_id)]);
  if(order.target_expires_at){
   await db.query('COMMIT');
   return order.target_expires_at;
  }
  const current=await db.query(
   'SELECT expires_at,device_limit FROM vpn_owner_entitlements WHERE owner_id=$1 FOR UPDATE',
   [order.owner_id]);
  const previous=current.rows[0];
  const base=Math.max(Date.now(),previous?.expires_at?new Date(previous.expires_at).getTime():0);
  const limit=Math.max(Number(previous?.device_limit)||3,Number(order.device_limit)||3);
  if(![30,60,90,180,365].includes(Number(order.plan_days)))throw Error('INVALID_PLAN');
  const target=new Date(base+Number(order.plan_days)*86400000);
  if(!Number.isFinite(target.getTime())||![3,6].includes(limit))
   throw Error('INVALID_ENTITLEMENT');
  await db.query(
   'INSERT INTO vpn_owner_entitlements(owner_id,expires_at,device_limit) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,device_limit=EXCLUDED.device_limit,updated_at=now()',
   [order.owner_id,target,limit]);
  await db.query('UPDATE vpn_orders SET target_expires_at=$2,updated_at=now() WHERE id=$1',
   [orderId,target]);
  await db.query('COMMIT');
  return target;
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error}
 finally{db.release()}
}
