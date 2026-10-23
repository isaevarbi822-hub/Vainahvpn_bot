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
    this.exitPromise=null; this.lastError=null;
  }
  get status() {return Object.freeze({state:this.state,protected:false,reason:this.lastError||null});}
  async start(binary,xrayJson) {
    if(this.state!=='stopped'||this.child||this.temp)return {ok:false,reason:'Already running or starting'};
    this.state='starting'; this.lastError=null;
    try {
      if(this.platform!=='win32')throw Error('Windows-only engine');
      if(typeof binary!=='string'||!path.isAbsolute(binary)||path.basename(binary).toLowerCase()!=='sing-box.exe')
        throw Error('Invalid binary path');
      const stat=await fs.stat(binary);
      if(!stat.isFile())throw Error('Binary unavailable');
      if(this.state!=='starting')return {ok:false,reason:'Startup cancelled',protected:false};
      const config=buildSingBoxConfig(xrayJson);
      this.temp=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-session-'));
      await fs.chmod(this.temp,0o700);
      const configPath=path.join(this.temp,'config.json');
      await fs.writeFile(configPath,JSON.stringify(config),{mode:0o600,flag:'wx'});
      if(this.state!=='starting'){
        await this.stop();
        return {ok:false,reason:'Startup cancelled',protected:false};
      }
      const child=this.runner(binary,['run','-c',configPath],{
        cwd:this.temp,windowsHide:true,shell:false,stdio:['ignore','ignore','pipe']
      });
      this.child=child;
      // Inspect only known failure categories. Never store/log raw engine output,
      // because diagnostics can contain server addresses or credentials.
      if(child.stderr?.on)child.stderr.on('data',chunk=>{
        const line=String(chunk).slice(0,2048).toLowerCase();
        if(/access is denied|permission denied|requires administrator|administrator privilege/.test(line))
          this.lastError='Недостаточно системных прав для запуска TUN.';
        else if(/wintun|tun device|create tun|network adapter/.test(line))
          this.lastError='Не удалось создать сетевой TUN-адаптер.';
        else if(/no such host|lookup .* failed|dns.*failed/.test(line))
          this.lastError='Ошибка DNS при обращении к серверу.';
        else if(/invalid config|decode config|unknown field/.test(line))
          this.lastError='Движок отклонил конфигурацию.';
      });
      this.exitPromise=new Promise(resolve=>{
        let settled=false;
        const finish=()=>{
          if(settled)return;
          settled=true;
          if(this.child===child){
            if(this.state==='running-unverified'&&!this.lastError)this.lastError='VPN-движок неожиданно завершился.';
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
      if(!spawned||this.child!==child||this.state!=='starting'){
        await this.stop();
        return {ok:false,reason:'Engine did not start or startup was cancelled',protected:false};
      }
      // A successful OS spawn can still exit immediately (invalid TUN permissions,
      // missing driver, bad config). Do not report success for that failure.
      await Promise.race([
        this.exitPromise,
        new Promise(resolve=>setTimeout(resolve,1500))
      ]);
      if(this.child!==child||this.state!=='starting'){
        if(this.child===child)await this.stop();
        return {ok:false,reason:this.lastError||'Движок остановился сразу после запуска.',protected:false};
      }
      // A fatal engine diagnostic during the startup grace period is a failed
      // start, even when the process has not exited yet. Never report started.
      if(this.lastError){
        const reason=this.lastError;
        await this.stop();
        return {ok:false,reason,protected:false};
      }
      this.state='running-unverified';
      return {ok:true,started:true,protected:false};
    } catch {
      await this.stop();
      return {ok:false,reason:this.lastError||'Не удалось запустить VPN-движок.',protected:false};
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
