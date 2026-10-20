/* Vainah VPN read-only control center and support diagnostics. */
import {parsePublicPlans} from './toolkit-logic.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const make=(tag,klass,text)=>{
  const element=document.createElement(tag);
  if(klass)element.className=klass;
  if(text!==undefined)element.textContent=String(text);
  return element;
};
const price=k=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(k/100)+' ₽';
const date=value=>{
  if(!value)return '—';
  const n=new Date(value);
  return Number.isFinite(n.getTime())?n.toLocaleDateString('ru-RU',{
    year:'numeric',month:'long',day:'numeric'
  }):'—';
};
const api='/'.concat('.netlify/functions/');
async function getJson(endpoint,timeoutMs=8500){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(api+endpoint,{method:'GET',cache:'no-store',
      credentials:'same-origin',headers:{Accept:'application/json'},signal:controller.signal});
    let data;
    try{data=await response.json()}catch{data={}}
    return {ok:response.ok&&data.ok!==false,status:response.status,data};
  }finally{clearTimeout(timer)}
}

const health=[
  {id:'database',endpoint:'database-health',name:'PostgreSQL',ready:'Схема и соединение доступны'},
  {id:'h1',endpoint:'h1-panel-health',name:'H1Cloud',ready:'VPN-панель отвечает серверу'},
  {id:'rollypay',endpoint:'rollypay-health',name:'RollyPay API',ready:'Ключ API принят (без списаний)'},
  {id:'webhook',endpoint:'rollypay-webhook-health',name:'Проверка webhook',ready:'Локальная проверка подписи пройдена'}
];
const reasons={
  connection_failed:'Нет соединения с панелью или таймаут',
  server_error:'Панель вернула ошибку сервера',
  rate_limited:'Панель ограничила частоту запросов',
  invalid_response:'Неожиданный ответ VPN-панели',
  api_error:'API панели не подтвердил запрос',
  unknown_error:'Причина пока неизвестна'
};
async function probe(check){
  try{
    const r=await getJson(check.endpoint);
    if(r.ok&&r.data.ok===true)return {state:'success',detail:check.ready};
    const extra=check.id==='h1'&&typeof r.data?.reason==='string'
      ?': '+(reasons[r.data.reason]||'дополнительные детали недоступны'):'';
    return {state:'warn',detail:'Проверка не пройдена'+extra};
  }catch{
    return {state:'neutral',detail:'Нет достоверного ответа — попробуй позже'};
  }
}
function updateBadge(badge,state,text){
  badge.dataset.level=state;
  badge.textContent=text;
}
async function loadPublicPlans(root){
  const grid=$('[data-hub-plans]',root);
  const message=$('[data-hub-plans-message]',root);
  try{
    const response=await getJson('subscription-plans');
    if(!response.ok)throw Error('CATALOG_UNAVAILABLE');
    const plans=parsePublicPlans(response.data.plans);
    if(plans.length!==6)throw Error('INCOMPLETE_CATALOG');
    grid.replaceChildren();
    for(const p of plans){
      const card=make('article','cx-plan');
      card.dataset.family=String(p.deviceLimit===6);
      const badge=make('span','cx-pill',p.deviceLimit===6?'СЕМЕЙНЫЙ':'СТАНДАРТНЫЙ');
      const title=make('h3','',p.title);
      const number=make('strong','',price(p.priceKopeks));
      const description=make('p','',p.days+' дней · до '+p.deviceLimit+' устройств · безлимитный трафик');
      const link=make('a','btn btn-border',
        response.data.checkoutReady===true?'Выбрать тариф ↗':'Посмотреть оформление ↗');
      link.href='checkout.html?plan='+encodeURIComponent(p.id);
      card.append(badge,title,number,description,link);grid.append(card);
    }
    message.textContent=response.data.checkoutReady===true?
      'Тарифы загружены с сервера. Выбор доступен после входа через Telegram.':
      'Цены загружены с сервера. Настоящая оплата пока отключена.';
  }catch{
    grid.replaceChildren(make('div','cx-empty',
      'Не удалось загрузить актуальные цены. Оформление недоступно, попробуй позже.'));
    message.textContent='Каталог недоступен. Не вводи платёжные данные.';
  }
}

