import {parsePublicPlans,recommendPlan,filterLibrary,setupInstructions,STEPS,OS_NAMES} from './toolkit-logic.mjs';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const fmtPrice=k=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(k/100)+' ₽';
const make=(tag,klass,value)=>{
  const element=document.createElement(tag);
  if(klass)element.className=klass;
  if(value!==undefined)element.textContent=String(value);
  return element;
};

function mountTariffAdvisor(root){
  if(!root)return;
  const days=$('[data-wanted-days]',root);
  const count=$('[data-wanted-days-label]',root);
  const devices=$('[data-wanted-devices]',root);
  const info=$('[data-advisor-info]',root);
  const output=$('[data-advisor-output]',root);
  const name=$('[data-advisor-name]',root);
  const price=$('[data-advisor-price]',root);
  const explanation=$('[data-advisor-explanation]',root);
  const link=$('[data-advisor-link]',root);
  const payment=$('[data-advisor-payment]',root);
  let plans=null,checkoutReady=false;
  function render(){
    const duration=Number(days.value),deviceCount=Number(devices.value);
    count.textContent=duration+' дней';
    if(!plans)return;
    const selected=recommendPlan(plans,duration,deviceCount);
    output.hidden=!selected;
    if(!selected){
      info.textContent='Сейчас нет тарифа, который покрывает выбранный срок и количество устройств. Попробуй другой вариант.';
      return;
    }
    info.textContent='Подбор основан на актуальном публичном каталоге сайта. Это рекомендация, а не созданный заказ.';
    name.textContent=selected.title;
    price.textContent=fmtPrice(selected.priceKopeks);
    explanation.textContent='Период '+selected.days+' дней · до '+selected.deviceLimit+
      ' устройств · цена за весь срок. Среди подходящих единичных тарифов выбран вариант с минимальной полной стоимостью.';
    payment.textContent=checkoutReady?'Платёжная форма доступна после Telegram-входа.':
      'Реальные платежи сейчас отключены: можно только посмотреть оформление.';
    link.href='checkout.html?plan='+encodeURIComponent(selected.id);
    link.textContent=checkoutReady?'Перейти к оформлению ↗':'Посмотреть выбранный тариф ↗';
  }
  days.addEventListener('input',render);
  devices.addEventListener('change',render);
  $$('[data-days-preset]',root).forEach(button=>button.addEventListener('click',()=>{
    days.value=button.dataset.daysPreset;render();
  }));
  info.textContent='Загружаем тарифы из API Vainah VPN…';
  fetch('/.netlify/functions/subscription-plans',{
    method:'GET',credentials:'omit',cache:'no-store',headers:{Accept:'application/json'}
  }).then(async response=>{
    if(!response.ok)throw Error('Нет ответа каталога');
    const result=await response.json();
    const read=parsePublicPlans(result.plans);
    if(read.length!==6)throw Error('Каталог тарифов пока не готов');
    plans=read;checkoutReady=result.checkoutReady===true;
    render();
  }).catch(()=>{
    output.hidden=true;
    info.replaceChildren();
    info.append(make('span','',
      'Не удалось загрузить актуальный каталог. Ничего не оплачивай, пока тарифы не будут доступны. '));
    const a=make('a','ux-link','Открыть все тарифы ↗');
    a.href='plans.html';info.append(a);
  });
}

function mountWizard(root){
  if(!root)return;
  let platform='ios',stage='before';
  const answer=$('[data-wizard-answer]',root);
  const title=$('[data-wizard-title]',root);
  const steps=$('[data-wizard-steps]',root);
  const link=$('[data-wizard-link]',root);
  const summary=$('[data-wizard-summary]',root);
  const complete=$('[data-setup-complete]',root);
  const progress=$('[data-setup-progress]',root);
  const reset=$('[data-setup-reset]',root);
  const checkboxes=$$('[data-setup-check]',root);
  const storageKey=()=> 'vainahvpn:setup:v1:'+platform;
  function readState(){
    try{
      const raw=sessionStorage.getItem(storageKey());
      const value=JSON.parse(raw||'[]');
      if(Array.isArray(value)&&value.length===STEPS.length)
        return value.map(x=>x===true);
    }catch{}
    return STEPS.map(()=>false);
  }
  function saveState(){
    try{sessionStorage.setItem(storageKey(),JSON.stringify(checkboxes.map(c=>c.checked)))}catch{}
  }
  function updateProgress(){
    const done=checkboxes.filter(c=>c.checked).length;
    complete.textContent=done+' из '+STEPS.length+' шагов отмечено';
    progress.style.width=done/STEPS.length*100+'%';
    progress.parentElement.setAttribute('aria-valuenow',String(done));
  }
  function render(){
    $$('[data-platform-choice]',root).forEach(b=>b.setAttribute('aria-pressed',
      String(b.dataset.platformChoice===platform)));
    $$('[data-stage-choice]',root).forEach(b=>b.setAttribute('aria-pressed',
      String(b.dataset.stageChoice===stage)));
    const instructions=setupInstructions(platform,stage);
    if(!instructions)return;
    title.textContent=instructions.title;
    summary.textContent='Устройство: '+OS_NAMES[platform]+'. Выбранный этап: '+
      ({before:'ещё нет доступа',link:'есть VPN-ссылка',issue:'есть проблема'}[stage]||'');
    steps.replaceChildren();
    instructions.details.forEach(value=>steps.append(make('li','',value)));
    link.textContent=instructions.label+' ↗';link.href=instructions.href;
    answer.dataset.platform=platform;
    const saved=readState();
    checkboxes.forEach((c,i)=>{c.checked=saved[i]});
    updateProgress();
  }
  $$('[data-platform-choice]',root).forEach(b=>b.addEventListener('click',()=>{
    platform=b.dataset.platformChoice;render();
  }));
  $$('[data-stage-choice]',root).forEach(b=>b.addEventListener('click',()=>{
    stage=b.dataset.stageChoice;render();
  }));
  checkboxes.forEach(c=>c.addEventListener('change',()=>{saveState();updateProgress()}));
  reset.addEventListener('click',()=>{
    checkboxes.forEach(c=>{c.checked=false});
    saveState();updateProgress();
  });
  render();
}

function mountLibrary(root){
  if(!root)return;
  const query=$('[data-library-search]',root);
  const category=$('[data-library-category]',root);
  const output=$('[data-library-count]',root);
  const noResults=$('[data-library-empty]',root);
  const cards=$$('[data-library-card]',root);
  const entries=cards.map(card=>({
    card,category:card.dataset.category,title:($('h2',card)?.textContent||''),
    description:($('p',card)?.textContent||'')
  }));
  function render(){
    const matched=new Set(filterLibrary(entries,category.value,query.value).map(e=>e.card));
    cards.forEach(c=>{c.hidden=!matched.has(c)});
    output.textContent='Найдено: '+matched.size+' из '+cards.length+' материалов';
    noResults.hidden=matched.size>0;
  }
  query.addEventListener('input',render);
  category.addEventListener('change',render);
  render();
}

mountTariffAdvisor($('[data-tariff-advisor]'));
mountWizard($('[data-setup-wizard]'));
mountLibrary($('[data-knowledge-library]'));
