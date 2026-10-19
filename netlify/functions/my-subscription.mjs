import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';

export default async function handler(request) {
  if(request.method!=='GET') return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user) return json({error:'Telegram login required'},401);
  return json({
    telegramId:user.telegramId,
    username:user.username,
    panelReady:false,
    found:false,
    active:false,
    expiresAt:null
  });
}
