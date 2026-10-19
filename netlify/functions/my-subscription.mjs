import {json} from './lib/security.mjs';
import {sessionFromRequest} from './lib/telegram-identity.mjs';
import {readSharedH1Subscription} from './lib/h1-fulfillment.mjs';
export default async function handler(request){
  if(request.method!=='GET')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Telegram authentication required'},401);
  if(!process.env.PANEL_BASE_URL||!process.env.PANEL_API_TOKEN)return json({
    telegramId:user.telegramId,username:user.username,
    panelReady:false,found:false,active:false,expiresAt:null
  });
  try{
    const status=await readSharedH1Subscription(user.telegramId);
    return json({telegramId:user.telegramId,username:user.username,panelReady:true,...status});
  }catch{
    return json({error:'Статус VPN сейчас недоступен. Проверь позже.'},503);
  }
}
