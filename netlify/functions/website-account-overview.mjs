import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {websiteAccountOverview} from './lib/subscription-db.mjs';

const time = value => {
  if(!value)return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toISOString():null;
};

/**
 * No client names, VPN links, RollyPay identifiers, private panel details or
 * Telegram IDs in this JSON. Authentication is from the signed HttpOnly cookie.
 */
export function presentWebsiteAccount(data,now=Date.now()){
  const orders=data.orders.map(o=>({
    id:String(o.id),days:Number(o.plan_days),deviceLimit:Number(o.device_limit),
    amountRub:(Number(o.amount_kopeks)/100).toFixed(2),currency:o.currency,
    status:o.status,deliveryState:o.delivery_state,
    createdAt:time(o.created_at),paidAt:time(o.paid_at),
    expiresAt:time(o.target_expires_at)
  }));
  const latest=orders.find(o=>o.id===String(data.latestDeliveredOrderId))||null;
  const expiry=latest?time(data.entitlementExpiresAt)||latest.expiresAt:null;
  return {
    orders,
    historyLimited:orders.length===30,
    subscription:latest?{
      planDays:latest.days,deviceLimit:latest.deviceLimit,
      expiresAt:expiry,
      active:!!expiry && new Date(expiry).getTime()>now,
      accessOrderId:latest.id
    }:null,
    // Never claim the live H1 panel is online from a DB record alone.
    statusSource:'database'
  };
}

export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Войди через Telegram'},401);
  try{
    const record=await websiteAccountOverview(user.telegramId);
    return json(presentWebsiteAccount(record));
  }catch(error){
    console.warn('Website account database read failed:',error?.name||'Error');
    return json({error:'Не удалось получить историю покупок. Попробуй позже.'},503);
  }
}
