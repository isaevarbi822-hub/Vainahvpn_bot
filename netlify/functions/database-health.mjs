import {json} from './lib/security.mjs';
import {getPool} from './lib/subscription-db.mjs';

// Public, read-only readiness probe. Do not return SQL errors, credentials, or row data.
export async function inspectDatabase(pool) {
  const result=await pool.query(`
    SELECT
      to_regclass('public.vpn_customers') IS NOT NULL AS customers,
      to_regclass('public.vpn_orders') IS NOT NULL AS orders,
      to_regclass('public.vpn_entitlements') IS NOT NULL AS entitlements
  `);
  const row=result.rows?.[0];
  return row?.customers===true && row?.orders===true && row?.entitlements===true;
}

export default async function handler(request) {
  if(request.method!=='GET') return json({error:'Method not allowed'},405);
  try {
    const pool=await getPool();
    const schemaReady=await inspectDatabase(pool);
    if(!schemaReady) return json({
      ok:false,database:'connected',schema:'missing_tables'
    },503);
    return json({ok:true,database:'connected',schema:'ready'});
  } catch {
    return json({ok:false,database:'unavailable'},503);
  }
}
