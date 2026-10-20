/* Reliable legacy Telegram Login Widget host. It does NOT authenticate by itself;
   only the Telegram callback + server-side HMAC verifier can establish a session. */
(function(){
  'use strict';
  const WIDGET_URL='https://telegram.org/js/telegram-widget.js?22';
  const BOT_NAME='Vainahvpn_bot';
  const WAIT_MS=10000;
  function setup(options){
    const box=options?.container, status=options?.status;
    const retry=options?.retry,diagnose=options?.diagnose,details=options?.details;
    if(!box||!status||!retry||!options?.callback)return null;
    let attempt=0,timeoutId=null,configured=false;
    const setMessage=value=>{if(!options.isAuthenticated?.())status.textContent=value};
    const hasFrame=()=>!!box.querySelector('iframe');
    const clear=()=>{
      if(timeoutId!==null){clearTimeout(timeoutId);timeoutId=null}
      box.replaceChildren();
    };
    function load(){
      attempt++;
      const current=attempt;
      clear();
      configured=false;
      retry.disabled=true;retry.textContent='Загружаем кнопку…';
      setMessage('Подключаем официальный виджет Telegram…');
      const script=document.createElement('script');
      script.src=WIDGET_URL;script.async=true;
      script.setAttribute('data-telegram-login',BOT_NAME);
      script.setAttribute('data-size','large');
      script.setAttribute('data-radius','12');
      script.setAttribute('data-onauth',options.callback);
      script.onerror=()=>{
        if(current!==attempt)return;
        retry.disabled=false;retry.textContent='↻ Повторить загрузку Telegram';
        setMessage('Не удалось загрузить виджет Telegram. Проверь подключение и настройки браузера; кнопка повторной попытки доступна ниже.');
      };
      script.onload=()=>{
        if(current!==attempt)return;
        retry.disabled=false;retry.textContent='↻ Обновить кнопку Telegram';
        // The external script may load before its iframe appears.
        if(hasFrame()){configured=true;setMessage('Кнопка Telegram загружена. Нажми её для входа.')}
      };
      box.appendChild(script);
      timeoutId=setTimeout(()=>{
        if(current!==attempt)return;
        retry.disabled=false;retry.textContent='↻ Повторить загрузку Telegram';
        if(hasFrame()){configured=true;setMessage('Кнопка Telegram загружена. Нажми её для входа.')}
        else setMessage('Виджет Telegram не появился. Проверь разрешённый домен в BotFather, настройки Login Widget и доступность telegram.org. Ни токен, ни пароль вводить сюда не нужно.');
      },WAIT_MS);
    }
    retry.addEventListener('click',load);
    if(diagnose&&details){
      diagnose.addEventListener('click',async()=>{
        diagnose.disabled=true;
        details.hidden=false;details.textContent='Проверяем настройки сайта…';
        try{
          const response=await fetch('/.netlify/functions/telegram-login-health',{
            method:'GET',cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}
          });
          const data=await response.json();
          if(!response.ok)throw Error('HTTP '+response.status);
          const lines=[
            'Токен бота: '+(data.botTokenConfigured?'настроен':'не найден или неверный формат'),
            'Ключ сессии: '+(data.sessionSigningConfigured?'настроен':'не настроен (нужно минимум 32 символа)'),
            'Адрес Netlify: '+(data.siteOriginMatches?'совпадает с PUBLIC_SITE_ORIGIN':'не совпадает с PUBLIC_SITE_ORIGIN'),
            'Домен в BotFather: не может быть проверен автоматически'
          ];
          if(data.ok&&!hasFrame())lines.push('Настройки Netlify выглядят готовыми. Если кнопки нет, проверь Allowed URLs в BotFather и загрузку виджета.');
          details.textContent=lines.join('\n');
        }catch{
          details.textContent='Серверная проверка недоступна. Проверь Deploy и три переменные: TELEGRAM_BOT_TOKEN, SESSION_SIGNING_KEY, PUBLIC_SITE_ORIGIN.';
        }finally{diagnose.disabled=false}
      });
    }
    load();
    return {retry:load,get ready(){return configured},stop:()=>{attempt++;clear()}};
  }
  window.VainahTelegramLogin={mount:setup};
})();
