'use strict';
const MAX_BYTES=256*1024;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PBK=/^[a-zA-Z0-9_-]{43}$/;
const SID=/^(?:[0-9a-f]{2}){0,8}$/i;
const FINGERPRINTS=new Set(['chrome','firefox','safari','ios','android','edge']);
const ALLOWED=new Set(['security','type','sni','pbk','sid','fp','flow']);

function validateTcpReality(link){
  let uri;
  try{uri=new URL(link)}catch{throw Error('PROFILE_INVALID')}
  if(uri.protocol!=='vless:'||!UUID.test(uri.username)||!uri.hostname||
     uri.password||!Number.isInteger(Number(uri.port))||Number(uri.port)<1||
     Number(uri.port)>65535||uri.hostname.length>253)throw Error('PROFILE_INVALID');
  const params=uri.searchParams;
  if(params.get('security')!=='reality'||params.get('type')!=='tcp'||
     !PBK.test(params.get('pbk')||'')||!SID.test(params.get('sid')||'')||
     !/^[a-z0-9.-]+$/i.test(params.get('sni')||'')||
     !(params.get('sni')||'').includes('.')||
     !FINGERPRINTS.has(params.get('fp')||'chrome')||
     !['','xtls-rprx-vision'].includes(params.get('flow')||''))
    throw Error('PROFILE_UNSUPPORTED');
  for(const [key] of params)if(!ALLOWED.has(key)||params.getAll(key).length!==1)
    throw Error('PROFILE_UNSUPPORTED');
  const outbound={
    type:'vless',tag:'vainah-primary',server:uri.hostname,
    server_port:Number(uri.port),uuid:uri.username,
    tls:{
      enabled:true,server_name:params.get('sni'),
      utls:{enabled:true,fingerprint:params.get('fp')||'chrome'},
      reality:{enabled:true,public_key:params.get('pbk'),short_id:params.get('sid')||''}
    }
  };
  if(params.get('flow'))outbound.flow=params.get('flow');
  return outbound;
}
function fromSubscriptionText(input){
  if(typeof input!=='string'||Buffer.byteLength(input)>MAX_BYTES)throw Error('SUBSCRIPTION_INVALID');
  let text=input.trim();
  if(!text.includes('vless://')){
    if(!/^[A-Za-z0-9+/=\r\n]+$/.test(text))throw Error('SUBSCRIPTION_INVALID');
    text=Buffer.from(text,'base64').toString('utf8');
  }
  if(Buffer.byteLength(text)>MAX_BYTES)throw Error('SUBSCRIPTION_INVALID');
  const rows=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(rows.length>256)throw Error('SUBSCRIPTION_TOO_LARGE');
  for(const link of rows){
    if(!link.startsWith('vless://'))continue;
    try{return validateTcpReality(link)}catch{ /* Try other profiles. */ }
  }
  throw Error('TCP_REALITY_NOT_FOUND');
}
function toTunConfig(outbound,platform){
  if(!['win32','darwin'].includes(platform))throw Error('PLATFORM_UNSUPPORTED');
  const tun={
    type:'tun',tag:'vainah-tun',
    address:['172.29.86.1/30','fd00:86:29::1/126'],
    mtu:1400,auto_route:true,dns_mode:'hijack'
  };
  if(platform==='win32')tun.strict_route=true;
  return {
    log:{level:'error'},
    dns:{
      servers:[
        {type:'local',tag:'bootstrap'},
        {type:'https',tag:'private-dns',server:'1.1.1.1',
         server_port:443,path:'/dns-query',detour:'vainah-primary'}
      ],
      rules:[{domain:[outbound.server],action:'route',server:'bootstrap'}],
      final:'private-dns'
    },
    inbounds:[tun],
    outbounds:[outbound],
    route:{
      auto_detect_interface:true,default_domain_resolver:'bootstrap',
      rules:[{protocol:'dns',action:'hijack-dns'}],
      final:'vainah-primary'
    }
  };
}
async function loadSubscription(urlText, fetcher=fetch){
  if(typeof urlText!=='string'||urlText.length>2048||/\s/.test(urlText))throw Error('SUBSCRIPTION_INVALID');
  let url;
  try{url=new URL(urlText)}catch{throw Error('SUBSCRIPTION_INVALID')}
  if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('SUBSCRIPTION_INVALID');
  try{
    const response=await fetcher(url.href,{
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)
    });
    if(!response.ok||!response.body||
       Number(response.headers.get('content-length')||0)>MAX_BYTES)throw Error('SUBSCRIPTION_FAILED');
    const reader=response.body.getReader();
    let size=0;const chunks=[];
    try{
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.length;
        if(size>MAX_BYTES)throw Error('SUBSCRIPTION_FAILED');
        chunks.push(Buffer.from(value));
      }
    }finally{await reader.cancel().catch(()=>{});}
    return Buffer.concat(chunks).toString('utf8');
  }catch{throw Error('SUBSCRIPTION_FAILED')}
}
module.exports={validateTcpReality,fromSubscriptionText,toTunConfig,loadSubscription};
