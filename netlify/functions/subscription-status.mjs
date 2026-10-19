import {json} from './lib/security.mjs';
import {sessionFromRequest,sameOrigin} from './lib/telegram-identity.mjs';
import {getCustomerOrder} from './lib/subscription-db.mjs';
import {fulfillPaidOrder} from './lib/h1-fulfillment.mjs';
import {checkoutReady} from './lib/plan-catalog.mjs';

export default async function handler(request){
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Telegram login required'},401);
  if(request.method!=='GET' && request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.method==='POST'&&!sameOrigin(request))return json({error:'Invalid origin'},403);
  const id=new URL(request.url).searchParams.get('order');
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(id||''))return json({error:'Invalid order ID'},400);
  try {
    const order=await getCustomerOrder(id,user.telegramId);
    if(!order)return json({error:'Order not found'},404);
    if(request.method==='POST'&&order.status==='paid'&&order.delivery_state==='retry'&&checkoutReady()){
      await fulfillPaidOrder(id);
    }
    const latest=request.method==='POST'?await getCustomerOrder(id,user.telegramId):order;
    return json({
      orderId:latest.id,planDays:latest.plan_days,
      amountRub:(Number(latest.amount_kopeks)/100).toFixed(2),
      status:latest.status,deliveryState:latest.delivery_state,
      expiresAt:latest.target_expires_at||null,
      notificationSent:!!latest.notification_sent_at
    });
  }catch{return json({error:'Не удалось проверить заказ. Повтори позже.'},503)}
}
