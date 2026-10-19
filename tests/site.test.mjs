import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = new URL('../site/', import.meta.url);
const pages = [
  'index.html','features.html','plans.html','servers.html',
  'devices.html','guide.html','security.html','speed.html',
  'troubleshooting.html','help.html','contact.html','about.html',
  'privacy.html','terms.html','thanks.html','404.html'
];

test('every public Vainah VPN page is present and has usable markup', () => {
  for (const page of pages) {
    const pathname = new URL(page, root);
    assert.ok(existsSync(pathname), page + ' does not exist');
    const html = readFileSync(pathname,'utf8');
    assert.match(html,/<html\b/i,page);
    assert.match(html,/<title>[\s\S]+?<\/title>/i,page);
    assert.match(html,/<main\s+id=["']main["']/i,page);
    assert.match(html,/<\/main>/i,page);
    assert.match(html,/<\/html>/i,page);
  }
});

test('all new knowledge pages use shared site assets and working local links', () => {
  for (const page of ['features.html','devices.html','security.html','speed.html','troubleshooting.html']) {
    const html = readFileSync(new URL(page,root),'utf8');
    assert.match(html,/href="assets\/main\.css"/);
    assert.match(html,/src="assets\/main\.js"/);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const uri = match[1];
      if (!uri || uri.startsWith('#') || /^https?:\/\//i.test(uri) || uri.startsWith('mailto:')) continue;
      const destination = uri.split(/[?#]/)[0];
      if (!destination) continue;
      assert.ok(existsSync(path.join(new URL('.',new URL(page,root)).pathname, destination)), page+' has a missing local asset/link: '+uri);
    }
  }
});

test('buy links stay with existing Telegram bot and not demo Rollypay flow', () => {
  const plans = readFileSync(new URL('plans.html',root),'utf8');
  assert.match(plans,/t\.me\/Vainahvpn_bot/);
  assert.doesNotMatch(plans,/\.netlify\/functions\/rollypay-test/);
  const home = readFileSync(new URL('index.html',root),'utf8');
  assert.match(home,/href="features\.html"/);
  assert.match(home,/href="troubleshooting\.html"/);
});
