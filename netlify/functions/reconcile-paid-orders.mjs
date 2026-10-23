import {checkoutReady} from './lib/plan-catalog.mjs';
import {getPool} from './lib/subscription-db.mjs';
import {fulfillPaidOrder} from './lib/h1-fulfillment.mjs';
import {reconcileRollypayOrder} from './lib/reconcile-rollypay-order.mjs';

// Runs only on published Netlify deploys. The checkout kill-switch currently
// prevents all DB reads and profile changes, including manual Run now calls.
export const config={schedule:'*/15 * * * *'};

export default async function handler(){
  if(!checkoutReady())return new Response(null,{status:204});
  try {
    const db=await getPool();
    // Process a small batch: scheduled functions have a short execution limit.
    // Claiming and advisory locks inside fulfillPaidOrder remain authoritative.
    const result=await db.query(
      `SELECT id FROM vpn_orders
       WHERE status='paid' AND (
          delivery_state='pending' OR
          (delivery_state='retry' AND updated_at < now()-interval '90 seconds') OR
          (delivery_state='processing' AND delivery_lease_until < now())
       )
       ORDER BY paid_at ASC NULLS LAST
       LIMIT 2`
    );
    for(const row of result.rows){
      const delivery=await fulfillPaidOrder(row.id);
      if(delivery.delivery==='retry_required')console.warn('VPN delivery scheduled for retry');
    }
    // Recover the last two stale unpaid invoices when a payment webhook
    // was missed. Updating the attempt timestamp rotates the work fairly;
    // the provider is always queried server-to-server before any grant.
    const stale=await db.query(`
      UPDATE vpn_orders SET updated_at=now()
      WHERE id IN (
        SELECT id FROM vpn_orders
        WHERE provider='rollypay' AND is_test=false AND payment_id IS NOT NULL
          AND status IN ('awaiting_payment','expired','canceled')
          AND created_at > now()-interval '48 hours'
          AND updated_at < now()-interval '3 minutes'
        ORDER BY updated_at ASC
        LIMIT 2 FOR UPDATE SKIP LOCKED
      ) RETURNING id`);
    for(const row of stale.rows){
      try {await reconcileRollypayOrder(row.id);}
      catch {console.warn('RollyPay payment reconciliation will retry');}
    }
    return new Response(null,{status:204});
  }catch(error){
    console.error('VPN delivery reconciliation failed:',error?.name||'Error');
    return new Response(null,{status:503});
  }
}
