'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectSubscriptionText,PUBLIC_CAPABILITIES}=require('../shared/h1-protocol.cjs');
const common='vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=';
test('Windows and macOS parser detects all H1Cloud Reality transports',()=>{
 const result=inspectSubscriptionText(['tcp','grpc','xhttp'].map(x=>common+x).join('\n'));
 assert.deepEqual(result,{profiles:3,realityProfiles:3,transports:['tcp','grpc','xhttp']});
 assert.equal(PUBLIC_CAPABILITIES.vpnEngineReady,false);
});
test('base64 subscriptions recognized but raw credentials never returned',()=>{
 const result=inspectSubscriptionText(Buffer.from(common+'tcp').toString('base64'));
 assert.deepEqual(result.transports,['tcp']);
 assert.doesNotMatch(JSON.stringify(result),/123e|vpn.invalid/);
});
test('unknown type is not silently treated as TCP',()=>{
 assert.deepEqual(inspectSubscriptionText(common+'other').transports,[]);
});
test('unbounded or malformed input rejected',()=>{
 assert.throws(()=>inspectSubscriptionText('A'.repeat(256*1024+1)),/SUBSCRIPTION_FORMAT_UNAVAILABLE/);
 assert.throws(()=>inspectSubscriptionText('❤'),/SUBSCRIPTION_FORMAT_UNAVAILABLE/);
});
