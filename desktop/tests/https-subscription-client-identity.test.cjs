'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {fetchSubscription}=require('../shared/https-subscription.cjs');
const {subscriptionErrorMessage,subscriptionDiagnosticCode}=require('../shared/subscription-error.cjs');
const packageJson=require('../package.json');
const uri='vless://12345678-1234-1234-1234-123456789abc@de.example.net:443?security=reality&type=tcp&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sid=a1b2&sni=example.com';
const resolver=async()=>[{address:'8.8.8.8',family:4}];
function requestWithStatus(status,seen){
 return (_url,options,callback)=>{
  seen.push(options);
  const req=new EventEmitter();
  req.destroy=error=>req.emit('error',error);
  const res=new EventEmitter();
  res.statusCode=status;
  res.headers={};
  res.resume=()=>{};
  queueMicrotask(()=>{
   callback(res);
   if(status===200){res.emit('data',Buffer.from(uri));res.emit('end');}
  });
  return req;
 };
}
test('HTTPS import identifies Vainah VPN as a client and accepts subscription MIME types',async()=>{
 const seen=[];
 const reply=await fetchSubscription('https://h1cloud.example.net/subscribe?token=PRIVATE_TEST_TOKEN',{
  resolver,request:requestWithStatus(200,seen)
 });
 assert.equal(reply.count,1);
 assert.equal(seen.length,1);
 assert.match(seen[0].headers['User-Agent'],/^VainahVPN\//);
 assert.ok(seen[0].headers['User-Agent'].includes(packageJson.version));
 assert.match(seen[0].headers.Accept,/text\/plain/);
 assert.match(seen[0].headers.Accept,/application\/json/);
 assert.match(seen[0].headers.Accept,/application\/octet-stream/);
 assert.equal(seen[0].headers['Cache-Control'],'no-cache');
 assert.equal(seen[0].rejectUnauthorized,undefined);
});
test('HTTP 403 is not mislabeled as expired, and makes just one request',async()=>{
 const seen=[];
 let actual;
 try{
  await fetchSubscription('https://h1cloud.example.net/subscribe?token=HIDDEN',{
    resolver,request:requestWithStatus(403,seen)
  });
 }catch(e){actual=e}
 assert.equal(actual?.statusCode,403);
 assert.equal(seen.length,1);
 assert.equal(subscriptionDiagnosticCode(actual),'HTTP_403');
 const message=subscriptionErrorMessage(actual);
 assert.match(message,/HTTP 403/);
 assert.match(message,/другом VPN-клиенте/);
 assert.doesNotMatch(message,/Проверь срок и правильность ссылки|срок закончился|HIDDEN/);
});
test('HTTP 401 indicates authorisation but not a confirmed expired subscription',async()=>{
 const seen=[];
 let error;
 try{
  await fetchSubscription('https://h1cloud.example.net/subscribe?token=SECRET',{
   resolver,request:requestWithStatus(401,seen)
  });
 }catch(e){error=e}
 assert.equal(error?.statusCode,401);
 assert.equal(subscriptionDiagnosticCode(error),'HTTP_401');
 assert.match(subscriptionErrorMessage(error),/авторизация/);
 assert.doesNotMatch(subscriptionErrorMessage(error),/SECRET|истёк/);
 assert.equal(seen.length,1);
});
