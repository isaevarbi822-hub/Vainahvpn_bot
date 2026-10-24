import {json} from './lib/security.mjs';
import {mobileSession} from './lib/mobile-auth.mjs';
import {getPool} from './lib/subscription-db.mjs';

/**
 * Clerk-owned read-only purchase recovery (for app reinstall / account change).
 * No H1Cloud subscription URLs, RollyPay links, email addresses, or payment IDs.
 * The Clerk JWT determines the account: an id in a query/body is never trusted.
 */
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const owner=await mobileSession(request);
  if(!owner)return json({error:'Authentication required'},401);
  try{
    const db=await getPool();
    const result=await db.query(`
      SELECT o.id,o.plan_days,o.device_limit,o.amount_kopeks,o.currency,
        o.status,o.delivery_state,o.email_state,o.created_at,
        o.paid_at,o.target_expires_at
      FROM vpn_native_orders AS o
      JOIN vpn_native_customers AS c ON c.id=o.customer_id
      WHERE c.auth_provider=$1 AND c.identity_subject=$2
      ORDER BY o.created_at DESC,o.id DESC
      LIMIT 20`,[owner.provider,owner.subject]);
    const orders=result.rows.map(r=>({
      orderId:String(r.id),planDays:Number(r.plan_days),
      deviceLimit:Number(r.device_limit),priceRub:(Number(r.amount_kopeks)/100).toFixed(2),
      currency:r.currency,status:r.status,deliveryState:r.delivery_state,
      emailState:r.email_state,
      createdAt:r.created_at?new Date(r.created_at).toISOString():null,
      paidAt:r.paid_at?new Date(r.paid_at).toISOString():null,
      expiresAt:r.target_expires_at?new Date(r.target_expires_at).toISOString():null
    }));
    const latestOutstanding=orders.find(o=>['created','awaiting_payment'].includes(o.status));
    const latestDelivered=orders.find(o=>o.status==='paid'&&o.deliveryState==='delivered');
    const response=json({orders,historyLimited:orders.length===20,
      latestOutstandingOrderId:latestOutstanding?.orderId||null,
      latestDeliveredOrderId:latestDelivered?.orderId||null});
    response.headers.set('Cache-Control','no-store');
    return response;
  }catch{
    return json({error:'Не удалось загрузить покупки. Попробуй позже.'},503);
  }
}
