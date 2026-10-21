'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseXrayProfiles } = require('../shared/xray-profiles.cjs');

const profile = (network='tcp') => ({
  tag:'Germany', protocol:'vless',
  settings:{vnext:[{address:'example.invalid',port:443,users:[{id:'invented-test-only'}]}]},
  streamSettings:{network,security:'reality',realitySettings:{publicKey:'not-a-real-key'}}
});
test('extracts nonsecret TCP, gRPC and XHTTP metadata', () => {
  const input = JSON.stringify({outbounds:[profile('tcp'),profile('grpc'),profile('xhttp')]});
  const got = parseXrayProfiles(input);
  assert.deepEqual(got.map(p => p.transport),['tcp','grpc','xhttp']);
  assert.ok(!JSON.stringify(got).includes('example.invalid'));
  assert.ok(!JSON.stringify(got).includes('invented-test-only'));
});
test('ignores unrecognized protocols and transports', () => {
  const other = profile();other.protocol='freedom';
  assert.deepEqual(parseXrayProfiles(JSON.stringify({outbounds:[other,profile('ws')]})),[]);
});
test('rejects unrecognized document shapes and malformed input', () => {
  for (const v of ['not-json','[]','{}','{"outbounds":null}'])
    assert.throws(()=>parseXrayProfiles(v));
});
test('enforces a bounded number of input entries',()=>{
  assert.throws(()=>parseXrayProfiles(JSON.stringify({outbounds:Array(129).fill(profile())})));
});
