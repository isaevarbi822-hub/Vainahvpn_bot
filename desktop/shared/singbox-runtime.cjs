'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { buildSingBoxConfig } = require('./singbox-config.cjs');

// First native-engine integration seam: runs the official sing-box configuration
// validator only. It does NOT create a TUN device or claim that traffic is safe.
// Never log a subscription JSON, local path, or subprocess stdout/stderr.
async function validateWithSingBox(binaryPath, xrayPayload, options={}) {
  if (typeof binaryPath !== 'string' || !path.isAbsolute(binaryPath))
    return {ok:false,reason:'Select an absolute engine path'};
  const base = path.basename(binaryPath).toLowerCase();
  if (process.platform === 'win32' ? base !== 'sing-box.exe' : base !== 'sing-box')
    return {ok:false,reason:'Engine filename must be sing-box'};
  const run = options.runner || spawn;
  let dir;
  try {
    const st = await fs.stat(binaryPath);
    if (!st.isFile()) return {ok:false,reason:'Engine file not found'};
    const config = buildSingBoxConfig(xrayPayload);
    dir = await fs.mkdtemp(path.join(os.tmpdir(),'vainah-check-'));
    await fs.chmod(dir,0o700);
    const configPath = path.join(dir,'config.json');
    await fs.writeFile(configPath,JSON.stringify(config),{encoding:'utf8',mode:0o600,flag:'wx'});
    const code = await new Promise((resolve,reject)=>{
      const child = run(binaryPath,['check','-c',configPath],{
        windowsHide:true,stdio:'ignore',shell:false,cwd:dir,env:{...process.env},
      });
      let completed=false;
      const finish=(value,isError=false)=>{
        if(completed)return;
        completed=true;
        clearTimeout(timer);
        if(isError)reject(value);
        else resolve(value);
      };
      const timer=setTimeout(()=>{
        try { child.kill(); } catch {}
        finish(null);
      },12000);
      child.once('error',err=>finish(err,true));
      child.once('exit',exitCode=>finish(exitCode));
    });
    return code===0?{ok:true,validated:true,tunnelActive:false}:
      {ok:false,reason:'Engine rejected configuration'};
  } catch {
    return {ok:false,reason:'Engine validation unavailable'};
  } finally {
    if(dir)await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
module.exports={validateWithSingBox};
