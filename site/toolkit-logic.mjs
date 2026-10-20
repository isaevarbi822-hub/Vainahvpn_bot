/* Shared pure client-side logic for Vainah VPN's website tools. */
export const PUBLIC_PLAN_IDS=Object.freeze(['30','60','90','180','365','365-family']);
const PLAN_IDS=new Set(PUBLIC_PLAN_IDS);
export const OS_NAMES=Object.freeze({
  ios:'iPhone / iPad',android:'Android',windows:'Windows',macos:'macOS'
});

/** Parse the public server catalogue without trusting unexpected fields. */
export function parsePublicPlans(raw){
  if(!Array.isArray(raw))return [];
  const seen=new Set();
  const safe=[];
  for(const p of raw){
    if(!p || !PLAN_IDS.has(p.id) || seen.has(p.id) ||
      !Number.isInteger(p.days) || p.days<30 || p.days>365 ||
      ![3,6].includes(p.deviceLimit) ||
      typeof p.priceRub!=='string' || !/^[1-9][0-9]{0,4}(?:\.[0-9]{1,2})?$/.test(p.priceRub))continue;
    const priceKopeks=Math.round(Number(p.priceRub)*100);
    if(!Number.isSafeInteger(priceKopeks)||priceKopeks<100)continue;
    seen.add(p.id);
    safe.push({id:p.id,days:p.days,deviceLimit:p.deviceLimit,priceKopeks,
      title:typeof p.title==='string'&&p.title.length<=70?p.title:p.days+' дней'});
  }
  return safe;
}

/** Cheapest SINGLE listed plan covering the required days and devices. */
export function recommendPlan(plans,requestedDays,requestedDevices){
  if(!Number.isInteger(requestedDays)||requestedDays<30||requestedDays>365||
     ![3,6].includes(requestedDevices))return null;
  return plans.filter(p=>p.days>=requestedDays&&p.deviceLimit>=requestedDevices)
    .sort((a,b)=>a.priceKopeks-b.priceKopeks||a.days-b.days)[0]||null;
}

function normalizeQuery(value){
  return String(value||'').trim().toLocaleLowerCase('ru')
    .replace(/телеграмм?/g,'telegram')
    .replace(/айпад/g,'ipad')
    .replace(/айфон/g,'iphone')
    .replace(/виндовс/g,'windows')
    .replace(/андроид/g,'android')
    .replace(/роллипей/g,'rollypay');
}
export function filterLibrary(items,category,query){
  const q=normalizeQuery(query);
  return items.filter(item=>(category==='all'||item.category===category) &&
    (!q || normalizeQuery(item.title+' '+item.description+' '+item.category).includes(q)));
}

export function setupInstructions(platform,stage){
  const name=OS_NAMES[platform];
  if(!name)return null;
  const help={
    before:{title:'Начни с подписки',details:[
      'Сравни тарифы и выбери нужный срок для своих устройств.',
      'После запуска оплаты войди через Telegram на сайте, чтобы привязать покупку.',
      'После подтверждённой оплаты и выдачи получи VPN-ссылку в личном кабинете.'
    ],label:'Выбрать тариф',href:'plans.html'},
    link:{title:'Подключение: '+name,details:[
      'Убедись, что ссылка получена в личном кабинете Vainah VPN и предназначена для тебя.',
      'Установи совместимый VPN-клиент по инструкции для своей операционной системы.',
      'Импортируй личную ссылку непосредственно в VPN-клиенте, не публикуя её.',
      'Активируй VPN в приложении и проверь работу соединения, когда панель доступна.'
    ],label:'Инструкция для устройств',href:'devices.html'},
    issue:{title:'Если соединение не работает',details:[
      'Проверь обычное интернет-соединение без VPN.',
      'Убедись, что профиль ещё активен в личном кабинете и панель H1Cloud доступна.',
      'Проверь настройки, формат ссылки и разрешения VPN-клиента на своём устройстве.',
      'Если проблема остаётся, открой диагностику и обратись в поддержку.'
    ],label:'Начать диагностику',href:'troubleshooting.html'}
  }[stage];
  return help||null;
}

export const STEPS=[
  {title:'Тариф выбран',description:'Я понимаю срок и количество устройств в тарифе.'},
  {title:'Доступ получен',description:'После подтверждённой оплаты VPN-ссылка появилась в моём кабинете.'},
  {title:'VPN-клиент готов',description:'Установлено совместимое приложение для моего устройства.'},
  {title:'Соединение проверено',description:'Конфигурация импортирована в VPN-клиент, подключение проверено.'}
];
