import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {H1StatusError,readH1ClientStatus} from './lib/h1-readonly.mjs';

/**
 * GET only. Reads an H1Cloud profile whose name matches the signed Telegram ID.
 * Never creates, updates, extends or deletes a VPN client.
 */
export default async function handler(request) {
  if(request.method!=='GET') return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user) return json({error:'Telegram login required'},401);
  try {
    // Deliberately discard client UUID, VPN keys and all other private API fields.
    const status=await readH1ClientStatus(user.telegramId);
    return json({telegramId:user.telegramId,username:user.username,...status});
  }catch(error){
    const diagnostic=error instanceof H1StatusError?error.code:'PANEL_READ_FAILED';
    console.warn('Vainah VPN H1 read-only status:',diagnostic);
    const notConfigured=/^PANEL_(URL|PREFIX)_INVALID$/.test(diagnostic);
    return json({
      error:'Не удалось проверить подписку в H1Cloud. Попробуй позже.',
      diagnostic
    },notConfigured?503:502);
  }
}
