#!/usr/bin/env node
/**
 * EXPERIMENTAL desktop VPN runner (Windows/macOS only).
 * Requires user-installed, trusted sing-box >=1.14 executable and OS TUN
 * permissions. Does not download binaries, elevate privileges, install drivers,
 * or claim that a live process proves traffic protection.
 *
 * Read the PRIVATE H1Cloud HTTPS subscription URL or VLESS URI from STDIN.
 * Never include credentials in command-line args, error output, or logs.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createDesktopTunConfig} from '../../services/control-plane/desktop-tun-config.mjs';
import {fetchPrivateSubscription,selectTcpRealityProfile} from './h1-select-profile.mjs';

async function readSecret(){
  const chunks=[];let length=0;
  for await(const item of process.stdin){
    length+=item.length;
    if(length>4096)throw Error('INPUT_TOO_LARGE');
    chunks.push(item);
  }
  return Buffer.concat(chunks.map(x=>Buffer.from(x))).toString('utf8').trim();
}
async function execute(core,args){
  return new Promise((resolve,reject)=>{
    const child=spawn(core,args,{stdio:'ignore',windowsHide:true,shell:false});
    child.once('error',()=>reject(Error('ENGINE_UNAVAILABLE')));
    child.once('exit',(code,signal)=>resolve({code,signal}));
  });
}
async function main(){
  if(!['win32','darwin'].includes(process.platform))throw Error('PLATFORM_UNSUPPORTED');
  const idx=process.argv.indexOf('--core');
  if(idx<0||!process.argv[idx+1]||process.argv.length!==4)
    throw Error('CORE_PATH_REQUIRED');
  const core=process.argv[idx+1];
  if(!path.isAbsolute(core)||!fs.statSync(core).isFile())
    throw Error('CORE_PATH_INVALID');
  const input=await readSecret();
  if(!input||input.includes('\n')||input.includes('\r'))
    throw Error('INPUT_INVALID');
  const text=input.startsWith('https://')?await fetchPrivateSubscription(input):input;
  const profile=selectTcpRealityProfile(text);
  const config=createDesktopTunConfig(profile,process.platform);
  let dir;
  try{
    dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-tun-'));
    fs.chmodSync(dir,0o700);
    const configPath=path.join(dir,'config.json');
    fs.writeFileSync(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
    const check=await execute(core,['check','-c',configPath]);
    if(check.code!==0)throw Error('ENGINE_CONFIG_REJECTED');
    // sing-box TUN may require OS-administered networking entitlements.
    // We NEVER request elevation or bypass any OS protection.
    const child=spawn(core,['run','-c',configPath],{
      stdio:'ignore',windowsHide:true,shell:false
    });
    let stopping=false;
    for(const signal of ['SIGINT','SIGTERM']){
      process.once(signal,()=>{stopping=true;child.kill();});
    }
    process.stdout.write('Проверка конфигурации пройдена. Движок запущен, но VPN-защита не подтверждена.\n');
    const result=await new Promise(resolve=>{
      child.once('error',()=>resolve({code:1}));
      child.once('exit',code=>resolve({code}));
    });
    if(!stopping&&result.code!==0)throw Error('ENGINE_STOPPED');
    process.stdout.write('Движок остановлен. VPN не активен.\n');
  }finally{
    if(dir)fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(error=>{
  // Do not print error.message from arbitrary engines, HTTP servers or links.
  const known=new Set([
    'PLATFORM_UNSUPPORTED','CORE_PATH_REQUIRED','CORE_PATH_INVALID',
    'INPUT_INVALID','INPUT_TOO_LARGE','ENGINE_UNAVAILABLE',
    'ENGINE_CONFIG_REJECTED','ENGINE_STOPPED'
  ]);
  const code=known.has(error?.message)?error.message:'PREPARE_FAILED';
  process.stderr.write('Vainah VPN: '+code+'\n');
  process.exitCode=1;
});
