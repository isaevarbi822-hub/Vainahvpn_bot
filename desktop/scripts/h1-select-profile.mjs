/**
 * Local-only H1Cloud profile selector for the experimental desktop runner.
 * Subscription URLs and raw profiles are bearer credentials; never log them.
 */
import {preflightVlessReality} from '../../services/control-plane/reality-compat.mjs';
const MAX=256*1024;

export function selectTcpRealityProfile(input){
  if(typeof input!=='string'||Buffer.byteLength(input,'utf8')>MAX)
    throw Error('PROFILE_NOT_SUPPORTED');
  const raw=input.trim();
  let decoded=raw;
  if(!raw.includes('vless://')){
    if(!/^[a-zA-Z0-9+/=\r\n]+$/.test(raw))throw Error('PROFILE_NOT_SUPPORTED');
    decoded=Buffer.from(raw,'base64').toString('utf8');
    if(Buffer.byteLength(decoded,'utf8')>MAX)throw Error('PROFILE_NOT_SUPPORTED');
  }
  const lines=decoded.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines.length>256)throw Error('PROFILE_NOT_SUPPORTED');
  for(const profile of lines){
    if(!profile.startsWith('vless://'))continue;
    const result=preflightVlessReality(profile);
    if(result.compatible&&result.transport==='tcp')return profile;
  }
  throw Error('TCP_REALITY_PROFILE_NOT_FOUND');
}

export async function fetchPrivateSubscription(raw){
  if(typeof raw!=='string'||raw.length>2048||/\s/.test(raw))
    throw Error('SUBSCRIPTION_INVALID');
  let url;
  try{url=new URL(raw)}catch{throw Error('SUBSCRIPTION_INVALID')}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash)
    throw Error('SUBSCRIPTION_INVALID');
  let response;
  try{
    response=await fetch(url,{method:'GET',redirect:'error',cache:'no-store',
      headers:{Accept:'text/plain'},signal:AbortSignal.timeout(12000)});
    if(!response.ok||!response.body||Number(response.headers.get('content-length')||0)>MAX)
      throw Error('UNAVAILABLE');
    const reader=response.body.getReader();
    const chunks=[];let total=0;
    try{
      while(true){
        const {value,done}=await reader.read();
        if(done)break;
        total+=value.byteLength;
        if(total>MAX)throw Error('TOO_LARGE');
        chunks.push(value);
      }
    }finally{await reader.cancel().catch(()=>{});}
    return Buffer.concat(chunks.map(x=>Buffer.from(x))).toString('utf8');
  }catch{throw Error('SUBSCRIPTION_FETCH_FAILED');}
}
