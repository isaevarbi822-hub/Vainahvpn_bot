'use strict';
const MAX_BYTES = 1024 * 1024;
const MAX_PROFILES = 128;
const TRANSPORTS = new Set(['tcp', 'grpc', 'xhttp']);
function safeLabel(tag) {
  if (typeof tag !== 'string' || !tag || tag.length > 80 ||
      /[\x00-\x1f\x7f<>]/.test(tag) ||
      /(?:https?:\/\/|vless:\/\/|bearer|token|secret|password|uuid|key=)/i.test(tag))
    return 'VLESS profile';
  return tag;
}
// Inspect untrusted Xray configuration. Never fetch, connect, log, or expose credentials.
function parseXrayProfiles(payload) {
  if (typeof payload !== 'string' || Buffer.byteLength(payload, 'utf8') > MAX_BYTES)
    throw new Error('Invalid subscription document size');
  let data;
  try { data = JSON.parse(payload); } catch { throw new Error('Subscription is not JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('Unsupported JSON document');
  const entries = Array.isArray(data.outbounds) ? data.outbounds :
    Array.isArray(data.profiles) ? data.profiles : null;
  if (!entries || entries.length > MAX_PROFILES)
    throw new Error('Unsupported Xray subscription structure');
  const profiles = [];
  for (const [index, item] of entries.entries()) {
    if (!item || typeof item !== 'object' || item.protocol !== 'vless') continue;
    const stream = item.streamSettings;
    if (!stream || typeof stream !== 'object' || stream.security !== 'reality') continue;
    const network = stream.network || 'tcp';
    if (!TRANSPORTS.has(network)) continue;
    const reality = stream.realitySettings;
    if (!reality || typeof reality !== 'object' ||
        typeof reality.publicKey !== 'string' || !reality.publicKey.trim()) continue;
    const servers = item.settings?.vnext;
    if (!Array.isArray(servers)) continue;
    for (const server of servers) {
      if (!server || typeof server !== 'object' ||
          typeof server.address !== 'string' || !server.address.trim() ||
          !Number.isInteger(server.port) || server.port < 1 || server.port > 65535 ||
          !Array.isArray(server.users) || !server.users.some(user =>
            user && typeof user.id === 'string' && user.id.trim())) continue;
      profiles.push(Object.freeze({
        id: `${index}:${profiles.length}`,
        name: safeLabel(item.tag),
        protocol: 'vless',
        transport: network,
        security: 'reality',
        configured: true
      }));
      if (profiles.length >= MAX_PROFILES) return Object.freeze(profiles);
    }
  }
  return Object.freeze(profiles);
}
module.exports = { parseXrayProfiles };
