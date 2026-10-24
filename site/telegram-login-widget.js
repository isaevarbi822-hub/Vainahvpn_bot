/* Vainah VPN Telegram Login: OIDC instead of deprecated iframe widget. */
(function(){
  'use strict';
  function mount(options={}){
    const {container,status,retry}=options;
    if(!container||!status||!retry)return;
    let version=0;
    async function render(){
      const current=++version;
      container.replaceChildren();
      status.textContent='Проверяем Telegram Login…';
      retry.disabled=true;
      try{
        const res=await fetch('/api/auth/telegram-status',{cache:'no-store',credentials:'same-origin'});
        const data=await res.json();
        if(current!==version)return;
        if(!res.ok||data.oidcConfigured!==true){
          status.textContent='Новый Telegram Login требует Client ID и Client Secret из BotFather в настройках Render.';
          return;
        }
        const button=document.createElement('a');
        button.href='/auth/telegram/start';
        button.className='auth-primary';
        button.style.cssText='display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 22px;border-radius:13px;';
        button.textContent='✈ Войти через Telegram';
        container.append(button);
        const hint=new URLSearchParams(location.search).get('telegram_login');
        status.textContent=hint==='error'
          ?'Telegram не подтвердил вход. Проверь разрешённые URL в BotFather и повтори.'
          :'Вход через официальную страницу Telegram. Пароль на сайте не вводится.';
      }catch{
        if(current===version)status.textContent='Не удалось проверить доступность Telegram Login. Повтори попытку.';
      }finally{
        if(current===version){
          retry.disabled=false;
          retry.textContent='↻ Проверить Telegram снова';
        }
      }
    }
    retry.addEventListener('click',render);
    void render();
  }
  window.VainahTelegramWidget={mount};
})();
