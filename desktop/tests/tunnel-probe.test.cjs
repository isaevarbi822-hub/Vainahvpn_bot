'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {probeOutbound,reachability}=require('../src/tunnel-probe.cjs');

function fakeClient(responseCode){
  return {get:(_options,callback)=>{
    const request=new EventEmitter();
    request.destroy=()=>{};
    process.nextTick(()=>{
      const response={statusCode:responseCode,resume:()=>{}};
      callback(response);
    });
    return request;
  }};
}
test('IPv4 and IPv6 diagnostic probes never claim VPN protection',async()=>{
 const engine={status:()=>({state:'running'})};
 const result=await probeOutbound(engine,fakeClient(200));
 assert.deepEqual(result,{
   attempted:true,ipv4:true,ipv6:true,dnsLeakChecked:false,vpnVerified:false
 });
 assert.equal(Object.isFrozen(result),true);
 assert.equal('publicIp' in result,false);
});
test('unstarted core never probes or claims route or DNS verification',async()=>{
 const state={status:()=>({state:'ready'})};
 const result=await probeOutbound(state,{get:()=>{throw Error('unwanted request')}});
 assert.deepEqual(result,{attempted:false,ipv4:false,ipv6:false,dnsLeakChecked:false,vpnVerified:false});
});
test('HTTP failures and network errors do not mean verified VPN',async()=>{
 assert.equal(await reachability({family:4},fakeClient(503)),false);
 const unavailable={get:()=>{throw Error('network unavailable')}};
 const result=await probeOutbound({status:()=>({state:'running'})},unavailable);
 assert.equal(result.ipv4,false);
 assert.equal(result.ipv6,false);
 assert.equal(result.vpnVerified,false);
});
