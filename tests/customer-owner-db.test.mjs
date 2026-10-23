import test from 'node:test';
import assert from 'node:assert/strict';
import {findOrCreateOwner} from '../netlify/functions/lib/customer-owner-db.mjs';

function fakePool(){
 const calls=[];
 const state={owner:null,creates:0};
 return {calls,state,async connect(){
  return {async query(sql,args=[]){
   calls.push({sql,args});
   if(sql.startsWith('SELECT owner_id'))return {rows:state.owner?[{owner_id:state.owner}]:[]};
   if(sql.startsWith('INSERT INTO vpn_account_owners')){
    state.creates++;return {rows:[{id:'00000000-0000-4000-8000-000000000001'}]};
   }
   if(sql.startsWith('INSERT INTO vpn_account_identities'))state.owner=args[2];
   return {rows:[]};
  },release(){calls.push({sql:'RELEASE'})}};
 }};
}

test('verified Telegram identity is assigned an owner only once',async()=>{
 const db=fakePool();
 const identity={provider:'telegram',subject:'123456789'};
 const first=await findOrCreateOwner(identity,db);
 const again=await findOrCreateOwner(identity,db);
 assert.equal(first,again);
 assert.equal(db.state.creates,1);
 assert.equal(db.calls.filter(c=>c.sql==='COMMIT').length,2);
 assert.equal(db.calls.filter(c=>c.sql==='RELEASE').length,2);
});
test('invalid or unverified identity is rejected before DB access',async()=>{
 const db=fakePool();
 for(const identity of [
  {provider:'phone',subject:'123456789'},
  {provider:'telegram',subject:'0'},
  {provider:'email',subject:'person@example.com'},
  {provider:'email',subject:'x'.repeat(64)}
 ]){
  await assert.rejects(findOrCreateOwner(identity,db),/INVALID/);
 }
 assert.equal(db.calls.length,0);
});
