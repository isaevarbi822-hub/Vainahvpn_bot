/**
 * Classify redacted configuration shape without disclosing credentials.
 * Does not fetch subscription URLs, parse full VLESS secrets or start VPN.
 * Only descriptive diagnostics may be returned to clients/logs.
 */
export function classifyProfileShape(value){
 if(typeof value!=='string'||value.length===0||value.length>8192||/[\x00-\x1f\x7f]/.test(value))
  return Object.freeze({kind:'invalid',supported:false});
 let url;
 try{url=new URL(value)}catch{return Object.freeze({kind:'invalid',supported:false});}
 if(url.protocol==='https:'&&!url.username&&!url.password&&
    url.hostname&&!url.hash){
  return Object.freeze({kind:'https-subscription',supported:false});
 }
 if(url.protocol==='vless:'&&url.hostname&&url.username&&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(url.username)&&
    Number.isInteger(Number(url.port))&&Number(url.port)>=1&&Number(url.port)<=65535){
  const security=url.searchParams.get('security');
  const transport=url.searchParams.get('type')||'tcp';
  const tls=security==='tls'||security==='reality';
  return Object.freeze({kind:'vless-uri',supported:false,
    encryptedTransportDeclared:tls,
    transportKind:['tcp','ws','grpc','httpupgrade','xhttp'].includes(transport)?transport:'other'});
 }
 return Object.freeze({kind:'unsupported',supported:false});
}
