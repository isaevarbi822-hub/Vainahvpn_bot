import {getPool} from './lib/subscription-db.mjs';
import {nativeCommerceReady,fulfillNativePaidOrder,verifyNativeProvider,sendNativeEmailIfDue} from './lib/native-commerce.mjs';
export const config={schedule:'*/15 * * * *'};
export default async function handler(){
  if(!nativeCommerceReady())return new Response(null,{status:204});
  try{
    const db=await getPool();
    const pending=await db.query(`SELECT id,status,delivery_state,email_state FROM vpn_native_orders
       WHERE (status='paid' AND
         (delivery_state IN ('pending','retry') OR
          (delivery_state='processing' AND delivery_lease_until<now()) OR
          (delivery_state='delivered' AND (email_state IN ('pending','retry') OR
           (email_state='sending' AND email_lease_until<now())))))
       ORDER BY created_at ASC LIMIT 3`);
    for(const o of pending.rows){
      try{
        if(o.delivery_state==='delivered')await sendNativeEmailIfDue(o.id);
        else await fulfillNativePaidOrder(o.id);
      }catch{console.warn('Mobile order delivery retry failed');}
    }
    const stale=await db.query(`SELECT id FROM vpn_native_orders WHERE
      status IN ('awaiting_payment','expired','canceled') AND payment_id IS NOT NULL
      AND created_at>now()-interval '48 hours'
      AND updated_at<now()-interval '10 minutes'
      ORDER BY updated_at ASC LIMIT 2`);
    for(const o of stale.rows){
      try{await verifyNativeProvider(o.id)}catch{console.warn('Mobile payment retry failed')}
    }
    return new Response(null,{status:204});
  }catch{return new Response(null,{status:503})}
}
