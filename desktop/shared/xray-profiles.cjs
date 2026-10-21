'use strict';

// Parse untrusted Xray JSON data ONLY. This module never starts a VPN,
// fetches a subscription, or records bearer credentials.
const MAX_BYTES = 1024 * 1024;
const MAX_PROFILES = 128;
const TRANSPORTS = new Set(['tcp', 'grpc', 'xhttp']);

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
    const settings = item.settings;
    const server = settings?.vnext?.[0];
    if (!server || !Array.isArray(server.users) || !server.users.length) continue;
    const network = stream?.network || 'tcp';
    if (!TRANSPORTS.has(network) || stream?.security !== 'reality') continue;
    if (typeof server.address !== 'string' || !server.address ||
      !Number.isInteger(server.port) || server.port < 1 || server.port > 65535) continue;
    // Deliberately do not return address, UUID, REALITY keys or raw profile.
    profiles.push(Object.freeze({
      id: index,
      name: typeof item.tag === 'string' && item.tag.length <= 80 ? item.tag : 'VLESS profile',
      protocol: 'vless',
      transport: network,
      security: 'reality',
      configured: true
    }));
  }
  return Object.freeze(profiles);
}

module.exports = { parseXrayProfiles };
