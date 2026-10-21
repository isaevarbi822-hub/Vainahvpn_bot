'use strict';
const https=require('node:https');
const dns=require('node:dns').promises;
const net=require('node:net');
const {vlessUriToXray}=require('./vless-link.cjs');
function publicAddress(address){
 if(!net.isIP(address))return false;
 if(net.isIP(address)===4){
  const n=address.split('.').map(Number);
  return !(n[0]===0||n[0]===10||n[0]===127||n[0]>=224||
   (n[0]===169&&n[1]===254)||(n[0]===172&&n[1]>=16&&n[1]<=31)||
   (n[0]===192&&n[1]===168)||(n[0]===100&&n[1]>=64&&n[1]<=127)||
   (n[0]===192&&n[1]===0)||(n[0]===198&&(n[1]===18||n[1]===19))||
   (n[0]===192&&n[1]===0&&n[2]===2)||(n[0]===198&&n[1]===51&&n[2]===100)||
   (n[0]===203&&n[1]===0&&n[2]===113));
 }
 const a=address.toLowerCase();
 return !(a==='::1'||a==='::'||a.startsWith('fc')||a.startsWith('fd')||
  a.startsWith('fe8')||a.startsWith('fe9')||a.startsWith('fea')||
  a.startsWith('feb')||a.startsWith('::ffff:'));
}
async function fetchSubscription(input,{resolver=dns.lookup,request=https.get}={}){
 if(typeof input!=='string'||input.length>8192)throw Error('Invalid subscription URL');
 let url;
 try{url=new URL(input)}catch{throw Error('Invalid subscription URL')}
 if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||
    url.hash||net.isIP(url.hostname)||!url.hostname.includes('.')||
    /[^a-z0-9.-]/i.test(url.hostname))throw Error('HTTPS hostname required');
 // Re-resolve to public IP and pin the connection to the validated address.
 const resolved=await resolver(url.hostname,{all:true,verbatim:true});
 if(!Array.isArray(resolved)||!resolved.length||resolved.some(x=>!publicAddress(x.address)))
  throw Error('Subscription target unavailable');
 const pinned=resolved[0].address;
 const data=await new Promise((resolve,reject)=>{
  const req=request(url,{timeout:8000,maxRedirects:0,lookup:(_host,_opts,cb)=>cb(null,pinned,net.isIP(pinned))},res=>{
   if(res.statusCode!==200){res.resume();return reject(Error('Subscription server rejected request'))}
   const chunks=[];let total=0;
   res.on('data',chunk=>{total+=chunk.length;if(total>256*1024){req.destroy(Error('Subscription too large'));return}chunks.push(chunk)});
   res.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));
   res.on('error',reject);
  });
  req.on('timeout',()=>req.destroy(Error('Subscription timeout')));
  req.on('error',reject);
 });
 const trimmed=data.trim();
 const decoded=trimmed.startsWith('vless://')?trimmed:Buffer.from(trimmed,'base64').toString('utf8');
 const lines=decoded.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 if(lines.length<1||lines.length>50)throw Error('Unsupported subscription');
 const profiles=[];
 for(const line of lines){if(line.startsWith('vless://')){try{profiles.push(vlessUriToXray(line))}catch{}}}
 if(!profiles.length)throw Error('No supported VLESS REALITY TCP servers');
 return {profiles,count:profiles.length};
}
module.exports={fetchSubscription,publicAddress};
