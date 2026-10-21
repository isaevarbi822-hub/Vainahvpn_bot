'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const load=file=>fs.readFileSync(path.join(root,file),'utf8');
const {safePage,pages}=require('../shared/official.cjs');
const {plans}=require('../shared/catalog.cjs');

test('All outbound pages are explicitly whitelisted to the original public site',()=>{
  assert.ok(Object.keys(pages).length>=8);
  for(const [name,url] of Object.entries(pages)){
    assert.equal(safePage(name),url);
    assert.ok(url.startsWith('https://vainahvpnbot0.netlify.app/'));
  }
  for(const input of ['https://attacker.example','javascript:alert(1)','file:///etc/passwd','../about',{},null,'__proto__','constructor'])
    assert.equal(safePage(input),null);
});

test('Electron renderer has sandbox, local-only files and no arbitrary IPC',()=>{
  const main=load('src/main.cjs');
  const preload=load('src/preload.cjs');
  assert.match(main,/nodeIntegration:\s*false/);
  assert.match(main,/contextIsolation:\s*true/);
  assert.match(main,/sandbox:\s*true/);
  assert.match(main,/webSecurity:\s*true/);
  assert.match(main,/webviewTag:\s*false/);
  assert.match(main,/setPermissionRequestHandler/);
  assert.match(main,/setPermissionCheckHandler/);
  assert.match(main,/setWindowOpenHandler/);
  assert.match(main,/will-navigate/);
  assert.match(main,/will-attach-webview/);
  assert.match(main,/loadFile\(/);
  assert.doesNotMatch(main,/loadURL\(\s*['"`]https?:/);
  assert.match(main,/authorizedSender\(event\)/);
  assert.match(preload,/contextBridge\.exposeInMainWorld/);
  assert.doesNotMatch(preload,/require\(\s*name|child_process|exec\(|eval\(/);
});

test('HTML CSP blocks remote scripts, networking, navigation and forms',()=>{
  const html=load('ui/index.html');
  assert.match(html,/Content-Security-Policy/);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/script-src 'self'/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/frame-src 'none'/);
  assert.match(html,/form-action 'none'/);
  assert.doesNotMatch(html,/https?:\/\/[^" ]+\.js/);
  assert.doesNotMatch(html,/<webview|<iframe|<form/);
});

test('Connection never claims VPN protection or opens an empty system tunnel',()=>{
  const main=load('src/main.cjs');
  const html=load('ui/index.html');
  assert.match(main,/state:\s*'unavailable'/);
  assert.match(main,/protected:\s*false/);
  assert.match(html,/VPN не активен/);
  assert.match(html,/VPN пока не подключается/);
  assert.match(html,/Трафик не защищён/);
  assert.doesNotMatch(main,/spawn\(|exec\(|NETunnelProviderManager|TUN|VpnService/);
});

test('Six plans with canonical values and no purchase or payment implementation',()=>{
  assert.deepEqual(plans.map(p=>p.priceRub),[99,160,219,339,700,1000]);
  assert.deepEqual(plans.map(p=>p.deviceLimit),[3,3,3,3,3,6]);
  const source=load('ui/index.html')+load('ui/app.js');
  assert.doesNotMatch(source,/payment_url|createCheckout|STRIPE_SECRET|ROLLYPAY_API_KEY|PANEL_API_TOKEN/);
  assert.ok(source.includes('Просмотр')||source.includes('просмотр'));
  assert.ok(Object.isFrozen(plans)&&plans.every(Object.isFrozen));
});

test('All major app views, guided onboarding and site palette are present',()=>{
  const html=load('ui/index.html');
  const css=load('ui/styles.css');
  for(const name of ['home','guide','plans','account','devices','help']){
    assert.match(html,new RegExp('id="view-'+name+'"'));
  }
  for(const color of ['#080b15','#121626','#181b2f','#a98bff','#79cde9','#70e5b1'])assert.ok(css.includes(color));
  assert.match(html,/Начать за 3 шага/);
  assert.match(html,/Мой кабинет/);
  assert.match(html,/Частые вопросы/);
  assert.match(html,/id="connection-dialog"/);
  assert.match(html,/К основному содержимому/);
});

test('Selected Xray JSON is bounded on re-open before starting a native engine',()=>{
  const main=load('src/main.cjs');
  assert.match(main,/fs\.lstat\(chosenFile\)/);
  assert.match(main,/fs\.open\(chosenFile/);
  assert.match(main,/size>1024\*1024/);
  assert.doesNotMatch(main,/fs\.readFile\(chosenFile/);
});
