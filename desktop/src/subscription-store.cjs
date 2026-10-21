'use strict';
/**
 * Store an H1Cloud HTTPS subscription as an OS-encrypted credential.
 * Windows: Electron safeStorage/DPAPI; macOS: safeStorage/Keychain.
 * Refuse persistent storage when the OS encryption backend is unavailable.
 * No plaintext logs, preferences, IPC readbacks or cloud synchronization.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function validateSubscriptionLink(value){
  if(typeof value!=='string'||value.length<12||value.length>2048||
     /[\x00-\x20\x7f]/.test(value))return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
       url.hash||url.hostname.length>253||url.hostname.includes('..'))
      return null;
    return url.href;
  }catch{return null;}
}

class SubscriptionStore {
  constructor(userData, encryption){
    this.directory=userData;
    this.encryption=encryption;
    this.file=path.join(userData,'h1cloud-subscription.v1.enc');
  }
  encryptionAvailable(){
    try{return this.encryption?.isEncryptionAvailable()===true}
    catch{return false;}
  }
  status(){
    // Never decrypt into the renderer or show host, token or path.
    return Object.freeze({
      saved:this.encryptionAvailable()&&fs.existsSync(this.file),
      secureStorageAvailable:this.encryptionAvailable()
    });
  }
  save(link){
    const url=validateSubscriptionLink(link);
    if(!url)return {ok:false,code:'SUBSCRIPTION_INVALID'};
    if(!this.encryptionAvailable())return {ok:false,code:'ENCRYPTION_UNAVAILABLE'};
    let temporary;
    try{
      const ciphertext=this.encryption.encryptString(url);
      if(!Buffer.isBuffer(ciphertext)||ciphertext.length===0)
        throw Error('ENCRYPTION_FAILED');
      fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
      temporary=path.join(this.directory,'.h1-'+crypto.randomBytes(12).toString('hex')+'.tmp');
      fs.writeFileSync(temporary,ciphertext,{flag:'wx',mode:0o600});
      fs.renameSync(temporary,this.file);
      try{fs.chmodSync(this.file,0o600)}catch{/* DPAPI remains encrypted on Windows. */}
      return {ok:true};
    }catch{return {ok:false,code:'SAVE_FAILED'}}
    finally{if(temporary){try{fs.rmSync(temporary,{force:true})}catch{}}}
  }
  load(){
    // Main process only; NEVER expose to the preload's renderer API.
    if(!this.encryptionAvailable())return null;
    try{
      const stat=fs.statSync(this.file);
      if(!stat.isFile()||stat.size<1||stat.size>8192)return null;
      const value=this.encryption.decryptString(fs.readFileSync(this.file));
      return validateSubscriptionLink(value);
    }catch{return null;}
  }
  clear(){
    try{fs.rmSync(this.file,{force:true});return {ok:true}}
    catch{return {ok:false,code:'DELETE_FAILED'}}
  }
}
module.exports={SubscriptionStore,validateSubscriptionLink};
