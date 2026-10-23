import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Script} from 'node:vm';

const root=new URL('../site/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const pages=readdirSync(root).filter(name=>name.endsWith('.html')
  && !['admin-payment-check.html','rollypay-sandbox.html'].includes(name));

test('all public pages style top navigation in normal flow, never sticky',()=>{
  assert.ok(pages.length>=30);
  for(const name of pages){
    const html=read(name);
    const style=(html.match(/<style>([\s\S]*?)<\/style>/)||[])[1]||'';
    assert.doesNotMatch(style,/(?:^|[}\n])\s*header\{position:(?:sticky|fixed)/,
      name+' has a global sticky header rule');
    assert.doesNotMatch(style,/\.site-header\{position:(?:sticky|fixed)/,
      name+' has a sticky alternate header');
    assert.match(html,/href="site-shell\.css"/,
      name+' must load common responsive fixes');
    assert.match(html,/src="site-shell\.js" defer/,
      name+' must load navigation support');
  }
});

test('nested content headers never inherit navigation-only styles',()=>{
  const style=read('site-shell.css');
  assert.match(style,/main header, main \.ux-page-hero, main \.tool-intro/);
  assert.match(style,/position:static!important/);
  assert.match(style,/background:transparent!important/);
  assert.match(style,/border:0!important/);
  assert.match(style,/backdrop-filter:none!important/);
  for(const name of ['compare.html','assistant.html','device-center.html','library.html','status.html']){
    const html=read(name);
    const inMain=html.slice(html.indexOf('<main'),html.indexOf('</main>'));
    assert.match(inMain,/<header\b/,
      name+' must keep its informational page hero, but not a sticky navigation bar');
    assert.match(html,/body>header\{position:relative;top:auto/,
      name+' should scope original navigation CSS to top-level body header');
  }
});

test('legacy theme navigations and shared assets are likewise non-sticky',()=>{
  const legacy=read('assets/main.css');
  assert.match(legacy,/\.site-header\{position:relative;top:auto;/);
  assert.doesNotMatch(legacy,/\.site-header\{position:sticky/);
  for(const name of ['devices.html','features.html','security.html','speed.html','troubleshooting.html']){
    const html=read(name);
    assert.doesNotMatch(html,/\.site-header\{position:sticky/);
    assert.match(html,/\.site-header\{position:relative;top:auto;/);
  }
});

test('mobile navigation supports dynamically injected links and accessible closing',()=>{
  const js=read('site-shell.js');
  assert.doesNotThrow(()=>new Script(js));
  assert.match(js,/mobile\.addEventListener\('click',event=>/);
  assert.match(js,/event\.target\.closest\('a'\)/);
  assert.match(js,/toggle\.setAttribute\('aria-expanded','false'\)/);
  assert.match(js,/event\.key==='Escape'/);
  const css=read('site-shell.css');
  assert.match(css,/@media\(max-width:1160px\)/);
  assert.match(css,/max-height:min\(65svh,500px\)/);
  assert.match(css,/body > header,body > \.site-header/);
});

test('no new payment functionality was activated by visual fixes',()=>{
  const catalog=readFileSync(new URL('../netlify/functions/lib/plan-catalog.mjs',import.meta.url),'utf8');
  assert.match(catalog,/export function checkoutReady/);
  assert.match(catalog,/return false;/);
});
