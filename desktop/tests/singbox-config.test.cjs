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
 assert.throws(()=>buildSingBoxConfig(p),/Only VLESS TCP REALITY/);
 p.outbounds[0].streamSettings.network='tcp';
 delete p.outbounds[0].streamSettings.realitySettings.publicKey;
 assert.throws(()=>buildSingBoxConfig(p));
});
test('never silently accepts ambiguous multi-server profile',()=>{
 const p=sample();p.outbounds[0].settings.vnext.push(p.outbounds[0].settings.vnext[0]);
 assert.throws(()=>buildSingBoxConfig(p),/exactly one/);
});
