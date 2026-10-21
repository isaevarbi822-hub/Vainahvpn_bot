'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SingBoxSession}=require('../shared/singbox-session.cjs');
test('new native session never claims VPN protection',()=>{
 const session=new SingBoxSession();
 assert.deepEqual(session.status,{state:'stopped',protected:false});
});
test('stop before start is safe and idempotent',async()=>{
 const session=new SingBoxSession();
 assert.deepEqual(await session.stop(),{ok:true,protected:false});
 assert.deepEqual(await session.stop(),{ok:true,protected:false});
});
test('invalid engine cannot enter connected state',async()=>{
 const session=new SingBoxSession();
 const result=await session.start('not-absolute','{}');
 assert.equal(result.ok,false);
 assert.deepEqual(session.status,{state:'stopped',protected:false});
});
