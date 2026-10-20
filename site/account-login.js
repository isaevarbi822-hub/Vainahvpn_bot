/* Vainah sign-in menu: Telegram + Clerk + Yandex, with no fake credentials. */
(function(){
  'use strict';
  const root=document.getElementById('account-auth-panel');
  if(!root)return;
  const $=selector=>root.querySelector(selector);
  const tabs=[...root.querySelectorAll('[data-auth-tab]')];
  const panes=[...root.querySelectorAll('[data-auth-pane]')];
  const info=$('[data-auth-availability]');
  const tgStatus=$('#account-auth-status');
  const tgRetry=$('#account-telegram-retry');
  let methods={email:false,phone:false,yandex:false,telegram:false};
  function select(method){
    for(const tab of tabs){
      const active=tab.dataset.authTab===method;
      tab.setAttribute('aria-selected',String(active));
      tab.tabIndex=active?0:-1;
    }
    for(const pane of panes)pane.hidden=pane.dataset.authPane!==method;
    window.dispatchEvent(new CustomEvent('vainah:auth-panel',{detail:{method}}));
  }
  for(let i=0;i<tabs.length;i++){
    tabs[i].addEventListener('click',()=>select(tabs[i].dataset.authTab));
    tabs[i].addEventListener('keydown',event=>{
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();
      const next=(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
      tabs[next].focus();select(tabs[next].dataset.authTab);
    });
  }
  async function availability(){
    try{
      const response=await fetch('/.netlify/functions/alternate-login',{
        method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Endpoint not ready');
      const result=await response.json();
      methods=result.available||methods;
      info.textContent='Telegram'+(methods.yandex?' и Яндекс':'')+
        '. Почта и телефон — через Clerk после настройки Production. '+
        'Подписки Telegram доступны только в Telegram-аккаунте.';
      const link=$('#account-yandex-start');
      const disabled=$('#account-yandex-disabled');
      link.hidden=!methods.yandex;
      disabled.hidden=!!methods.yandex;
      if(!methods.telegram)
        tgStatus.textContent='Проверь TELEGRAM_BOT_TOKEN, SESSION_SIGNING_KEY, PUBLIC_SITE_ORIGIN и домен в BotFather.';
    }catch{
      info.textContent='Не получилось проверить конфигурацию входа. Обнови страницу позже.';
    }
  }
  if(window.VainahTelegramWidget){
    window.VainahTelegramWidget.mount({
      container:$('#account-widget'),status:tgStatus,retry:tgRetry,
      callback:'onVainahAccountAuth(user)'
    });
  }else{
    tgStatus.textContent='Модуль Telegram пока не загрузился.';
  }
  const hint=new URLSearchParams(location.search).get('alt_login');
  if(hint==='error')info.textContent='Яндекс не подтвердил вход. Попробуй снова.';
  if(hint==='success')info.textContent='Яндекс подтвердил вход. Проверяем сессию…';
  select('telegram');
  void availability();
})();