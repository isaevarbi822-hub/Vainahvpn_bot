/**
 * Vainah VPN data-plane readiness gate.
 * A profile or permission is not proof of real VPN packet transport.
 * Pure logic only; no traffic interception or engine bundled here.
 */
export const REQUIRED_CHECKS=Object.freeze([
  'encryptedUpstream','bidirectionalPackets','routes',
  'dns','ipv6','disconnectCleanup'
]);
export function evaluateEngineReadiness(evidence){
  if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))
    return Object.freeze({ready:false,missing:[...REQUIRED_CHECKS]});
  const missing=REQUIRED_CHECKS.filter(name=>evidence[name]!==true);
  return Object.freeze({ready:missing.length===0,missing});
}
export function safeConnectionState({engineReady=false,tunnelAlive=false,sessionValid=false,entitlementActive=false}={}){
  const protectedTraffic=engineReady===true&&tunnelAlive===true&&sessionValid===true&&entitlementActive===true;
  return Object.freeze({state:protectedTraffic?'connected':'disconnected',protected:protectedTraffic});
}
