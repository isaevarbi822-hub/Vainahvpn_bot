'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fetchSubscription,publicAddress}=require('../shared/https-subscription.cjs');
const sample='vless://12345678-1234-1234-1234-123456789abc@example.invalid:443?security=reality&type=tcp&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sid=a1b2&sni=example.com';
test('rejects private and local DNS results',()=>{
 for(const ip of ['127.0.0.1','10.0.0.2','192.168.1.1','172.17.1.1','::1','fc00::1'])
  assert.equal(publicAddress(ip),false);
 assert.equal(publicAddress('8.8.8.8'),true);
});
test('rejects non HTTPS and credentials before making a request',async()=>{
 for(const url of ['http://example.com/a','https://user:pass@example.com/a','https://127.0.0.1/a'])
  await assert.rejects(fetchSubscription(url));
});
test('base64 subscription imports a supported VLESS server',async()=>{
 const {EventEmitter}=require('node:events');
 const result=await fetchSubscription('https://subscription.example.com/key',{
  resolver:async()=>[{address:'8.8.8.8',family:4}],
  request:(_url,opts,callback)=>{
   assert.equal(opts.maxRedirects,0);
   const req=new EventEmitter();
   req.destroy=error=>req.emit('error',error);
   const res=new EventEmitter();
   res.statusCode=200;
   res.resume=()=>{};
   queueMicrotask(()=>{
    callback(res);
    res.emit('data',Buffer.from(Buffer.from(sample).toString('base64')));
    res.emit('end');
   });
   return req;
  }
 });
 assert.equal(result.count,1);
 assert.equal(result.profiles[0].outbounds[0].protocol,'vless');
});

test('plaintext HTTPS subscription accepts multiple VLESS links',async()=>{
 const {EventEmitter}=require('node:events');
 const list=[sample,sample.replace('example.invalid','second.example')].join('\n');
 const result=await fetchSubscription('https://subscription.example.com/list',{
  resolver:async()=>[{address:'8.8.8.8',family:4}],
  request:(_url,_options,callback)=>{
   const req=new EventEmitter();
   req.destroy=error=>req.emit('error',error);
   const res=new EventEmitter();
   res.statusCode=200;
   res.resume=()=>{};
   queueMicrotask(()=>{callback(res);res.emit('data',Buffer.from(list));res.emit('end')});
   return req;
  }
 });
 assert.equal(result.count,2);
 assert.equal(result.profiles[1].outbounds[0].settings.vnext[0].address,'second.example');
});
