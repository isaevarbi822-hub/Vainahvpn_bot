'use strict';
/**
 * User-triggered test only. Makes requests to a public HTTPS endpoint over
 * the OS network to check basic reachability while the VPN process runs.
 * Success CANNOT prove tunnel routing, protected DNS, lack of leaks or H1Cloud
 * authentication. Never return response bodies, egress IP or credentials.
 */
const https=require('node:https');

function reachability({family,host='www.cloudflare.com',timeoutMs=7500},client=https){
  return new Promise(resolve=>{
    let settled=false;
    let request;
    const done=ok=>{
      if(settled)return;
      settled=true;
      resolve(ok===true);
    };
    try{
      request=client.get({
        protocol:'https:',hostname:host,path:'/cdn-cgi/trace',
        method:'GET',family,timeout:timeoutMs,
        headers:{'Cache-Control':'no-store','User-Agent':'VainahVPN-Integration-Diagnostic'},
        rejectUnauthorized:true
      },response=>{
        // No IP address/body is ever exposed to the app.
        const ok=response.statusCode===200;
        response.resume();
        done(ok);
      });
      request.on('timeout',()=>{request.destroy();done(false)});
      request.on('error',()=>done(false));
    }catch{done(false)}
  });
}

async function probeOutbound(engine,client=https){
  if(!engine||engine.status().state!=='running')return Object.freeze({
    attempted:false,ipv4:false,ipv6:false,dnsLeakChecked:false,
    vpnVerified:false
  });
  const [ipv4,ipv6]=await Promise.all([
    reachability({family:4},client),
    reachability({family:6},client)
  ]);
  return Object.freeze({
    attempted:true,ipv4,ipv6,dnsLeakChecked:false,vpnVerified:false
  });
}
module.exports={reachability,probeOutbound};
