'use strict';
// Parse a single VLESS REALITY TCP URI without network requests.
function vlessUriToXray(uri){
 if(typeof uri!=='string'||uri.length>8192)throw Error('Expected VLESS link');
 const clean=uri.replace(/^\uFEFF/,'').trim();
 if(!/^vless:\/\//i.test(clean)||/[\x00-\x20\x7f]/.test(clean))throw Error('Expected VLESS link');
 let url;
 try{url=new URL('vless://'+clean.slice(8));}catch{throw Error('Invalid VLESS link');}
 const id=decodeURIComponent(url.username);
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(id))throw Error('Invalid UUID');
 if(!url.hostname||!Number.isInteger(Number(url.port))||Number(url.port)<1||Number(url.port)>65535)throw Error('Invalid host/port');
 const query=url.searchParams;
 if(query.get('security')!=='reality'||!['tcp','raw',null].includes(query.get('type')))throw Error('Unsupported transport');
 const publicKey=query.get('pbk'),sni=query.get('sni'),shortId=query.get('sid')||'';
 if(!publicKey||!/^[\w-]{20,100}$/.test(publicKey)||!sni||!/^([a-z0-9-]+\.)+[a-z0-9-]+$/i.test(sni))throw Error('Invalid REALITY parameters');
 if(!/^(?:[0-9a-f]{2}){0,8}$/i.test(shortId))throw Error('Invalid short ID');
 const flow=query.get('flow')||'';
 if(flow&&!['xtls-rprx-vision'].includes(flow))throw Error('Unsupported flow');
 const fingerprint=query.get('fp')||'chrome';
 if(!/^[a-z0-9-]{2,24}$/i.test(fingerprint))throw Error('Invalid fingerprint');
 return {outbounds:[{protocol:'vless',settings:{vnext:[{address:url.hostname,port:Number(url.port),users:[{id,flow}]}]},
 streamSettings:{network:'tcp',security:'reality',realitySettings:{serverName:sni,publicKey,shortId,fingerprint}}}]};
}
module.exports={vlessUriToXray};
