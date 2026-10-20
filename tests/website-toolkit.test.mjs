import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {planCatalog} from '../netlify/functions/lib/plan-catalog.mjs';
import {
  PUBLIC_PLAN_IDS,OS_NAMES,STEPS,parsePublicPlans,
  recommendPlan,filterLibrary,setupInstructions
} from '../site/toolkit-logic.mjs';

const site=name=>readFileSync(new URL('../site/'+name,import.meta.url),'utf8');

test('tariff helper reads the actual six-plan backend catalogue',()=>{
  const result=parsePublicPlans(planCatalog());
  assert.equal(result.length,6);
  assert.deepEqual(result.map(x=>x.id),PUBLIC_PLAN_IDS);
  assert.deepEqual(result.map(x=>x.priceKopeks),[9900,16000,21900,33900,70000,100000]);
  assert.deepEqual(result.map(x=>x.deviceLimit),[3,3,3,3,3,6]);
});

test('picks cheapest single plan covering requested days and device count',()=>{
  const plans=parsePublicPlans(planCatalog());
  assert.equal(recommendPlan(plans,30,3)?.id,'30');
  assert.equal(recommendPlan(plans,31,3)?.id,'60');
  assert.equal(recommendPlan(plans,90,3)?.id,'90');
  assert.equal(recommendPlan(plans,91,3)?.id,'180');
  assert.equal(recommendPlan(plans,180,3)?.id,'180');
  assert.equal(recommendPlan(plans,365,3)?.id,'365');
  assert.equal(recommendPlan(plans,30,6)?.id,'365-family');
  assert.equal(recommendPlan(plans,365,6)?.id,'365-family');
  for(const invalid of [0,29,366,NaN,90.5])assert.equal(recommendPlan(plans,invalid,3),null);
  assert.equal(recommendPlan(plans,90,7),null);
});

test('never recommends suspicious provider plan IDs or invalid prices',()=>{
  const source=planCatalog();
  const plans=parsePublicPlans([
    {id:'javascript:alert(1)',days:90,deviceLimit:3,priceRub:'1.00'},
    {id:'30',days:30,deviceLimit:3,priceRub:'-1.00'},
    ...source,
    {id:'30',days:30,deviceLimit:3,priceRub:'0.01'}
  ]);
  assert.equal(plans.length,6);
  assert.ok(plans.every(x=>PUBLIC_PLAN_IDS.includes(x.id)));
  assert.equal(recommendPlan(plans,30,3).priceKopeks,9900);
  assert.deepEqual(parsePublicPlans(null),[]);
});

test('setup wizard supports every platform and three sensible stages',()=>{
  assert.equal(STEPS.length,4);
  for(const id of Object.keys(OS_NAMES)){
    for(const stage of ['before','link','issue']){
      const result=setupInstructions(id,stage);
      assert.ok(result?.details?.length>=3);
      assert.ok(result.href.endsWith('.html'));
      assert.ok(existsSync(new URL('../site/'+result.href,import.meta.url)));
      assert.ok(result.details.every(x=>typeof x==='string'&&x.length>20));
    }
  }
  assert.equal(setupInstructions('unknown','link'),null);
  assert.equal(setupInstructions('ios','unknown'),null);
});

test('knowledge library search is case-insensitive and respects categories',()=>{
  const cards=[
    {title:'Подключение на iPad',description:'Устройства Apple',category:'devices'},
    {title:'Оплата на сайте',description:'Telegram Login',category:'plans'},
    {title:'Подключение Android',description:'Устройства Android',category:'devices'}
  ];
  assert.deepEqual(filterLibrary(cards,'devices','ipad').map(x=>x.title),['Подключение на iPad']);
  assert.equal(filterLibrary(cards,'devices','').length,2);
  assert.equal(filterLibrary(cards,'all','ТЕЛЕГРАМ').length,1);
  assert.equal(filterLibrary(cards,'plans','Android').length,0);
});

test('three new pages have required interactive controls and privacy notices',()=>{
  const advisor=site('assistant.html'),wizard=site('device-center.html'),library=site('library.html');
  for(const page of [advisor,wizard,library]){
    assert.match(page,/src="toolkit-ui\.mjs"/);
    assert.match(page,/href="toolkit\.css"/);
    assert.match(page,/<main\b/);
    assert.match(page,/<\/main>/);
    assert.match(page,/href="account\.html"/);
  }
  assert.match(advisor,/data-tariff-advisor/);
  assert.match(advisor,/data-wanted-days/);
  assert.match(advisor,/data-wanted-devices/);
  assert.match(advisor,/data-advisor-output[^>]*hidden/);
  assert.match(wizard,/data-setup-wizard/);
  assert.equal((wizard.match(/data-setup-check/g)||[]).length,4);
  assert.equal((wizard.match(/data-platform-choice="/g)||[]).length,4);
  assert.equal((wizard.match(/data-stage-choice="/g)||[]).length,3);
  assert.match(wizard,/только в текущей вкладке браузера/);
  assert.match(library,/data-knowledge-library/);
  assert.equal((library.match(/data-library-card/g)||[]).length,22);
  assert.match(library,/data-library-empty hidden/);
  assert.match(library,/поиск выполняется прямо в браузере/i);
});

test('all local .html links on the new pages exist',()=>{
  for(const file of ['assistant.html','device-center.html','library.html']){
    for(const [,href] of site(file).matchAll(/href="([^"]+\.html)(?:\?[^"]*)?"/g)){
      assert.ok(existsSync(new URL('../site/'+href,import.meta.url)),
        file+' links to missing '+href);
    }
  }
});

test('toolkit pages integrate into homepage and other user journeys',()=>{
  const homepage=site('index.html');
  for(const file of ['assistant.html','device-center.html','library.html'])
    assert.ok(homepage.includes('href="'+file+'"'));
  assert.ok(site('plans.html').includes('href="assistant.html"'));
  assert.ok(site('devices.html').includes('href="device-center.html"'));
  assert.ok(site('help.html').includes('href="library.html"'));
  assert.ok(site('account.html').includes('href="assistant.html"'));
});
