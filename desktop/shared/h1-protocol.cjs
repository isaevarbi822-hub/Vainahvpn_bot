'use strict';
/**
 * Desktop-side pure parser of H1Cloud subscriptions.
 * Keep private URLs out of renderer IPC, logs, error messages and telemetry.
 * No fetch, native VPN integration or OS networking occurs here.
 */
const LIMIT=256*1024;
const TYPES=Object.freeze(['tcp','grpc','xhttp']);
const makeSummary=(profiles,realityProfiles,transports)=>Object.freeze({
  profiles,realityProfiles,transports:Object.freeze(TYPES.filter(x=>transports.has(x)))
});
function inspectSubscriptionText(content){
  if(typeof content!=='string'||Buffer.byteLength(content,'utf8')>LIMIT)
    throw Error('SUBSCRIPTION_FORMAT_UNAVAILABLE');
  const trimmed=content.trim();
  let plain=trimmed;
  if(!trimmed.includes('vless://')){
    if(!/^[\w+/=\r\n]+$/.test(trimmed))throw Error('SUBSCRIPTION_FORMAT_UNAVAILABLE');
    plain=Buffer.from(trimmed,'base64').toString('utf8');
    if(Buffer.byteLength(plain,'utf8')>LIMIT)throw Error('SUBSCRIPTION_FORMAT_UNAVAILABLE');
  }
  const lines=plain.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length>256)throw Error('SUBSCRIPTION_FORMAT_UNAVAILABLE');
  let count=0;
  const types=new Set();
  for(const link of lines){
    if(!link.startsWith('vless://'))continue;
    let url;
    try{url=new URL(link)}catch{continue}
    if(url.protocol!=='vless:'||!url.username||!url.hostname)continue;
    if(url.searchParams.get('security')!=='reality')continue;
    count++;
    const transport=url.searchParams.get('type');
    if(TYPES.includes(transport))types.add(transport);
  }
  return makeSummary(lines.length,count,types);
}
const PUBLIC_CAPABILITIES=Object.freeze({
  protocol:'VLESS + Reality',
  configurationTransports:TYPES,
  vpnEngineReady:false
});
module.exports={inspectSubscriptionText,PUBLIC_CAPABILITIES};
