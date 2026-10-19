import {json} from './lib/security.mjs';
import {sessionFromRequest,sameOrigin} from './lib/telegram-identity.mjs';
import {H1StatusError} from './lib/h1-readonly.mjs';
import {deliverOwnExistingH1Subscription} from './lib/vpn-link-delivery.mjs';

/**
 * Authenticated, explicit click only: send EXISTING VPN URL to OWN Telegram.
 * Does not create or renew VPN profiles; does not charge or place orders.
 */
export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!sameOrigin(request))return json({error:'Неверный источник запроса'},403);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Войди через Telegram'},401);
  try{
    const result=await deliverOwnExistingH1Subscription(user.telegramId);
    return json(result);
  }catch(error){
    const diagnostic=error instanceof H1StatusError?error.code:'DELIVERY_UNAVAILABLE';
    console.warn('Vainah self-service Telegram delivery:',diagnostic); // No personal URLs or tokens.
    const messages={
      PANEL_NOT_CONFIGURED:'Панель VPN ещё не подключена.',
      PANEL_CLIENT_NOT_FOUND:'VPN-профиль пока не найден в H1Cloud.',
      PANEL_CLIENT_INACTIVE:'VPN-профиль сейчас не активен.',
      PANEL_LINK_MISSING:'H1Cloud не вернул защищённую ссылку для подписки.',
      TELEGRAM_START_BOT_FIRST:'Открой @Vainahvpn_bot, нажми Start и попробуй ещё раз.',
      TELEGRAM_SEND_FAILED:'Telegram пока не принял сообщение. Попробуй позже.'
    };
    return json({error:messages[diagnostic]||'Не получилось отправить VPN в Telegram. Попробуй позже.',diagnostic},503);
  }
}
