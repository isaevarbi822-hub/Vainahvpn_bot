'use strict';
/**
 * Experimental Windows/macOS sing-box runner. No auto-elevation, downloads,
 * telemetry, logs or permanent profile storage. Only run binaries selected by
 * the user. "running" does NOT mean protected until egress/DNS/routes prove it.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {loadSubscription,fromSubscriptionText,toTunConfig}=require('../shared/engine-config.cjs');

class EngineHost {
  constructor(platform=process.platform){
    this.platform=platform;
    this.executable=null;
    this.proc=null;
    this.temp=null;
    this.generation=0;
    this.phase='unavailable';
  }
  status(){
    const phase=this.phase;
    return Object.freeze({
      state:phase,
      protected:false,
      explanation:{
        unavailable:'Нужно выбрать официальный sing-box 1.14. VPN выключен.',
        ready:'Движок выбран. VPN пока не подключён.',
        preparing:'Подготовка Reality-конфигурации. VPN ещё не активен.',
        running:'Сетевой процесс запущен. Защита маршрутов и DNS ещё не проверена.',
        stopping:'Отключение VPN-процесса. Дожидаемся подтверждения остановки.', 
        error:'Не удалось запустить VPN. Соединение не подтверждено.',
        stopped:'VPN-процесс остановлен.'
      }[phase]||'VPN не подтверждён.'
    });
  }
  setExecutable(file){
    if(this.proc||this.phase==='preparing')return {ok:false,code:'BUSY'};
    if(!['darwin','win32'].includes(this.platform)||
       typeof file!=='string'||!path.isAbsolute(file)||
       !/^sing-box(?:\.exe)?$/i.test(path.basename(file)))
      return {ok:false,code:'INVALID_EXECUTABLE'};
    try{if(!fs.statSync(file).isFile())return {ok:false,code:'INVALID_EXECUTABLE'}}
    catch{return {ok:false,code:'INVALID_EXECUTABLE'}}
    this.executable=file;
    this.phase='ready';
    return {ok:true};
  }
  runCheck(file,args,timeoutMs=9000){
    return new Promise(resolve=>{
      let complete=false;
      let child;
      try{
        child=spawn(file,args,{shell:false,windowsHide:true,stdio:'ignore'});
      }catch{return resolve(false)}
      const timer=setTimeout(()=>{child.kill();done(false)},timeoutMs);
      function done(ok){
        if(complete)return;
        complete=true;clearTimeout(timer);resolve(ok);
      }
      child.once('error',()=>done(false));
      child.once('close',code=>done(code===0));
    });
  }
  /**
   * Only the pinned, CI-validated sing-box 1.14.3 configuration is supported.
   * A zero exit status alone is insufficient: older binaries can silently
   * interpret routing or DNS differently. This is NOT a binary authenticity
   * check; users must still obtain sing-box from its official release.
   */
  checkVersion(){
    return new Promise(resolve=>{
      let complete=false,output='',child;
      const done=ok=>{
        if(complete)return;
        complete=true;
        clearTimeout(timer);
        resolve(ok);
      };
      try{
        child=spawn(this.executable,['version'],{
          shell:false,windowsHide:true,stdio:['ignore','pipe','ignore']
        });
      }catch{return resolve(false)}
      const timer=setTimeout(()=>{child.kill();done(false)},4000);
      child.stdout.on('data',chunk=>{
        output+=chunk.toString('utf8');
        if(output.length>4096){child.kill();done(false)}
      });
      child.once('error',()=>done(false));
      child.once('close',code=>done(code===0&&/^sing-box version 1\.14\.3(?:\s|$)/m.test(output)));
    });
  }
  async start(secret){
    if(this.proc||this.phase==='preparing')return {ok:false,code:'BUSY'};
    if(!this.executable)return {ok:false,code:'ENGINE_REQUIRED'};
    if(typeof secret!=='string'||secret.length<12||secret.length>2048||
       /[\r\n\x00-\x1f]/.test(secret))return {ok:false,code:'SUBSCRIPTION_INVALID'};
    const generation=++this.generation;
    this.phase='preparing';
    try{
      if(!await this.checkVersion())
        throw Error('ENGINE_UNAVAILABLE');
      const profile=secret.startsWith('https://')?await loadSubscription(secret):secret;
      if(generation!==this.generation)return {ok:false,code:'CANCELLED'};
      const outbound=fromSubscriptionText(profile);
      const config=toTunConfig(outbound,this.platform);
      // Engine validates config before attempting to configure the OS.
      const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-engine-'));
      fs.chmodSync(dir,0o700);
      this.temp=dir;
      const filename=path.join(dir,'config.json');
      fs.writeFileSync(filename,JSON.stringify(config),{mode:0o600,flag:'wx'});
      if(!await this.runCheck(this.executable,['check','-c',filename],10000))
        throw Error('CONFIG_REJECTED');
      if(generation!==this.generation){
        this.cleanup();
        return {ok:false,code:'CANCELLED'};
      }
      const processHandle=spawn(this.executable,['run','-c',filename],{
        shell:false,windowsHide:true,stdio:'ignore'
      });
      this.proc=processHandle;
      this.phase='running';
      processHandle.once('error',()=>this.processStopped(processHandle));
      processHandle.once('close',()=>this.processStopped(processHandle));
      return {ok:true,verified:false};
    }catch{
      if(generation===this.generation){
        this.cleanup();
        this.phase='error';
      }
      return {ok:false,code:'ENGINE_START_FAILED'};
    }
  }
  processStopped(proc){
    if(this.proc!==proc)return;
    const requested=this.phase==='stopping';
    this.proc=null;
    this.cleanup();
    this.phase=requested?'stopped':'error';
  }
  cleanup(){
    if(!this.proc&&this.temp){
      try{fs.rmSync(this.temp,{recursive:true,force:true})}catch{}
      this.temp=null;
    }
  }
  stop(){
    ++this.generation;
    if(this.proc){
      const child=this.proc;
      this.phase='stopping';
      child.kill();
      // Do not advertise stopped or delete the key-bearing config until the
      // child exits. Force termination if it ignores a graceful request.
      setTimeout(()=>{
        if(this.proc===child)child.kill('SIGKILL');
      },3000).unref();
    }else{
      this.cleanup();
      this.phase=this.executable?'ready':'unavailable';
    }
    return {ok:true,verified:false};
  }
}
module.exports={EngineHost};
