import {json} from './lib/security.mjs';

/**
 * Public, non-sensitive self-check. Does NOT call Telegram API, verify BotFather
 * domain registration or expose keys / expected origin / private account data.
 */
export function diagnoseTelegramLogin(env,requestUrl){
  let originMatches=false;
  try{
    const deployed=new URL(requestUrl).origin;
    const expected=new URL(env.PUBLIC_SITE_ORIGIN||'').origin;
    originMatches=expected===deployed;
  }catch{}
  const tokenReady=typeof env.TELEGRAM_BOT_TOKEN==='string'&&
    /^[0-9]{5,15}:[A-Za-z0-9_-]{30,}$/.test(env.TELEGRAM_BOT_TOKEN);
  const sessionReady=typeof env.SESSION_SIGNING_KEY==='string'&&
    env.SESSION_SIGNING_KEY.length>=32;
  return {
    ok:tokenReady&&sessionReady&&originMatches,
    botTokenConfigured:tokenReady,
    sessionSigningConfigured:sessionReady,
    siteOriginMatches:originMatches,
    telegramDomainVerified:false,
    telegramDomainVerification:'not_checked',
    note:'Telegram domain settings and external widget availability cannot be checked by this endpoint.'
  };
}
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  return json(diagnoseTelegramLogin(process.env,request.url));
}
