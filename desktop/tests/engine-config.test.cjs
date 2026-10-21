'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validateTcpReality,validateGrpcReality,fromSubscriptionText,toTunConfig,loadSubscription}=require('../shared/engine-config.cjs');
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
 assert.equal(validateTcpReality(uri+'&encryption=none&headerType=none').type,'vless');
 assert.equal(validateTcpReality(uri+'&spx=%2F').type,'vless');
 assert.throws(()=>validateTcpReality(uri+'&spx=%2Fprivate'),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateTcpReality(uri+'&encryption=aes-128-gcm'),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateTcpReality(uri+'&headerType=http'),/PROFILE_UNSUPPORTED/);
});
test('subscription parser prefers TCP, falls back to real gRPC and never substitutes XHTTP',()=>{
 const grpc=uri.replace('type=tcp','type=grpc')+'&serviceName=vainah-service';
 const xhttp=uri.replace('type=tcp','type=xhttp');
 assert.equal(fromSubscriptionText([grpc,xhttp,uri].join('\n')).transport,undefined);
 assert.equal(fromSubscriptionText(Buffer.from([grpc,uri].join('\n')).toString('base64')).transport,undefined);
 assert.deepEqual(fromSubscriptionText([grpc,xhttp].join('\n')).transport,{
  type:'grpc',service_name:'vainah-service'
 });
 assert.throws(()=>fromSubscriptionText(xhttp),/REALITY_SUPPORTED_TRANSPORT_NOT_FOUND/);
 assert.throws(()=>validateTcpReality(grpc),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateGrpcReality(uri),/PROFILE_UNSUPPORTED/);
});
test('H1Cloud sing-box JSON with reviewed TCP and gRPC Reality profiles uses the same strict validator',()=>{
 const tcp=validateTcpReality(uri);
 const grpc=validateGrpcReality(uri.replace('type=tcp','type=grpc')+'&serviceName=vainah-svc');
 const json=JSON.stringify({outbounds:[grpc,tcp]});
 const choice=fromSubscriptionText(json);
 assert.equal(choice.type,'vless');
 assert.equal(choice.transport,undefined);
 assert.equal(choice.tls.reality.public_key,tcp.tls.reality.public_key);
 assert.equal(choice.uuid,tcp.uuid);
 assert.deepEqual(fromSubscriptionText(JSON.stringify({outbounds:[grpc]})).transport,{
  type:'grpc',service_name:'vainah-svc'
 });
});
test('JSON H1Cloud subscriptions fail closed on weak TLS, missing Reality or unsupported transport',()=>{
 const base=validateTcpReality(uri);
 const cases=[
  {...base,tls:{...base.tls,reality:{enabled:false}}},
  {...base,tls:{...base.tls,insecure:true}},
  {...base,transport:{type:'xhttp',path:'/test'}},
  {...base,type:'trojan'},
  {...base,uuid:'not-a-uuid'},
  {...base,tls:{...base.tls,reality:{enabled:true,public_key:'bad'}}}
 ];
 for(const invalid of cases){
  assert.throws(()=>fromSubscriptionText(JSON.stringify({outbounds:[invalid]})),
    /SUBSCRIPTION_JSON_UNSUPPORTED|REALITY_SUPPORTED_TRANSPORT_NOT_FOUND/);
 }
 assert.throws(()=>fromSubscriptionText(JSON.stringify({proxies:[base]})),
  /SUBSCRIPTION_JSON_UNSUPPORTED/);
 assert.throws(()=>fromSubscriptionText('<html>login required</html>'),/SUBSCRIPTION_FORMAT_UNSUPPORTED/);
});
test('gRPC Reality generates a separate full-route config with pinned TLS security',()=>{
 const grpc=uri.replace('type=tcp','type=grpc')+'&serviceName=h1-grpc';
 const outbound=validateGrpcReality(grpc);
 assert.deepEqual(outbound.transport,{type:'grpc',service_name:'h1-grpc'});
 assert.equal(outbound.tls.reality.enabled,true);
 for(const platform of ['win32','darwin']){
  const config=toTunConfig(outbound,platform);
  assert.deepEqual(config.outbounds[0].transport,outbound.transport);
  assert.equal(config.route.final,'vainah-primary');
  assert.equal(config.dns.final,'private-dns');
  assert.equal(config.inbounds[0].auto_route,true);
 }
 assert.throws(()=>validateGrpcReality(grpc+'&serviceName=other'),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateGrpcReality(grpc+'&flow=xtls-rprx-vision'),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateGrpcReality(grpc.replace('serviceName=h1-grpc','serviceName=')),/PROFILE_UNSUPPORTED/);
 assert.throws(()=>validateGrpcReality(grpc+'&allowInsecure=true'),/PROFILE_UNSUPPORTED/);
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
