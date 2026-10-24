'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {fetchSubscription}=require('../shared/https-subscription.cjs');
const uri='vless://12345678-1234-1234-1234-123456789abc@example.invalid:443?security=reality&type=tcp&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sid=a1b2&sni=example.com';

function fakeRequest(steps,seen){
 return (url,options,callback)=>{
  seen.push({url:url.toString(),options});
  const req=new EventEmitter();
  req.destroy=error=>req.emit('error',error);
  const res=new EventEmitter();
  const step=steps.shift();
  res.statusCode=step.status;
  res.headers={location:step.location};
  res.resume=()=>{};
  queueMicrotask(()=>{
   callback(res);
   if(step.status===200){
     res.emit('data',Buffer.from(step.body||uri));
     res.emit('end');
   }
  });
  return req;
 };
}
const resolver=async()=>[{address:'8.8.8.8',family:4}];
test('same-origin HTTPS 301/302 follows with IP pinning and no cross-host requests',async()=>{
 const seen=[];
 const steps=[{status:301,location:'/real/path?key=protected'},{status:200,body:uri}];
 const result=await fetchSubscription(' "https://sub.example.com/start" ',{
  resolver,request:fakeRequest(steps,seen)
 });
 assert.equal(result.count,1);
 assert.equal(seen.length,2);
 assert.match(seen[1].url,/sub.example.com\/real\/path\?key=protected/);
 for(const call of seen) {
  assert.equal(call.options.maxRedirects,0);
  call.options.lookup('sub.example.com',{},(_err,ip,family)=>{
   assert.equal(ip,'8.8.8.8');assert.equal(family,4);
  });
 }
});
test('cross-origin redirects are rejected without sending bearer URLs to next host',async()=>{
 const seen=[];
 const secret='https://sub.example.com/start?token=VERY_SECRET';
 await assert.rejects(
   fetchSubscription(secret,{resolver,request:fakeRequest([
      {status:302,location:'https://other.example.com/secret?token=VERY_SECRET'}],seen)}),
   /Subscription redirect refused/
 );
 assert.equal(seen.length,1);
 assert.equal(seen[0].url,secret);
});
test('HTTP downgrade is refused and redirect loops are bounded',async()=>{
 for(const location of ['http://sub.example.com/key','https://user@sub.example.com/key']){
   const seen=[];
   await assert.rejects(fetchSubscription('https://sub.example.com/start',{
     resolver,request:fakeRequest([{status:307,location}],seen)}),/Subscription redirect refused/);
   assert.equal(seen.length,1);
 }
 const seen=[];
 await assert.rejects(fetchSubscription('https://sub.example.com/key',{
  resolver,request:fakeRequest(Array(3).fill({status:308,location:'/key'}),seen)
 }),/Subscription redirect refused/);
 assert.equal(seen.length,3);
});
