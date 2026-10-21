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
  function showNotice(title,description){
    document.getElementById('dialog-title').textContent=title;
    document.getElementById('dialog-description').textContent=description;
    dialog.showModal();
  }
  async function refreshEngine(){
    const status=await window.vainah?.getTunnelStatus?.().catch(()=>null);
    if(!status)return;
    const label=document.getElementById('connection-heading');
    label.textContent=status.state==='running'?'Туннель тестируется':'Не подключено';
    document.getElementById('connection-status').textContent=
      status.protected===true?'Состояние проверяется…':
      status.explanation||'VPN пока не подтверждён.';
  }
  async function refreshSavedSubscription(){
    const status=await window.vainah?.getSubscriptionStatus?.().catch(()=>null);
    const label=document.getElementById('saved-subscription-status');
    if(!status){label.textContent='Подписку можно сохранить только в установленном приложении.';return}
    label.textContent=!status.secureStorageAvailable?
      'Системное шифрование недоступно. Ссылка не будет сохранена.':
      status.saved?'✓ Подписка зашифрована и сохранена только на этом устройстве.':
      'Подписка не сохранена. Вставь HTTPS-ссылку H1Cloud.';
    document.getElementById('save-subscription').disabled=!status.secureStorageAvailable;
  }
  document.getElementById('save-subscription').addEventListener('click',async()=>{
    const field=document.getElementById('engine-link');
    const secret=field.value;
    field.value='';
    if(!window.vainah?.saveSubscription)return;
    const result=await window.vainah.saveSubscription(secret).catch(()=>({ok:false}));
    showNotice(result?.ok?'Подписка сохранена':'Не удалось сохранить подписку',
      result?.ok?'Ссылка зашифрована средствами операционной системы и не отображается после сохранения.':
      result?.code==='ENCRYPTION_UNAVAILABLE'?
      'Без системного шифрования приложение не сохраняет приватную ссылку.':
      'Проверь HTTPS-ссылку и доступность защищённого хранилища.');
    await refreshSavedSubscription();
  });
  document.getElementById('delete-subscription').addEventListener('click',async()=>{
    if(!window.vainah?.deleteSubscription)return;
    const result=await window.vainah.deleteSubscription().catch(()=>({ok:false}));
    document.getElementById('engine-link').value='';
    showNotice(result?.ok?'Подписка удалена':'Не удалось удалить подписку',
      result?.ok?'Локальная сохранённая ссылка удалена, а VPN-процесс останавливается.':
      'Проверь доступ к хранилищу приложения.');
    await refreshSavedSubscription();
    await refreshEngine();
  });
  document.getElementById('choose-core').addEventListener('click',async()=>{
    if(!window.vainah?.chooseLocalEngine)return;
    const result=await window.vainah.chooseLocalEngine().catch(()=>({ok:false}));
    if(result?.ok)showNotice('Движок выбран','Выбран файл sing-box. Это не подтверждает VPN-защиту.');
    else if(result?.code!=='CANCELLED')showNotice('Движок не выбран','Выбери официальный исполняемый файл sing-box 1.14.');
    await refreshEngine();
  });
  document.getElementById('connect-button').addEventListener('click',async()=>{
    if(!window.vainah?.startLocalEngine)return;
    const saved=await window.vainah?.getSubscriptionStatus?.().catch(()=>null);
    if(!saved?.saved){
      showNotice('Подписка не сохранена','Сначала вставь HTTPS-ссылку H1Cloud в поле выше и нажми «Сохранить подписку».');
      return;
    }
    const button=document.getElementById('connect-button');
    button.disabled=true;
    try{
      const result=await window.vainah.startLocalEngine().catch(()=>({ok:false}));
      showNotice(result?.ok?'VPN-процесс запущен':'Проверка не удалась',
        result?.ok?
          'Проверяемая конфигурация передана sing-box, но защита DNS и маршрутов не подтверждена. Не считай VPN подключённым до испытаний.':
          'Проверь движок, подписку и разрешения системы. Временные конфигурации очищаются.');
      await refreshEngine();
    }finally{button.disabled=false}
  });
  document.getElementById('stop-engine').addEventListener('click',async()=>{
    await window.vainah?.stopLocalEngine?.().catch(()=>null);
    await refreshEngine();
  });
  document.getElementById('test-network').addEventListener('click',async()=>{
    const button=document.getElementById('test-network');
    const status=document.getElementById('network-test-result');
    if(!window.vainah?.testNetworkFamilies)return;
    button.disabled=true;
    status.textContent='Проверяем HTTPS-доступность IPv4 и IPv6…';
    try{
      const result=await window.vainah.testNetworkFamilies().catch(()=>null);
      if(!result?.attempted){
        status.textContent='Сначала запусти тестовый VPN-процесс.';
        return;
      }
      status.textContent='HTTPS IPv4: '+(result.ipv4?'доступен':'не подтверждён')+
        ' · HTTPS IPv6: '+(result.ipv6?'доступен':'не подтверждён')+
        '. Это НЕ доказывает работу VPN, отсутствие DNS-утечек или маршрут через H1Cloud.';
    }finally{button.disabled=false}
  });
  window.setInterval(()=>{void refreshEngine()},3000);
  document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
  document.getElementById('dialog-ok').addEventListener('click',()=>dialog.close());
  document.getElementById('dialog-guide').addEventListener('click',()=>{dialog.close();showPage('guide')});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});

  async function init(){
    await refreshSavedSubscription();
    if(!window.vainah){
      document.getElementById('platform-chip').textContent='Предпросмотр';
      return;
    }
    const [info,catalog,status,capabilities]=await Promise.all([
      window.vainah.getInfo().catch(()=>null),
      window.vainah.getPlans().catch(()=>[]),
      window.vainah.getTunnelStatus().catch(()=>null),
      window.vainah.getH1Capabilities().catch(()=>null)
    ]);
    const capabilityText=document.getElementById('reality-capabilities');
    if(capabilityText && capabilities?.protocol==='VLESS + Reality' && capabilities.vpnEngineReady===false){
      capabilityText.textContent='H1Cloud: VLESS + Reality ('+
        capabilities.configurationTransports.filter(x=>['tcp','grpc','xhttp'].includes(x)).join(', ')+
        '). Сетевой движок ещё не встроен.';
    }
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
      // Never show a protected badge from process liveness alone.
      if(status.protected!==false)
        document.getElementById('connection-status').textContent='Защищённое соединение пока не подтверждено.';
    }
  }
  void init();
})();
