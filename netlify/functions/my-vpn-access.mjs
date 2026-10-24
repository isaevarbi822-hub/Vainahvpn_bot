import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {readH1ClientStatus} from './lib/h1-readonly.mjs';
import {readWebsiteAccess} from './lib/h1-fulfillment.mjs';

/**
 * Self-service access for an EXISTING active H1Cloud profile, regardless of
 * whether it was bought through the bot or website.
 *
 * The authenticated Telegram ID comes solely from the verified HttpOnly
 * session cookie. No client name, ID, key or subscription URL is accepted
 * from browser parameters, and the provider is only queried with GET.
 */
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Войди через Telegram, чтобы получить свой VPN'},401);
  try{
    const status=await readH1ClientStatus(user.telegramId);
    if(!status.panelReady)return json({error:'H1Cloud пока не подключён'},503);
    if(!status.found||!status.active||status.banned)
      return json({error:'Активный VPN-профиль для аккаунта не найден'},404);
    // readWebsiteAccess validates HTTPS URL and active expiry; the passed ID
    // is the authenticated ID and cannot be replaced by user-controlled input.
    const result=await readWebsiteAccess(user.telegramId);
    return json({subscriptionUrl:result.subscriptionUrl,expiresAt:result.expiresAt});
  }catch{
    return json({error:'Не удалось получить VPN-ссылку из H1Cloud. Попробуй позже.'},503);
  }
}
