import {randomSecret,pkceChallenge,issueSigned,setCookie,
  flowCookieName,yandexConfigured,expectedOrigin} from './lib/alternate-auth.mjs';

export function yandexAuthorizationUrl(env,origin,state,verifier){
  const url=new URL('https://oauth.yandex.ru/authorize');
  url.searchParams.set('response_type','code');
  url.searchParams.set('client_id',env.YANDEX_CLIENT_ID);
  url.searchParams.set('redirect_uri',origin+'/.netlify/functions/yandex-callback');
  url.searchParams.set('scope','login:info');
  url.searchParams.set('state',state);
  url.searchParams.set('code_challenge',pkceChallenge(verifier));
  url.searchParams.set('code_challenge_method','S256');
  return url.href;
}
export default async function handler(request){
  if(request.method!=='GET')return new Response('Method not allowed',{status:405});
  const env=process.env,origin=expectedOrigin(env,request.url);
  if(!origin||!yandexConfigured(env))
    return new Response('Вход через Яндекс пока не настроен',{status:503});
  const state=randomSecret(),verifier=randomSecret();
  // Optional one-use mobile pairing. Keep this ID in the signed OAuth flow,
  // never accept a callback-controlled return URL.
  const requested=new URL(request.url).searchParams.get('mobile_flow');
  const mobileFlow=/^[a-f0-9]{8}-[a-f0-9-]{27,36}$/i.test(requested||'')?requested:null;
  const signed=issueSigned({purpose:'yandex-flow',state,verifier,
    ...(mobileFlow?{mobileFlow}:{}),
    exp:Math.floor(Date.now()/1000)+600},env.SESSION_SIGNING_KEY);
  const response=new Response(null,{status:302,headers:{
    Location:yandexAuthorizationUrl(env,origin,state,verifier),
    'Cache-Control':'no-store','Referrer-Policy':'no-referrer'
  }});
  response.headers.append('Set-Cookie',setCookie(flowCookieName,signed,600));
  return response;
}
