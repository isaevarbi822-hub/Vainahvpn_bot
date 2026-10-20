import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const html=readFileSync(new URL('../site/account.html',import.meta.url),'utf8');
const client=readFileSync(new URL('../site/account-dashboard.js',import.meta.url),'utf8');
const telegram=readFileSync(new URL('../site/telegram-login-widget.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../site/account-dashboard.css',import.meta.url),'utf8');
test('dashboard client code parses as valid JavaScript',()=>{
 assert.doesNotThrow(()=>new Script(client,{filename:'account-dashboard.js'}));
});
test('every dashboard JS element exists in account markup',()=>{
 const ids=[...client.matchAll(/\$\('([^']+)'\)/g)].map(x=>x[1]);
 assert.ok(ids.length>=20,'expected all dashboard controls');
 for(const id of ids)assert.ok(html.includes('id="'+id+'"'),'Missing dashboard element: '+id);
});
test('Telegram Login kept and private account is hidden until server login',()=>{
 assert.match(html,/id="account-private"[^>]*hidden/);
 assert.match(html,/id="account-auth-panel"/);
 assert.match(css,/\.account-shell \[hidden\]\{display:none!important\}/);
 assert.match(telegram,/telegram\.org\/js\/telegram-widget/);
 assert.match(telegram,/data-telegram-login','Vainahvpn_bot'/);
 assert.match(client,/telegram-account/);
 assert.doesNotMatch(client,/send-my-vpn/);
});
test('site fetches real purchases, owner-bound VPN link and separately checks H1 status',()=>{
 assert.match(client,/website-account-overview/);
 assert.match(client,/website-vpn-access\?order=/);
 assert.match(client,/my-subscription/);
 assert.match(client,/account-h1-state/);
 assert.doesNotMatch(client,/innerHTML\s*=/);
 assert.doesNotMatch(html,/class="account-progress"/);
 assert.match(client,/new Date/);
});
test('dashboard privacy-sensitive VPN controls start hidden',()=>{
 assert.match(html,/id="account-open-vpn"[^>]*hidden/);
 assert.match(html,/id="account-copy-vpn"[^>]*hidden/);
 assert.match(client,/clearVpnLink\(\)/);
 assert.match(client,/referrerPolicy='no-referrer'/);
});
