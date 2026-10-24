'use strict';
const fsDefault=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {normalizeVpnLink}=require('./clipboard-link.cjs');

// Private desktop store. Never write a cleartext VPN link to disk or logs.
// Only the trusted Electron main process uses this module.
const FILE='vpn-subscription-v1.dat';
const MAX_BLOB=128*1024;
function valid(value){
 if(!value||!['https','vless'].includes(value.type)||
    typeof value.uri!=='string'||value.uri.length>8192||
    normalizeVpnLink(value.uri)!==value.uri)return false;
 return value.type==='https'
   ?/^https:\/\//i.test(value.uri):/^vless:\/\//i.test(value.uri);
}
function location(root){
 if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Invalid private app location');
 return path.join(root,FILE);
}
async function isAvailable(safeStorage){
 try{return !!(await safeStorage?.isAsyncEncryptionAvailable?.());}
 catch{return false;}
}
async function saveSubscription(value,{root,safeStorage,fs=fsDefault}){
 if(!valid(value))return false;
 if(!(await isAvailable(safeStorage)))return false; // no plain-text fallback
 const filepath=location(root);
 let temporary;
 try{
  const data=await safeStorage.encryptStringAsync(JSON.stringify({
    v:1,type:value.type,uri:value.uri
  }));
  if(!Buffer.isBuffer(data)||!data.length||data.length>MAX_BLOB)return false;
  await fs.mkdir(root,{recursive:true,mode:0o700});
  temporary=filepath+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';
  await fs.writeFile(temporary,data,{flag:'wx',mode:0o600});
  await fs.rename(temporary,filepath);
  return true;
 }catch{
  return false;
 }finally{
  if(temporary)await fs.rm(temporary,{force:true}).catch(()=>{});
 }
}
async function loadSubscription({root,safeStorage,fs=fsDefault}){
 if(!(await isAvailable(safeStorage)))return null;
 try{
  const filepath=location(root);
  const stats=await fs.lstat(filepath);
  if(!stats.isFile()||stats.size<=0||stats.size>MAX_BLOB)return null;
  const data=await fs.readFile(filepath);
  if(data.length>MAX_BLOB)return null;
  const decrypted=await safeStorage.decryptStringAsync(data);
  const stored=JSON.parse(decrypted?.result||'');
  if(stored?.v!==1||!valid(stored))return null;
  return {type:stored.type,uri:stored.uri};
 }catch{return null;}
}
async function clearSubscription({root,fs=fsDefault}){
 try{
  await fs.rm(location(root),{force:true});
  return true;
 }catch{return false;}
}
module.exports={saveSubscription,loadSubscription,clearSubscription};
