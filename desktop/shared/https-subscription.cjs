'use strict';
const https=require('node:https');
const dns=require('node:dns').promises;
const net=require('node:net');
const {parseSubscriptionBody}=require('./subscription-payload.cjs');
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
 // Clipboard apps sometimes wrap the copied HTTPS URL with angle brackets or quotes.
 // Only unwrap the ends; never rewrite an embedded bearer token or its query string.
 let clean=input.trim().replace(/^\uFEFF/,'').trim();
 if((clean.startsWith('<')&&clean.endsWith('>'))||
    (clean.startsWith('"')&&clean.endsWith('"'))||
    (clean.startsWith("'")&&clean.endsWith("'")))clean=clean.slice(1,-1).trim();
 if(!clean || /[\x00-\x20\x7f]/.test(clean))throw Error('Invalid subscription URL');
 let url;
 try{url=new URL(clean)}catch{throw Error('Invalid subscription URL')}
 if(url.protocol!=='https:'||url.username||url.password||
    url.hash||net.isIP(url.hostname)||!url.hostname.includes('.')||
    /[^a-z0-9.-]/i.test(url.hostname))throw Error('HTTPS hostname required');
 // Re-resolve to public IP and pin the connection to the validated address.
 let resolved;
 try{resolved=await resolver(url.hostname,{all:true,verbatim:true})}
 catch(error){if(['ENOTFOUND','EAI_AGAIN'].includes(error?.code))throw error;
  throw Error('Subscription DNS lookup failed');}
 if(!Array.isArray(resolved)||!resolved.length||resolved.some(x=>!publicAddress(x.address)))
  throw Error('Subscription target unavailable');
 // Prefer IPv4 on networks where AAAA resolves but IPv6 is unavailable.
 const pinned=(resolved.find(x=>net.isIP(x.address)===4)||resolved[0]).address;
 const getOnce=target=>new Promise((resolve,reject)=>{
  const req=request(target,{timeout:8000,maxRedirects:0,
    headers:{Accept:'text/plain, application/json'},
    lookup:(_host,_opts,cb)=>cb(null,pinned,net.isIP(pinned))},res=>{
   // Only a same-origin redirect can be followed; never leak an H1 bearer URL
   // or its request headers to a new hostname.
   if([301,302,307,308].includes(res.statusCode)){
     const location=res.headers?.location;
     res.resume();
     if(!location)return reject(Error('Subscription HTTP response'));
     let next;
     try{next=new URL(location,target)}catch{return reject(Error('Subscription HTTP response'))}
     if(next.origin!==url.origin||next.username||next.password||next.hash)
       return reject(Error('Subscription redirect refused'));
     return resolve({redirect:next});
   }
   if(res.statusCode!==200){
     res.resume();
     const error=Error('Subscription HTTP response');
     error.statusCode=Number(res.statusCode)||0;
     return reject(error);
   }
   const chunks=[];let total=0;
   res.on('data',chunk=>{
     total+=chunk.length;
     if(total>256*1024){req.destroy(Error('Subscription too large'));return}
     chunks.push(chunk);
   });
   res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8')}));
   res.on('error',reject);
  });
  req.on('timeout',()=>req.destroy(Error('Subscription timeout')));
  req.on('error',reject);
 });
 let current=url, response;
 for(let i=0;i<=2;i++){
  response=await getOnce(current);
  if(!response.redirect)break;
  if(i===2)throw Error('Subscription redirect refused');
  current=response.redirect;
 }
 return parseSubscriptionBody(response.body);

}
module.exports={fetchSubscription,publicAddress};
