'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {fetchSubscription}=require('../shared/https-subscription.cjs');
const uri='vless://12345678-1234-1234-1234-123456789abc@node.example.com:443?security=reality&type=tcp&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sni=example.com';
const resolver=async()=>[{address:'8.8.8.8',family:4}];

function fakeRequest(expectedAll,seen){
 return (url,opts,cb)=>{
   const request=new EventEmitter();
   request.destroy=err=>request.emit('error',err);
   const reply=new EventEmitter();
   reply.statusCode=200;
   reply.headers={};
   reply.resume=()=>{};
   opts.lookup(url.hostname,expectedAll?{family:undefined,hints:32,all:true}:{all:false},
     (err,result,family)=>{
       assert.ifError(err);
       if(expectedAll)assert.deepEqual(result,[{address:'8.8.8.8',family:4}]);
       else{assert.equal(result,'8.8.8.8');assert.equal(family,4);}
       seen.push(result);
     });
   queueMicrotask(()=>{
     cb(reply);reply.emit('data',Buffer.from(uri));reply.emit('end');
   });
   return request;
 };
}
test('Node 22 multi-family HTTPS lookup returns [{address,family}], not a string',async()=>{
 const seen=[];
 const reply=await fetchSubscription('https://panel.example.com/sub?key=HIDDEN',{
   resolver,request:fakeRequest(true,seen)
 });
 assert.equal(reply.count,1);
 assert.deepEqual(seen,[[{address:'8.8.8.8',family:4}]]);
});
test('legacy one-IP lookup remains compatible',async()=>{
 const seen=[];
 assert.equal((await fetchSubscription('https://panel.example.com/sub',{
   resolver,request:fakeRequest(false,seen)
 })).count,1);
 assert.deepEqual(seen,['8.8.8.8']);
});
test('IPv6 pinning uses family 6 in both lookup signatures',async()=>{
 for(const all of [false,true]){
   const res=await fetchSubscription('https://panel.example.com/sub',{
     resolver:async()=>[{address:'2606:4700:4700::1111',family:6}],
     request:(_url,opts,cb)=>{
       opts.lookup('panel.example.com',{all},(err,address,family)=>{
         assert.ifError(err);
         if(all)assert.deepEqual(address,[{address:'2606:4700:4700::1111',family:6}]);
         else{assert.equal(address,'2606:4700:4700::1111');assert.equal(family,6);}
       });
       const req=new EventEmitter();req.destroy=e=>req.emit('error',e);
       const reply=new EventEmitter();reply.statusCode=200;reply.headers={};reply.resume=()=>{};
       queueMicrotask(()=>{cb(reply);reply.emit('data',Buffer.from(uri));reply.emit('end')});
       return req;
     }
   });
   assert.equal(res.count,1);
 }
});
