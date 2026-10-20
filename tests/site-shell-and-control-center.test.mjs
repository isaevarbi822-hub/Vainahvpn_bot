import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {Script} from 'node:vm';

const siteFile=name=>new URL('../site/'+name,import.meta.url);
const read=name=>readFileSync(siteFile(name),'utf8');
const htmlPages=readdirSync(new URL('../site/',import.meta.url))
  .filter(x=>x.endsWith('.html')&&!['admin-payment-check.html','rollypay-sandbox.html'].includes(x));
const shell=read('site-shell.js');
const css=read('site-shell.css');
const hub=read('hub.html');
const diag=read('diagnostics.html');
const controller=read('command-center.mjs');

test('non-sticky header fix is global on all public pages',()=>{
  assert.ok(htmlPages.length>=29);
  assert.match(css,/body\s*>\s*header,body\s*>\s*\.site-header\s*\{/);
  assert.match(css,/position:relative!important/);
  assert.match(css,/@media\(max-width:1160px\)/);
  assert.match(css,/body\s*>\s*header\s+\.hamburger/);
  assert.match(css,/body\s*>\s*\.site-header\s+\.menu-toggle/);
  assert.match(css,/max-height:min\(65svh,500px\)/);
  for(const file of htmlPages){
    const html=read(file);
    assert.ok(html.includes('href="site-shell.css"'),file+' missing global fix');
    assert.ok(html.includes('src="site-shell.js" defer'),file+' missing progressive navigation');
    assert.ok(html.indexOf('href="site-shell.css"')<html.indexOf('</head>'),file+' stylesheet misplaced');
    assert.ok(html.indexOf('src="site-shell.js"')<html.indexOf('</head>'),file+' script misplaced');
  }
});

test('legacy theme no longer runs ineffective inline defer in head',()=>{
  for(const file of ['features.html','devices.html','security.html','speed.html','troubleshooting.html']){
    const html=read(file);
    assert.doesNotMatch(html,/<script defer>/,file);
    assert.match(html,/<script type="module">/,file);
    assert.match(html,/data-menu-button/,file);
  }
});

test('all client scripts added for expansion parse with Node without executing network',()=>{
  assert.doesNotThrow(()=>new Script(shell,{filename:'site-shell.js'}));
  for(const file of ['command-center.mjs','toolkit-logic.mjs','toolkit-ui.mjs']){
    assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',siteFile(file).pathname],{
      encoding:'utf8'}),file);
  }
});

test('search is keyboard-accessible and only opened on demand',()=>{
  assert.match(shell,/Ctrl\+K/);
  assert.match(shell,/createElement\(tag\)/);
  assert.match(shell,/dialog\.showModal/);
  assert.match(shell,/aria-label/);
  assert.doesNotMatch(shell,/innerHTML\s*=/);
  assert.doesNotMatch(shell,/setInterval\(/);
  assert.doesNotMatch(shell,/fetch\(/);
  assert.match(shell,/hub\.html/);
  assert.match(shell,/diagnostics\.html/);
});

test('hub shows only session-scoped subscription metadata, not a VPN URL',()=>{
  for(const marker of ['data-control-hub','data-hub-login-badge','data-hub-user-name',
    'data-hub-plan','data-hub-expires','data-hub-devices','data-hub-orders',
    'data-hub-login-message','data-hub-plans','data-hub-refresh','data-hub-checked-at'])
    assert.ok(hub.includes(marker),marker);
  for(const name of ['database','h1','rollypay','webhook'])
    assert.ok(hub.includes('data-hub-check="'+name+'"'));
  assert.match(controller,/website-account-overview/);
  assert.match(controller,/telegram-account/);
  assert.match(controller,/response\.data\.checkoutReady===true/);
  assert.match(hub,/история/i);
  assert.doesNotMatch(hub,/data-telegram-login/);
  assert.doesNotMatch(controller,/website-vpn-access|subscription-checkout/);
  assert.doesNotMatch(controller,/navigator\.clipboard\.writeText\(.*subscription/);
});

test('hub and diagnostics use only safe read-only health checks',()=>{
  for(const api of ['database-health','h1-panel-health','rollypay-health','rollypay-webhook-health'])
    assert.ok(controller.includes("'"+api+"'"),api);
  assert.match(controller,/method:'GET'/);
  assert.match(controller,/cache:'no-store'/);
  assert.match(controller,/new AbortController\(\)/);
  assert.doesNotMatch(controller,/method:'POST'|method:'PUT'|method:'DELETE'/);
  assert.doesNotMatch(controller,/innerHTML\s*=/);
  assert.match(hub,/не подтверждает работу конкретного VPN/);
  assert.match(diag,/не создаём платежи/);
});

test('diagnostics has six interactive scenarios, safe owner-facing support flow',()=>{
  assert.equal((diag.match(/data-diag-problem="/g)||[]).length,6);
  for(const marker of ['data-diagnostics-center','data-diag-title','data-diag-summary',
    'data-diag-list','data-diag-link','data-diag-check','data-diag-check-results',
    'data-diag-copy','data-diag-copy-status'])
    assert.ok(diag.includes(marker),marker);
  assert.match(controller,/navigator\.onLine/);
  assert.match(controller,/navigator\.clipboard\.writeText/);
  assert.match(controller,/getJson\('website-account-overview'\)/);
  assert.match(diag,/не передавай VPN-ссылку/);
});

test('all public HTML linked assets and local pages actually exist',()=>{
  for(const filename of htmlPages){
    const html=read(filename);
    for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
      const href=match[1];
      if(!href||href.startsWith('#')||/^(?:https?:|mailto:|tel:|data:)/i.test(href)||
         href.startsWith('/.netlify/'))continue;
      const target=href.split(/[?#]/)[0].replace(/^\//,'');
      if(!target)continue;
      assert.ok(existsSync(siteFile(target)),filename+' -> '+target);
    }
  }
});

test('new central navigation is discoverable from homepage and plan comparison',()=>{
  assert.match(read('index.html'),/href="hub\.html"/);
  assert.match(read('index.html'),/href="diagnostics\.html"/);
  assert.match(read('compare.html'),/href="hub\.html"/);
  assert.match(read('hub.html'),/href="account\.html"/);
  assert.match(read('diagnostics.html'),/href="contact\.html"/);
  assert.match(read('site-shell.js'),/href='\#vainah-top'/);
});

test('merchant production kill switch still blocks real purchases',()=>{
  const source=readFileSync(new URL('../netlify/functions/lib/plan-catalog.mjs',import.meta.url),'utf8');
  assert.match(source,/export function checkoutReady/);
  assert.match(source,/return false;/);
});
