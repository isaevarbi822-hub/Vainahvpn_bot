import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{inspectDatabase} from '../netlify/functions/database-health.mjs';

test('database health is read only',async()=>{
  assert.equal((await handler(new Request('https://example.net/.netlify/functions/database-health',{method:'POST'}))).status,405);
});
test('database readiness verifies all three tables',async()=>{
  let sql='';
  const pool={query:async query=>{
    sql=query;
    return {rows:[{customers:true,orders:true,entitlements:true}]};
  }};
  assert.equal(await inspectDatabase(pool),true);
  assert.match(sql,/to_regclass\('public\.vpn_orders'\)/);
  assert.doesNotMatch(sql,/INSERT|UPDATE|DELETE|DROP|ALTER/i);
});
test('missing tables must not be reported as ready',async()=>{
  assert.equal(await inspectDatabase({query:async()=>({rows:[{customers:true,orders:false,entitlements:true}]})}),false);
});
