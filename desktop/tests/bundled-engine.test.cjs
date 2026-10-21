'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {EngineHost}=require('../src/engine-host.cjs');

test('packaged Windows app automatically selects an existing sing-box executable',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-bundled-'));
 try{
  fs.mkdirSync(path.join(dir,'engines'));
  fs.writeFileSync(path.join(dir,'engines','sing-box.exe'),'only a file fixture');
  const host=new EngineHost('win32',dir);
  assert.equal(host.phase,'ready');
  assert.equal(host.executable,path.join(dir,'engines','sing-box.exe'));
  assert.equal(host.status().protected,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('packaged macOS app chooses the host CPU architecture and remains unverified',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-bundled-'));
 const name=process.arch==='arm64'?'sing-box-darwin-arm64':'sing-box-darwin-amd64';
 try{
  fs.mkdirSync(path.join(dir,'engines'));
  fs.writeFileSync(path.join(dir,'engines',name),'only a file fixture');
  const host=new EngineHost('darwin',dir);
  assert.equal(host.phase,'ready');
  assert.equal(path.basename(host.executable),name);
  assert.equal(host.status().protected,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('missing core or directory cannot masquerade as protected tunnel',()=>{
 const host=new EngineHost('win32','/nonexistent/vainah-engine-test');
 assert.equal(host.status().state,'unavailable');
 assert.equal(host.status().protected,false);
});
