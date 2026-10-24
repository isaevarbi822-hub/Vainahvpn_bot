'use strict';
// Never forward raw Node/Electron errors: they may contain a bearer URL.
function subscriptionErrorMessage(error){
 const cause=String(error?.message||'');
 const code=String(error?.code||error?.cause?.code||'');
 if(cause==='Subscription HTTP response'){
  const status=error?.statusCode;
  if(status===401||status===403)return 'Доступ к подписке запрещён (HTTP '+status+'). Проверь срок и правильность ссылки.';
  if(status===404||status===410)return 'Подписка не найдена или больше не существует (HTTP '+status+').';
  if(status===429)return 'Сервер ограничил число запросов (HTTP 429). Попробуй позже.';
  if(Number.isInteger(status)&&status>=500&&status<=599)return 'Сервер подписки временно недоступен (HTTP 5xx).';
  if(Number.isInteger(status)&&status>=300&&status<=399)return 'Сервер перенаправляет подписку (HTTP 3xx). Автоматические переходы отключены для защиты ключа.';
  return 'Сервер отклонил запрос подписки по HTTPS.';
 }
 if(cause==='Subscription redirect refused')
  return 'Сервер подписки перенаправляет на другой адрес. Для защиты VPN-ключа такой переход заблокирован.';
 if(cause==='Invalid subscription URL'||cause==='HTTPS hostname required')
  return 'Нужна полная HTTPS-ссылка подписки H1Cloud с действующим доменом и портом.';
 if(cause==='Subscription target unavailable')
  return 'DNS подписки указывает на закрытый или недоступный адрес.';
 if(cause==='Subscription DNS lookup failed'||['ENOTFOUND','EAI_AGAIN','ESERVFAIL'].includes(code))
  return 'Ошибка DNS. Windows не смогла определить адрес сервера H1Cloud.';
 if(['ECONNREFUSED','ECONNRESET','EHOSTUNREACH','ENETUNREACH','EPIPE'].includes(code))
  return 'HTTPS-соединение с сервером разорвано или недоступно.';
 if(['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','UNABLE_TO_VERIFY_LEAF_SIGNATURE',
   'UNABLE_TO_GET_ISSUER_CERT_LOCALLY','DEPTH_ZERO_SELF_SIGNED_CERT',
   'SELF_SIGNED_CERT_IN_CHAIN','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))
  return 'Не удалось проверить TLS-сертификат сервера. Безопасность соединения не ослаблена.';
 if(['ERR_SSL_WRONG_VERSION_NUMBER','EPROTO','ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE'].includes(code))
  return 'Сервер отклонил TLS-соединение. Проверь HTTPS-адрес и порт H1Cloud.';
 if(cause==='Subscription timeout'||['ETIMEDOUT','ESOCKETTIMEDOUT'].includes(code))
  return 'Сервер подписки не ответил в течение 8 секунд.';
 if(cause==='Subscription server rejected request')
  return 'Сервер вернул HTTP-ошибку или перенаправление. Проверь действительность подписки.';
 if(cause==='Unsupported subscription'||cause==='Unsupported subscription format')
  return 'Получен неподдерживаемый формат подписки (возможен Clash YAML или HTML).';
 if(cause==='No supported VLESS REALITY TCP servers')
  return 'Подписка прочитана, но VLESS TCP REALITY серверов не найдено.';
 if(cause==='Subscription too large')return 'Подписка больше 256 КБ.';
 if(['ERR_TLS_HANDSHAKE_TIMEOUT','ERR_SOCKET_CONNECTION_TIMEOUT'].includes(code))
  return 'Тайм-аут при установлении защищённого HTTPS-соединения.';
 if(['ECONNABORTED','EADDRNOTAVAIL'].includes(code))
  return 'Windows не смогла установить HTTPS-соединение. Проверь сеть и VPN-прокси.';
 // Only fixed text: never include error.message, error.stack, hostname, URL or token.
 return 'Неизвестная ошибка HTTPS. Проверь доступность ссылки в браузере Windows.';
}
module.exports={subscriptionErrorMessage};
