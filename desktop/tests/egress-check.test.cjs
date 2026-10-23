'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseTrace,fetchTrace,compareEgress}=require('../shared/egress-check.cjs');
const salt='a'.repeat(32);
test('IP is hashed and never exposed to UI',()=>{
  const before=parseTrace('ip=198.51.100.1\nloc=NO\n',{salt});
  const after=parseTrace('ip=203.0.113.2\nloc=DE\n',{salt});
  assert.equal(before.ipHash.length,64);
  assert.equal(JSON.stringify(before).includes('198.51.100.1'),false);
  assert.deepEqual(compareEgress(before,after),{
    status:'ip_changed_unverified',country:'DE',protected:false
  });
  assert.deepEqual(compareEgress(before,before),{
    status:'ip_unchanged',country:'NO',protected:false
  });
});
test('Failure and untrusted responses never claim protected',async()=>{
  assert.equal(parseTrace('ip=SECRET\nloc=AA',{salt}),null);
  assert.equal(parseTrace('ip=1.1.1.1\nloc=AAA',{salt}),null);
  assert.deepEqual(compareEgress(null,null),{status:'unavailable',country:null,protected:false});
  assert.equal(await fetchTrace({salt,request:async()=>({status:302})}),null);
  assert.equal(await fetchTrace({salt,request:async()=>{throw Error('offline')}}),null);
});
test('HTTPS trace reader only accepts bounded successful response',async()=>{
  const value=await fetchTrace({salt,request:async(url,options)=>{
    assert.equal(url,'https://www.cloudflare.com/cdn-cgi/trace');
    assert.equal(options.redirect,'manual');
    return {status:200,headers:{get:()=>null},
      arrayBuffer:async()=>Buffer.from('ip=2001:db8::1\nloc=ES\n')};
  }});
  assert.equal(value.country,'ES');
});

test('Fresh HTTPS egress probe disables socket pooling and disallows redirects',async()=>{
  const {EventEmitter}=require('node:events');
  const {freshHttpsRequest}=require('../shared/egress-check.cjs');
  const requests=[];
  const transport={request(options,done){
    requests.push(options);
    const req=new EventEmitter();
    req.end=()=>{
      const response=new EventEmitter();
      response.statusCode=200;
      response.headers={'content-length':'25'};
      queueMicrotask(()=>{
        done(response);
        response.emit('data',Buffer.from('ip=198.51.100.10\nloc=NO\n'));
        response.emit('end');
      });
    };
    req.destroy=error=>req.emit('error',error);
    return req;
  }};
  const a=await freshHttpsRequest('https://www.cloudflare.com/cdn-cgi/trace',{}, {transport});
  const b=await freshHttpsRequest('https://www.cloudflare.com/cdn-cgi/trace',{}, {transport});
  assert.equal(a.status,200);
  assert.equal((await b.arrayBuffer()).toString('utf8').includes('loc=NO'),true);
  assert.equal(requests.length,2);
  for(const request of requests){
    assert.equal(request.agent,false);
    assert.equal(request.headers.Connection,'close');
    assert.equal(request.hostname,'www.cloudflare.com');
    assert.equal(request.path,'/cdn-cgi/trace');
  }
  await assert.rejects(freshHttpsRequest('https://example.net/',{}, {transport}));
  assert.equal(requests.length,2);
});
test('Malformed IP address and large response never become a valid exit',()=>{
  for(const bad of ['....','1.2.3.999','2001:::db8','127.0.0.1:443'])
    assert.equal(parseTrace('ip='+bad+'\nloc=NO',{salt}),null);
});
