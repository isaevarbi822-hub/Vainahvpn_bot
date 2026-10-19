import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {latestDeliveredWebsiteOrder} from './lib/subscription-db.mjs';
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Authentication required'},401);
  try{
    const order=await latestDeliveredWebsiteOrder(user.telegramId);
    if(!order)return json({found:false});
    return json({found:true,orderId:order.id,days:order.plan_days,deviceLimit:order.device_limit,expiresAt:order.target_expires_at});
  }catch{return json({error:'Unable to load purchased VPN'},503)}
}
