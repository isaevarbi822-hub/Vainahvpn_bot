/* Vanilla ClerkJS using Clerk's documented CDN flow. No Vite or second app. */
(function(){
  'use strict';
  const root=document.getElementById('account-auth-panel');
  if(!root)return;
  const panes={
    email:root.querySelector('#account-clerk-email'),
    phone:root.querySelector('#account-clerk-phone')
  };
  const status={
    email:root.querySelector('[data-auth-message="email"]'),
    phone:root.querySelector('[data-auth-message="phone"]')
  };
  let clerk=null,current=null,signedIn=null,userButtonZone=null,busy=false,initialized=false;
  const write=(type,value)=>{if(status[type])status[type].textContent=value};
  function domainFromKey(key){
    if(!/^pk_live_[A-Za-z0-9_-]{25,}$/.test(key))throw Error('Неверный публичный ключ');
    const encoded=key.slice('pk_live_'.length).replace(/-/g,'+').replace(/_/g,'/');
    const domain=atob(encoded).replace(/\$/,'');
    if(!/^[a-z0-9][a-z0-9.-]{2,230}[a-z0-9]$/i.test(domain)||
       domain.includes('..')||domain.includes('localhost'))
      throw Error('Некорректный адрес Clerk');
    return domain;
  }
  function script(url,publishableKey){
    return new Promise((resolve,reject)=>{
      const element=document.createElement('script');
      const timer=setTimeout(()=>{element.remove();reject(Error('Таймаут загрузки Clerk'))},15000);
      element.async=true;
      element.crossOrigin='anonymous';
      element.src=url;
      if(publishableKey)element.setAttribute('data-clerk-publishable-key',publishableKey);
      element.onload=()=>{clearTimeout(timer);resolve()};
      element.onerror=()=>{clearTimeout(timer);reject(Error('Clerk недоступен'))};
      document.head.append(element);
    });
  }
  function resetMount(){
    if(!clerk||!current)return;
    try{
      if(signedIn&&userButtonZone)clerk.unmountUserButton(userButtonZone);
      else clerk.unmountSignIn(panes[current]);
    }catch{}
    panes[current].replaceChildren();
    userButtonZone=null;current=null;
  }
  function activate(method){
    if(!['email','phone'].includes(method))return;
    if(!initialized){
      write(method,'Подключаем Clerk. Если он ещё не настроен, вход станет доступен после установки ключей Production.');
      return;
    }
    if(!clerk){
      write(method,'Clerk пока не подключён в Netlify. Настрой ключи Production.');
      return;
    }
    if(current===method)return;
    resetMount();
    current=method;
    const isSignedIn=Boolean(clerk.isSignedIn&&clerk.session);
    signedIn=isSignedIn;
    const pane=panes[method];
    if(isSignedIn){
      const userZone=document.createElement('div');
      const button=document.createElement('button');
      button.type='button';
      button.className='auth-primary';
      button.textContent='Подтвердить вход в Vainah VPN';
      button.addEventListener('click',()=>void continueToSite(method,button));
      pane.append(userZone,button);
      userButtonZone=userZone;
      clerk.mountUserButton(userZone);
      write(method,'Clerk подтвердил сессию. Нажми кнопку для безопасного входа на сайт.');
    }else{
      clerk.mountSignIn(pane,{fallbackRedirectUrl:window.location.origin+'/account.html',withSignUp:true,signUpFallbackRedirectUrl:window.location.origin+'/account.html'});
      write(method,'Используй официальную форму Clerk. Если вход по телефону не предлагается, включи SMS в настройках Clerk.');
    }
  }
  async function continueToSite(method,button){
    if(busy||!clerk?.session)return;
    busy=true;button.disabled=true;write(method,'Проверяем сессию на сервере Vainah VPN…');
    try{
      const token=await clerk.session.getToken();
      if(typeof token!=='string'||!token)throw Error('Нет подтверждённой сессии Clerk');
      const response=await fetch('/.netlify/functions/clerk-session',{
        method:'POST',credentials:'same-origin',
        headers:{Authorization:'Bearer '+token,Accept:'application/json'}
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.authenticated)
        throw Error('Сервер не принял подтверждение Clerk. Проверь Production-ключи и адрес сайта.');
      if(typeof window.onVainahAltLogin==='function')await window.onVainahAltLogin();
      else window.location.assign('account.html');
    }catch(error){write(method,error.message||'Ошибка подтверждения');}
    finally{busy=false;button.disabled=false;}
  }
  async function load(){
    try{
      const response=await fetch('/.netlify/functions/clerk-auth-config',{
        method:'GET',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}
      });
      if(!response.ok)throw Error('Нет ответа Netlify');
      const data=await response.json();
      if(!data.enabled||!data.publishableKey)throw Error('Clerk Production ещё не подключён');
      const domain=domainFromKey(data.publishableKey);
      await script('https://'+domain+'/npm/@clerk/ui@1/dist/ui.browser.js');
      await script('https://'+domain+'/npm/@clerk/clerk-js@6/dist/clerk.browser.js',
        data.publishableKey);
      if(!window.Clerk||!window.__internal_ClerkUICtor)
        throw Error('Clerk загрузился не полностью');
      clerk=window.Clerk;
      await clerk.load({ui:{ClerkUI:window.__internal_ClerkUICtor}});
      clerk.addListener(({session})=>{
        const next=Boolean(session&&clerk.isSignedIn);
        if(current&&signedIn!==next){
          const method=current;resetMount();activate(method);
        }
      });
      initialized=true;
      const active=root.querySelector('[data-auth-tab][aria-selected="true"]');
      if(['phone','email'].includes(active?.dataset.authTab))activate(active.dataset.authTab);
      write('email','Clerk готов. Вход через email подтверждается у Clerk.');
      write('phone','Clerk готов. SMS появится в форме, если включён в настройках и на тарифе.');
    }catch(error){
      initialized=true;
      for(const method of ['phone','email'])
        write(method,(error.message||'Clerk временно недоступен')+'. Telegram и Яндекс остаются доступными.');
    }
  }
  // Signing out of the Vainah bridge should also close the Clerk session.
  window.VainahClerkSignOut=async()=>{
    if(clerk?.isSignedIn&&typeof clerk.signOut==='function')await clerk.signOut();
  };
  window.addEventListener('vainah:auth-panel',event=>{
    const method=event.detail?.method;
    if(['phone','email'].includes(method))activate(method);
    else resetMount();
  });
  void load();
})();
