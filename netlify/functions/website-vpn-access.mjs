import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {getCustomerOrder} from './lib/subscription-db.mjs';
import {readWebsiteAccess} from './lib/h1-fulfillment.mjs';

export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Authentication required'},401);
  const orderId=new URL(request.url).searchParams.get('order');
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(orderId||''))return json({error:'Invalid order'},400);
  try{
    // Ownership is checked against the signed login cookie in SQL.
    const order=await getCustomerOrder(orderId,user.telegramId);
    if(!order || order.source!=='website' || order.status!=='paid' ||
       order.delivery_state!=='delivered')return json({error:'VPN access unavailable'},404);
    const access=await readWebsiteAccess(user.telegramId);
    return json(access,200,{'Cache-Control':'no-store'});
  }catch{
    return json({error:'VPN access temporarily unavailable'},503);
  }
}
