import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import handler from '../netlify/functions/clerk-billing-account.mjs';

test('Clerk billing history rejects unauthenticated requests',async()=>{
 const r=await handler(new Request('https://vpn.example/.netlify/functions/clerk-billing-account'));
 assert.equal(r.status,401);
});
test('Clerk billing history is strictly owner scoped and read only',()=>{
 const source=readFileSync(new URL('../netlify/functions/clerk-billing-account.mjs',import.meta.url),'utf8');
 assert.match(source,/clerkIdentityFromRequest\(request\)/);
 assert.match(source,/provider=\$1 AND subject=\$2/);
 assert.match(source,/FROM vpn_orders WHERE owner_id=\$1/);
 assert.match(source,/billingReady:false/);
 assert.doesNotMatch(source,/createInvoice\(|insertCheckout\(|findOrCreateOwner\(|fulfillPaidOrder\(/);
});

test('Clerk registration refuses forged origin and missing identity without DB work',async()=>{
 const previous=process.env.PUBLIC_SITE_ORIGIN;
 process.env.PUBLIC_SITE_ORIGIN='https://vpn.example';
 try{
  const invalid=await handler(new Request('https://vpn.example/.netlify/functions/clerk-billing-account',{
   method:'POST',headers:{origin:'https://untrusted.example'}
  }));
  assert.equal(invalid.status,403);
  const anonymous=await handler(new Request('https://vpn.example/.netlify/functions/clerk-billing-account',{
   method:'POST',headers:{origin:'https://vpn.example'}
  }));
  assert.equal(anonymous.status,401);
 }finally{
  if(previous===undefined)delete process.env.PUBLIC_SITE_ORIGIN;
  else process.env.PUBLIC_SITE_ORIGIN=previous;
 }
});
