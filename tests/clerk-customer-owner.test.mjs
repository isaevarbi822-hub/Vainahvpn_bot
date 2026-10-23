import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {findOrCreateOwner} from '../netlify/functions/lib/customer-owner-db.mjs';
const migration=readFileSync(new URL('../database/migrations/004-clerk-identity.sql',import.meta.url),'utf8');
function fakePool(){
 let owner=null,created=0;
 return {get created(){return created},async connect(){
  return {async query(sql,params=[]){
   if(sql.startsWith('SELECT owner_id'))return {rows:owner?[{owner_id:owner}]:[]};
   if(sql.startsWith('INSERT INTO vpn_account_owners')){created++;return {rows:[{id:'00000000-0000-4000-8000-000000000001'}]};}
   if(sql.startsWith('INSERT INTO vpn_account_identities'))owner=params[2];
   return {rows:[],rowCount:1};
  },release(){}};
 }};
}
test('verified Clerk subject maps to stable owner without duplicate creation',async()=>{
 const pool=fakePool(),identity={provider:'clerk',subject:'user_12345678ABCD'};
 assert.equal(await findOrCreateOwner(identity,pool),'00000000-0000-4000-8000-000000000001');
 assert.equal(await findOrCreateOwner(identity,pool),'00000000-0000-4000-8000-000000000001');
 assert.equal(pool.created,1);
});
test('invalid Clerk identities are rejected',async()=>{
 const pool=fakePool();
 for(const subject of ['user_bad','attacker','user_12345678;DROP','user_']) {
  await assert.rejects(findOrCreateOwner({provider:'clerk',subject},pool),/INVALID_SUBJECT/);
 }
 assert.equal(pool.created,0);
});
test('migration preserves existing orders and supports Clerk without deleting identities',()=>{
 assert.match(migration,/provider IN \('email','telegram','clerk'\)/);
 assert.match(migration,/provider='clerk'/);
 assert.doesNotMatch(migration,/\bUPDATE\s+vpn_orders|\bDELETE\s+FROM\s+vpn_account_identities/i);
});
