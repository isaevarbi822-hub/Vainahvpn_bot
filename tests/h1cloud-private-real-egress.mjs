#!/usr/bin/env node
/**
 * Opt-in H1Cloud TCP/gRPC Reality integration. NEVER give this a production
 * subscription: use a disposable limited test user via Actions encrypted secret.
 * Only checks an explicit SOCKS5 proxy on GitHub's runner, NOT an OS TUN.
 * No telemetry, DNS/IPv6/privacy-protection claims or public IP output.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';

const require=createRequire(import.meta.url);
const {validateSubscriptionLink}=require('../desktop/src/subscription-store.cjs');
const {loadSubscription,fromSubscriptionText}=require('../desktop/shared/engine-config.cjs');
const messages=Object.freeze({
  INVALID_URL:'H1_TEST_URL_INVALID',
  FETCH:'H1_SUBSCRIPTION_HTTPS_FAILED',
  PROFILE:'H1_SUPPORTED_REALITY_PROFILE_NOT_FOUND',
  JSON:'H1_JSON_HAS_NO_SUPPORTED_REALITY_PROFILE',
  FORMAT:'H1_SUBSCRIPTION_FORMAT_UNSUPPORTED',
  VLESS:'H1_VLESS_PROFILES_NOT_COMPATIBLE',
  CORE:'H1_SINGBOX_CONFIG_REJECTED',
  PROXY:'H1_REALITY_PROXY_HTTPS_NOT_CONFIRMED',
});
function stopWithCode(code){
  const err=new Error(code);
  err.name='H1TestFailure';
  throw err;
}
function secureTestUrl(value){
  const safe=validateSubscriptionLink(value);
  if(!safe)stopWithCode(messages.INVALID_URL);
  const url=new URL(safe);
  // Hosted CI must not be used to probe loopback or network service IPs.
  if(net.isIP(url.hostname)||url.hostname==='localhost'||
     /\.(?:local|internal|localhost|invalid|test)$/i.test(url.hostname)||
     !url.hostname.includes('.'))stopWithCode(messages.INVALID_URL);
  return safe;
}
function pickSafePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const port=server.address().port;
      server.close(error=>error?reject(error):resolve(port));
    });
  });
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timeout=ms=>AbortSignal.timeout(ms);

async function main(){
  const binary=process.argv[2];
  if(!binary||!path.isAbsolute(binary)||!fs.statSync(binary).isFile())
    stopWithCode(messages.CORE);
  const privateUrl=secureTestUrl(process.env.VAINAH_H1_TEST_SUBSCRIPTION_URL);
  let plaintext;
  try {plaintext=await loadSubscription(privateUrl)}
  catch{stopWithCode(messages.FETCH)}
  let outbound;
  try {outbound=fromSubscriptionText(plaintext)}
  catch(error){
    // Return only allowlisted format categories. Never expose profile content,
    // UUIDs, hostnames, paths, raw parser errors or certificate details.
    const code=String(error?.message||'');
    if(code==='SUBSCRIPTION_JSON_UNSUPPORTED'||code==='SUBSCRIPTION_JSON_INVALID')
      stopWithCode(messages.JSON);
    if(code==='SUBSCRIPTION_FORMAT_UNSUPPORTED'||code==='SUBSCRIPTION_INVALID')
      stopWithCode(messages.FORMAT);
    if(code==='REALITY_SUPPORTED_TRANSPORT_NOT_FOUND')
      stopWithCode(messages.VLESS);
    stopWithCode(messages.PROFILE);
  }
  plaintext=null;
  // No H1Cloud URL/host/UUID is ever printed. Only a transport *label*.
  const transport=outbound.transport?.type==='grpc'?'gRPC':'TCP';
  const port=await pickSafePort();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-private-h1-test-'));
  fs.chmodSync(root,0o700);
  const configFile=path.join(root,'config.json');
  const config={
    log:{level:'error'},
    inbounds:[{
      type:'mixed',tag:'integration-socks',listen:'127.0.0.1',listen_port:port
    }],
    outbounds:[outbound],
    route:{final:'vainah-primary'}
  };
  fs.writeFileSync(configFile,JSON.stringify(config),{flag:'wx',mode:0o600});
  let child=null;
  try {
    try {execFileSync(binary,['check','-c',configFile],{
      stdio:'ignore',timeout:12000
    })}
    catch{stopWithCode(messages.CORE)}
    child=spawn(binary,['run','-c',configFile],{
      windowsHide:true,stdio:'ignore',env:{
        PATH:process.env.PATH,
        HOME:root,
        TMPDIR:root
      }
    });
    child.once('error',()=>{});
    await pause(1500);
    // curl cannot directly fall back to the network if local SOCKS is down.
    // --socks5-hostname sends the destination DNS resolution through the proxy.
    // Do not include secrets, public IPs or body content in test output.
    let success=false;
    for(let attempt=0;attempt<3;attempt++){
      if(child.exitCode!==null)break;
      try{
        const code=execFileSync('curl',[
          '--fail','--silent','--location','--max-time','18',
          '--noproxy','','--socks5-hostname','127.0.0.1:'+port,
          '--output','/dev/null','--write-out','%{http_code}',
          'https://example.com/'
        ],{encoding:'utf8',timeout:21000,stdio:['ignore','pipe','ignore'],
          env:{PATH:process.env.PATH,HOME:root,HTTPS_PROXY:'',HTTP_PROXY:'',ALL_PROXY:''}
        }).trim();
        if(code==='200'){success=true;break}
      }catch{/* Keep all upstream errors, hostnames and tokens private. */}
      await pause(900);
    }
    if(!success)stopWithCode(messages.PROXY);
    process.stdout.write('H1CLOUD_REALITY_'+transport.toUpperCase()+
      '_HTTPS_PROXY_TEST_PASSED — real H1Cloud proxy egress; device TUN/DNS/IPv6 UNVERIFIED.\n');
  }finally{
    if(child&&child.exitCode===null){
      try{child.kill('SIGTERM')}catch{}
      await pause(300);
      if(child.exitCode===null){try{child.kill('SIGKILL')}catch{}}
    }
    fs.rmSync(root,{recursive:true,force:true});
  }
}
main().catch(error=>{
  const code=error?.name==='H1TestFailure'?error.message:'H1_TEST_UNAVAILABLE';
  process.stderr.write(code+' (credentials and server addresses hidden)\n');
  process.exitCode=1;
});
