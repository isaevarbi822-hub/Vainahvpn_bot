import {json} from './lib/security.mjs';
import {sameOrigin,sessionFromRequest} from './lib/telegram-identity.mjs';
import {sandboxAllowed,createSandboxPayment,checkSandboxPayment,SandboxError} from './lib/rollypay-sandbox.mjs';
import {sandboxDeliveryReady,deliverPaidSandboxProfile,SandboxDeliveryError} from './lib/sandbox-h1-delivery.mjs';

const explanations={
  SANDBOX_NOT_ALLOWED:'Тест доступен только владельцу. Укажи VAINAH_SANDBOX_TELEGRAM_ID в Netlify.',
  PROVIDER_UNREACHABLE:'RollyPay временно недоступен. Попробуй позже.',
  PROVIDER_RESPONSE_INVALID:'RollyPay прислал неожиданный ответ. Тест не подтверждён.',
  PROVIDER_RESPONSE_NOT_JSON:'RollyPay вернул ответ не в формате JSON. Проверь код ошибки ниже.',
  PROVIDER_RESPONSE_TOO_LARGE:'RollyPay вернул слишком большой ответ. Тест не подтверждён.',
  PROVIDER_RESPONSE_FIELDS_INVALID:'В ответе RollyPay отсутствуют обязательные поля.',
  PROVIDER_RESPONSE_READ_FAILED:'Не получилось прочитать ответ RollyPay.',
  PROVIDER_PAYMENT_ID_INVALID:'RollyPay вернул идентификатор платежа в неподдерживаемом формате.',
  PROVIDER_PAYMENT_ID_MISSING:'RollyPay не вернул поле payment_id. Нужна проверка формата API.',
  PROVIDER_PAY_URL_INVALID:'RollyPay вернул неподходящую ссылку на платёж.',
  PROVIDER_PAY_URL_MISSING:'RollyPay не передал платёжную ссылку. Тест не подтверждён.',
  PROVIDER_PAY_URL_MALFORMED:'RollyPay вернул некорректный формат платёжной ссылки.',
  PROVIDER_PAY_URL_UNSAFE_ORIGIN:'Ссылка ведёт не на ожидаемый защищённый сайт RollyPay.',
  PROVIDER_PAY_URL_UNEXPECTED_PATH:'Путь или параметры ссылки отличаются от документированного формата RollyPay.',
  PROVIDER_HTTP_400:'RollyPay отклонил параметры тестового платежа (HTTP 400).',
  PROVIDER_HTTP_401:'RollyPay не принял API-ключ кассы (HTTP 401).',
  PROVIDER_HTTP_403:'RollyPay запретил запрос от этой кассы (HTTP 403).',
  PROVIDER_HTTP_404:'Адрес RollyPay не найден (HTTP 404).',
  PROVIDER_HTTP_422:'RollyPay не принял данные запроса (HTTP 422).',
  PROVIDER_HTTP_429:'RollyPay временно ограничил частоту запросов (HTTP 429).',
  PROVIDER_HTTP_500:'В RollyPay произошла внутренняя ошибка (HTTP 500).',
  PROVIDER_HTTP_502:'RollyPay временно недоступен (HTTP 502).',
  PROVIDER_HTTP_503:'RollyPay временно недоступен (HTTP 503).',
  PROVIDER_SANDBOX_MISMATCH:'Данные sandbox-счёта не совпали. VPN не выдаётся.',
  PROVIDER_TEST_FLAG_MISSING:'В ответе RollyPay нет подтверждения test:true. VPN не выдаётся.',
  PROVIDER_TEST_FLAG_NOT_TRUE:'RollyPay не подтвердил тестовый флаг. VPN не выдаётся.',
  PROVIDER_ENVIRONMENT_MISSING:'В ответе RollyPay отсутствует environment:sandbox. VPN не выдаётся.',
  PROVIDER_ENVIRONMENT_NOT_SANDBOX:'RollyPay вернул не sandbox. VPN не выдаётся.',
  PROVIDER_ORDER_MISMATCH:'RollyPay вернул другой номер заказа. VPN не выдаётся.',
  PROVIDER_CURRENCY_MISMATCH:'Валюта RollyPay не соответствует RUB.',
  PROVIDER_AMOUNT_MISMATCH:'Сумма RollyPay не соответствует тестовому счёту.',
  PROVIDER_STATUS_INVALID:'RollyPay вернул неподдерживаемый статус.',
  PROVIDER_PAYMENT_ID_MISMATCH:'RollyPay вернул другой ID платежа.',
  INVALID_TEST_SESSION:'Срок теста истёк или проверка не прошла. Создай новый тест.',
  TEST_DELIVERY_DISABLED:'Тестовая выдача VPN отключена. Проверь отдельную настройку Netlify.',
  TEST_OWNER_INVALID:'Не удалось проверить владельца тестового профиля.',
  TEST_PAYMENT_NOT_PAID:'RollyPay пока не подтвердил успешный тестовый платёж.',
  TEST_CLIENT_NAME_COLLISION:'Имя тестового профиля совпало с основным. Операция запрещена.',
  TEST_PANEL_UNREACHABLE:'H1Cloud пока недоступен для теста.',
  TEST_PANEL_UNAUTHORIZED:'H1Cloud отклонил доступ к панели.',
  TEST_PANEL_INVALID_RESPONSE:'H1Cloud вернул неожиданный ответ.',
  TEST_PANEL_CREATE_FAILED:'H1Cloud не смог создать демонстрационный профиль.',
  TEST_PANEL_READ_FAILED:'H1Cloud не смог проверить демонстрационный профиль.',
  TEST_PANEL_CREATE_NOT_VISIBLE:'Новый тестовый профиль пока не появился в панели.',
  TEST_PANEL_PROFILE_MISMATCH:'Панель вернула другой профиль. Изменения запрещены.',
  TEST_PANEL_PROFILE_UNSAFE:'Уже существует неподходящий тестовый профиль. Ничего не изменено.',
  TEST_PANEL_LINK_INVALID:'Нет безопасной ссылки на тестовый VPN.',
  TEST_TELEGRAM_UNREACHABLE:'Не получилось связаться с Telegram.',
  TEST_TELEGRAM_START_BOT:'Открой @Vainahvpn_bot и нажми Start, затем повтори тестовую проверку.',
  TEST_TELEGRAM_SEND_FAILED:'Бот не подтвердил доставку тестовой ссылки.'
};
export default async function handler(request){
  if(request.method!=='GET'&&request.method!=='POST')return json({error:'Method not allowed'},405);
  const user=sessionFromRequest(request);
  if(!user)return json({error:'Сначала войди через Telegram на сайте'},401);
  if(request.method==='GET')return json({allowed:sandboxAllowed(user.telegramId),deliveryReady:sandboxDeliveryReady(user.telegramId)});
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
    if(data?.action==='deliver'){
      // Revalidate the signed TEST proof through RollyPay before any H1 API call.
      const result=await deliverPaidSandboxProfile(user.telegramId,data?.proof);
      return json(result);
    }
    return json({error:'Неизвестное действие'},400);
  }catch(e){
    const code=e instanceof SandboxError||e instanceof SandboxDeliveryError?e.code:'SANDBOX_UNAVAILABLE';
    console.warn('Vainah RollyPay sandbox diagnostic:',code); // No API keys or payment URLs.
    return json({error:explanations[code]||'Не получилось проверить тестовый платёж. Повтори позже.',
      diagnostic:code},503);
  }
}
