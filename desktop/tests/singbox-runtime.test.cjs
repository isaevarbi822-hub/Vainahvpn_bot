'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {EventEmitter}=require('node:events');
const {validateWithSingBox}=require('../shared/singbox-runtime.cjs');
const valid=()=>JSON.stringify({outbounds:[{
 protocol:'vless',settings:{vnext:[{
 address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]}]},
 streamSettings:{security:'reality',network:'tcp',realitySettings:{
 publicKey:'fictional-key',serverName:'example.com'}}}]});
test('rejects absent engine without writing configuration',async()=>{
 const result=await validateWithSingBox('sing-box',valid());
 assert.equal(result.ok,false);
});
test('invokes check command without exposing secret arguments',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-runner-test-'));
 const binary=path.join(dir,process.platform==='win32'?'sing-box.exe':'sing-box');
 await fs.writeFile(binary,'dummy');
 try{
   let inspected=false;
   const runner=(exe,args,options)=>{
     inspected=true;
     assert.equal(exe,binary);
     assert.deepEqual(args.slice(0,2),['check','-c']);
     assert.equal(options.shell,false);
     assert.ok(!JSON.stringify(args).includes('fictional-key'));
     const child=new EventEmitter();
     child.kill=()=>{};
     process.nextTick(()=>child.emit('exit',0));
     return child;
   };
   const result=await validateWithSingBox(binary,valid(),{runner});
   assert.equal(inspected,true);
   assert.deepEqual(result,{ok:true,validated:true,tunnelActive:false});
 } finally {await fs.rm(dir,{recursive:true,force:true})}
});
test('refuses invalid configuration before spawning',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-runner-test-'));
 const binary=path.join(dir,process.platform==='win32'?'sing-box.exe':'sing-box');
 await fs.writeFile(binary,'dummy');
 try{
   let invoked=false;
   const result=await validateWithSingBox(binary,'{}',{runner:()=>{invoked=true}});
   assert.equal(result.ok,false);
   assert.equal(invoked,false);
 } finally {await fs.rm(dir,{recursive:true,force:true})}
});

test('validation failure from engine is reported without claiming a tunnel',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-runner-test-'));
 const binary=path.join(dir,process.platform==='win32'?'sing-box.exe':'sing-box');
 await fs.writeFile(binary,'dummy');
 try {
   const runner=()=>{
     const child=new EventEmitter();
     child.kill=()=>{};
     process.nextTick(()=>child.emit('exit',1));
     return child;
   };
   assert.deepEqual(await validateWithSingBox(binary,valid(),{runner}),
     {ok:false,reason:'Engine rejected configuration'});
 } finally {await fs.rm(dir,{recursive:true,force:true})}
});
