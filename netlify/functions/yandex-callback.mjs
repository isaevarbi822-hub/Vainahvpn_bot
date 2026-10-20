import {cookie,verifySigned,newAltSession,setCookie,
  flowCookieName,altCookieName,yandexConfigured,expectedOrigin} from './lib/alternate-auth.mjs';

function redirect(origin,reason,cookies=[]){
  const destination=origin+'/account.html?alt_login='+encodeURIComponent(reason);
  const response=new Response(null,{status:303,headers:{
    Location:destination,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'
  }});
  for(const value of cookies)response.headers.append('Set-Cookie',value);
  return response;
}
async function yandexIdentity(env,origin,code,verifier){
  const redirectUri=origin+'/.netlify/functions/yandex-callback';
  const params=new URLSearchParams({grant_type:'authorization_code',code,
    redirect_uri:redirectUri,code_verifier:verifier});
  const basic=Buffer.from(env.YANDEX_CLIENT_ID+':'+env.YANDEX_CLIENT_SECRET)
    .toString('base64');
  const tokenResponse=await fetch('https://oauth.yandex.ru/token',{
    method:'POST',headers:{Authorization:'Basic '+basic,
      'Content-Type':'application/x-www-form-urlencoded'},
    body:params.toString(),signal:AbortSignal.timeout(10000)});
  const payload=await tokenResponse.json().catch(()=>({}));
  if(!tokenResponse.ok||typeof payload.access_token!=='string')return null;
  const userResponse=await fetch('https://login.yandex.ru/info?format=json',{
    method:'GET',headers:{Authorization:'OAuth '+payload.access_token,
      Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  if(!userResponse.ok)return null;
  const user=await userResponse.json().catch(()=>({}));
  if(String(user.client_id)!==String(env.YANDEX_CLIENT_ID)||
    !/^[0-9a-zA-Z_-]{1,100}$/.test(String(user.id||'')))return null;
  return String(user.id);
}
export default async function handler(request){
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  const env=process.env,origin=expectedOrigin(env,request.url);
  if(!origin||!yandexConfigured(env))return new Response('Unavailable',{status:503});
  const cleared=setCookie(flowCookieName,'',0);
  const params=new URL(request.url).searchParams;
  const flow=verifySigned(cookie(request,flowCookieName),
    env.SESSION_SIGNING_KEY,'yandex-flow');
  const code=params.get('code')||'',state=params.get('state')||'';
  if(!flow||!state||state!==flow.state||!code||code.length>1800||
    params.has('error'))
    return redirect(origin,'error',[cleared]);
  try{
    const subject=await yandexIdentity(env,origin,code,flow.verifier);
    if(!subject)return redirect(origin,'error',[cleared]);
    return redirect(origin,'success',[
      cleared,
      setCookie(altCookieName,newAltSession('yandex',subject,env.SESSION_SIGNING_KEY))
    ]);
  }catch{return redirect(origin,'error',[cleared])}
}
