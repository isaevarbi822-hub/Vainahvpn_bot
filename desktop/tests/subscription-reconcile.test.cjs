'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {endpoint,reconcileSubscriptionSelection}=require('../shared/subscription-reconcile.cjs');

function node(address,uuid,serverName='example.com'){
  return {outbounds:[{protocol:'vless',settings:{vnext:[{
    address,port:443,users:[{id:uuid}]
  }]},streamSettings:{security:'reality',realitySettings:{
    publicKey:'TEST_PUBLIC_KEY',serverName
  }}}]};
}

test('keeps exact selection after normal H1 subscription refresh',()=>{
  const germany=node('de.example.com','old-credential');
  const poland=node('pl.example.com','different');
  const next=[node('pl.example.com','different'),node('de.example.com','old-credential')];
  assert.strictEqual(reconcileSubscriptionSelection(germany,next),next[1]);
  assert.notStrictEqual(reconcileSubscriptionSelection(germany,next),poland);
});

test('keeps same location when H1Cloud rotates UUID but not endpoint',()=>{
  const old=node('de.example.com','old-uuid');
  const fresh=node('de.example.com','new-uuid');
  assert.strictEqual(reconcileSubscriptionSelection(old,[node('pl.example.com','pl'),fresh]),fresh);
  assert.equal(endpoint(fresh),endpoint(old));
});

test('does not silently change countries or select another user endpoint',()=>{
  const old=node('de.example.com','old');
  assert.strictEqual(reconcileSubscriptionSelection(old,[node('pl.example.com','pl')]),null);
  assert.strictEqual(reconcileSubscriptionSelection(null,[node('pl.example.com','pl')]),null);
  assert.strictEqual(reconcileSubscriptionSelection(old,[]),null);
  assert.strictEqual(reconcileSubscriptionSelection(old,'oops'),null);
});

test('different SNI for same IP requires user to re-select',()=>{
  const old=node('1.1.1.1','old','old.example.com');
  const fresh=node('1.1.1.1','new','new.example.com');
  assert.strictEqual(reconcileSubscriptionSelection(old,[fresh]),null);
});
