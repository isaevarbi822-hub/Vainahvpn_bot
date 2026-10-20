/**
 * Pure authorization policy for the future Vainah VPN device registry.
 * Not an HTTP endpoint and not wired to production databases.
 * Identity and entitlement MUST come from verified server-side sources.
 */
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM=new Set(['android','ios','windows','macos']);
export class PolicyError extends Error {
  constructor(code){super(code);this.name='PolicyError';this.code=code;}
}
function validId(value){return typeof value==='string'&&ID.test(value);}
function requireIdentity(identity){
 if(!identity||!validId(identity.accountId)||identity.verified!==true)throw new PolicyError('AUTH_REQUIRED');
 return identity.accountId.toLowerCase();
}
function authorizedEntitlement(entitlement,accountId,now){
 if(!entitlement||entitlement.accountId?.toLowerCase()!==accountId||
    entitlement.status!=='active'||!Number.isSafeInteger(entitlement.deviceLimit)||
    entitlement.deviceLimit<1||entitlement.deviceLimit>100||
    !Number.isSafeInteger(entitlement.expiresAt)||entitlement.expiresAt<=now)
    throw new PolicyError('ENTITLEMENT_REQUIRED');
 return entitlement.deviceLimit;
}
/**
 * Returns a decision only, never stores data. Caller must transactionally
 * lock account/device rows and enforce the same checks within the DB commit.
 */
export function canRegisterDevice({identity,entitlement,devices,deviceId,platform,now=Date.now()}){
 const accountId=requireIdentity(identity);
 const limit=authorizedEntitlement(entitlement,accountId,now);
 if(!validId(deviceId)||!PLATFORM.has(platform)||!Array.isArray(devices))
  throw new PolicyError('INVALID_REQUEST');
 const owned=devices.filter(d=>d.accountId?.toLowerCase()===accountId&&d.revokedAt==null);
 if(owned.some(d=>d.deviceId?.toLowerCase()===deviceId.toLowerCase()))
  return Object.freeze({allowed:true,alreadyRegistered:true});
 if(owned.length>=limit)throw new PolicyError('DEVICE_LIMIT');
 return Object.freeze({allowed:true,alreadyRegistered:false});
}
export function canRevokeDevice({identity,device}){
 const accountId=requireIdentity(identity);
 if(!device||device.accountId?.toLowerCase()!==accountId||!validId(device.deviceId))
  throw new PolicyError('NOT_FOUND');
 return Object.freeze({allowed:true,deviceId:device.deviceId});
}
export function mayIssueProfile({identity,entitlement,device,now=Date.now()}){
 const accountId=requireIdentity(identity);
 authorizedEntitlement(entitlement,accountId,now);
 if(!device||device.accountId?.toLowerCase()!==accountId||!validId(device.deviceId)||
    device.revokedAt!=null||!PLATFORM.has(device.platform))
  throw new PolicyError('DEVICE_NOT_AUTHORIZED');
 return Object.freeze({allowed:true,deviceId:device.deviceId});
}
