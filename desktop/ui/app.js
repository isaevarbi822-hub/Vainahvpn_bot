'use strict';
(function () {
  const navButtons=[...document.querySelectorAll('[data-view]')];
  const views=[...document.querySelectorAll('.view')];
  const title=document.getElementById('current-page');
  const content=document.getElementById('content');
  const pageNames={home:'Главная',guide:'С чего начать',plans:'Тарифы',account:'Мой кабинет',devices:'Устройства',help:'Поддержка'};
  let plans=[];
  let deviceFilter=0;
  let visibleServers=[];

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
    const months=plan.days===365?12:Math.max(1,Math.round(plan.days/30));
    tile.append(element('p','', '≈ '+Math.floor(plan.priceRub/months)+' ₽/мес · '+plan.days+' дней · '+plan.deviceLimit+' устройств · Безлимит'));
    tile.append(element('p','', '✓ VLESS REALITY · ✓ Обновление серверов'));
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
  const connectButton=document.getElementById('connect-button');
  connectButton.addEventListener('click',async()=>{
    if(!window.vainah?.getTunnelStatus)return;
    connectButton.disabled=true;
    const statusLabel=document.getElementById('connection-status');
    try {
      const current=await window.vainah.getTunnelStatus();
      if(['running-unverified','stop-failed'].includes(current?.state)){
        const stopped=await window.vainah.stopEngine();
        statusLabel.textContent=stopped?.ok
          ?'VPN-движок остановлен. Защита трафика не активна.'
          :'Не удалось остановить движок. Проверь процессы Windows.';
        connectButton.textContent=stopped?.ok?'⏻ Проверить подключение':'⏻ Повторить отключение';
        return;
      }
      if(current?.state!=='stopped'){
        statusLabel.textContent='Движок занят. Подожди завершения операции.';
        return;
      }
      const started=await window.vainah.startEngine();
      statusLabel.textContent=started?.ok
        ?'Движок запущен. Маршрутизация и защита VPN пока НЕ подтверждены.'
        :(started?.message||'Не удалось запустить VPN-движок.');
      connectButton.textContent=started?.ok?'⏻ Остановить движок':'⏻ Проверить подключение';
    } catch {
      statusLabel.textContent='Ошибка управления VPN-движком.';
    } finally {
      connectButton.disabled=false;
    }
  });
  async function refreshServers(){
    const list=document.getElementById('home-server-list');
    const result=await window.vainah?.getSubscriptionServers?.();
    if(!list||!result?.ok)return;
    visibleServers=result.servers;
    list.replaceChildren();
    if(!result.servers.length){list.append(element('p','', 'Подписка ещё не добавлена.'));return;}
    const query=document.getElementById('home-server-search')?.value.trim().toLocaleLowerCase('ru-RU')||'';
    const matches=result.servers.filter(server=>server.label.toLocaleLowerCase('ru-RU').includes(query));
    if(!matches.length){list.append(element('p','', 'По запросу локаций не найдено.'));return;}
    for(const server of matches){
      const button=element('button','button secondary server-choice'+(server.selected?' active':''),server.label);
      button.type='button';
      button.setAttribute('aria-pressed',String(server.selected));
      button.addEventListener('click',async()=>{
        const selected=await window.vainah.selectSubscriptionServer(server.index);
        if(selected?.ok)await refreshServers();
        else document.getElementById('connection-status').textContent=selected?.message||'Не удалось выбрать сервер';
      });
      list.append(button);
    }
  }
  document.getElementById('home-server-search')?.addEventListener('input',()=>{
    const list=document.getElementById('home-server-list');
    const query=document.getElementById('home-server-search').value.trim().toLocaleLowerCase('ru-RU');
    // Preserve the active selected server and never re-import secrets just
    // because the user typed a search query.
    for(const button of list.querySelectorAll('button.server-choice')){
      button.hidden = !button.textContent.toLocaleLowerCase('ru-RU').includes(query);
    }
    const resultCount=[...list.querySelectorAll('button.server-choice')].filter(b=>!b.hidden).length;
    let hint=document.getElementById('server-search-empty');
    if(!hint){
      hint=element('p','server-search-empty','Нет локаций по запросу');
      hint.id='server-search-empty';
      list.append(hint);
    }
    hint.hidden=resultCount!==0 || !visibleServers.length;
  });
  // Reflect unexpected native engine exits without claiming verified VPN protection.
  async function refreshEngineStatus(){
    if(connectButton.disabled||!window.vainah?.getTunnelStatus)return;
    const state=await window.vainah.getTunnelStatus().catch(()=>null);
    if(!state)return;
    const label=document.getElementById('connection-status');
    if(state.state==='running-unverified'){
      connectButton.textContent='⏻ Остановить движок';
    }else if(state.state==='stop-failed'){
      connectButton.textContent='⏻ Повторить отключение';
      label.textContent='Ошибка остановки VPN-движка.';
    }else if(state.state==='stopped'){
      if(connectButton.textContent==='⏻ Остановить движок')
        label.textContent=(state.reason||'VPN-движок неожиданно остановился.')+' Защита трафика не активна.';
      connectButton.textContent='⏻ Проверить подключение';
    }
  }
  setInterval(()=>{void refreshEngineStatus()},3000);
  const importButton=document.getElementById('import-vless');
  importButton.addEventListener('click',async()=>{
    const field=document.getElementById('vless-key');
    const status=document.getElementById('vless-import-status');
    if(!window.vainah?.importVlessLink)return;
    importButton.disabled=true;
    const link=field.value.trim();
    if(!/^https:\/\//i.test(link)&&!/^vless:\/\//i.test(link)){
      status.textContent='Вставь полную ссылку, начинающуюся с https:// или vless://';
      importButton.disabled=false;
      return;
    }
    status.textContent='Проверяем подписку…';
    try{
      const isHttps=/^https:\/\//i.test(link);
      const result=isHttps
        ? await window.vainah.importHttpsSubscription(link)
        : await window.vainah.importVlessLink(link);
      if(result?.ok)await refreshServers();
      status.textContent=result?.message||'Не удалось прочитать подписку.';
      if(result?.ok)field.value='';
    }catch{status.textContent='Не удалось импортировать ссылку. Проверь формат и доступность подписки.';}
    finally{importButton.disabled=false;}
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
    const billing=document.getElementById('desktop-checkout-status');
    if(billing){
      const reply=await window.vainah.getCheckoutReadiness().catch(()=>null);
      billing.textContent=!reply?.catalogMatches
        ?'Сервер оплаты недоступен или тарифы не совпадают. Покупки заблокированы.'
        :reply.ready
          ?'Сервер сообщил о готовности оплаты. Заказы оформляются только в проверенном кабинете, не в этом приложении.'
          :'Оплата на сервере пока отключена: ничего не списывается.';
    }
    void refreshServers();
    if(status){
      const label=document.getElementById('connection-status');
      const button=document.getElementById('connect-button');
      if(status.state==='running-unverified'){
        label.textContent='VPN-движок запущен, но защищённое соединение не подтверждено.';
        button.textContent='⏻ Остановить движок';
      }else if(status.state==='stop-failed'){
        label.textContent='Ошибка остановки VPN-движка. Повтори отключение.';
        button.textContent='⏻ Повторить отключение';
      }else if(status.state==='stopped'){
        label.textContent='VPN не подключён. Сначала добавь HTTPS-подписку в разделе «Устройства».';
        button.textContent='⏻ Проверить подключение';
      }else{
        label.textContent=status.explanation||'Нет подтверждения VPN-соединения.';
      }
    }
  }
  void init();
})();
