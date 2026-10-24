'use strict';
/**
 * In-memory parser for H1Cloud/Xray/sing-box HTTPS subscription documents.
 * Accepts VLESS REALITY TCP/raw only. Does not log, persist or return secrets to UI.
 */
const {TextDecoder}=require('node:util');
const {vlessUriToXray}=require('./vless-link.cjs');
const MAX_BYTES=256*1024;
const MAX_ENTRIES=200;
const MAX_PROFILES=50;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function supportedUri(input){
  if(typeof input!=='string'||input.length>8192||!/^vless:\/\//i.test(input))return null;
  try{return vlessUriToXray('vless://'+input.slice(8));}catch{return null;}
}
function makeUri({uuid,server,port,sni,pbk,sid='',fp='chrome',flow='',label=''}) {
  if(!uuidPattern.test(uuid||'')||typeof server!=='string'||server.length>253||
     /[\s/@#?\\]/.test(server)||!Number.isInteger(Number(port))||
     Number(port)<1||Number(port)>65535||typeof sni!=='string'||
     typeof pbk!=='string'||String(label).length>80)return null;
  const host=server.includes(':')&&!server.startsWith('[')?'['+server+']':server;
  const params=new URLSearchParams({security:'reality',type:'tcp',sni,pbk,fp:String(fp||'chrome')});
  if(sid)params.set('sid',String(sid));
  if(flow)params.set('flow',String(flow));
  const uri='vless://'+uuid+'@'+host+':'+port+'?'+params.toString()+
    (label?'#'+encodeURIComponent(String(label)):'');
  return supportedUri(uri);
}
function xray(item){
  const ss=item.streamSettings;
  if(item.protocol!=='vless'||ss?.security!=='reality'||
     !['tcp','raw',undefined,null].includes(ss.network))return [];
  const real=ss.realitySettings;
  const next=item.settings?.vnext;
  if(!real||!Array.isArray(next)||next.length>MAX_PROFILES)return [];
  const out=[];
  for(const server of next){
    if(!Array.isArray(server?.users)||server.users.length>MAX_PROFILES)continue;
    for(const user of server.users){
      const p=makeUri({uuid:user?.id,server:server.address,port:server.port,
        sni:real.serverName,pbk:real.publicKey,sid:real.shortId,
        fp:real.fingerprint,flow:user?.flow,label:item.tag});
      if(p)out.push(p);
    }
  }
  return out;
}
function singBox(item){
  if(item.type!=='vless'||item.tls?.enabled!==true||
     item.tls?.reality?.enabled!==true||
     (item.transport&&!['tcp','raw'].includes(item.transport.type)))return [];
  const p=makeUri({uuid:item.uuid,server:item.server,port:item.server_port,
    sni:item.tls.server_name,pbk:item.tls.reality.public_key,
    sid:item.tls.reality.short_id,fp:item.tls.utls?.fingerprint,
    flow:item.flow,label:item.tag});
  return p?[p]:[];
}
function parseJson(source){
  let root;
  try{root=JSON.parse(source)}catch{throw Error('Unsupported subscription format');}
  if(!root || typeof root!=='object')throw Error('Unsupported subscription format');
  const entries=Array.isArray(root)?root:
    ['outbounds','profiles','servers','nodes','links'].map(k=>root[k]).find(Array.isArray);
  if(!entries||entries.length>MAX_ENTRIES)throw Error('Unsupported subscription format');
  const profiles=[];
  const collect=p=>{if(p&&profiles.length<MAX_PROFILES)profiles.push(p);};
  for(const entry of entries){
    if(typeof entry==='string'){
      collect(supportedUri(entry.trim()));
    }else if(entry&&typeof entry==='object'&&!Array.isArray(entry)){
      if(entry.protocol==='vless')xray(entry).forEach(collect);
      else if(entry.type==='vless')singBox(entry).forEach(collect);
      else{
        collect(supportedUri(entry.uri||entry.link||entry.url));
        if(Array.isArray(entry.outbounds)&&entry.outbounds.length<=MAX_ENTRIES){
          for(const nested of entry.outbounds){
            if(nested?.protocol==='vless')xray(nested).forEach(collect);
            else if(nested?.type==='vless')singBox(nested).forEach(collect);
          }
        }
      }
    }
  }
  return profiles;
}
function lines(input){
  const filtered=input.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(filtered.length>MAX_ENTRIES)throw Error('Unsupported subscription');
  const profiles=[];
  for(const item of filtered){
    const profile=supportedUri(item);
    if(profile&&profiles.length<MAX_PROFILES)profiles.push(profile);
  }
  return profiles;
}
function parseSubscriptionBody(value){
  if(typeof value!=='string'||Buffer.byteLength(value,'utf8')>MAX_BYTES)
    throw Error('Subscription too large');
  const input=value.replace(/^\uFEFF/,'').trim();
  if(!input)throw Error('Unsupported subscription');
  let profiles;
  if(input[0]==='{'||input[0]==='[')profiles=parseJson(input);
  else{
    profiles=lines(input);
    if(!profiles.length && /^[a-z0-9+/_=\s-]+$/i.test(input)){
      const encoded=input.replace(/\s/g,'');
      // Base64 and base64url, including unpadded Telegram/H1 subscription feeds.
      const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/');
      if(normalized.length%4!==1){
        let decoded='';
        try{
          const bytes=Buffer.from(normalized,'base64');
          decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'').trim();
        }catch{}
        if(decoded && decoded!==input){
          profiles=decoded[0]==='{'||decoded[0]==='['?parseJson(decoded):lines(decoded);
        }
      }
    }
  }
  if(!profiles.length)throw Error('No supported VLESS REALITY TCP servers');
  return {profiles,count:profiles.length};
}
module.exports={parseSubscriptionBody};
