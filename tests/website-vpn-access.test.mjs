import test from 'node:test';
import assert from 'node:assert/strict';
import access from '../netlify/functions/website-vpn-access.mjs';

test('website VPN link requires authenticated session',async()=>{
  const req=new Request('https://vpn.example.com/.netlify/functions/website-vpn-access?order=2cc7e0ca-a7e7-44ba-ac6c-2805db647e27');
  assert.equal((await access(req)).status,401);
});

test('website VPN link is never available with malformed order identifiers',async()=>{
  const req=new Request('https://vpn.example.com/.netlify/functions/website-vpn-access?order=bad',{method:'POST'});
  assert.equal((await access(req)).status,405);
});
