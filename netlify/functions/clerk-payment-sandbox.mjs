import {json} from './lib/security.mjs';
import {mobileSession,limitedJson} from './lib/mobile-auth.mjs';
import {clerkSandboxEnabled,clerkSandboxOwner,startClerkSandbox,checkClerkSandbox} from './lib/clerk-rollypay-sandbox.mjs';

/**
 * Clerk-only RollyPay TEST payment: no charge, no DB, no H1Cloud and no email.
 * Sandbox mode and one explicitly approved test Clerk user must be configured.
 */
export default async function handler(request){
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(!clerkSandboxEnabled())return json({error:'Тестовый режим платежей выключен'},503);
  const origin=request.headers.get('origin');
  if(origin&&origin!==process.env.PUBLIC_SITE_ORIGIN)
    return json({error:'Invalid origin'},403);
  const owner=await mobileSession(request);
  if(!owner)return json({error:'Войди через Clerk'},401);
  if(!clerkSandboxOwner(owner))
    return json({error:'Этот тест доступен только разрешённому аккаунту'},403);
  const body=await limitedJson(request);
  if(!body||!['start','status'].includes(body.action))
    return json({error:'Invalid sandbox action'},400);
  try{
    if(body.action==='start'){
      if(Object.keys(body).some(k=>k!=='action'))
        return json({error:'Sandbox cannot accept amounts or payment flags'},400);
      return json(await startClerkSandbox(owner));
    }
    if(typeof body.proof!=='string'||
       Object.keys(body).some(k=>!['action','proof'].includes(k)))
      return json({error:'Invalid sandbox receipt'},400);
    return json(await checkClerkSandbox(owner,body.proof));
  }catch(error){
    console.warn('RollyPay sandbox validation failed:',error?.message||'Error');
    return json({error:'Тестовый платёж не подтверждён. Проверь настройки sandbox.'},503);
  }
}
