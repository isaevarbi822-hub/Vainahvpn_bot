import {sameOrigin} from './lib/telegram-identity.mjs';
import {json} from './lib/security.mjs';
import {altSession,publicMethods,normalizeContact,twilioConfigured,
  cookie,issueSigned,verifySigned,newAltSession,setCookie,identityHash,
  altCookieName,otpCookieName,cooldownCookieName,expectedOrigin} from './lib/alternate-auth.mjs';

function respond(data,status=200,cookies=[]){
  const r=json(data,status);
  for(const value of cookies)r.headers.append('Set-Cookie',value);
  r.headers.set('Cache-Control','no-store');
  return r;
}
async function parseBody(request){
  if(Number(request.headers.get('content-length')||0)>768)return null;
  const raw=await request.text();
  if(raw.length>768)return null;
  try{const value=JSON.parse(raw);return value&&typeof value==='object'&&
    !Array.isArray(value)?value:null}catch{return null}
}
async function verifyProvider(params,env){
  const endpoint=params.start?'Verifications':'VerificationCheck';
  const url='https://verify.twilio.com/v2/Services/'+
    env.TWILIO_VERIFY_SERVICE_SID+'/'+endpoint;
  const auth=Buffer.from(env.TWILIO_ACCOUNT_SID+':'+env.TWILIO_AUTH_TOKEN)
    .toString('base64');
  const body=new URLSearchParams({To:params.contact});
  if(params.start)body.set('Channel',params.method==='phone'?'sms':'email');
  else body.set('Code',params.code);
  const response=await fetch(url,{method:'POST',headers:{
    Authorization:'Basic '+auth,'Content-Type':'application/x-www-form-urlencoded'
  },body:body.toString(),signal:AbortSignal.timeout(10000)});
  return {status:response.status,ok:response.ok,
    data:await response.json().catch(()=>({}))};
}
export default async function handler(request){
  const env=process.env;
  if(request.method==='GET'){
    const session=altSession(request);
    return respond({authenticated:!!session,user:session||null,
      available:publicMethods(env,request.url)});
  }
  if(request.method!=='POST')return respond({error:'Method not allowed'},405);
  if(!sameOrigin(request)||!expectedOrigin(env,request.url))
    return respond({error:'Invalid request origin'},403);
  const data=await parseBody(request);
  if(!data)return respond({error:'Invalid request'},400);
  if(data.action==='logout')
    return respond({authenticated:false},200,[setCookie(altCookieName,'',0)]);
  if(!['send','check'].includes(data.action)||!['phone','email'].includes(data.method))
    return respond({error:'Invalid action'},400);
  if(!twilioConfigured(env))return respond({error:'Этот способ входа ещё не подключён'},503);
  const contact=normalizeContact(data.method,data.contact);
  if(!contact)return respond({error:'Укажи корректную почту или телефон в международном формате (+...)'},400);
  const secret=env.SESSION_SIGNING_KEY;
  try{
    if(data.action==='send'){
      const cooldown=verifySigned(cookie(request,cooldownCookieName),secret,'otp-cooldown');
      if(cooldown)return respond({error:'Подожди минуту перед повторной отправкой'},429);
      const result=await verifyProvider({start:true,method:data.method,contact},env);
      if(!result.ok||result.data.status!=='pending')
        return respond({error:result.status===429?'Слишком много запросов. Попробуй позже.':
          'Не получилось отправить код. Проверь настройки провайдера.'},
          result.status===429?429:503);
      const pending=issueSigned({purpose:'otp-pending',method:data.method,
        sub:identityHash(data.method,contact,secret),
        exp:Math.floor(Date.now()/1000)+600},secret);
      const throttle=issueSigned({purpose:'otp-cooldown',
        exp:Math.floor(Date.now()/1000)+60},secret);
      return respond({sent:true,expiresIn:600},200,[
        setCookie(otpCookieName,pending,600),
        setCookie(cooldownCookieName,throttle,60)
      ]);
    }
    const pending=verifySigned(cookie(request,otpCookieName),secret,'otp-pending');
    if(!pending||pending.method!==data.method||
      pending.sub!==identityHash(data.method,contact,secret))
      return respond({error:'Сначала запроси код для этого адреса или номера'},403);
    if(typeof data.code!=='string'||!/^[0-9]{4,10}$/.test(data.code))
      return respond({error:'Код должен содержать от 4 до 10 цифр'},400);
    const result=await verifyProvider({start:false,contact,code:data.code},env);
    if(result.ok&&result.data.status==='approved'&&
      normalizeContact(data.method,result.data.to)===contact){
      return respond({authenticated:true,provider:data.method},200,[
        setCookie(altCookieName,newAltSession(data.method,contact,secret)),
        setCookie(otpCookieName,'',0)
      ]);
    }
    return respond({error:'Неверный код или срок действия истёк'},403);
  }catch{
    return respond({error:'Сервис подтверждения временно недоступен'},503);
  }
}
