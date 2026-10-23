import {json} from './lib/security.mjs';
import {clerkIdentityFromRequest} from './lib/clerk-identity.mjs';
import {getPool} from './lib/subscription-db.mjs';

/** Read-only billing identity lookup; never expose secrets or create invoices. */
export default async function handler(request){
 if(request.method!=='GET')return json({error:'Method not allowed'},405);
 const identity=clerkIdentityFromRequest(request);
 if(!identity)return json({error:'Требуется действующая сессия Clerk'},401);
 try{
  const db=await getPool();
  const found=await db.query(
   'SELECT owner_id FROM vpn_account_identities WHERE provider=$1 AND subject=$2',
   ['clerk',identity.subject]
  );
  const ownerId=found.rows[0]?.owner_id;
  if(!ownerId)return json({authenticated:true,accountLinked:false,billingReady:false,
   message:'Аккаунт подтверждён. Привязка оплаты ещё не завершена.'});
  const orders=await db.query(
   `SELECT id,plan_days,device_limit,amount_kopeks,currency,status,delivery_state,created_at
      FROM vpn_orders WHERE owner_id=$1 AND is_test=false
      ORDER BY created_at DESC LIMIT 20`,[ownerId]
  );
  return json({authenticated:true,accountLinked:true,billingReady:false,
   orders:orders.rows.map(row=>({
    id:row.id,days:row.plan_days,deviceLimit:row.device_limit,
    amountRub:(Number(row.amount_kopeks)/100).toFixed(2),
    currency:row.currency,status:row.status,deliveryState:row.delivery_state,
    createdAt:row.created_at
   })),
   message:'Покупки через Clerk пока не включены.'});
 }catch{
  return json({error:'Статус покупок временно недоступен'},503);
 }
}
