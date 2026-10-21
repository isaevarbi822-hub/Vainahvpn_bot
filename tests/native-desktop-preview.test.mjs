import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {Script} from 'node:vm';
import {planCatalog,checkoutReady} from '../netlify/functions/lib/plan-catalog.mjs';
const require=createRequire(import.meta.url);
const root=new URL('../',import.meta.url);
const file=p=>new URL(p,root);
const read=p=>readFileSync(file(p),'utf8');
const {plans}=require('../desktop/shared/catalog.cjs');
const {safePage}=require('../desktop/shared/official.cjs');

test('Windows and macOS native desktop structure exists with secure renderer',()=>{
  for(const path of ['desktop/package.json','desktop/src/main.cjs','desktop/src/preload.cjs',
     'desktop/ui/index.html','desktop/ui/styles.css','desktop/ui/app.js',
     'desktop/shared/catalog.cjs','desktop/shared/official.cjs',
     '.github/workflows/desktop-preview.yml'])assert.ok(existsSync(file(path)),path);
  const packageJson=JSON.parse(read('desktop/package.json'));
  assert.equal(packageJson.build.win.target[0].target,'nsis');
  assert.equal(packageJson.build.mac.target[0].target,'dmg');
  assert.equal(packageJson.build.win.target[0].arch[0],'x64');
  assert.deepEqual(packageJson.build.mac.target[0].arch,['x64','arm64']);
  assert.equal(packageJson.build.appId,'app.vainah.vpn.desktop');
});

test('Desktop plans exactly match the immutable website source of truth',()=>{
  assert.deepEqual(plans.map(({id,days,priceRub,deviceLimit})=>({id,days,priceRub,deviceLimit})),
    planCatalog().map(({id,days,kopeks,deviceLimit})=>({id,days,priceRub:kopeks/100,deviceLimit})));
  assert.equal(checkoutReady(),false);
});

test('Desktop uses the website design and guides users honestly',()=>{
  const html=read('desktop/ui/index.html'),css=read('desktop/ui/styles.css');
  const site=read('site/index.html');
  for(const color of ['#080b15','#121626','#181b2f','#a98bff','#79cde9','#70e5b1']){
    assert.ok(site.includes(color),color+' missing on website');
    assert.ok(css.includes(color),color+' missing in desktop');
  }
  assert.match(html,/Интернет под твоим/);
  assert.match(html,/контролем/);
  for(const page of ['home','guide','plans','account','devices','help'])
    assert.match(html,new RegExp('id="view-'+page+'"'));
  assert.match(html,/VPN не активен/);
  assert.match(html,/Пока приложение не подключает VPN/);
  assert.match(html,/id="vless-key"/);
  assert.match(html,/type="password"/);
  assert.doesNotMatch(html,/<iframe|<webview/);
});

test('Desktop blocks sensitive IPC calls, native VPN impersonation and arbitrary browser links',()=>{
  const main=read('desktop/src/main.cjs');
  assert.match(main,/protected:\s*false/);
  assert.match(main,/contextIsolation:\s*true/);
  assert.match(main,/nodeIntegration:\s*false/);
  assert.match(main,/sandbox:\s*true/);
  assert.match(main,/setPermissionRequestHandler/);
  assert.match(main,/authorizedSender/);
  assert.match(read('desktop/ui/index.html'),/connect-src 'none'/);
  assert.equal(safePage('javascript:alert(1)'),null);
  assert.equal(safePage('constructor'),null);
  assert.equal(safePage('account'),'https://vainahvpnbot0.netlify.app/account.html');
  assert.doesNotMatch(main,/child_process|process\.env\.PANEL_API_TOKEN|exec\(|spawn\(/);
  assert.doesNotThrow(()=>new Script(read('desktop/ui/app.js')));
});

test('Desktop CI is branch-isolated and publishes only explicitly labeled preview artifacts',()=>{
  const yml=read('.github/workflows/desktop-preview.yml');
  assert.match(yml,/feature\/native-ios-android-vpn-foundation/);
  assert.match(yml,/windows-latest/);
  assert.match(yml,/macos-latest/);
  assert.match(yml,/--prerelease/);
  assert.match(yml,/НЕ ПОДКЛЮЧАЕТ VPN/);
  assert.doesNotMatch(yml,/pull_request_target/);
});
