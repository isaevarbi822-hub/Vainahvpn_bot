'use strict';
// Offline translation for a single, explicit VLESS TCP REALITY Xray outbound.
// NEVER log, return to renderer, or commit generated configs: they include credentials.
function buildSingBoxConfig(xrayJson, outboundIndex) {
  const root=typeof xrayJson==='string'?JSON.parse(xrayJson):xrayJson;
  if(!root || !Array.isArray(root.outbounds))throw new Error('Invalid Xray config');
  // Xray configs may start with direct/block/DNS outbounds; select VLESS by default.
  const selected=outboundIndex===undefined
    ? root.outbounds.findIndex(item=>item?.protocol==='vless' &&
      item.streamSettings?.security==='reality' &&
      (!item.streamSettings.network || item.streamSettings.network==='tcp'))
    : outboundIndex;
  const outbound=root.outbounds[selected];
  if(!outbound || outbound.protocol!=='vless')throw new Error('VLESS outbound required');
  const stream=outbound.streamSettings;
  if(!stream || (stream.network && stream.network!=='tcp') || stream.security!=='reality')
    throw new Error('Only VLESS TCP REALITY supported by this adapter');
  const servers=outbound.settings?.vnext;
  if(!Array.isArray(servers) || servers.length!==1)throw new Error('Expected exactly one server');
  const server=servers[0],users=server?.users;
  if(typeof server?.address!=='string' || !server.address.trim() ||
     !Number.isInteger(server.port) || server.port<1 || server.port>65535 ||
     !Array.isArray(users) || users.length!==1)throw new Error('Invalid server');
  const user=users[0],real=stream.realitySettings;
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(user?.id||'') ||
     typeof real?.publicKey!=='string'||!real.publicKey ||
     typeof real?.serverName!=='string'||!real.serverName)
    throw new Error('Invalid VLESS/REALITY parameters');
  const shortId=real.shortId??'';
  if(typeof shortId!=='string'||!/^(?:[0-9a-f]{2}){0,8}$/i.test(shortId))
    throw new Error('Invalid REALITY short ID');
  return {
    log:{level:'warn',output:'',timestamp:false},
    dns:{servers:[{type:'local',tag:'local-dns'}],final:'local-dns'},
    inbounds:[{type:'tun',tag:'vainah-tun',address:['172.18.0.1/30'],auto_route:true,strict_route:true}],
    outbounds:[{
      type:'vless',tag:'vainah-proxy',server:server.address,server_port:server.port,
      uuid:user.id,flow:user.flow||'',
      tls:{enabled:true,server_name:real.serverName,
        utls:{enabled:true,fingerprint:real.fingerprint||'chrome'},
        reality:{enabled:true,public_key:real.publicKey,short_id:shortId}}
    }],
    route:{auto_detect_interface:true,final:'vainah-proxy'}
  };
}
module.exports={buildSingBoxConfig};
