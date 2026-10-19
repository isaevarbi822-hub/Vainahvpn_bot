import {checkoutReady} from './lib/plan-catalog.mjs';
import {getPool} from './lib/subscription-db.mjs';
import {fulfillPaidOrder} from './lib/h1-fulfillment.mjs';

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
    return new Response(null,{status:204});
  }catch(error){
    console.error('VPN delivery reconciliation failed:',error?.name||'Error');
    return new Response(null,{status:503});
  }
}
