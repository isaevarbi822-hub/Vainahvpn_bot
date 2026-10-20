import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightVlessReality} from '../services/control-plane/reality-compat.mjs';
const base='vless://123e4567-e89b-42d3-a456-426614174000@vpn.example.org:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome';
test('accepts Reality shaped config without returning any credentials',()=>{
 const r=preflightVlessReality(base);
 assert.deepEqual(r,{compatible:true,protocol:'vless-reality',transport:'tcp',verifiedTunnel:false});
 assert.doesNotMatch(JSON.stringify(r),/123e|vpn.example|www.example|AAAA|abcd/);
});
test('rejects insecure and incompatible parameters',()=>{
 const changes=[
  ['security=reality','security=none','SECURITY'],
  ['pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','pbk=short','KEY'],
  ['type=tcp','type=ws','TRANSPORT'],
  ['sid=abcd','sid=abc','SHORT_ID'],
  ['fp=chrome','fp=random','FINGERPRINT']
 ];
 for(const [from,to,code] of changes)assert.equal(preflightVlessReality(base.replace(from,to)).code,code);
 assert.equal(preflightVlessReality(base.replace('sni=www.example.org','sni=')).code,'SERVER_NAME');
 assert.equal(preflightVlessReality('https://example.org/access').compatible,false);
});
test('sanitized errors never reflect private configuration',()=>{
 const result=preflightVlessReality(base.replace('security=reality','security=token_SECRET'));
 assert.equal(result.compatible,false);
 assert.doesNotMatch(JSON.stringify(result),/SECRET|123e|vpn.example/);
});

test('missing Reality transport is not guessed',()=>{
 const result=preflightVlessReality(base.replace('&type=tcp',''));
 assert.equal(result.compatible,false);
 assert.equal(result.code,'TRANSPORT');
});
