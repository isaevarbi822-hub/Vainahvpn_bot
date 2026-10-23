import { json } from './lib/security.mjs';
import { checkoutReady, planCatalog } from './lib/plan-catalog.mjs';
import {nativeCommerceReady} from './lib/native-commerce.mjs';
export default async function handler(request) {
  if(request.method!=='GET') return json({error:'Method not allowed'},405);
  return json({
    plans:planCatalog().map(({id,days,title,priceRub,deviceLimit})=>({id,days,title,priceRub,deviceLimit})),
    checkoutReady:checkoutReady(),
    nativeCheckoutReady:nativeCommerceReady(),
    botUsername:'Vainahvpn_bot',
    message:checkoutReady()?'Авторизуйся через Telegram перед покупкой.':'Онлайн-оплата готовится. Пока не вводи платёжные данные.'
  });
}
