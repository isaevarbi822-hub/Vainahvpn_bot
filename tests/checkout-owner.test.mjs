import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutOwner} from '../netlify/functions/lib/checkout-owner.mjs';
import {makeSession} from '../netlify/functions/lib/telegram-identity.mjs';
import {newAltSession,altCookieName} from '../netlify/functions/lib/alternate-auth.mjs';

const secret='test-checkout-owner-secret-'.repeat(3);
const url='https://vpn.example.test/.netlify/functions/subscription-checkout';
const emailCookie=altCookieName+'='+newAltSession('email','client@example.test',secret);
const telegramCookie='__Host-vainah_session='+makeSession({telegramId:'123456789'},secret);
const req=cookie=>new Request(url,{headers:{cookie}});

test('email and Telegram are separately identifiable verified checkout owners',()=>{
 const email=checkoutOwner(req(emailCookie),secret);
 assert.equal(email.provider,'email');
 assert.match(email.subject,/^[a-f0-9]{64}$/);
 assert.equal(email.subject.includes('@'),false);
 assert.deepEqual(checkoutOwner(req(telegramCookie),secret),
  {provider:'telegram',subject:'123456789'});
});
test('unlinked simultaneous sessions cannot silently merge purchased access',()=>{
 assert.deepEqual(checkoutOwner(req(emailCookie+'; '+telegramCookie),secret),
  {error:'ACCOUNT_LINK_REQUIRED'});
});
test('unknown, phone or invalid sessions never become a checkout owner',()=>{
 assert.equal(checkoutOwner(req(''),secret),null);
 assert.equal(checkoutOwner(req(altCookieName+'='+newAltSession('phone','+4712345678',secret)),secret),null);
 assert.equal(checkoutOwner(req(altCookieName+'=tampered'),secret),null);
});
