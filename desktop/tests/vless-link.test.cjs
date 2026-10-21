'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {vlessUriToXray}=require('../shared/vless-link.cjs');
const {buildSingBoxConfig}=require('../shared/singbox-config.cjs');
const sample='vless://12345678-1234-1234-1234-123456789abc@example.invalid:443?security=reality&type=tcp&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sid=a1b2&sni=example.com&fp=chrome&flow=xtls-rprx-vision#Germany';
test('VLESS REALITY TCP link is converted to Xray and sing-box formats',()=>{
 const x=vlessUriToXray(sample);
 const config=buildSingBoxConfig(x);
 assert.equal(config.outbounds[0].server,'example.invalid');
 assert.equal(config.outbounds[0].server_port,443);
 assert.equal(config.outbounds[0].flow,'xtls-rprx-vision');
 assert.equal(config.outbounds[0].tls.reality.short_id,'a1b2');
});
test('does not follow or fetch subscription links',()=>{
 for(const url of ['https://example.com/sub','vless://wrong','javascript:alert(1)'])
   assert.throws(()=>vlessUriToXray(url));
});
test('rejects unsupported transport',()=>{
 assert.throws(()=>vlessUriToXray(sample.replace('type=tcp','type=grpc')));
});
