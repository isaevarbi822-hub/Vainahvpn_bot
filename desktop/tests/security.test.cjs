'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const load=file=>fs.readFileSync(path.join(root,file),'utf8');
const {safePage,pages}=require('../shared/official.cjs');
const {plans}=require('../shared/catalog.cjs');

test('All outbound pages are explicitly whitelisted to the authenticated Render preview',()=>{
  assert.ok(Object.keys(pages).length>=8);
  for(const [name,url] of Object.entries(pages)){
    assert.equal(safePage(name),url);
    assert.ok(url.startsWith('https://vainahvpn-python-preview.onrender.com/'));
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
  // Process creation is isolated in the trusted singbox-session module.
  // Mentioning TUN in status text must not fail this security test.
  assert.doesNotMatch(main,/\b(?:spawn|exec)\s*\(/);
  assert.match(main,/const \{ SingBoxSession \} = require\('\.\.\/shared\/singbox-session\.cjs'\)/);
  assert.match(main,/protected:\s*false/);
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

test('Electron waits for native engine cleanup before exiting',()=>{
  const main=load('src/main.cjs');
  assert.match(main,/app\.on\('before-quit',event=>/);
  assert.match(main,/event\.preventDefault\(\)/);
  assert.match(main,/engineSession\.stop\(\)\.then\(result=>/);
  assert.match(main,/if\(result\.ok\)/);
  assert.match(main,/quitCleanupDone=true/);
});

test('Window waits for native engine shutdown before closing',()=>{
  const main=load('src/main.cjs');
  assert.match(main,/mainWindow\.on\('close',event=>/);
  assert.match(main,/event\.preventDefault\(\)/);
  assert.match(main,/engineSession\.stop\(\)\.then\(result=>/);
  assert.match(main,/shutdownComplete=true/);
});

test('Official public site stays isolated, Telegram account opens in system browser',()=>{
  const main=load('src/main.cjs');
  assert.match(main,/partition:'persist:vainah-official-site'/);
  assert.match(main,/nodeIntegration:false,contextIsolation:true,sandbox:true/);
  assert.match(main,/target\.origin===siteOrigin/);
  assert.match(main,/win\.webContents\.on\('will-navigate'/);
  assert.match(main,/win\.webContents\.on\('will-redirect'/);
  assert.match(main,/openWebsiteInsideApp\(url\)/);
  assert.match(main,/if\(name==='account'\)/);
  assert.match(main,/await shell\.openExternal\(url\)/);
  assert.match(main,/if\(!url \|\| !trustedSiteNavigation\(url\)\)/);
  assert.match(main,/shell\.openExternal\(safePage\('account'\)\)/);
});

test('Desktop restores unverified process state without claiming VPN protection',()=>{
  const ui=load('ui/app.js');
  assert.match(ui,/status\.state==='running-unverified'/);
  assert.match(ui,/VPN-движок запущен, но защищённое соединение не подтверждено/);
  assert.match(ui,/button\.textContent='⏻ Остановить движок'/);
  assert.match(ui,/status\.state==='stop-failed'/);
});

test('Subscription import button is wired and servers are rendered below connection',()=>{
  const html=load('ui/index.html');
  const js=load('ui/app.js');
  const main=load('src/main.cjs');
  assert.match(html,/id="import-vless"/);
  assert.match(html,/id="home-server-list"/);
  assert.doesNotMatch(html,/id="subscription-server"/);
  assert.match(js,/importButton\.addEventListener\('click'/);
  assert.match(js,/refreshServers\(\)/);
  assert.match(main,/vainah:subscription-servers/);
});

test('Desktop detects unexpected native engine shutdown without reporting connection',()=>{
 const ui=load('ui/app.js');
 assert.match(ui,/async function refreshEngineStatus\(/);
 assert.match(ui,/VPN-движок неожиданно остановился/);
 assert.match(ui,/getTunnelStatus\(\)/);
});

test('Cannot replace imported VPN subscription while native engine is active',()=>{
 const main=load('src/main.cjs');
 for(const channel of ['vainah:import-vless-link','vainah:import-https-subscription']){
  const start=main.indexOf("ipcMain.handle('"+channel+"'");
  assert.ok(start>=0);
  const handler=main.slice(start,main.indexOf("\n  });",start));
  assert.match(handler,/engineSession\.status\.state!=='stopped'/);
  assert.match(handler,/Сначала отключи VPN-движок/);
 }
});
