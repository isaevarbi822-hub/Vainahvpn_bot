'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildSingBoxConfig}=require('../shared/singbox-config.cjs');
const sample=()=>({outbounds:[{protocol:'vless',
 settings:{vnext:[{address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]}]},
 streamSettings:{network:'tcp',security:'reality',realitySettings:{serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'}}}]});
test('translates offline TCP REALITY profile into tun config',()=>{
 const c=buildSingBoxConfig(sample());
 assert.equal(c.inbounds[0].type,'tun');
 assert.equal(c.inbounds[0].strict_route,true);
 assert.equal(c.outbounds[0].tls.reality.short_id,'a1b2');
 assert.equal(c.route.final,'vainah-proxy');
});
test('refuses unsupported transport and missing parameters',()=>{
 const p=sample();p.outbounds[0].streamSettings.network='grpc';
 assert.throws(()=>buildSingBoxConfig(p),/VLESS outbound required/);
 p.outbounds[0].streamSettings.network='tcp';
 delete p.outbounds[0].streamSettings.realitySettings.publicKey;
 assert.throws(()=>buildSingBoxConfig(p));
});
test('never silently accepts ambiguous multi-server profile',()=>{
 const p=sample();p.outbounds[0].settings.vnext.push(p.outbounds[0].settings.vnext[0]);
 assert.throws(()=>buildSingBoxConfig(p),/exactly one/);
});

test('auto-selects VLESS TCP REALITY even when direct outbound comes first',()=>{
 const p=sample();
 p.outbounds.unshift({protocol:'freedom',tag:'direct'});
 const result=buildSingBoxConfig(p);
 assert.equal(result.outbounds[0].server,'example.invalid');
 assert.equal(result.outbounds[0].type,'vless');
});
test('refuses missing supported VLESS outbound without fallback to direct',()=>{
 const p=sample();
 p.outbounds[0].streamSettings.network='grpc';
 assert.throws(()=>buildSingBoxConfig(p),/VLESS outbound required/);
});

test('desktop DNS and both IP families are routed through the VLESS engine',()=>{
 const cfg=buildSingBoxConfig(sample());
 assert.equal(cfg.inbounds[0].dns_mode,'hijack');
 assert.equal(cfg.inbounds[0].strict_route,true);
 assert.ok(cfg.inbounds[0].address.some(x=>x.includes(':')));
 assert.equal(cfg.dns.final,'vpn-doh');
 const remote=cfg.dns.servers.find(x=>x.tag==='vpn-doh');
 assert.equal(remote.type,'https');
 assert.equal(remote.detour,'vainah-proxy');
 assert.equal(remote.tls.server_name,'cloudflare-dns.com');
 assert.equal(cfg.outbounds[0].domain_resolver,'bootstrap-only');
 assert.deepEqual(cfg.route.rules,[{port:53,action:'hijack-dns'}]);
 assert.equal(cfg.route.final,'vainah-proxy');
 assert.equal(cfg.outbounds.some(x=>x.type==='direct'),false);
});
