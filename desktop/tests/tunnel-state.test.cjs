'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {TunnelState,STATES,cleanReason}=require('../shared/tunnel-state.cjs');
const proof=Object.freeze({upstreamEncrypted:true,packetsForwarded:true,routesVerified:true,dnsVerified:true,ipv6PolicyVerified:true});

test('preview remains unavailable and can never claim traffic protection',()=>{
 const s=new TunnelState();
 assert.deepEqual(STATES,['unavailable','disconnected','connecting','connected','reconnecting','disconnecting','error']);
 assert.equal(s.begin(),null);
 assert.equal(s.status.protected,false);
 assert.equal(s.verifiedOnline(0,proof),false);
 assert.equal(s.status.state,'unavailable');
});
test('requires explicit proof of encrypted forwarding, DNS and routing',()=>{
 const s=new TunnelState({engineAvailable:true}),id=s.begin();
 assert.equal(s.status.state,'connecting');
 for(const key of Object.keys(proof)){
  assert.equal(s.verifiedOnline(id,{...proof,[key]:false}),false,key);
  assert.equal(s.status.protected,false);
 }
 assert.equal(s.verifiedOnline(id-1,proof),false);
 assert.equal(s.verifiedOnline(id,proof),true);
 assert.equal(s.status.protected,true);
 assert.equal(s.linkLost(id),true);
 assert.equal(s.status.protected,false);
 assert.equal(s.verifiedOnline(id,proof),true);
});
test('disconnect revokes late tunnel success and requires confirmed stop',()=>{
 const s=new TunnelState({engineAvailable:true}),id=s.begin();
 const stop=s.disconnect();
 assert.equal(s.status.protected,false);
 assert.equal(s.verifiedOnline(id,proof),false);
 assert.equal(s.stopped(id),false);
 assert.equal(s.stopped(stop),true);
 assert.equal(s.status.state,'disconnected');
});
test('failure is fail-closed and secrets cannot appear in status',()=>{
 const s=new TunnelState({engineAvailable:true}),id=s.begin();
 assert.equal(s.fail(id,'https://example.com/profile?token=private'),true);
 assert.equal(s.status.protected,false);
 assert.doesNotMatch(s.status.reason,/private|example/);
 assert.equal(s.fail(id,'other'),false);
 assert.equal(s.begin(),id+1);
 assert.equal(s.verifiedOnline(id,proof),false);
 assert.equal(cleanReason('bad\nmessage'),'bad message');
});
