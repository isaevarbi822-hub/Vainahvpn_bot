import test from 'node:test';
import assert from 'node:assert/strict';
import {h1CreatePayload} from '../netlify/functions/lib/h1-fulfillment.mjs';

test('H1Cloud creation uses obligatory days; absent inbound IDs allow default panel channels',()=>{
  const p=h1CreatePayload({name:'tg123456789',days:30,inboundIds:[],deviceLimit:3});
  assert.deepEqual(p,{name:'tg123456789',days:30,device_limit:3});
  assert.equal('expires_at' in p,false);
});
test('custom inbound IDs are applied only if explicitly supplied',()=>{
  const p=h1CreatePayload({name:'tg123456789',days:90,inboundIds:['44','45'],
    deviceLimit:3,trafficLimitGb:100});
  assert.equal(p.days,90);
  assert.deepEqual(p.inbound_ids,['44']);
  assert.deepEqual(p.channels,[]);
  assert.equal(p.traffic_limit_gb,100);
});
test('H1 creation refuses untrusted names or nonsensical periods/inbound IDs',()=>{
  assert.throws(()=>h1CreatePayload({name:'../../bad',days:30}));
  assert.throws(()=>h1CreatePayload({name:'tg123456789',days:0}));
  assert.throws(()=>h1CreatePayload({name:'tg123456789',days:30,inboundIds:['../../']}));
});
