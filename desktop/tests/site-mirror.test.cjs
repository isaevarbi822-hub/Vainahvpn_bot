'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
test('full website mirror retains exact bytes for every canonical site file',()=>{
 cp.execFileSync(process.execPath,[path.join(root,'desktop/scripts/sync-site.cjs')],{stdio:'pipe'});
 const source=path.join(root,'site');
 const target=path.join(root,'desktop/site-mirror');
 const manifest=JSON.parse(fs.readFileSync(path.join(target,'mirror-manifest.json'),'utf8'));
 assert.ok(manifest.files.length>=25);
 for(const {path:relative,sha256} of manifest.files){
  const a=fs.readFileSync(path.join(source,relative));
  const b=fs.readFileSync(path.join(target,relative));
  assert.deepEqual(a,b,relative);
  assert.equal(sha256,crypto.createHash('sha256').update(a).digest('hex'));
 }
 for(const name of ['index.html','plans.html','account.html','servers.html','devices.html','help.html']){
  assert.ok(manifest.files.some(entry=>entry.path===name));
 }
});
