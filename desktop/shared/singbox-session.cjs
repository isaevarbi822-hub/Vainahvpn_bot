'use strict';
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {buildSingBoxConfig}=require('./singbox-config.cjs');

// Low-level, opt-in Windows engine lifecycle. This is not an assertion of VPN protection.
// The caller must independently check encrypted egress, routing and DNS before reporting CONNECTED.
class SingBoxSession {
  constructor({runner=spawn,platform=process.platform}={}) {
    this.platform=platform;
    this.runner=runner; this.child=null; this.temp=null; this.state='stopped';
    this.exitPromise=null;
  }
  get status() {return Object.freeze({state:this.state,protected:false});}
  async start(binary,xrayJson) {
    if(this.state!=='stopped'||this.child||this.temp)return {ok:false,reason:'Already running or starting'};
    this.state='starting';
    try {
      if(this.platform!=='win32')throw Error('Windows-only engine');
      if(typeof binary!=='string'||!path.isAbsolute(binary)||path.basename(binary).toLowerCase()!=='sing-box.exe')
        throw Error('Invalid binary path');
      const stat=await fs.stat(binary);
      if(!stat.isFile())throw Error('Binary unavailable');
      const config=buildSingBoxConfig(xrayJson);
      this.temp=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-session-'));
      await fs.chmod(this.temp,0o700);
      const configPath=path.join(this.temp,'config.json');
      await fs.writeFile(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
      const child=this.runner(binary,['run','-c',configPath],{
        cwd:this.temp,windowsHide:true,shell:false,stdio:'ignore'
      });
      this.child=child;
      this.exitPromise=new Promise(resolve=>{
        let settled=false;
        const finish=()=>{
          if(settled)return;
          settled=true;
          if(this.child===child){
            this.child=null;
            this.state='stopped';
            const dir=this.temp;
            this.temp=null;
            // Also remove credentials after an unexpected engine exit.
            if(dir)void fs.rm(dir,{recursive:true,force:true}).catch(()=>{}).finally(resolve);
            else resolve();
          } else resolve();
        };
        child.once('exit',finish);child.once('error',finish);
      });
      // Wait for OS spawn acknowledgement, not just the ChildProcess object.
      const spawned=await new Promise(resolve=>{
        if(child.pid && !child.exitCode && !child.killed)return resolve(true);
        let done=false;
        const finish=value=>{
          if(done)return;
          done=true;
          clearTimeout(timer);
          child.removeListener('spawn',onSpawn);
          child.removeListener('error',onFailure);
          child.removeListener('exit',onFailure);
          resolve(value);
        };
        const onSpawn=()=>finish(true);
        const onFailure=()=>finish(false);
        child.once('spawn',onSpawn);
        child.once('error',onFailure);
        child.once('exit',onFailure);
        const timer=setTimeout(()=>finish(false),3000);
      });
      if(!spawned||this.child!==child){
        await this.stop();
        return {ok:false,reason:'Engine did not start',protected:false};
      }
      // A successful OS spawn can still exit immediately (invalid TUN permissions,
      // missing driver, bad config). Do not report success for that failure.
      await Promise.race([
        this.exitPromise,
        new Promise(resolve=>setTimeout(resolve,250))
      ]);
      if(this.child!==child){
        return {ok:false,reason:'Engine exited during startup',protected:false};
      }
      this.state='running-unverified';
      return {ok:true,started:true,protected:false};
    } catch {
      await this.stop();
      return {ok:false,reason:'Could not start native engine',protected:false};
    }
  }
  async stop() {
    if(this.state==='stopped'&&!this.temp)return {ok:true,protected:false};
    this.state='stopping';
    const child=this.child;
    if(child){
      try {child.kill();}catch{}
      // Never block UI forever waiting for a hung subprocess.
      await Promise.race([this.exitPromise||Promise.resolve(),new Promise(resolve=>setTimeout(resolve,2000))]);
    }
    if(this.child){
      this.state='stop-failed';
      return {ok:false,reason:'Engine process did not exit',protected:false};
    }
    // Exit handler owns credential cleanup; stop() only removes remnants.
    const temp=this.temp;
    this.temp=null;this.state='stopped';
    if(temp)await fs.rm(temp,{recursive:true,force:true}).catch(()=>{});
    return {ok:true,protected:false};
  }
}
module.exports={SingBoxSession};
