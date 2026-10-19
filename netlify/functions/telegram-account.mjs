import { verifyTelegramLogin, makeSession, sessionFromRequest, sameOrigin, sessionCookie } from './lib/telegram-identity.mjs';
import { json } from './lib/security.mjs';

function respond(data,status=200,cookie) {
  const response=json(data,status);
  if(cookie) response.headers.set('Set-Cookie',cookie);
  return response;
}
export default async function handler(request) {
  if (request.method==='GET') {
    const user=sessionFromRequest(request);
    return respond({authenticated:!!user,user:user||null});
  }
  if(request.method!=='POST') return respond({error:'Method not allowed'},405);
  if(!sameOrigin(request)) return respond({error:'Invalid request origin'},403);
  let body;
  try {
    if(Number(request.headers.get('content-length')||0)>4096) return respond({error:'Too large'},413);
    const text=await request.text();
    if(text.length>4096) return respond({error:'Too large'},413);
    body=JSON.parse(text);
  }catch {return respond({error:'Invalid request'},400);}
  if(body?.action==='logout') return respond({authenticated:false},200,sessionCookie('',0));
  if(body?.action!=='login') return respond({error:'Invalid action'},400);
  const token=process.env.TELEGRAM_BOT_TOKEN||'';
  const secret=process.env.SESSION_SIGNING_KEY||'';
  if(!token || secret.length<32) return respond({error:'Telegram login not configured'},503);
  const user=verifyTelegramLogin(body.data,token);
  if(!user) return respond({error:'Telegram authentication failed'},403);
  const cookie=sessionCookie(makeSession(user,secret));
  return respond({authenticated:true,user},200,cookie);
}
