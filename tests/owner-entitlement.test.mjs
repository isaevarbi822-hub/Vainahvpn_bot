import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveOwnerEntitlement} from '../netlify/functions/lib/owner-entitlement.mjs';

function database(alreadyReserved=false){
 const state={calls:[],expiry:alreadyReserved?new Date('2030-01-01T00:00:00Z'):null};
 const order={id:'order-a',status:'paid',is_test:false,owner_id:'00000000-0000-4000-8000-000000000001',plan_days:30,device_limit:3,
  target_expires_at:state.expiry};
 const pool={async connect(){return{
  async query(sql,params=[]){
   state.calls.push(sql);
   if(sql.startsWith('SELECT * FROM vpn_orders'))return {rows:[order]};
   if(sql.startsWith('SELECT expires_at'))return {rows:[]};
   if(sql.startsWith('UPDATE vpn_orders'))order.target_expires_at=params[1];
   return {rows:[]};
  },release(){}
 }}};
 return {pool,state};
}
test('only paid owner orders reserve expiry and retries reuse the same target',async()=>{
 const {pool,state}=database();
 const first=await reserveOwnerEntitlement('order-a',pool);
 assert.ok(first instanceof Date);
 const second=await reserveOwnerEntitlement('order-a',pool);
 assert.equal(second,first);
 assert.equal(state.calls.filter(sql=>sql.startsWith('INSERT INTO vpn_owner_entitlements')).length,1);
 assert.equal(state.calls.filter(sql=>sql.includes('pg_advisory_xact_lock')).length,2);
});
test('previously reserved target is returned without adding days',async()=>{
 const {pool,state}=database(true);
 const target=await reserveOwnerEntitlement('order-a',pool);
 assert.equal(target.toISOString(),'2030-01-01T00:00:00.000Z');
 assert.equal(state.calls.filter(sql=>sql.startsWith('INSERT INTO vpn_owner_entitlements')).length,0);
});
