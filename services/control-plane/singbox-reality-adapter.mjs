/**
 * Adapt a validated VLESS + Reality link into an IN-MEMORY sing-box
 * outbound object. Contains PRIVATE account and server details.
 * Never log, serialize to telemetry, commit, or send to the renderer.
 * This is configuration adaptation, NOT a tunnel or VPN permission.
 */
import {preflightVlessReality} from './reality-compat.mjs';

export class ConfigUnsupportedError extends Error {
 constructor(code='CONFIG_UNSUPPORTED'){super(code);this.code=code;}
}
export function toSingBoxRealityOutbound(secretUri){
 const preflight=preflightVlessReality(secretUri);
 if(!preflight.compatible)throw new ConfigUnsupportedError(preflight.code);
 const uri=new URL(secretUri);
 const flow=uri.searchParams.get('flow')||'';
 if(flow!==''&&flow!=='xtls-rprx-vision')throw new ConfigUnsupportedError('FLOW_UNSUPPORTED');
 if(preflight.transport==='grpc'&&!uri.searchParams.get('serviceName'))
   throw new ConfigUnsupportedError('GRPC_SERVICE_MISSING');
 // Use only fields whose mapping is explicitly reviewed. Avoid unknown
 // security overrides and custom transports.
 const allowed=new Set(['security','type','sni','pbk','sid','fp','flow','serviceName']);
 for(const name of uri.searchParams.keys())if(!allowed.has(name))
   throw new ConfigUnsupportedError('PARAMETER_UNREVIEWED');
 const outbound={
  type:'vless',tag:'vainah-primary',server:uri.hostname,server_port:Number(uri.port),
  uuid:uri.username,
  tls:{
   enabled:true,server_name:uri.searchParams.get('sni'),
   utls:{enabled:true,fingerprint:uri.searchParams.get('fp')||'chrome'},
   reality:{enabled:true,public_key:uri.searchParams.get('pbk'),short_id:uri.searchParams.get('sid')||''}
  }
 };
 if(flow)outbound.flow=flow;
 if(preflight.transport==='grpc'){
  outbound.transport={type:'grpc',service_name:uri.searchParams.get('serviceName')};
 }
 return outbound;
}