async function loadPrivateSummary(root){
  const badge=$('[data-hub-login-badge]',root);
  const name=$('[data-hub-user-name]',root);
  const description=$('[data-hub-user-description]',root);
  const plan=$('[data-hub-plan]',root);
  const expires=$('[data-hub-expires]',root);
  const devices=$('[data-hub-devices]',root);
  const orders=$('[data-hub-orders]',root);
  const message=$('[data-hub-login-message]',root);
  let identity;
  try{identity=await getJson('telegram-account')}catch{
    updateBadge(badge,'neutral','Не удалось проверить вход');
    description.textContent='Сайт пока не может проверить авторизацию. Попробуй позже.';
    return;
  }
  if(!identity.ok||!identity.data?.user){
    updateBadge(badge,'neutral','Вход не выполнен');
    name.textContent='Привет! Твой кабинет ждёт тебя.';
    description.textContent='Войди через Telegram на сайте, чтобы увидеть свои покупки. Бот для этого открывать не нужно.';
    return;
  }
  const user=identity.data.user;
  updateBadge(badge,'success','Telegram подтверждён');
  name.textContent='С возвращением'+(user.firstName?', '+user.firstName:'')+'!';
  description.textContent='Покупки связаны с подтверждённым Telegram-аккаунтом. Здесь виден только безопасный обзор.';
  try{
    const result=await getJson('website-account-overview');
    if(!result.ok||!Array.isArray(result.data.orders))throw Error('ORDERS_UNAVAILABLE');
    const sub=result.data.subscription;
    plan.textContent=sub?(sub.deviceLimit===6?'Семейный тариф':sub.planDays+' дней'):'Нет выданных покупок';
    expires.textContent=sub?date(sub.expiresAt):'—';
    devices.textContent=sub?'До '+sub.deviceLimit:'—';
    orders.textContent=String(result.data.orders.length)+(result.data.historyLimited?'*':'');
    message.textContent=sub?
      (sub.active?'Срок учтён в базе. Работа VPN проверяется отдельно через H1Cloud.':
       'Срок в базе истёк. Проверь статус VPN-профиля в кабинете.') :
      'Покупок через сайт пока нет. История Telegram-бота может отличаться.';
  }catch{
    message.textContent='Не удалось получить покупки. В кабинете можно повторить проверку позже.';
  }
}

async function loadHubHealth(root){
  const button=$('[data-hub-refresh]',root);
  const timestamp=$('[data-hub-checked-at]',root);
  button.disabled=true;button.textContent='Проверяем…';
  timestamp.textContent='Отправлены разовые read-only проверки. Это не мониторинг VPN-трафика.';
  const results=await Promise.all(health.map(probe));
  health.forEach((check,index)=>{
    const card=$('[data-hub-check="'+check.id+'"]',root);
    if(!card)return;
    const result=results[index],badge=$('[data-check-badge]',card),detail=$('[data-check-detail]',card);
    updateBadge(badge,result.state,
      result.state==='success'?'Доступен':result.state==='warn'?'Есть проблема':'Нет данных');
    detail.textContent=result.detail;
  });
  timestamp.textContent='Последняя проверка: '+new Date().toLocaleTimeString('ru-RU',{
    hour:'2-digit',minute:'2-digit'})+'. Ответ API не гарантирует работу конкретного VPN.';
  button.disabled=false;button.textContent='↻ Проверить снова';
}

function mountHub(root){
  if(!root)return;
  void Promise.allSettled([loadPublicPlans(root),loadPrivateSummary(root)]);
  const button=$('[data-hub-refresh]',root);
  button.addEventListener('click',()=>void loadHubHealth(root));
  void loadHubHealth(root);
}

const problems={
  connection:{
    title:'VPN не подключается',
    steps:['Проверь, работает ли обычный интернет без VPN.',
      'Проверь срок подписки в личном кабинете. Дата в базе не подтверждает статус панели.',
      'Открой технический статус и проверь, отвечает ли H1Cloud.',
      'Убедись, что конфигурация импортирована в совместимый VPN-клиент.',
      'Если ошибка повторяется, обратись в поддержку с текстом сообщения об ошибке — без личной VPN-ссылки.'],
    href:'troubleshooting.html',label:'Полная диагностика →'},
  import:{
    title:'Не импортируется конфигурация',
    steps:['Проверь совместимость VPN-приложения с форматом выданной ссылки.',
      'Повтори получение личной ссылки в кабинете, когда H1Cloud работает.',
      'Открой импорт внутри самого VPN-клиента, а не через неизвестный сайт.',
      'Посмотри пошаговые инструкции для своей ОС.',
      'Не публикуй ссылку подписки в обращении или скриншоте.'],
    href:'device-center.html',label:'Мастер подключения →'},
  account:{
    title:'Не работает Telegram Login',
    steps:['Проверь, что ты на актуальном домене Vainah VPN.',
      'Убедись, что браузер поддерживает вход через Telegram и cookies сайта.',
      'Владелец сервиса должен настроить токен бота и домен Telegram Login.',
      'Если вход не подтвердился, повтори его позже без пересылки токена кому-либо.'],
    href:'account.html',label:'Открыть кабинет →'},
  payment:{
    title:'Проблема с оплатой',
    steps:['Пока реальные платежи на сайте отключены — не пытайся отправлять деньги через сторонние формы.',
      'Выбранный тариф и цену проверь на странице сравнения.',
      'Если у тебя уже есть подтверждённая покупка, ищи её в истории своего кабинета.',
      'При расхождении статуса и оплаты свяжись с поддержкой, не раскрывая платёжные реквизиты.'],
    href:'compare.html',label:'Сравнение тарифов →'},
  slow:{
    title:'Низкая скорость соединения',
    steps:['Сравни качество обычного интернет-соединения с VPN и без него.',
      'Проверь, нет ли временного сбоя H1Cloud по техническому статусу.',
      'Используй настройки, рекомендованные для твоего VPN-протокола.',
      'Проверь скорость в разное время и на другой своей разрешённой сети.',
      'Если проблема сохраняется, сообщи в поддержку устройство и общую ошибку без конфигурации.'],
    href:'speed.html',label:'Советы по скорости →'},
  panel:{
    title:'H1Cloud временно недоступен',
    steps:['Если панель возвращает ошибку, дождись восстановления на стороне провайдера.',
      'Не удаляй текущие VPN-профили и не заменяй токены наугад.',
      'История оплаченных заказов остаётся в базе данных, если Neon доступен.',
      'Выдача нового профиля и получение ссылки могут временно не работать.',
      'Открой страницу статуса для разовой повторной проверки.'],
    href:'status.html',label:'Статус сервисов →'}
};

