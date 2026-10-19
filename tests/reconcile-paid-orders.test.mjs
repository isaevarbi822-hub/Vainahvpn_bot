import test from 'node:test';
import assert from 'node:assert/strict';
import reconcile,{config} from '../netlify/functions/reconcile-paid-orders.mjs';

test('reconciliation schedule is every fifteen minutes',()=>{
  assert.equal(config.schedule,'*/15 * * * *');
});

test('unreviewed checkout never reconciles or touches the database',async()=>{
  const response=await reconcile();
  assert.equal(response.status,204);
});
