/**
 * Build an experimental TUN config for a separately installed sing-box 1.14+
 * on Windows or macOS. This file contains PRIVILEGED CONNECTION SECRETS:
 * only hold it in memory or in a 0600 temporary file owned by the user.
 *
 * NOT suitable for Android VpnService or iOS PacketTunnelProvider; those
 * require libbox with a platform-owned packet interface.
 */
import {toSingBoxRealityOutbound} from './singbox-reality-adapter.mjs';

export function createDesktopTunConfig(uri, platform){
  if(!['win32','darwin'].includes(platform))throw Error('PLATFORM_UNSUPPORTED');
  const outbound=toSingBoxRealityOutbound(uri);
  // gRPC+Reality is structurally supported by stock sing-box and can be
  // validated offline, but egress must still be checked against H1Cloud.
  // XHTTP is NOT accepted by stock sing-box 1.14; never silently downgrade.
  if(outbound.transport && outbound.transport.type!=='grpc')
    throw Error('TRANSPORT_NOT_TESTED');
  const tun={
    type:'tun',tag:'vainah-tun',
    address:['172.29.86.1/30','fd00:86:29::1/126'],
    mtu:1400,
    auto_route:true,
    dns_mode:'hijack'
  };
  if(platform==='win32')tun.strict_route=true;
  return {
    log:{level:'error'},
    dns:{
      servers:[
        {type:'local',tag:'bootstrap'},
        {type:'https',tag:'private-dns',server:'1.1.1.1',server_port:443,
          path:'/dns-query',detour:'vainah-primary'}
      ],
      rules:[{domain:[outbound.server],action:'route',server:'bootstrap'}],
      final:'private-dns'
    },
    inbounds:[tun],
    outbounds:[outbound],
    route:{
      auto_detect_interface:true,
      default_domain_resolver:'bootstrap',
      rules:[{protocol:'dns',action:'hijack-dns'}],
      final:'vainah-primary'
    }
  };
}
