'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {saveSubscription,loadSubscription,clearSubscription}=
  require('../shared/subscription-store.cjs');

const link='https://sub.example.com:8443/secret?token=PRIVATE_ACCOUNT_TOKEN';
function cryptoMock(){
 return {
  isAsyncEncryptionAvailable:async()=>true,
  // TEST STUB ONLY. Real app uses Electron safeStorage/Windows DPAPI.
  encryptStringAsync:async text=>Buffer.from('ENCRYPTED:'+Buffer.from(text).toString('base64')),
  decryptStringAsync:async blob=>{
   if(!blob.toString().startsWith('ENCRYPTED:'))throw Error('Tampered');
   return {result:Buffer.from(blob.toString().slice(10),'base64').toString('utf8')};
  }
 };
}
async function working(fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vainah-store-test-'));
 try{await fn(root);}finally{await fs.rm(root,{recursive:true,force:true});}
}
test('Windows private store encrypts H1 bearer link before writing to disk',async()=>{
 await working(async root=>{
  const safeStorage=cryptoMock();
  assert.equal(await saveSubscription({type:'https',uri:link},{root,safeStorage}),true);
  const contents=await fs.readdir(root);
  assert.equal(contents.length,1);
  const blob=await fs.readFile(path.join(root,contents[0]));
  assert.equal(blob.includes(Buffer.from('PRIVATE_ACCOUNT_TOKEN')),false);
  assert.equal(blob.includes(Buffer.from(link)),false);
  assert.deepEqual(await loadSubscription({root,safeStorage}),{type:'https',uri:link});
 });
});
test('stores VLESS keys and replaces previous H1 subscription in one private file',async()=>{
 await working(async root=>{
  const safeStorage=cryptoMock();
  const vless='vless://12345678-1234-1234-1234-123456789abc@example.com:443?security=reality&type=tcp';
  assert.equal(await saveSubscription({type:'https',uri:link},{root,safeStorage}),true);
  assert.equal(await saveSubscription({type:'vless',uri:vless},{root,safeStorage}),true);
  assert.deepEqual(await loadSubscription({root,safeStorage}),{type:'vless',uri:vless});
  assert.equal((await fs.readdir(root)).length,1);
  assert.equal(await clearSubscription({root}),true);
  assert.equal(await loadSubscription({root,safeStorage}),null);
 });
});
test('never falls back to plaintext when OS encryption is unavailable',async()=>{
 await working(async root=>{
  const safeStorage={isAsyncEncryptionAvailable:async()=>false,
    encryptStringAsync:()=>{throw Error('must not be used')}};
  assert.equal(await saveSubscription({type:'https',uri:link},{root,safeStorage}),false);
  assert.equal((await fs.readdir(root)).length,0);
  assert.equal(await loadSubscription({root,safeStorage}),null);
 });
});
test('damaged, oversized and malicious storage is not restored',async()=>{
 await working(async root=>{
  const safeStorage=cryptoMock();
  assert.equal(await loadSubscription({root,safeStorage}),null);
  assert.equal(await saveSubscription({type:'https',uri:'javascript:evil'},{root,safeStorage}),false);
  assert.equal(await saveSubscription({type:'https',uri:'http://example.com'},{root,safeStorage}),false);
  assert.equal(await saveSubscription({type:'vless',uri:'https://example.com'},{root,safeStorage}),false);
  await fs.writeFile(path.join(root,'vpn-subscription-v1.dat'),Buffer.from('malformed'));
  assert.equal(await loadSubscription({root,safeStorage}),null);
  await fs.writeFile(path.join(root,'vpn-subscription-v1.dat'),Buffer.alloc(128*1024+1));
  assert.equal(await loadSubscription({root,safeStorage}),null);
 });
});
test('desktop startup and forgotten subscription never reveal URL to renderer',async()=>{
 const main=await fs.readFile(path.join(__dirname,'../src/main.cjs'),'utf8');
 const preload=await fs.readFile(path.join(__dirname,'../src/preload.cjs'),'utf8');
 const ui=await fs.readFile(path.join(__dirname,'../ui/app.js'),'utf8');
 assert.match(main,/void restorePreviousSubscription\(\)/);
 assert.match(main,/await loadSubscription\(\{root:app.getPath\('userData'\),safeStorage\}\)/);
 assert.match(main,/async function rememberSubscription/);
 assert.match(main,/subscriptionGeneration\+\+/);
 assert.match(main,/ipcMain\.handle\('vainah:forget-subscription'/);
 assert.match(preload,/forgetSubscription:\(\)=>ipcRenderer\.invoke\('vainah:forget-subscription'\)/);
 assert.match(ui,/getElementById\('forget-vpn-link'\)/);
 assert.doesNotMatch(main,/console\.(log|error)\(.*subscriptionUrl/);
});
