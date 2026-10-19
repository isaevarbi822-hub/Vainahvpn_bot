import {json} from './lib/security.mjs';
import {sameOrigin,sessionFromRequest} from './lib/telegram-identity.mjs';
import {sandboxAllowed,createSandboxPayment,checkSandboxPayment,SandboxError} from './lib/rollypay-sandbox.mjs';

const explanations={
  SANDBOX_NOT_ALLOWED:'Тест доступен только владельцу. Укажи VAINAH_SANDBOX_TELEGRAM_ID в Netlify.',
  PROVIDER_UNREACHABLE:'RollyPay временно недоступен. Попробуй позже.',
  PROVIDER_RESPONSE_INVALID:'RollyPay прислал неожиданный ответ. Тест не подтверждён.',
  PROVIDER_RESPONSE_NOT_JSON:'RollyPay вернул ответ не в формате JSON. Проверь код ошибки ниже.',
  PROVIDER_RESPONSE_TOO_LARGE:'RollyPay вернул слишком большой ответ. Тест не подтверждён.',
  PROVIDER_RESPONSE_FIELDS_INVALID:'В ответе RollyPay отсутствуют обязательные поля.',
  PROVIDER_RESPONSE_READ_FAILED:'Не получилось прочитать ответ RollyPay.',
  PROVIDER_PAYMENT_ID_INVALID:'RollyPay вернул неожиданный идентификатор платежа.',
  PROVIDER_PAY_URL_INVALID:'RollyPay вернул неподходящую ссылку на платёж.',
  PROVIDER_HTTP_400:'RollyPay отклонил параметры тестового платежа (HTTP 400).',
  PROVIDER_HTTP_401:'RollyPay не принял API-ключ кассы (HTTP 401).',
  PROVIDER_HTTP_403:'RollyPay запретил запрос от этой кассы (HTTP 403).',
  PROVIDER_HTTP_404:'Адрес RollyPay не найден (HTTP 404).',
  PROVIDER_HTTP_422:'RollyPay не принял данные запроса (HTTP 422).',
  PROVIDER_HTTP_429:'RollyPay временно ограничил частоту запросов (HTTP 429).',
  PROVIDER_HTTP_500:'В RollyPay произошла внутренняя ошибка (HTTP 500).',
  PROVIDER_HTTP_502:'RollyPay временно недоступен (HTTP 502).',
  PROVIDER_HTTP_503:'RollyPay временно недоступен (HTTP 503).',
  PROVIDER_SANDBOX_MISMATCH:'RollyPay не подтвердил безопасный тестовый режим.',
  INVALID_TEST_SESSION:'Срок теста истёк или проверка не прошла. Создай новый тест.'
};
export default async function handler(request){
  if(request.method!=='GET'&&request.method!=='POST')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Сначала войди через Telegram на сайте'},401);
  if(request.method==='GET')return json({allowed:sandboxAllowed(user.telegramId)});
  if(!sameOrigin(request))return json({error:'Неверный источник запроса'},403);
  if(!sandboxAllowed(user.telegramId))return json({error:explanations.SANDBOX_NOT_ALLOWED},403);
  let data;
  try{
    if(Number(request.headers.get('content-length')||0)>1500)return json({error:'Too large'},413);
    const raw=await request.text();
    if(raw.length>1500)return json({error:'Too large'},413);
    data=JSON.parse(raw);
  }catch{return json({error:'Некорректный запрос'},400)}
  try{
    if(data?.action==='create'){
      const payment=await createSandboxPayment(user.telegramId);
      return json(payment,201);
    }
    if(data?.action==='status'){
      const result=await checkSandboxPayment(user.telegramId,data?.proof);
      return json(result);
    }
    return json({error:'Неизвестное действие'},400);
  }catch(e){
    const code=e instanceof SandboxError?e.code:'SANDBOX_UNAVAILABLE';
    console.warn('Vainah RollyPay sandbox diagnostic:',code); // No API keys or payment URLs.
    return json({error:explanations[code]||'Не получилось проверить тестовый платёж. Повтори позже.',
      diagnostic:code},503);
  }
}
