'use strict';
// Never forward raw Node/Electron errors: they may contain a bearer URL.
function subscriptionErrorMessage(error){
 const cause=String(error?.message||'');
 const code=String(error?.code||error?.cause?.code||'');
 if(cause==='Invalid subscription URL'||cause==='HTTPS hostname required')
  return 'Неверная HTTPS-ссылка подписки или порт сервера.';
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
