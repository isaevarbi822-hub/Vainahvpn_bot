import test from 'node:test';
import assert from 'node:assert/strict';
import {reserveExpiry} from '../netlify/functions/lib/subscription-db.mjs';

test('reservation reuses locked connection and never acquires another pool client', async()=>{
  const queries=[];
  const order={id:'order-1',telegram_id:'123456789',status:'paid',is_test:false,plan_days:30,target_expires_at:null};
  const fakeDb={query:async(sql,params)=>{
    queries.push({sql,params});
    if(sql.startsWith('SELECT * FROM vpn_orders'))return {rows:[order]};
    if(sql.startsWith('SELECT telegram_id FROM vpn_customers'))return {rows:[{telegram_id:order.telegram_id}]};
    if(sql.startsWith('SELECT expires_at FROM vpn_entitlements'))return {rows:[]};
    if(sql.startsWith('UPDATE vpn_orders SET target_expires_at'))return {rows:[{...order,target_expires_at:params[1]}]};
    return {rows:[]};
  }};
  const result=await reserveExpiry('order-1',0,fakeDb);
  assert.ok(result.target_expires_at instanceof Date);
  assert.equal(queries.some(q=>q.sql==='BEGIN'||q.sql==='COMMIT'),false);
  assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO vpn_entitlements')).length,1);
});

test('retry with existing reservation never extends expiry again',async()=>{
  const original=new Date('2027-01-15T00:00:00.000Z');
  const order={telegram_id:'123456789',status:'paid',is_test:false,target_expires_at:original};
  let count=0;
  const db={query:async()=>{count++;return {rows:[order]}}};
  const result=await reserveExpiry('order-2',0,db);
  assert.equal(result.target_expires_at,original);
  assert.equal(count,1);
});
