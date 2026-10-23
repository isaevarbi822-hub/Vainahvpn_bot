'use strict';
// Build-only compatibility check: synthetic data, no user credentials.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {buildSingBoxConfig}=require('../shared/singbox-config.cjs');
const binary=process.argv[2];
if(!binary || !path.isAbsolute(binary))throw Error('Absolute sing-box path required');
const sample={outbounds:[{
 protocol:'vless',
 settings:{vnext:[{address:'example.com',port:443,users:[{
   id:'12345678-1234-4234-8234-123456789abc',flow:'xtls-rprx-vision'
 }]}]},
 streamSettings:{network:'tcp',security:'reality',realitySettings:{
   serverName:'example.com',
   publicKey:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
   shortId:'a1b2',fingerprint:'chrome'
 }}
}]};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-singbox-ci-'));
try{
 const file=path.join(dir,'config.json');
 fs.writeFileSync(file,JSON.stringify(buildSingBoxConfig(sample)),{mode:0o600});
 const result=spawnSync(binary,['check','-c',file],{
   cwd:dir,windowsHide:true,encoding:'utf8',timeout:15000,
   stdio:['ignore','pipe','pipe']
 });
 if(result.error||result.status!==0){
   // Intentionally do not print raw engine logs: production logs may contain secrets.
   throw Error('sing-box rejected generated Windows TUN + VLESS REALITY config');
 }
 process.stdout.write('sing-box accepted generated TUN + VLESS REALITY config\n');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
