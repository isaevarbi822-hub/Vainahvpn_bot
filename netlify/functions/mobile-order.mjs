import {json} from './lib/security.mjs';
import {mobileSession} from './lib/mobile-auth.mjs';
import {readNativeOrder,readNativeVpnAccess,verifyNativeProvider,nativeCommerceReady} from './lib/native-commerce.mjs';

export default async function handler(request){
  if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
  const user=mobileSession(request);
  if(!user)return json({error:'Authentication required'},401);
  if(request.method==='POST'&&request.headers.get('origin')&&
     request.headers.get('origin')!==process.env.PUBLIC_SITE_ORIGIN)
    return json({error:'Invalid origin'},403);
  const orderId=new URL(request.url).searchParams.get('order');
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(orderId||''))
    return json({error:'Invalid order'},400);
  try{
    let order=await readNativeOrder(orderId);
    if(!order||order.auth_provider!==user.provider||order.identity_subject!==user.subject)
      return json({error:'Not found'},404);
    if(request.method==='POST'&&nativeCommerceReady()&&
       (['awaiting_payment','canceled','expired'].includes(order.status) ||
         (order.status==='paid' && order.delivery_state==='retry'))){
      if(order.status==='paid'){
        const {fulfillNativePaidOrder}=await import('./lib/native-commerce.mjs');
        await fulfillNativePaidOrder(orderId);
      }else await verifyNativeProvider(orderId);
      order=await readNativeOrder(orderId);
    }
    const active=order.status==='paid'&&order.delivery_state==='delivered';
    const subscriptionUrl=active?await readNativeVpnAccess(order):null;
    return json({orderId:order.id,status:order.status,
      deliveryState:order.delivery_state,emailState:order.email_state,
      expiresAt:order.target_expires_at||null,
      ...(subscriptionUrl?{subscriptionUrl}:{})});
  }catch{
    return json({error:'Проверка заказа временно недоступна'},503);
  }
}