function mountDiagnostics(root){
  if(!root)return;
  const title=$('[data-diag-title]',root),text=$('[data-diag-summary]',root);
  const list=$('[data-diag-list]',root),link=$('[data-diag-link]',root);
  const badge=$('[data-diag-check-badge]',root);
  const details=$('[data-diag-check-results]',root);
  const button=$('[data-diag-check]',root);
  const copy=$('[data-diag-copy]',root),copyStatus=$('[data-diag-copy-status]',root);
  let problem='connection';
  let lastResults=[];
  function render(){
    $$('[data-diag-problem]',root).forEach(choice=>{
      choice.setAttribute('aria-pressed',String(choice.dataset.diagProblem===problem));
    });
    const entry=problems[problem];
    title.textContent=entry.title;
    text.textContent='Пройди эти шаги по очереди. Ниже можно отдельно проверить связь с инфраструктурой.';
    list.replaceChildren();
    entry.steps.forEach((step,index)=>{
      const li=make('li');
      li.append(make('span','',String(index+1).padStart(2,'0')),make('div','',step));
      list.append(li);
    });
    link.href=entry.href;link.textContent=entry.label;
  }
  $$('[data-diag-problem]',root).forEach(choice=>choice.addEventListener('click',()=>{
    problem=choice.dataset.diagProblem;render();
  }));
  async function check(){
    button.disabled=true;button.textContent='Проверяем соединения…';
    updateBadge(badge,'neutral','Идёт проверка');
    const browserOnline=Boolean(navigator.onLine);
    const entries=await Promise.all(health.filter(h=>h.id!=='webhook').map(async check=>{
      const result=await probe(check);
      return {label:check.name,result};
    }));
    lastResults=[{label:'Подсказка браузера',result:{
      state:browserOnline?'success':'warn',
      detail:browserOnline?'Браузер считает сеть доступной (это не проверка VPN)':
        'Браузер считает устройство офлайн'
    }},...entries];
    details.replaceChildren();
    for(const {label,result} of lastResults){
      const row=make('div','cx-hero-art-row');
      const indicator=make('span','cx-state',result.state==='success'?'Ответ есть':
        result.state==='warn'?'Проблема':'Нет данных');
      indicator.dataset.level=result.state;
      const desc=make('div');desc.append(make('b','',label),make('small','',result.detail));
      row.append(indicator,desc);details.append(row);
    }
    updateBadge(badge,'success','Проверка завершена');
    button.disabled=false;button.textContent='↻ Проверить снова';
    copy.disabled=false;
  }
  button.addEventListener('click',()=>void check());
  copy.addEventListener('click',async()=>{
    const summary=['Vainah VPN — диагностика',
      'Проблема: '+problems[problem].title,
      ...lastResults.map(({label,result})=>label+': '+result.detail),
      'Без личных VPN-ссылок, токенов и платёжных реквизитов.'].join('\n');
    try{await navigator.clipboard.writeText(summary);
      copyStatus.textContent='Краткое описание скопировано. Проверь его перед отправкой.'}
    catch{copyStatus.textContent='Не получилось скопировать. Результаты видны выше.'}
  });
  render();
}

mountHub($('[data-control-hub]'));
mountDiagnostics($('[data-diagnostics-center]'));
