'use strict';
// Convert *only* reviewed sing-box JSON VLESS + Reality outbound profiles to
// the same strict VLESS URI validator used for regular H1Cloud subscriptions.
// Never execute URLs, scripts, plugin options or arbitrary JSON fragments.
const types=new Set(['tcp','grpc']);
function candidatesFromSingBoxJson(input){
  let document;
  try{document=JSON.parse(input)}catch{return null}
  const outbounds=Array.isArray(document)?document:document?.outbounds;
  if(!Array.isArray(outbounds)||outbounds.length>256)return [];
  const candidates=[];
  for(const o of outbounds){
    if(!o||o.type!=='vless')continue;
    const tls=o.tls, reality=tls?.reality;
    if(tls?.enabled!==true||reality?.enabled!==true||tls?.insecure===true||
       tls?.disable_sni===true||!reality?.public_key)continue;
    const transport=o.transport?.type||'tcp';
    if(!types.has(transport))continue;
    if(transport==='grpc'&&typeof o.transport?.service_name!=='string')continue;
    if(transport==='tcp'&&o.transport&&o.transport.type!=='tcp')continue;
    if(transport==='grpc'&&o.flow)continue;
    if(typeof o.server!=='string'||typeof o.uuid!=='string'||
       !Number.isInteger(o.server_port)||typeof tls.server_name!=='string')
      continue;
    // The parsed URI is validated again by the existing complete VLESS
    // allowlist (UUID, port, SNI, Reality pubkey/SID, transport and fingerprint).
    try{
      const url=new URL('vless://placeholder.invalid:443');
      url.username=o.uuid;
      url.hostname=o.server;
      url.port=String(o.server_port);
      const params=url.searchParams;
      params.set('security','reality');
      params.set('type',transport);
      params.set('sni',tls.server_name);
      params.set('pbk',reality.public_key);
      params.set('sid',reality.short_id??'');
      params.set('fp',tls.utls?.fingerprint??'chrome');
      if(o.flow)params.set('flow',o.flow);
      if(transport==='grpc')params.set('serviceName',o.transport.service_name);
      candidates.push(url.href);
    }catch{/* Invalid profile will not be considered. */}
  }
  return candidates;
}
module.exports={candidatesFromSingBoxJson};
