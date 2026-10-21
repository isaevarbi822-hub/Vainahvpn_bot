'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {SubscriptionStore,validateSubscriptionLink}=require('../src/subscription-store.cjs');
const good='https://vpn.example.org/secret/subscription?access=test-redacted-private-token';

function fixture(encryptionEnabled=true){
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-credential-test-'));
  const encryption={
    isEncryptionAvailable:()=>encryptionEnabled,
    encryptString:text=>Buffer.from('sealed:'+Buffer.from(text).toString('base64'),'utf8'),
    decryptString:bytes=>Buffer.from(bytes.toString('utf8').slice(7),'base64').toString('utf8')
  };
  const store=new SubscriptionStore(folder,encryption);
  return {store,folder,cleanup:()=>fs.rmSync(folder,{recursive:true,force:true})};
}
test('subscription input accepts only private HTTPS URLs and rejects malformed secrets',()=>{
 assert.equal(validateSubscriptionLink(good),good);
 for(const raw of [
  'http://vpn.example.org/test',
  'vless://uuid@vpn.example.org:443',
  'https://user:pass@vpn.example.org/test',
  'https://vpn.example.org/test#fragment',
  'https://vpn.example.org/has space',
  'https://vpn..example.org/test',
  'https://vpn.example.org/test\n',
  ''
 ])assert.equal(validateSubscriptionLink(raw),null);
});
test('secure store saves ciphertext, reloads privately and deletes the secret',()=>{
 const {store,folder,cleanup}=fixture();
 try{
  assert.deepEqual(store.status(),{saved:false,secureStorageAvailable:true});
  assert.deepEqual(store.save(good),{ok:true});
  assert.deepEqual(store.status(),{saved:true,secureStorageAvailable:true});
  const onDisk=fs.readFileSync(path.join(folder,'h1cloud-subscription.v1.enc'),'utf8');
  assert.ok(onDisk.startsWith('sealed:'));
  assert.equal(onDisk.includes('test-redacted-private-token'),false);
  assert.equal(store.load(),good);
  const second='https://vpn.example.org/new/test?access=another-token';
  assert.deepEqual(store.save(second),{ok:true});
  assert.equal(store.load(),second);
  assert.deepEqual(store.clear(),{ok:true});
  assert.equal(store.load(),null);
  assert.equal(store.status().saved,false);
 }finally{cleanup()}
});
test('missing OS encryption blocks saving, loading and any plaintext fallback',()=>{
 const {store,folder,cleanup}=fixture(false);
 try{
  assert.deepEqual(store.save(good),{ok:false,code:'ENCRYPTION_UNAVAILABLE'});
  assert.equal(store.load(),null);
  assert.deepEqual(store.status(),{saved:false,secureStorageAvailable:false});
  assert.equal(fs.existsSync(path.join(folder,'h1cloud-subscription.v1.enc')),false);
 }finally{cleanup()}
});
test('invalid and corrupted file never leaks secrets into status',()=>{
 const {store,folder,cleanup}=fixture();
 try{
  assert.deepEqual(store.save('not-a-link'),{ok:false,code:'SUBSCRIPTION_INVALID'});
  assert.deepEqual(store.save(good),{ok:true});
  fs.writeFileSync(path.join(folder,'h1cloud-subscription.v1.enc'),Buffer.from('corrupt'));
  assert.equal(store.load(),null);
  assert.equal(JSON.stringify(store.status()).includes('test-redacted-private-token'),false);
 }finally{cleanup()}
});
