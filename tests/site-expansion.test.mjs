import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {Script} from 'node:vm';
import {planCatalog} from '../netlify/functions/lib/plan-catalog.mjs';

const read=name=>readFileSync(new URL('../site/'+name,import.meta.url),'utf8');
const home=read('index.html');
const comparison=read('compare.html');
const status=read('status.html');
const plansPage=read('plans.html');
const checkout=read('checkout.html');
const experience=read('experience.js');

test('expanded public pages and browser interactions parse',()=>{
  assert.doesNotThrow(()=>new Script(experience,{filename:'experience.js'}));
  for(const page of [home,comparison,status]){
    assert.match(page,/<main\b/);
    assert.match(page,/<\/main>/);
    assert.match(page,/href="experience.css"/);
    assert.match(page,/src="experience.js" defer/);
  }
});

test('all six official plan prices and device counts match homepage and comparison',()=>{
  const canonical=planCatalog();
  assert.equal(canonical.length,6);
  const cards=[...comparison.matchAll(/<article class="ux-compare-item" data-plan-days="(\d+)" data-plan-kopeks="(\d+)" data-plan-devices="(\d+)">([\s\S]*?)<\/article>/g)];
  assert.equal(cards.length,6);
  const homeCards=[...home.matchAll(/<article class="ux-plan(?: ux-family)?">([\s\S]*?)<\/article>/g)];
  assert.equal(homeCards.length,6);
  for(const plan of canonical){
    const card=cards.find(x=>x[4].includes('checkout.html?plan='+plan.id+'"'));
    assert.ok(card,'Missing comparison plan '+plan.id);
    assert.equal(Number(card[1]),plan.days);
    assert.equal(Number(card[2]),plan.kopeks);
    assert.equal(Number(card[3]),plan.deviceLimit);
    const primary=homeCards.find(x=>x[1].includes('checkout.html?plan='+plan.id+'"'));
    assert.ok(primary,'Missing homepage plan '+plan.id);
    const price=new Intl.NumberFormat('ru-RU').format(plan.kopeks/100);
    assert.ok(primary[1].replace(/\u00a0/g,' ').includes(price.replace(/\u00a0/g,' ')),
      'Incorrect homepage price for '+plan.id);
  }
});

test('homepage is independent of bot purchases and explicitly blocks claims of live checkout',()=>{
  assert.match(home,/Онлайн-оплата пока отключена/);
  assert.match(home,/Telegram нужен для подтверждения аккаунта/);
  assert.match(checkout,/VPN-доступ прямо/);
  assert.match(checkout,/личном кабинете/);
  assert.doesNotMatch(checkout,/>Открыть @Vainahvpn_bot и нажать Start/);
  assert.doesNotMatch(plansPage,/VPN-ссылка после подтверждённой оплаты придёт через Telegram/);
});

test('status dashboard uses read-only checks and never invents uptime statistics',()=>{
  for(const endpoint of ['database-health','h1-panel-health','rollypay-health','rollypay-webhook-health']){
    assert.match(experience,new RegExp('endpoint:\\x27'+endpoint+'\\x27'));
  }
  assert.match(experience,/method:'GET'/);
  assert.match(experience,/cache:'no-store'/);
  assert.doesNotMatch(experience,/method:'POST'|method:'PUT'|method:'DELETE'/);
  assert.match(status,/не круглосуточный мониторинг/);
  assert.match(status,/не гарантия скорости/);
  assert.equal((status.match(/data-status-card="/g)||[]).length,4);
});

test('all homepage and comparison links to local html targets exist',()=>{
  for(const [file,page] of [['index.html',home],['compare.html',comparison],['status.html',status]]){
    for(const m of page.matchAll(/href="([^"]+\.html)(?:\?[^"]*)?"/g)){
      assert.ok(existsSync(new URL('../site/'+m[1],import.meta.url)),
        file+' links to missing '+m[1]);
    }
  }
});

test('filter controls and status card elements are present for their scripts',()=>{
  for(const name of ['data-compare','data-compare-grid','data-compare-count','data-compare-empty','data-devices-filter','data-duration-filter','data-sort-filter'])
    assert.ok(comparison.includes(name),name);
  for(const name of ['data-service-status','data-status-refresh','data-status-updated','data-status-detail','data-status-label'])
    assert.ok(status.includes(name),name);
});
