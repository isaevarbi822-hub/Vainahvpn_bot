import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const {validateTcpReality}=require('../desktop/shared/engine-config.cjs');

async function vacantPort(){
 return await new Promise((resolve,reject)=>{
  const server=net.createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   const port=server.address().port;
   server.close(error=>error?reject(error):resolve(port));
  });
 });
}
const core=process.argv[2];
if(!core||!path.isAbsolute(core))throw Error('PINNED_SINGBOX_PATH_REQUIRED');
let keypair;
try{keypair=execFileSync(core,['generate','reality-keypair'],{encoding:'utf8',timeout:10000})}
catch{throw Error('REALITY_KEYPAIR_GENERATION_FAILED')}
const privateKey=keypair.match(/PrivateKey:\s*([A-Za-z0-9_-]{43})/)?.[1];
const publicKey=keypair.match(/PublicKey:\s*([A-Za-z0-9_-]{43})/)?.[1];
if(!privateKey||!publicKey)throw Error('INVALID_TEST_KEYPAIR');
const sid='0123456789abcdef';
const id=crypto.randomUUID();
const serverPort=await vacantPort();
const proxyPort=await vacantPort();
if(serverPort===proxyPort)throw Error('PORT_COLLISION');
const sni='www.cloudflare.com';
const dummyUri='vless://'+id+'@127.0.0.1:'+serverPort+
 '?security=reality&type=tcp&sni='+sni+'&pbk='+publicKey+
 '&sid='+sid+'&fp=chrome&flow=xtls-rprx-vision';
const outbound=validateTcpReality(dummyUri);
const serverConfig={
 log:{level:'error'},
 inbounds:[{
  type:'vless',tag:'reality-in',listen:'127.0.0.1',listen_port:serverPort,
  users:[{uuid:id,flow:'xtls-rprx-vision'}],
  tls:{
   enabled:true,server_name:sni,
   reality:{
    enabled:true,
    handshake:{server:sni,server_port:443},
    private_key:privateKey,short_id:[sid]
   }
  }
 }],
 outbounds:[{type:'direct',tag:'direct'}],
 route:{final:'direct'}
};
const clientConfig={
 log:{level:'error'},
 inbounds:[{type:'mixed',tag:'test-proxy',listen:'127.0.0.1',listen_port:proxyPort}],
 outbounds:[outbound],
 route:{final:'vainah-primary'}
};
const work=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-vless-reality-e2e-'));
fs.chmodSync(work,0o700);
const serverFile=path.join(work,'server.json');
const clientFile=path.join(work,'client.json');
fs.writeFileSync(serverFile,JSON.stringify(serverConfig),{flag:'wx',mode:0o600});
fs.writeFileSync(clientFile,JSON.stringify(clientConfig),{flag:'wx',mode:0o600});
const children=[];
try{
 for(const file of [serverFile,clientFile]){
  try{execFileSync(core,['check','-c',file],{stdio:'ignore',timeout:15000})}
  catch{throw Error('REALITY_SYNTHETIC_CONFIG_REJECTED')}
 }
 for(const file of [serverFile,clientFile]){
  children.push(spawn(core,['run','-c',file],{stdio:'ignore',windowsHide:true}));
 }
 await new Promise(resolve=>setTimeout(resolve,1300));
 let passed=false;
 for(let attempt=0;attempt<3;attempt++){
  if(children.some(child=>child.exitCode!==null))break;
  try{
   const output=execFileSync('curl',[
    '--fail','--silent','--show-error','--max-time','18',
    '--noproxy','','--proxy','http://127.0.0.1:'+proxyPort,
    '--output','/dev/null','--write-out','%{http_code}',
    'https://example.com/'
   ],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:22000});
   if(output.trim()==='200'){passed=true;break}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,1100));
 }
 if(!passed)throw Error('REALITY_SYNTHETIC_PROXY_EGRESS_NOT_CONFIRMED');
 process.stdout.write('VLESS Reality TCP: real encrypted sing-box loopback proxy and HTTPS egress verified with GENERATED test keys; H1Cloud/device TUN still untested.\n');
}finally{
 for(const child of children){try{child.kill('SIGTERM')}catch{}}
 fs.rmSync(work,{recursive:true,force:true});
}
