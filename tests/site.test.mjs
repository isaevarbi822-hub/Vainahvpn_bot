import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';

const root=new URL('../site/',import.meta.url);
const pages=[
 'index.html','features.html','plans.html','servers.html',
 'devices.html','guide.html','security.html','speed.html',
 'troubleshooting.html','help.html','contact.html','about.html',
 'privacy.html','terms.html','thanks.html','404.html',
 'start.html','glossary.html','checklist.html',
 'checkout.html','payment-result.html','account.html'
];
test('every public Vainah VPN page exists and has a main landmark',()=>{
 for(const page of pages){
  const html=readFileSync(new URL(page,root),'utf8');
  assert.match(html,/<title>[\s\S]+?<\/title>/i,page);
  assert.match(html,/<main\b/i,page);
  assert.match(html,/<\/main>/i,page);
  assert.match(html,/<\/html>/i,page);
 }
});
test('self-contained pages contain their own styles or valid shared assets',()=>{
 for(const page of pages){
  const html=readFileSync(new URL(page,root),'utf8');
  assert.ok(html.includes('<style>')||html.includes('href="assets/main.css"'),page+' has no styles');
  for(const uri of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const link=uri[1];
   if(!link||link.startsWith('#')||/^https?:\/\//i.test(link) ||
      link.startsWith('mailto:')||link.startsWith('tel:')||link.startsWith('data:') ||
      link.startsWith('/.netlify/'))continue;
   const dest=link.split(/[?#]/)[0];
   if(!dest)continue;
   const file=dest.startsWith('/')?path.join(root.pathname,dest.slice(1)):path.join(root.pathname,dest);
   assert.ok(existsSync(file),page+' missing: '+dest);
  }
 }
});
test('RollyPay website checkout requires verified Telegram identity',()=>{
 const plans=readFileSync(new URL('plans.html',root),'utf8');
 assert.match(plans,/href="checkout\.html\?plan=30"/);
 assert.match(plans,/href="checkout\.html\?plan=90"/);
 assert.match(plans,/href="checkout\.html\?plan=365"/);
 const checkout=readFileSync(new URL('checkout.html',root),'utf8');
 assert.match(checkout,/data-request-access/);
 assert.match(checkout,/subscription-checkout/);
 assert.doesNotMatch(checkout,/ROL(LY)?PAY_API_KEY\s*=/);
});
