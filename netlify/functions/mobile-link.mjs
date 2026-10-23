import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {json} from './lib/security.mjs';
import {sameOrigin,sessionFromRequest} from './lib/telegram-identity.mjs';
import {cookie,verifySigned,altCookieName,identityHash} from './lib/alternate-auth.mjs';
import {limitedJson} from './lib/mobile-auth.mjs';
import {getPool,transaction} from './lib/subscription-db.mjs';

const idValid=id=>typeof id==='string'&&
  /^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(id);
const pollValid=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const hash=s=>createHash('sha256').update(s,'utf8').digest('hex');
export function equalHash(a,b) {
 if(!/^[a-f0-9]{64}$/.test(a||'')||!/^[a-f0-9]{64}$/.test(b||''))return false;
 return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function browserIdentity(request,provider,secret){
  if(provider==='telegram'){
    const user=sessionFromRequest(request,secret);
    if(!user)return null;
    return {subject:identityHash('telegram',user.telegramId,secret),
      telegramId:user.telegramId};
  }
  if(provider==='yandex'){
    const session=verifySigned(cookie(request,altCookieName),secret,'alt-session');
    if(session?.provider!=='yandex'||!/^[a-f0-9]{64}$/.test(session.sub||''))return null;
    return {subject:session.sub,telegramId:null};
  }
  return null;
}
export default async function handler(request){
 if(request.method!=='POST')return json({error:'Method not allowed'},405);
 const data=await limitedJson(request);
 if(!data || !['start','approve','poll'].includes(data.action))
   return json({error:'Invalid request'},400);
 const site=process.env.PUBLIC_SITE_ORIGIN;
 if(!site||!site.startsWith('https://'))return json({error:'Not configured'},503);
 if(request.headers.get('origin') && !sameOrigin(request))
   return json({error:'Invalid origin'},403);
 if(data.action==='approve'&&!sameOrigin(request))
   return json({error:'Invalid browser origin'},403);
 const secret=process.env.SESSION_SIGNING_KEY;
 if(!secret||secret.length<32)return json({error:'Not configured'},503);
 try{
   if(data.action==='start'){
     if(!['telegram','yandex'].includes(data.provider))return json({error:'Invalid provider'},400);
     if(data.provider==='telegram'&&!process.env.TELEGRAM_BOT_TOKEN)
       return json({error:'Telegram unavailable'},503);
     if(data.provider==='yandex'&&!process.env.YANDEX_CLIENT_ID)
       return json({error:'Yandex unavailable'},503);
     const flowId=randomUUID(),pollSecret=randomBytes(32).toString('hex');
     const pool=await getPool();
     await pool.query(`INSERT INTO vpn_native_login_links
       (id,auth_provider,poll_secret_hash) VALUES($1,$2,$3)`,
       [flowId,data.provider,hash(pollSecret)]);
     return json({flowId,pollSecret,provider:data.provider,
       browserUrl:site+'/mobile-link.html?flow='+flowId+'&provider='+data.provider});
   }
   if(!idValid(data.flowId))return json({error:'Invalid flow'},400);
   if(data.action==='approve'){
     const pool=await getPool();
     const row=await pool.query(`SELECT auth_provider FROM vpn_native_login_links
       WHERE id=$1 AND expires_at>now() AND consumed_at IS NULL`,[data.flowId]);
     const provider=row.rows[0]?.auth_provider;
     const identity=browserIdentity(request,provider,secret);
     if(!identity)return json({error:'Войди через указанный способ и повтори'},401);
     const result=await pool.query(`
       UPDATE vpn_native_login_links SET identity_subject=$2,telegram_id=$3,approved_at=now()
       WHERE id=$1 AND auth_provider=$4 AND approved_at IS NULL AND consumed_at IS NULL
         AND expires_at>now() RETURNING id`,
       [data.flowId,identity.subject,identity.telegramId,provider]);
     if(!result.rowCount)return json({error:'Код уже использован или устарел'},409);
     return json({approved:true});
   }
   if(!pollValid(data.pollSecret))return json({error:'Invalid poll secret'},400);
   const outcome=await transaction(async db=>{
      const r=await db.query(`SELECT * FROM vpn_native_login_links WHERE id=$1
        FOR UPDATE`,[data.flowId]);
      const flow=r.rows[0];
      if(!flow||flow.consumed_at||new Date(flow.expires_at).getTime()<=Date.now() ||
         !equalHash(flow.poll_secret_hash,hash(data.pollSecret)))
        return {error:true};
      if(!flow.approved_at || !/^[a-f0-9]{64}$/.test(flow.identity_subject||''))
        return {pending:true};
      await db.query(`UPDATE vpn_native_login_links SET consumed_at=now() WHERE id=$1`,[data.flowId]);
      return {provider:flow.auth_provider,subject:flow.identity_subject,
        telegramId:flow.telegram_id||null};
   });
   if(outcome.error)return json({error:'Link expired or invalid'},403);
   if(outcome.pending)return json({pending:true});
   return json({error:'Для мобильных покупок необходим вход через Clerk.'},403);
 }catch(error) {
   console.warn('Mobile browser login:',error?.name||'Error');
   return json({error:'Вход временно недоступен'},503);
 }
}
