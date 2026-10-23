import {sessionFromRequest} from './telegram-identity.mjs';
import {cookie,verifySigned,altCookieName} from './alternate-auth.mjs';

/**
 * Resolve a verified checkout owner without treating an email identity as
 * a Telegram ID. This helper is for the future owner-scoped order migration.
 * It does NOT authorize billing or change existing payment endpoints.
 */
export function checkoutOwner(request,secret=process.env.SESSION_SIGNING_KEY){
  const telegram=sessionFromRequest(request,secret);
  const alt=verifySigned(cookie(request,altCookieName),secret,'alt-session');
  const email=alt?.provider==='email'&&/^[a-f0-9]{64}$/.test(alt.sub||'')
    ? {provider:'email',subject:alt.sub} : null;
  // Two simultaneously valid, unlinked identities are ambiguous. Never guess.
  if(telegram&&email)return {error:'ACCOUNT_LINK_REQUIRED'};
  if(telegram)return {provider:'telegram',subject:telegram.telegramId};
  if(email)return email;
  return null;
}
