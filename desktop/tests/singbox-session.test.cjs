'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {SingBoxSession}=require('../shared/singbox-session.cjs');
test('new native session never claims VPN protection',()=>{
 const session=new SingBoxSession();
 assert.deepEqual(session.status,{state:'stopped',protected:false,reason:null});
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
 assert.deepEqual(session.status,{state:'stopped',protected:false,reason:null});
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

test('disconnect racing with startup cannot resurrect engine',async()=>{
 const fs=require('node:fs/promises');
 const os=require('node:os');
 const path=require('node:path');
 const {EventEmitter}=require('node:events');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-start-race-'));
 const binary=path.join(dir,'sing-box.exe');
 await fs.writeFile(binary,'mock');
 const payload={outbounds:[{protocol:'vless',settings:{vnext:[{
  address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]
 }]},streamSettings:{network:'tcp',security:'reality',realitySettings:{
  serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'
 }}}]};
 const child=new EventEmitter();
 child.kill=()=>{queueMicrotask(()=>child.emit('exit',0));return true;};
 const session=new SingBoxSession({platform:'win32',runner:()=>{
   queueMicrotask(()=>child.emit('spawn'));
   return child;
 }});
 try{
   const starting=session.start(binary,payload);
   // Wait until process is spawned and session is in startup grace period.
   await new Promise(resolve=>child.once('spawn',resolve));
   const stopped=await session.stop();
   const started=await starting;
   assert.equal(stopped.ok,true);
   assert.equal(started.ok,false);
   assert.deepEqual(session.status,{state:'stopped',protected:false,reason:null});
 }finally{
   await session.stop();
   await fs.rm(dir,{recursive:true,force:true});
 }
});

test('unexpected TUN failure is reported without exposing engine logs',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {EventEmitter}=require('node:events');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-failure-check-'));
 const binary=path.join(folder,'sing-box.exe');
 await fs.writeFile(binary,'mock');
 const child=new EventEmitter();
 child.stderr=new EventEmitter();
 child.kill=()=>{queueMicrotask(()=>child.emit('exit',0));return true;};
 const session=new SingBoxSession({platform:'win32',runner:()=>{
   queueMicrotask(()=>child.emit('spawn'));
   return child;
 }});
 const sample={outbounds:[{protocol:'vless',settings:{vnext:[{
  address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]
 }]},streamSettings:{network:'tcp',security:'reality',realitySettings:{
  serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'
 }}}]};
 try{
   assert.equal((await session.start(binary,sample)).ok,true);
   child.stderr.emit('data',Buffer.from('create tun failed: secret should not leak'));
   child.emit('exit',1);
   await new Promise(resolve=>setImmediate(resolve));
   assert.equal(session.status.state,'stopped');
   assert.equal(session.status.protected,false);
   assert.equal(session.status.reason,'Не удалось создать сетевой TUN-адаптер.');
   assert.doesNotMatch(session.status.reason,/secret/);
 }finally{
   await session.stop();
   await fs.rm(folder,{recursive:true,force:true});
 }
});


test('fatal TUN diagnostic during startup rejects session and removes credentials',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {EventEmitter}=require('node:events');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-start-diagnostic-'));
 const binary=path.join(folder,'sing-box.exe');
 await fs.writeFile(binary,'mock');
 const child=new EventEmitter();
 child.stderr=new EventEmitter();
 child.kill=()=>{queueMicrotask(()=>child.emit('exit',1));return true};
 let configPath;
 const session=new SingBoxSession({platform:'win32',runner:(_exe,args)=>{
   configPath=args[2];
   queueMicrotask(()=>{
     child.emit('spawn');
     child.stderr.emit('data',Buffer.from('create tun failed: sensitive host token'));
   });
   return child;
 }});
 const sample={outbounds:[{protocol:'vless',settings:{vnext:[{
  address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]
 }]},streamSettings:{network:'tcp',security:'reality',realitySettings:{
  serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'
 }}}]};
 try{
   const result=await session.start(binary,sample);
   assert.equal(result.ok,false);
   assert.equal(result.protected,false);
   assert.equal(result.reason,'Не удалось создать сетевой TUN-адаптер.');
   assert.equal(session.status.state,'stopped');
   assert.doesNotMatch(result.reason,/sensitive/);
   await assert.rejects(fs.stat(configPath),{code:'ENOENT'});
 }finally{
   await session.stop();
   await fs.rm(folder,{recursive:true,force:true});
 }
});


test('fatal diagnostic after startup terminates engine and clears private config',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const {EventEmitter}=require('node:events');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-runtime-failure-'));
 const binary=path.join(folder,'sing-box.exe');
 await fs.writeFile(binary,'mock');
 const child=new EventEmitter();
 child.stderr=new EventEmitter();
 let kills=0,configPath;
 child.kill=()=>{kills++;queueMicrotask(()=>child.emit('exit',1));return true};
 const session=new SingBoxSession({platform:'win32',runner:(_exe,args)=>{
   configPath=args[2];
   queueMicrotask(()=>child.emit('spawn'));
   return child;
 }});
 const sample={outbounds:[{protocol:'vless',settings:{vnext:[{
  address:'example.invalid',port:443,users:[{id:'12345678-1234-1234-1234-123456789abc'}]
 }]},streamSettings:{network:'tcp',security:'reality',realitySettings:{
  serverName:'example.com',publicKey:'synthetic-public-key',shortId:'a1b2'
 }}}]};
 try{
   assert.equal((await session.start(binary,sample)).ok,true);
   child.stderr.emit('data',Buffer.from('DNS lookup failed: hidden server credential'));
   await session.exitPromise;
   assert.equal(kills,1);
   assert.equal(session.status.state,'stopped');
   assert.equal(session.status.protected,false);
   assert.equal(session.status.reason,'Ошибка DNS при обращении к серверу.');
   await assert.rejects(fs.stat(configPath),{code:'ENOENT'});
 }finally{
   await session.stop();
   await fs.rm(folder,{recursive:true,force:true});
 }
});
