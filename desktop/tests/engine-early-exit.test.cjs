'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EngineHost}=require('../src/engine-host.cjs');

const profile='vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome';

function fakeCore(dir,runCode){
  const executable=path.join(dir,'sing-box');
  const source=[
    '#!/usr/bin/env node',
    "'use strict';",
    "const action=process.argv[2];",
    "if(action==='version'||action==='check')process.exit(0);",
    runCode,
    "else process.exit(1);"
  ].join('\n');
  fs.writeFileSync(executable,source,{mode:0o700});
  return executable;
}

test('a sing-box core exiting immediately cannot claim a running VPN process',async t=>{
 if(process.platform==='win32')return t.skip('POSIX script executable for Linux/macOS test jobs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-engine-early-exit-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const executable=fakeCore(dir,"if(action==='run')process.exit(78);");
 const host=new EngineHost('darwin');
 assert.deepEqual(host.setExecutable(executable),{ok:true});
 const result=await host.start(profile);
 assert.deepEqual(result,{ok:false,code:'ENGINE_START_FAILED'});
 assert.equal(host.status().state,'error');
 assert.equal(host.status().protected,false);
 assert.equal(host.temp,null,'failed native process must not leave token-bearing config on disk');
 assert.equal(host.proc,null);
});

test('native core startup stays unverified and preparing until it survives initial failure window',async t=>{
 if(process.platform==='win32')return t.skip('POSIX script executable for Linux/macOS test jobs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-engine-grace-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const executable=fakeCore(dir,"if(action==='run')setInterval(()=>{},500);");
 const host=new EngineHost('darwin');
 t.after(()=>{
   host.stop();
   if(host.proc)host.proc.kill('SIGKILL');
 });
 assert.deepEqual(host.setExecutable(executable),{ok:true});
 let finished=false;
 const launch=host.start(profile).finally(()=>{finished=true});
 await new Promise(resolve=>setTimeout(resolve,350));
 assert.equal(host.status().protected,false);
 assert.equal(finished,false,'start should not return success before native process startup grace');
 const result=await launch;
 assert.deepEqual(result,{ok:true,verified:false});
 assert.equal(host.status().state,'running');
 assert.equal(host.status().protected,false);
 assert.deepEqual(host.stop(),{ok:true,verified:false});
});
