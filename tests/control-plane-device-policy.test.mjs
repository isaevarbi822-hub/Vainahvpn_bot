import test from 'node:test';
import assert from 'node:assert/strict';
import {canRegisterDevice,canRevokeDevice,mayIssueProfile,PolicyError} from '../services/control-plane/device-policy.mjs';
const account='123e4567-e89b-42d3-a456-426614174000';
const another='123e4567-e89b-42d3-a456-426614174001';
const deviceId='123e4567-e89b-42d3-a456-426614174002';
const nextId='123e4567-e89b-42d3-a456-426614174003';
const now=1_800_000_000_000;
const identity={accountId:account,verified:true};
const entitlement={accountId:account,status:'active',deviceLimit:1,expiresAt:now+10000};
const device={deviceId,accountId:account,platform:'ios',revokedAt:null};
const call=extra=>canRegisterDevice({identity,entitlement,devices:[],deviceId,platform:'ios',now,...extra});
function rejected(fn,code){assert.throws(fn,e=>e instanceof PolicyError&&e.code===code)}
test('requires verified server identity',()=>{
 rejected(()=>call({identity:{accountId:account,verified:false}}),'AUTH_REQUIRED');
 rejected(()=>call({identity:{accountId:'a',verified:true}}),'AUTH_REQUIRED');
});
test('rejects foreign, expired and unpaid entitlements',()=>{
 rejected(()=>call({entitlement:{...entitlement,accountId:another}}),'ENTITLEMENT_REQUIRED');
 rejected(()=>call({entitlement:{...entitlement,expiresAt:now}}),'ENTITLEMENT_REQUIRED');
 rejected(()=>call({entitlement:{...entitlement,status:'pending'}}),'ENTITLEMENT_REQUIRED');
});
test('limits devices and handles idempotent registration',()=>{
 assert.deepEqual(call({devices:[device]}),{allowed:true,alreadyRegistered:true});
 rejected(()=>call({devices:[device],deviceId:nextId}),'DEVICE_LIMIT');
 assert.equal(call({devices:[{...device,revokedAt:now}],deviceId:nextId}).allowed,true);
 rejected(()=>call({platform:'unknown'}),'INVALID_REQUEST');
});
test('foreign devices may neither be revoked nor issued a VPN profile',()=>{
 rejected(()=>canRevokeDevice({identity,device:{...device,accountId:another}}),'NOT_FOUND');
 rejected(()=>mayIssueProfile({identity,entitlement,device:{...device,accountId:another},now}),'DEVICE_NOT_AUTHORIZED');
 rejected(()=>mayIssueProfile({identity,entitlement,device:{...device,revokedAt:now},now}),'DEVICE_NOT_AUTHORIZED');
 assert.equal(mayIssueProfile({identity,entitlement,device,now}).allowed,true);
 assert.equal(canRevokeDevice({identity,device}).deviceId,deviceId);
});
