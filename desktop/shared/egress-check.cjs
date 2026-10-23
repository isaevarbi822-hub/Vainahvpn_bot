'use strict';
const crypto=require('node:crypto');
const https=require('node:https');
const net=require('node:net');
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
     net.isIP(ip)===0 || !/^[A-Z]{2}$/.test(fields.loc||''))return null;
  return Object.freeze({
    ipHash:crypto.createHash('sha256').update(salt).update('\0').update(ip).digest('hex'),
    country:fields.loc
  });
}

/**
 * A fresh, never-pooled HTTPS socket is required for post-TUN tests.
 * Node fetch/undici can reuse a TCP/TLS connection opened *before* VPN,
 * making the IP comparison wrong. No redirects or external host inputs.
 */
function freshHttpsRequest(url,options,{transport=https}={}){
  if(url!==CHECK_URL) return Promise.reject(new Error('Endpoint not allowed'));
  return new Promise((resolve,reject)=>{
    let completed=false;
    const req=transport.request({
      protocol:'https:',hostname:'www.cloudflare.com',port:443,
      path:'/cdn-cgi/trace',method:'GET',agent:false,
      headers:{Accept:'text/plain',Connection:'close'},
      timeout:4500,signal:options.signal
    },response=>{
      const status=response.statusCode;
      let total=0;
      const chunks=[];
      response.on('data',chunk=>{
        if(completed)return;
        total+=chunk.length;
        if(total>5000){
          completed=true;
          req.destroy(new Error('Trace response too large'));
          reject(new Error('Trace response too large'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.once('error',reject);
      response.once('end',()=>{
        if(completed)return;
        completed=true;
        const payload=Buffer.concat(chunks,total);
        resolve({
          status,
          headers:{get(name){return response.headers?.[name.toLowerCase()]??null}},
          async arrayBuffer(){return payload}
        });
      });
    });
    req.once('timeout',()=>req.destroy(new Error('Trace HTTPS timeout')));
    req.once('error',reject);
    req.end();
  });
}

async function fetchTrace({request=freshHttpsRequest,salt}={}){
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
module.exports={parseTrace,freshHttpsRequest,fetchTrace,compareEgress};
