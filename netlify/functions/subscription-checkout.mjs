import {randomUUID} from 'node:crypto';
import {json} from './lib/security.mjs';
import {checkoutReady,planById} from './lib/plan-catalog.mjs';
import {sameOrigin,sessionFromRequest} from './lib/telegram-identity.mjs';
import {insertCheckout,attachPayment,markOrderFailed} from './lib/subscription-db.mjs';
import {createInvoice} from './lib/rollypay-client.mjs';
import {checkoutOwner} from './lib/checkout-owner.mjs';
import {findOrCreateOwner} from './lib/customer-owner-db.mjs';
import {clerkIdentityFromRequest} from './lib/clerk-identity.mjs';

export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!sameOrigin(request))return json({error:'Invalid origin'},403);
  const clerk=clerkIdentityFromRequest(request);
  // Clerk identities need an audited H1Cloud delivery migration; refuse
  // to charge rather than allocating access to an unrelated Telegram ID.
  if(clerk)return json({error:'Вход Clerk подтверждён. Выдача VPN для этого аккаунта ещё настраивается; оплата не запущена.'},503);
  const identity=checkoutOwner(request);
  if(!identity)return json({error:'Сначала войди через почту или Telegram'},401);
  if(identity.error)return json({error:'Выйди из второго аккаунта и повтори вход'},409);
  // Email purchasing requires an owner-scoped delivery migration first.
  // Never create a charge against a fabricated Telegram identity.
  if(identity.provider==='email')return json({error:'Оплата по почте ещё не подключена к выдаче VPN'},503);
  const user=sessionFromRequest(request);
  if(!user || identity.subject!==user.telegramId)return json({error:'Ошибка подтверждения аккаунта'},401);
  if(!checkoutReady())return json({error:'Оплата пока настраивается. Денег не списываем.'},503);
  let body;
  try{
    const raw=await request.text();
    if(raw.length>2048) return json({error:'Too large'},413);
    body=JSON.parse(raw);
  }catch{return json({error:'Invalid request'},400)}
  const plan=planById(body?.plan);
  if(!plan || plan.kopeks===null)return json({error:'Тариф пока недоступен'},400);
  const id=randomUUID();
  let created=false;
  try{
    const ownerId=await findOrCreateOwner(identity);
    const result=await insertCheckout({id,telegramId:user.telegramId,username:user.username,plan,ownerId});
    if(!result)return json({error:'Уже есть неоплаченные заказы. Подожди 15 минут.'},429);
    created=true;
    const payment=await createInvoice({
      orderId:id,amountKopeks:plan.kopeks,telegramId:user.telegramId,
      description:'Vainah VPN — подписка на '+plan.days+' дней'
    });
    if(!(await attachPayment({id,paymentId:payment.paymentId,url:payment.payUrl})))throw Error('PERSISTENCE_FAILED');
    return json({orderId:id,payUrl:payment.payUrl,days:plan.days,priceRub:plan.priceRub});
  }catch(e){
    if(created)await markOrderFailed(id).catch(()=>{});
    console.error('Vainah checkout diagnostic:',String(e?.message||'').replace(/https?:\/\/\S+/g,'[url]'));
    return json({error:'Не получилось создать счёт. Оплата не запущена; попробуй позже.'},503);
  }
}
