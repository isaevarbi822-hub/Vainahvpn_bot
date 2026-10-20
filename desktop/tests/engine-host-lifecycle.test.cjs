'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EngineHost}=require('../src/engine-host.cjs');

const profile='vless://123e4567-e89b-42d3-a456-426614174000@vpn.invalid:443?security=reality&type=tcp&sni=www.example.org&pbk=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&sid=abcd&fp=chrome';
const wait=async (predicate,timeout=5000)=>{
 const start=Date.now();
 while(Date.now()-start<timeout){
  if(predicate())return true;
  await new Promise(resolve=>setTimeout(resolve,30));
 }
 return false;
};

test('fake process lifecycle never claims protected traffic and removes private config',async t=>{
 if(process.platform==='win32')return t.skip('POSIX executable test on Linux/macOS CI only');
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-test-engine-'));
 const executable=path.join(work,'sing-box');
 const source=[
  '#!/usr/bin/env node',
  "'use strict';",
  "const action=process.argv[2];",
  "if(action==='version'||action==='check')process.exit(0);",
  "if(action==='run')setInterval(()=>{},1000);",
  "else process.exit(1);"
 ].join('\n');
 fs.writeFileSync(executable,source,{mode:0o700});
 const host=new EngineHost('darwin');
 t.after(()=>{
  host.stop();
  try{if(host.proc)host.proc.kill('SIGKILL')}catch{}
  fs.rmSync(work,{recursive:true,force:true});
 });
 assert.deepEqual(host.setExecutable(executable),{ok:true});
 const result=await host.start(profile);
 assert.deepEqual(result,{ok:true,verified:false});
 assert.equal(host.status().state,'running');
 assert.equal(host.status().protected,false);
 const configDir=host.temp;
 assert.ok(configDir&&fs.existsSync(path.join(configDir,'config.json')));
 assert.equal(fs.statSync(path.join(configDir,'config.json')).mode&0o777,0o600);
 assert.deepEqual(host.stop(),{ok:true,verified:false});
 assert.equal(host.status().protected,false);
 assert.ok(await wait(()=>host.proc===null));
 assert.ok(!fs.existsSync(configDir));
});

test('engine never enters running on invalid config or invalid executable',async()=>{
 const host=new EngineHost('darwin');
 assert.deepEqual(host.setExecutable('/does-not-exist/sing-box'),{
   ok:false,code:'INVALID_EXECUTABLE'
 });
 assert.deepEqual(await host.start(profile),{ok:false,code:'ENGINE_REQUIRED'});
 assert.notEqual(host.status().state,'running');
 assert.equal(host.status().protected,false);
});
