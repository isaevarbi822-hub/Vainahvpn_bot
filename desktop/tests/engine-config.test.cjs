'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateTcpReality,fromSubscriptionText,toTunConfig,loadSubscription}=require('../shared/engine-config.cjs');
const {EngineHost}=require('../src/engine-host.cjs');
const uri='vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome';
test('TCP Reality profile becomes privacy-preserving full-route TUN settings',()=>{
 const outbound=validateTcpReality(uri);
 assert.equal(outbound.type,'vless');
 assert.equal(outbound.tls.reality.enabled,true);
 for(const platform of ['win32','darwin']){
  const config=toTunConfig(outbound,platform);
  assert.equal(config.inbounds[0].auto_route,true);
  assert.equal(config.route.final,'vainah-primary');
  assert.equal(config.dns.final,'private-dns');
  assert.equal(config.dns.servers[1].detour,'vainah-primary');
  assert.equal(config.outbounds[0].tls.reality.public_key,'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
 }
});
test('multiple or unknown query fields fail closed',()=>{
 assert.throws(()=>validateTcpReality(uri+'&security=none'),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateTcpReality(uri.replace('type=tcp','type=xhttp')),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateTcpReality(uri+'&allowInsecure=1'),/PROFILE_UNSUPPORTED/);
});
test('subscription parser selects only supported TCP Reality, not gRPC or XHTTP',()=>{
 const grpc=uri.replace('type=tcp','type=grpc');
 const xhttp=uri.replace('type=tcp','type=xhttp');
 assert.equal(fromSubscriptionText([grpc,xhttp,uri].join('\n')).type,'vless');
 assert.equal(fromSubscriptionText(Buffer.from([grpc,uri].join('\n')).toString('base64')).type,'vless');
 assert.throws(()=>fromSubscriptionText([grpc,xhttp].join('\n')),/TCP_REALITY_NOT_FOUND/);
});
test('private subscription loader refuses redirects and unsafe credentials',async()=>{
 await assert.rejects(loadSubscription('http://vpn.invalid/t'),/SUBSCRIPTION_INVALID/);
 await assert.rejects(loadSubscription('https://admin:secret@vpn.invalid/t'),/SUBSCRIPTION_INVALID/);
 await assert.rejects(loadSubscription('https://vpn.invalid/t#token'),/SUBSCRIPTION_INVALID/);
 let opts;
 await assert.rejects(loadSubscription('https://vpn.invalid/t',async(_url,options)=>{
  opts=options;throw Error('network unavailable');
 }),/SUBSCRIPTION_FAILED/);
 assert.equal(opts.redirect,'error');
 assert.equal(opts.cache,'no-store');
});
test('unverified OS process is never marked protected',()=>{
 const host=new EngineHost('win32');
 assert.equal(host.status().protected,false);
 assert.equal(host.status().state,'unavailable');
 assert.deepEqual(host.setExecutable('/tmp/malicious-script.sh'),{ok:false,code:'INVALID_EXECUTABLE'});
 assert.deepEqual(host.stop(),{ok:true,verified:false});
 assert.equal(host.status().protected,false);
});
