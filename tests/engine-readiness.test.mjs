import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_CHECKS,evaluateEngineReadiness,safeConnectionState} from '../services/control-plane/engine-readiness.mjs';
test('all six independent verifications must pass',()=>{
 const valid=Object.fromEntries(REQUIRED_CHECKS.map(x=>[x,true]));
 assert.equal(evaluateEngineReadiness(valid).ready,true);
 for(const key of REQUIRED_CHECKS){
  const result=evaluateEngineReadiness({...valid,[key]:false});
  assert.equal(result.ready,false);
  assert.deepEqual(result.missing,[key]);
 }
});
test('no profile, session or account alone can claim VPN protection',()=>{
 const yes={engineReady:true,tunnelAlive:true,sessionValid:true,entitlementActive:true};
 assert.equal(safeConnectionState(yes).protected,true);
 for(const name of Object.keys(yes))
  assert.equal(safeConnectionState({...yes,[name]:false}).protected,false);
 assert.equal(safeConnectionState().protected,false);
});
