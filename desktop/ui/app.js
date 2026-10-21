'use strict';
(function () {
  const navButtons=[...document.querySelectorAll('[data-view]')];
  const views=[...document.querySelectorAll('.view')];
  const title=document.getElementById('current-page');
  const content=document.getElementById('content');
  const pageNames={home:'Главная',guide:'С чего начать',plans:'Тарифы',account:'Мой кабинет',devices:'Устройства',help:'Поддержка'};
  let plans=[];
  let deviceFilter=0;

  function showPage(name) {
    if(!Object.hasOwn(pageNames,name)) return;
    for(const section of views){
      const visible=section.id==='view-'+name;
      section.hidden=!visible;
      section.classList.toggle('visible',visible);
    }
    for(const button of document.querySelectorAll('.nav-link')){
      const selected=button.dataset.view===name;
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    title.textContent=pageNames[name];
    content.scrollTop=0;
    content.focus({preventScroll:true});
  }

  function element(tag,klass,value){
    const e=document.createElement(tag);
    if(klass)e.className=klass;
    if(value!==undefined)e.textContent=String(value);
    return e;
  }
  function planTile(plan){
    const family=plan.deviceLimit===6;
    const tile=element('article','plan-card'+(family?' family':''));
    tile.append(element('span','plan-badge',family?'СЕМЕЙНЫЙ':'ПОДПИСКА НА '+plan.days+' ДНЕЙ'));
    tile.append(element('h2','',plan.title));
    tile.append(element('div','plan-price',new Intl.NumberFormat('ru-RU').format(plan.priceRub)+' ₽'));
    tile.append(element('p','',plan.days+' дней · '+plan.deviceLimit+' устройств · Безлимитный трафик'));
    const button=element('button','button primary','Подробнее на сайте ↗');
    button.addEventListener('click',()=>openOfficial('plans'));
    tile.append(button);
    return tile;
  }
  function renderPlans(){
    const shown=plans.filter(p=>deviceFilter===0||p.deviceLimit===deviceFilter);
    const root=document.getElementById('plans-grid');
    root.replaceChildren(...shown.map(planTile));
    document.getElementById('plan-count').textContent=shown.length+' тарифов';
    for(const button of document.querySelectorAll('[data-devices]')){
      const active=Number(button.dataset.devices)===deviceFilter;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    }
  }
  async function openOfficial(name) {
    if(!window.vainah?.openOfficialPage)return;
    const result=await window.vainah.openOfficialPage(name).catch(()=>({ok:false}));
    if(!result?.ok){
      const dialog=document.getElementById('connection-dialog');
      document.getElementById('dialog-title').textContent='Не удалось открыть страницу';
      document.getElementById('dialog-description').textContent='Попробуй открыть сайт vainahvpnbot0.netlify.app вручную в своём браузере.';
      dialog.showModal();
    }
  }
  document.addEventListener('click',event=>{
    const viewButton=event.target.closest('button[data-view]');
    if(viewButton){showPage(viewButton.dataset.view);return}
    const link=event.target.closest('button[data-link]');
    if(link){void openOfficial(link.dataset.link);return}
    const filter=event.target.closest('button[data-devices]');
    if(filter){deviceFilter=Number(filter.dataset.devices);renderPlans()}
  });
  const dialog=document.getElementById('connection-dialog');
  document.getElementById('connect-button').addEventListener('click',()=>{
    document.getElementById('dialog-title').textContent='VPN пока не подключается';
    document.getElementById('dialog-description').textContent=
      'Это демонстрация Vainah VPN. Движок H1Cloud/VLESS ещё не встроен, поэтому программа не шифрует трафик и не меняет системные VPN-настройки.';
    dialog.showModal();
  });
  const inspectButton=document.getElementById('inspect-xray');
  inspectButton.addEventListener('click',async()=>{
    if(!window.vainah?.inspectXrayFile)return;
    inspectButton.disabled=true;
    const status=document.getElementById('xray-inspection-status');
    status.textContent='Проверяем выбранный файл локально…';
    try {
      const result=await window.vainah.inspectXrayFile();
      if(result?.cancelled)status.textContent='Выбор отменён.';
      else if(!result?.ok)status.textContent=result?.message||'Не удалось прочитать конфигурацию.';
      else {
        const profiles=Array.isArray(result.profiles)?result.profiles:[];
        status.textContent=profiles.length
          ?'Найдено профилей VLESS + REALITY: '+profiles.length+
           '. Транспорты: '+[...new Set(profiles.map(x=>x.transport))].join(', ')+
           '. Это проверка структуры, VPN ещё не подключён.'
          :'Подходящих профилей VLESS + REALITY не найдено.';
        if(result.engineCheck?.ok)status.textContent+=' Проверка синтаксиса sing-box прошла.';
        else status.textContent+=' Проверка движком sing-box не пройдена: '+(result.engineCheck?.reason||'движок недоступен')+'.';
      }
    } catch {status.textContent='Не удалось проверить файл.'}
    finally {inspectButton.disabled=false}
  });
  document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
  document.getElementById('dialog-ok').addEventListener('click',()=>dialog.close());
  document.getElementById('dialog-guide').addEventListener('click',()=>{dialog.close();showPage('guide')});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});

  async function init(){
    if(!window.vainah){
      document.getElementById('platform-chip').textContent='Предпросмотр';
      return;
    }
    const [info,catalog,status]=await Promise.all([
      window.vainah.getInfo().catch(()=>null),
      window.vainah.getPlans().catch(()=>[]),
      window.vainah.getTunnelStatus().catch(()=>null)
    ]);
    if(info){
      document.getElementById('platform-chip').textContent=
        info.platform==='win32'?'Windows':info.platform==='darwin'?'macOS':'Компьютер';
      document.getElementById('detected-platform').textContent=
        info.platform==='win32'?'Компьютер с Windows':info.platform==='darwin'?'Компьютер с macOS':'Твой компьютер';
      document.getElementById('app-version').textContent=info.version;
    }
    if(Array.isArray(catalog)){
      plans=catalog.filter(p=>p&&typeof p.title==='string'&&Number.isInteger(p.priceRub)&&
        Number.isInteger(p.days)&&[3,6].includes(p.deviceLimit));
      renderPlans();
    }
    if(status){
      document.getElementById('connection-status').textContent=status.explanation;
      // A future 'connected' visual must only be shown after verified real engine state.
      if(status.protected!==false||status.state!=='unavailable')
        document.getElementById('connection-status').textContent='Нет подтверждения защищённого VPN-подключения.';
    }
  }
  void init();
})();
