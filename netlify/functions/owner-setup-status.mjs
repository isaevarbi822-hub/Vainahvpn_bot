import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {twilioConfigured,yandexConfigured} from './lib/alternate-auth.mjs';
import {checkoutReady} from './lib/plan-catalog.mjs';

/**
 * Configuration-only status for the authenticated sandbox owner.
 * No network calls, financial operations, key values, URLs, usernames,
 * database queries, H1 mutations or provider invoice creation.
 * A 'configured' result is NOT evidence that the provider accepts a key.
 */
const present=value=>typeof value==='string'&&value.trim().length>0;

function strictHttpsOrigin(value){
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&u.origin===value&&
      !u.username&&!u.password&&!u.hash&&!u.search;
  }catch{return false}
}
function postgresUrl(value){
  try{
    const u=new URL(value);
    return ['postgres:','postgresql:'].includes(u.protocol)&&
      !!u.hostname&&!!u.pathname&&!u.hash;
  }catch{return false}
}
function panelUrl(value){
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&
      !u.search&&!u.hash&&['/','/api','/api/'].includes(u.pathname);
  }catch{return false}
}

export function inspectDeploymentSetup(env=process.env) {
  const site=strictHttpsOrigin(env.PUBLIC_SITE_ORIGIN);
  const session=present(env.SESSION_SIGNING_KEY)&&env.SESSION_SIGNING_KEY.length>=32;
  const telegram=present(env.TELEGRAM_BOT_TOKEN)&&session;
  const database=postgresUrl(env.DATABASE_URL);
  const h1cloud=panelUrl(env.PANEL_BASE_URL)&&present(env.PANEL_API_TOKEN);
  const rollypay=present(env.ROLLYPAY_API_KEY)&&present(env.ROLLYPAY_SIGNING_SECRET);
  const sms=twilioConfigured(env);
  const yandex=yandexConfigured(env);
  const result={
    // Boolean values ONLY. These do not mean an account or provider has been
    // independently verified, and are not exposed outside owner authorization.
    configured:{
      site,telegram,database,h1cloud,rollypay,
      phone:sms,email:sms,yandex,
      sandbox:present(env.VAINAH_SANDBOX_TELEGRAM_ID)&&
        present(env.ROLLYPAY_API_KEY)&&session,
      clientMappingReview:env.PANEL_CLIENT_MAPPING_VERIFIED==='true'
    },
    essentialConfigurationPresent:site&&telegram&&database&&h1cloud&&rollypay,
    liveCheckoutEnabled:checkoutReady(env),
    providerConnectivityVerified:false,
    h1DeliveryVerified:false,
    explanation:'Только проверка настроек сервера. Работа RollyPay, БД, H1Cloud и живой оплаты этим запросом НЕ подтверждается.'
  };
  return result;
}

export default async function handler(request) {
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const identity=sessionFromRequest(request);
  const ownerId=String(process.env.VAINAH_SANDBOX_TELEGRAM_ID||'');
  // Reuse existing private, owner-only test identity. Never allow a fallback
  // to "any signed-in user" when operator identity is not configured.
  if(!/^[1-9][0-9]{0,17}$/.test(ownerId) ||
     !identity||identity.telegramId!==ownerId)
    return json({error:'Not available'},403);
  // Do not reveal even booleans when the request is routed via the wrong site.
  if(!strictHttpsOrigin(process.env.PUBLIC_SITE_ORIGIN) ||
     new URL(request.url).origin!==process.env.PUBLIC_SITE_ORIGIN)
    return json({error:'Wrong site'},403);
  return json(inspectDeploymentSetup());
}
