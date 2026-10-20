import test from 'node:test';
import assert from 'node:assert/strict';
import {toSingBoxRealityOutbound,ConfigUnsupportedError} from '../services/control-plane/singbox-reality-adapter.mjs';
const original='vless://123e4567-e89b-42d3-a456-426614174000@vpn.example.org:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome';
test('translates explicit TCP Reality shape to in-memory outbound',()=>{
 const config=toSingBoxRealityOutbound(original);
 assert.equal(config.type,'vless');
 assert.equal(config.server_port,443);
 assert.equal(config.tls.reality.enabled,true);
 assert.equal(config.tls.utls.fingerprint,'chrome');
 assert.equal(config.transport,undefined);
});
test('supports explicit gRPC service name only',()=>{
 const grpc=original.replace('type=tcp','type=grpc')+'&serviceName=grpc';
 assert.equal(toSingBoxRealityOutbound(grpc).transport.service_name,'grpc');
 assert.throws(()=>toSingBoxRealityOutbound(grpc.replace('&serviceName=grpc','')),e=>e.code==='GRPC_SERVICE_MISSING');
});
test('rejects unreviewed parameters and unsupported flows',()=>{
 assert.throws(()=>toSingBoxRealityOutbound(original+'&allowInsecure=1'),e=>e instanceof ConfigUnsupportedError&&e.code==='PARAMETER_UNREVIEWED');
 assert.throws(()=>toSingBoxRealityOutbound(original+'&flow=unknown'),e=>e.code==='FLOW_UNSUPPORTED');
 assert.throws(()=>toSingBoxRealityOutbound(original.replace('&type=tcp','')),e=>e.code==='TRANSPORT');
});
