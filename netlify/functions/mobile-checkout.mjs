import {json} from './lib/security.mjs';
import {planById} from './lib/plan-catalog.mjs';
import {mobileSession,limitedJson} from './lib/mobile-auth.mjs';
import {nativeCommerceReady,createNativeOrder,attachNativePayment,failNativeOrder} from './lib/native-commerce.mjs';
import {createInvoice} from './lib/rollypay-client.mjs';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('origin') && request.headers.get('origin')!==process.env.PUBLIC_SITE_ORIGIN)
    return json({error:'Invalid origin'},403);
  const user=mobileSession(request);
  if(!user)return json({error:'Войди в аккаунт внутри Vainah VPN'},401);
  if(!user.email)return json({error:'Подтверди почту для получения VPN-подписки'},403);
  if(!nativeCommerceReady())return json({error:'Платежи в приложении ещё не включены'},503);
  const data=await limitedJson(request);
  const plan=planById(data?.plan);
  if(!plan)return json({error:'Недоступный тариф'},400);
  let order;
  try{
    order=await createNativeOrder(user,plan);
    if(!order)return json({error:'Слишком много незавершённых заказов'},429);
    const payment=await createInvoice({orderId:order.id,amountKopeks:plan.kopeks,
      customerId:'native_'+order.customerId,description:'Vainah VPN — '+plan.days+' дней',mobile:true});
    if(!await attachNativePayment(order.id,payment))throw Error('ORDER_NOT_ATTACHED');
    return json({orderId:order.id,payUrl:payment.payUrl,
      priceRub:plan.priceRub,days:plan.days});
  }catch(error){
    if(order)await failNativeOrder(order.id).catch(()=>{});
    console.warn('Native checkout creation error:',error?.name||'Error');
    return json({error:'Не удалось создать счёт. Попробуй позже.'},503);
  }
}
