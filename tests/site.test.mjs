import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
const root=new URL('../site/',import.meta.url);
const pages=['index.html','features.html','plans.html','servers.html','devices.html',
 'guide.html','security.html','speed.html','troubleshooting.html','help.html',
 'contact.html','about.html','privacy.html','terms.html','thanks.html','404.html',
 'start.html','glossary.html','checklist.html','account.html',
 'assistant.html','device-center.html','library.html','compare.html','status.html',
 'hub.html','diagnostics.html'];
test('all Vainah public pages exist and have complete HTML and styling',()=>{
 for(const page of pages){
  const location=new URL(page,root);
  assert.ok(existsSync(location),page+' missing');
  const html=readFileSync(location,'utf8');
  assert.match(html,/<title>[\s\S]+?<\/title>/i,page);
  assert.match(html,/<main\b/i,page);
  assert.match(html,/<\/main>/i,page);
  assert.match(html,/<\/html>/i,page);
  assert.ok(html.includes('<style>')||html.includes('href="assets/main.css"'),page+' missing CSS');
 }
});
test('all public page links point to existing local files',()=>{
 for(const page of pages){
  const html=readFileSync(new URL(page,root),'utf8');
  for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const url=m[1];
   if(!url||url.startsWith('#')||/^(https?:|mailto:|tel:|data:)/i.test(url)||
      url.startsWith('/.netlify/'))continue;
   const target=url.split(/[?#]/)[0].replace(/^\//,'');
   if(target)assert.ok(existsSync(path.join(root.pathname,target)),page+' broken link: '+target);
  }
 }
});
test('Telegram login stays separate from website checkout; production checkout locked',()=>{
 const account=readFileSync(new URL('account.html',root),'utf8');
 const loginCode=readFileSync(new URL('telegram-login-widget.js',root),'utf8');
 const plans=readFileSync(new URL('plans.html',root),'utf8');
 const serverCatalog=readFileSync(new URL('../netlify/functions/lib/plan-catalog.mjs',root),'utf8');
 assert.match(account,/id="account-auth-panel"/);
 assert.match(loginCode,/api\/auth\/telegram-status/);
 assert.match(loginCode,/auth\/telegram\/start/);
 assert.doesNotMatch(loginCode,/telegram\.org\/js\/telegram-widget/);
 assert.match(readFileSync(new URL('index.html',root),'utf8'),/href="account\.html"/);
 assert.match(plans,/href="checkout\.html\?plan=30"/);
 assert.match(serverCatalog,/export function checkoutReady/);
 assert.match(serverCatalog,/return false;/);
});
