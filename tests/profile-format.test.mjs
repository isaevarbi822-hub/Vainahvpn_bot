import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyProfileShape} from '../services/control-plane/profile-format.mjs';
test('classifies HTTPS subscriptions without emitting bearer paths',()=>{
 const secret='https://panel.example/private/VERY_PRIVATE_TOKEN?token=MORE_SECRET';
 const result=classifyProfileShape(secret);
 assert.deepEqual(result,{kind:'https-subscription',supported:false});
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE|SECRET|panel/);
});
test('recognizes VLESS URI shape but never treats it as a working engine',()=>{
 const uri='vless://123e4567-e89b-42d3-a456-426614174000@example.net:443?security=reality&type=grpc&sni=private.example#user-label';
 const result=classifyProfileShape(uri);
 assert.deepEqual(result,{kind:'vless-uri',supported:false,encryptedTransportDeclared:true,transportKind:'grpc'});
 assert.doesNotMatch(JSON.stringify(result),/example|123e|user-label/);
});
test('rejects unsafe or malformed config input',()=>{
 for(const input of [null,{},'', 'http://example.net/key','https://user:pass@example.net/', 'https://example.net/#secret','vless://bad@example.net:443','file:///etc/passwd','https://example.net/\nAuthorization:secret','x'.repeat(8193)]){
  assert.equal(classifyProfileShape(input).supported,false);
  assert.notEqual(classifyProfileShape(input).kind,'https-subscription');
 }
});
