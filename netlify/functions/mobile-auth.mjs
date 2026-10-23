import {json} from './lib/security.mjs';
import {identityHash,normalizeContact,publicMethods} from './lib/alternate-auth.mjs';
import {mobileSession,makeMobileSession,nativeChallenge,checkChallenge,twilioVerify,limitedJson} from './lib/mobile-auth.mjs';

export default async function handler(request) {
  if(request.method==='GET'){
    const session=mobileSession(request);
    return json({authenticated:!!session,provider:session?.provider||null,
      emailVerified:!!session?.email,available:publicMethods(process.env,
      new URL(process.env.PUBLIC_SITE_ORIGIN||request.url).origin+'/.netlify/functions/mobile-auth')});
  }
  if(request.method!=='POST')return json({error:'Method not allowed'},405);
  if(request.headers.get('origin') && request.headers.get('origin')!==process.env.PUBLIC_SITE_ORIGIN)
    return json({error:'Invalid origin'},403);
  const data=await limitedJson(request);
  if(!data)return json({error:'Invalid JSON'},400);
  if(!['send','check','email-send','email-check'].includes(data.action))
    return json({error:'Invalid action'},400);
  const linking=data.action.startsWith('email-');
  const owner=linking?mobileSession(request):null;
  if(linking&&!owner)return json({error:'Login required to verify delivery email'},401);
  const method=linking?'email':data.method;
  if(!['email','phone'].includes(method))return json({error:'Unsupported verification'},400);
  const contact=normalizeContact(method,data.contact);
  if(!contact)return json({error:'Укажи корректный адрес или номер +…'},400);
  const secret=process.env.SESSION_SIGNING_KEY;
  const linkTo=owner?.subject||null;
  try{
    if(data.action.endsWith('send')){
      const result=await twilioVerify({start:true,method,contact});
      if(!result.ok||result.data?.status!=='pending')
        return json({error:'Не получилось отправить код. Попробуй позже.'},result.status===429?429:503);
      return json({sent:true,challenge:nativeChallenge(method,contact,secret,{linkTo}),
        expiresIn:600});
    }
    if(typeof data.challenge!=='string'||!checkChallenge(data.challenge,method,contact,secret,linkTo))
      return json({error:'Запроси новый код для этого адреса или номера'},403);
    if(typeof data.code!=='string'||!/^[0-9]{4,10}$/.test(data.code))
      return json({error:'Неверный формат кода'},400);
    const response=await twilioVerify({start:false,method,contact,code:data.code});
    if(!response.ok || response.data?.status!=='approved' ||
       normalizeContact(method,response.data.to)!==contact)
      return json({error:'Неверный код или срок его действия истёк'},403);
    const subject=owner?.subject||identityHash(method,contact,secret);
    const provider=owner?.provider||method;
    const email=linking?contact:method==='email'?contact:null;
    const token=makeMobileSession({provider,subject,email,
      telegramId:owner?.telegramId||null},secret);
    return json({authenticated:true,token,provider,emailVerified:!!email});
  }catch(e){
    console.warn('Native login provider:',e?.name||'Error');
    return json({error:'Проверка недоступна. Повтори позже.'},503);
  }
}
