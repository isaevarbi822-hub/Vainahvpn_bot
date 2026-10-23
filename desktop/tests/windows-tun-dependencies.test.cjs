'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {checkTunDependencies}=require('../shared/windows-tun-dependencies.cjs');

test('Windows TUN never starts without verified build components',async()=>{
  assert.deepEqual(await checkTunDependencies('relative/sing-box.exe'),{ok:false});
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-driver-test-'));
  try{
    const exe=path.join(dir,'sing-box.exe');
    await fs.writeFile(exe,'synthetic');
    assert.deepEqual(await checkTunDependencies(exe),{ok:false});
    await fs.writeFile(path.join(dir,'wintun.dll'),'synthetic');
    assert.deepEqual(await checkTunDependencies(exe),{ok:false});
    await fs.writeFile(path.join(dir,'WINTUN-LICENSE.txt'),'synthetic');
    assert.deepEqual(await checkTunDependencies(exe),{ok:true});
    await fs.rm(path.join(dir,'wintun.dll'));
    assert.deepEqual(await checkTunDependencies(exe),{ok:false});
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
