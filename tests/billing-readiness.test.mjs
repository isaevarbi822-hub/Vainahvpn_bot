import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutPrerequisites,checkoutReady} from '../netlify/functions/lib/plan-catalog.mjs';

test('billing readiness reports only booleans and never secret values',()=>{
 const env={DATABASE_URL:'postgresql://user:secret@db.example/db',
  ROLLYPAY_API_KEY:'SECRET_ROLLYPAY_API',ROLLYPAY_SIGNING_SECRET:'SIGNING_SECRET',
  PANEL_BASE_URL:'https://panel.example',PANEL_API_TOKEN:'SECRET_PANEL',
  PUBLIC_SITE_ORIGIN:'https://vpn.example',SESSION_SIGNING_KEY:'SECRET_SESSION',
  TELEGRAM_BOT_TOKEN:'SECRET_BOT'};
 const status=checkoutPrerequisites(env);
 assert.equal(Object.values(status).every(value=>typeof value==='boolean'),true);
 assert.equal(status.rollypay,true);
 assert.equal(status.clerkIntegrated,false);
 assert.equal(status.migrationsVerified,false);
 assert.equal(status.deliveryVerified,false);
 assert.equal(status.liveReviewed,false);
 assert.equal(JSON.stringify(status).includes('SECRET_'),false);
 assert.equal(JSON.stringify(status).includes('postgresql:'),false);
 assert.equal(checkoutReady(env),false);
});

test('unset environment exposes missing payment prerequisites without enabling charges',()=>{
 const status=checkoutPrerequisites({});
 assert.equal(status.database,false);
 assert.equal(status.rollypay,false);
 assert.equal(status.panel,false);
 assert.equal(checkoutReady({}),false);
});
