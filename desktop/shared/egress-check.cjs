'use strict';
const crypto=require('node:crypto');
const CHECK_URL='https://www.cloudflare.com/cdn-cgi/trace';

// Browser independent: Cloudflare trace contains a public IP. Never log,
// persist or return it to the Electron renderer. Only compare salted digests.
function parseTrace(text,{salt}={}){
  if(typeof text!=='string'||text.length>5000||typeof salt!=='string'||salt.length<16)
    return null;
  const fields=Object.create(null);
  for(const row of text.split(/\r?\n/)){
    const equals=row.indexOf('=');
    if(equals>0 && equals<30)fields[row.slice(0,equals)]=row.slice(equals+1);
  }
  const ip=fields.ip;
  if(typeof ip!=='string'||ip.length>64||
     !/^[0-9a-fA-F:.]+$/.test(ip) || !/^[A-Z]{2}$/.test(fields.loc||''))return null;
  return Object.freeze({
    ipHash:crypto.createHash('sha256').update(salt).update('\0').update(ip).digest('hex'),
    country:fields.loc
  });
}

async function fetchTrace({request=globalThis.fetch,salt}={}){
  if(typeof salt!=='string'||salt.length<16)return null;
  try{
    const response=await request(CHECK_URL,{
      method:'GET',redirect:'manual',cache:'no-store',
      headers:{Accept:'text/plain'},
      signal:AbortSignal.timeout(4500)
    });
    if(response.status!==200) return null;
    if(Number(response.headers?.get('content-length'))>5000)return null;
    const stream=await response.arrayBuffer();
    if(stream.byteLength>5000)return null;
    return parseTrace(Buffer.from(stream).toString('utf8'),{salt});
  }catch{return null}
}

function compareEgress(before,after){
  if(!before||!after)return Object.freeze({status:'unavailable',country:null,protected:false});
  const changed=before.ipHash!==after.ipHash;
  return Object.freeze({
    status:changed?'ip_changed_unverified':'ip_unchanged',
    country:after.country,
    protected:false
  });
}
module.exports={parseTrace,fetchTrace,compareEgress};
