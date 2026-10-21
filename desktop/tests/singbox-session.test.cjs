'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SingBoxSession}=require('../shared/singbox-session.cjs');
test('new native session never claims VPN protection',()=>{
 const session=new SingBoxSession();
 assert.deepEqual(session.status,{state:'stopped',protected:false});
});
test('stop before start is safe and idempotent',async()=>{
 const session=new SingBoxSession();
 assert.deepEqual(await session.stop(),{ok:true,protected:false});
 assert.deepEqual(await session.stop(),{ok:true,protected:false});
});
test('invalid engine cannot enter connected state',async()=>{
 const session=new SingBoxSession();
 const result=await session.start('not-absolute','{}');
 assert.equal(result.ok,false);
 assert.deepEqual(session.status,{state:'stopped',protected:false});
});

test('mock engine exits and removes sensitive temporary config',async()=>{
 const fs=require('node:fs/promises');
 const os=require('node:os');
 const path=require('node:path');
 const {EventEmitter}=require('node:events');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-test-engine-'));
 const binary=path.join(folder,'sing-box.exe');
 await fs.writeFile(binary,'mock');
 const child=new EventEmitter();
 child.kill=()=>{queueMicrotask(()=>child.emit('exit',0));return true};
 let configPath;
 const session=new SingBoxSession({platform:'win32',runner:(_exe,args)=>{
   configPath=args[2];
   queueMicrotask(()=>child.emit('spawn'));
   return child;
 }});
 const payload={outbounds:[{protocol:'vless',settings:{vnext:[{
  address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]
 }]},streamSettings:{network:'tcp',security:'reality',realitySettings:{
  serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'
 }}}]};
 try{
   const started=await session.start(binary,payload);
   assert.equal(started.ok,true);
   assert.equal(session.status.protected,false);
   assert.equal(session.status.state,'running-unverified');
   assert.equal((await fs.stat(configPath)).isFile(),true);
   const stopped=await session.stop();
   assert.equal(stopped.ok,true);
   assert.equal(session.status.state,'stopped');
   await assert.rejects(fs.stat(configPath),{code:'ENOENT'});
   assert.equal((await session.stop()).ok,true);
 }finally{
   await session.stop();
   await fs.rm(folder,{recursive:true,force:true});
 }
});

test('an engine that exits immediately after spawn is not treated as started',async()=>{
 const fs=require('node:fs/promises');
 const os=require('node:os');
 const path=require('node:path');
 const {EventEmitter}=require('node:events');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-early-exit-'));
 const binary=path.join(folder,'sing-box.exe');
 await fs.writeFile(binary,'mock');
 const payload={outbounds:[{protocol:'vless',settings:{vnext:[{
  address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]
 }]},streamSettings:{network:'tcp',security:'reality',realitySettings:{
  serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'
 }}}]};
 const session=new SingBoxSession({platform:'win32',runner:()=>{
   const child=new EventEmitter();
   child.kill=()=>true;
   queueMicrotask(()=>{
     child.emit('spawn');
     setImmediate(()=>child.emit('exit',1));
   });
   return child;
 }});
 try{
   const started=await session.start(binary,payload);
   assert.equal(started.ok,false);
   assert.equal(session.status.state,'stopped');
   assert.equal(session.status.protected,false);
 }finally{
   await session.stop();
   await fs.rm(folder,{recursive:true,force:true});
 }
});
