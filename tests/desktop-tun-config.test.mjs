import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesktopTunConfig} from '../services/control-plane/desktop-tun-config.mjs';
import {selectTcpRealityProfile,fetchPrivateSubscription} from '../desktop/scripts/h1-select-profile.mjs';
const tcp='vless://123e4567-e89b-42d3-a456-426614174000@vpn.example.org:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome';
const grpc=tcp.replace('type=tcp','type=grpc')+'&serviceName=srv';
test('creates full TCP Reality TUN config for Windows and macOS',()=>{
 for(const os of ['win32','darwin']){
  const c=createDesktopTunConfig(tcp,os);
  assert.equal(c.inbounds[0].type,'tun');
  assert.equal(c.inbounds[0].auto_route,true);
  assert.equal(c.inbounds[0].dns_mode,'hijack');
  assert.equal(c.route.auto_detect_interface,true);
  assert.equal(c.route.final,'vainah-primary');
  assert.equal(c.outbounds[0].tls.reality.enabled,true);
  assert.equal(c.dns.final,'private-dns');
  assert.equal(c.dns.servers[1].detour,'vainah-primary');
  assert.equal(c.inbounds[0].strict_route,os==='win32'?true:undefined);
 }
});
test('selects TCP only, never substitutes gRPC/XHTTP or claims protection',()=>{
 const found=selectTcpRealityProfile([grpc,tcp].join('\n'));
 assert.equal(found,tcp);
 assert.throws(()=>selectTcpRealityProfile(grpc),/TCP_REALITY_PROFILE_NOT_FOUND/);
 assert.throws(()=>selectTcpRealityProfile(tcp.replace('type=tcp','type=xhttp')),/TCP_REALITY_PROFILE_NOT_FOUND/);
 assert.throws(()=>createDesktopTunConfig(grpc,'win32'),/TRANSPORT_NOT_TESTED/);
 assert.throws(()=>createDesktopTunConfig(tcp,'linux'),/PLATFORM_UNSUPPORTED/);
 const config=createDesktopTunConfig(tcp,'win32');
 assert.equal('protected' in config,false);
});
test('supports subscription base64 without returning private URLs in public summaries',()=>{
 const encoded=Buffer.from([grpc,tcp].join('\n')).toString('base64');
 assert.equal(selectTcpRealityProfile(encoded),tcp);
 assert.throws(()=>selectTcpRealityProfile('!bad!'),/PROFILE_NOT_SUPPORTED/);
});
test('rejects unsafe subscription address before fetch',async()=>{
 await assert.rejects(fetchPrivateSubscription('http://example.org/private'),/SUBSCRIPTION_INVALID/);
 await assert.rejects(fetchPrivateSubscription('https://user:pass@example.org/path'),/SUBSCRIPTION_INVALID/);
 await assert.rejects(fetchPrivateSubscription('https://example.org/key#fragment'),/SUBSCRIPTION_INVALID/);
});
