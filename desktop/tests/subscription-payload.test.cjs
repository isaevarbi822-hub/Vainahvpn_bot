'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSubscriptionBody}=require('../shared/subscription-payload.cjs');
const link='vless://12345678-1234-1234-1234-123456789abc@de.example.com:443?security=reality&type=raw&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sid=a1b2&sni=example.com&fp=chrome#Germany';
const sing={type:'vless',tag:'Germany',server:'de.example.com',server_port:443,
  uuid:'12345678-1234-1234-1234-123456789abc',
  tls:{enabled:true,server_name:'example.com',utls:{fingerprint:'chrome'},
    reality:{enabled:true,public_key:'AbCdEfGhIjKlMnOpQrStUvWxYz012345',short_id:'a1b2'}}};
const xray={protocol:'vless',tag:'Germany',settings:{vnext:[{address:'de.example.com',port:443,
  users:[{id:'12345678-1234-1234-1234-123456789abc',flow:'xtls-rprx-vision'}]}]},
  streamSettings:{network:'raw',security:'reality',realitySettings:{
    publicKey:'AbCdEfGhIjKlMnOpQrStUvWxYz012345',serverName:'example.com',shortId:'a1b2'}}};
test('plain VLESS list with UTF8 BOM supports raw/TCP',()=>{
 const out=parseSubscriptionBody('\uFEFF'+link+'\r\n');
 assert.equal(out.count,1);
 assert.equal(out.profiles[0].outbounds[0].settings.vnext[0].address,'de.example.com');
});
test('padded, unpadded and urlsafe base64 VLESS feeds',()=>{
 for(const value of [Buffer.from(link).toString('base64'),
    Buffer.from(link).toString('base64').replace(/=+$/,''),
    Buffer.from(link).toString('base64url')]){
   assert.equal(parseSubscriptionBody(value).count,1);
 }
});
test('base64-wrapped sing-box JSON import and direct sing-box JSON',()=>{
 const text=JSON.stringify({outbounds:[sing]});
 for(const value of [text,Buffer.from(text).toString('base64url')]){
  const data=parseSubscriptionBody(value);
  assert.equal(data.count,1);
  assert.equal(data.profiles[0].outbounds[0].streamSettings.security,'reality');
 }
});
test('H1-compatible JSON profile structures',()=>{
 for(const doc of [
  [link],
  {servers:[link]},
  {links:[{uri:link}]},
  {nodes:[{link}]},
  {profiles:[xray]},
  {outbounds:[sing,xray]},
  {profiles:[{outbounds:[sing,xray]}]}
 ]){
  const out=parseSubscriptionBody(JSON.stringify(doc));
  assert.equal(out.count,doc.outbounds?.length===2?2:doc.profiles?.[0]?.outbounds?.length===2?2:1);
 }
});
test('rejects HTML, garbage, unsupported VLESS transport and huge responses',()=>{
 for(const data of ['<html>login</html>','garbage',
    'vless://abc@server:443?security=tls',
    JSON.stringify({outbounds:[{type:'vmess',server:'example.com'}]})]){
  assert.throws(()=>parseSubscriptionBody(data));
 }
 assert.throws(()=>parseSubscriptionBody('x'.repeat(262145)),/too large/);
});
test('imports only supported identities and never emits arbitrary tokens as names',()=>{
 const payload=JSON.stringify({links:[
    'vless://ATTACKER@local.invalid:123?security=reality&type=tcp',
    link]});
 const out=parseSubscriptionBody(payload);
 assert.equal(out.count,1);
 assert.doesNotMatch(JSON.stringify(out),/ATTACKER/);
});
