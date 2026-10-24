import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {readOwnH1Access} from './lib/own-h1-access.mjs';
import {H1StatusError} from './lib/h1-readonly.mjs';

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
    const result=await readOwnH1Access(user.telegramId);
    return json(result);
  }catch(error){
    const code=error instanceof H1StatusError?error.code:'PANEL_READ_FAILED';
    if(code==='PANEL_CLIENT_NOT_FOUND'||code==='PANEL_CLIENT_INACTIVE')
      return json({error:'Активный VPN-профиль для аккаунта не найден'},404);
    return json({error:'Не удалось получить VPN-ссылку из H1Cloud. Попробуй позже.'},503);
  }
}
