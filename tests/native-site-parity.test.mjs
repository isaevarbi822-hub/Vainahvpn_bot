import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {planCatalog,checkoutReady} from '../netlify/functions/lib/plan-catalog.mjs';

const file = path => new URL('../'+path,import.meta.url);
const read = path => readFileSync(file(path),'utf8');
const root = read('site/index.html');
const androidDesign = read('native/android/app/src/main/java/app/vainah/vpn/VainahDesign.kt');
const iosDesign = read('native/ios/Sources/App/VainahDesign.swift');
const androidApp = read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
const iosApp = read('native/ios/Sources/App/ContentView.swift');

test('native design reuses website brand palette on both platforms',()=>{
  for(const color of [
    '#080b15','#121626','#181b2f','#292d43',
    '#a0a6bd','#f5f6ff','#a98bff','#79cde9','#70e5b1'
  ]){
    assert.ok(root.includes(color),'website color missing: '+color);
    assert.ok(androidDesign.includes(color),'Android missing website color: '+color);
    assert.ok(iosDesign.includes(color),'iOS missing website color: '+color);
  }
  assert.match(androidApp,/VainahMark/);
  assert.match(iosApp,/struct VainahMark/);
  assert.ok(existsSync(file('native/android/app/src/main/res/drawable/ic_vainah.xml')));
});

test('native tariff prices and device limits equal server canonical catalog',()=>{
  const source = planCatalog();
  assert.equal(source.length,6);
  const androidMatches=[...androidDesign.matchAll(/VainahPlan\("([^"]+)",\s*(\d+),\s*"[^"]+",\s*(\d+),\s*(\d+),/g)]
    .map(m=>({id:m[1],days:Number(m[2]),rub:Number(m[3]),devices:Number(m[4])}));
  const iosMatches=[...iosDesign.matchAll(/\.init\(id:\s*"([^"]+)",\s*days:\s*(\d+),\s*title:\s*"[^"]+",\s*priceRub:\s*(\d+),\s*deviceLimit:\s*(\d+),/g)]
    .map(m=>({id:m[1],days:Number(m[2]),rub:Number(m[3]),devices:Number(m[4])}));
  const canonical=source.map(p=>({id:p.id,days:p.days,rub:p.kopeks/100,devices:p.deviceLimit}));
  assert.deepEqual(androidMatches,canonical);
  assert.deepEqual(iosMatches,canonical);
  assert.equal(checkoutReady(),false);
});

test('native screens mirror major website sections with four usable native tabs',()=>{
  for(const code of [androidApp,iosApp]){
    for(const label of ['Интернет под твоим','контролем.','ТАРИФЫ VAINAH',
      'ЛИЧНЫЙ КАБИНЕТ','ЦЕНТР ПОДДЕРЖКИ','ВАШЕ СОЕДИНЕНИЕ',
      'Всё важное.','В одном месте.'])
      assert.ok(code.includes(label),'missing website copy: '+label);
    assert.ok(code.includes('https://vainahvpnbot0.netlify.app/'));
    assert.ok(code.includes('Не подключено') || code.includes('tunnel.state.rawValue'));
    assert.ok(code.includes('Подключиться'));
    assert.doesNotMatch(code,/\\bWebView\\s*\\(/);
    assert.ok(!code.includes('https://api.telegram.org/bot'));
  }
  for(const title of ['Главная','Тарифы','Кабинет','Помощь'])
    assert.ok(androidApp.includes('"'+title+'"'));
  assert.equal((iosApp.match(/\.tabItem/g)||[]).length,4);
  assert.match(androidApp,/deviceFilter/);
  assert.match(iosApp,/\.pickerStyle\(\.segmented\)/);
});

test('account screen does not invent remote entitlements, payments or a working VPN',()=>{
  assert.match(androidApp,/Ссылка хранится на устройстве/);
  assert.match(iosApp,/Ссылка хранится на устройстве/);
  assert.match(androidApp,/EngineRegistry\.active\.ready/);
  assert.match(iosApp,/tunnel\.connect\(\)/);
  assert.match(read('native/ios/Sources/App/TunnelController.swift'),/static let available = false/);
  assert.match(read('native/android/app/src/main/java/app/vainah/vpn/TunnelEngine.kt'),/override val ready = false/);
  assert.doesNotMatch(androidApp,/payment|billing|startCheckout|clerk-secret/);
  assert.doesNotMatch(iosApp,/purchase\(|RollyPay|PANEL_API_TOKEN/);
});

test('all native support links resolve to existing public website pages',()=>{
  const pages=[
    'account.html','plans.html','compare.html','hub.html','diagnostics.html',
    'status.html','device-center.html','help.html','security.html'
  ];
  for(const name of pages){
    assert.ok(existsSync(file('site/'+name)),'missing page '+name);
  }
  assert.match(androidApp,/https:\/\/vainahvpnbot0\.netlify\.app\//);
  assert.match(iosApp,/https:\/\/vainahvpnbot0\.netlify\.app\//);
});
