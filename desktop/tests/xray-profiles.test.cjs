'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseXrayProfiles } = require('../shared/xray-profiles.cjs');
const profile = (network='tcp') => ({
  tag:'Germany', protocol:'vless',
  settings:{vnext:[{address:'example.invalid',port:443,users:[{id:'invented-test-only'}]}]},
  streamSettings:{network,security:'reality',realitySettings:{publicKey:'not-a-real-key'}}
});
test('extracts supported transports without credentials',()=>{
  const result=parseXrayProfiles(JSON.stringify({outbounds:['tcp','grpc','xhttp'].map(profile)}));
  assert.deepEqual(result.map(x=>x.transport),['tcp','grpc','xhttp']);
  for(const secret of ['example.invalid','invented-test-only','not-a-real-key'])
    assert.ok(!JSON.stringify(result).includes(secret));
});
test('handles multiple server entries',()=>{
  const p=profile();p.settings.vnext.push({address:'other.invalid',port:443,users:[{id:'test'}]});
  assert.equal(parseXrayProfiles(JSON.stringify({outbounds:[p]})).length,2);
});
test('never exposes suspicious tag data',()=>{
  const p=profile();p.tag='https://example.invalid/secret';
  assert.equal(parseXrayProfiles(JSON.stringify({outbounds:[p]}))[0].name,'VLESS profile');
});
test('requires a REALITY public key and valid user',()=>{
  const p=profile();delete p.streamSettings.realitySettings.publicKey;
  assert.deepEqual(parseXrayProfiles(JSON.stringify({outbounds:[p]})),[]);
  p.streamSettings.realitySettings.publicKey='sample';p.settings.vnext[0].users=[];
  assert.deepEqual(parseXrayProfiles(JSON.stringify({outbounds:[p]})),[]);
});
test('ignores unrecognized protocols and transports',()=>{
  const p=profile();p.protocol='freedom';
  assert.deepEqual(parseXrayProfiles(JSON.stringify({outbounds:[p,profile('ws')]})),[]);
});
test('rejects malformed document and unsupported schemas',()=>{
  for(const s of ['not-json','[]','{}','{"outbounds":null}'])
    assert.throws(()=>parseXrayProfiles(s));
});
test('limits oversized inputs and entry count',()=>{
  assert.throws(()=>parseXrayProfiles(' '.repeat(1024*1024+1)));
  assert.throws(()=>parseXrayProfiles(JSON.stringify({outbounds:Array(129).fill(profile())})));
});
