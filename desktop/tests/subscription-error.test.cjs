'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {subscriptionErrorMessage,subscriptionDiagnosticCode}=require('../shared/subscription-error.cjs');
test('categorizes TLS, DNS and HTTP errors without echoing bearer URLs',()=>{
 const secret='https://panel.example.com/sub?token=DO_NOT_LEAK';
 for(const [code,expected] of [
  ['EPROTO','TLS'],['ERR_SSL_WRONG_VERSION_NUMBER','TLS'],
  ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY','сертификат'],
  ['ENOTFOUND','DNS'],['ECONNRESET','HTTPS']
 ]){
  const message=subscriptionErrorMessage({code,message:secret});
  assert.match(message,new RegExp(expected));
  assert.doesNotMatch(message,/DO_NOT_LEAK|panel\.example\.com/);
 }
 const unknown=subscriptionErrorMessage({code:'SOME_NEW_ERROR',message:secret});
 assert.match(unknown,/Неизвестная ошибка/);
 assert.doesNotMatch(unknown,/DO_NOT_LEAK/);
});


test('identifies unsupported empty subscription and nested network codes safely',()=>{
 const secret='https://panel.example.com/sub?token=PRIVATE_VALUE';
 const unsupported=subscriptionErrorMessage(new Error('Unsupported subscription'));
 assert.match(unsupported,/неподдерживаемый формат/);
 assert.doesNotMatch(unsupported,/Неизвестная ошибка/);
 const nested=subscriptionErrorMessage({message:secret,cause:{code:'ENOTFOUND'}});
 assert.match(nested,/DNS/);
 assert.doesNotMatch(nested,/PRIVATE_VALUE|panel\.example\.com/);
 const timeout=subscriptionErrorMessage({message:secret,code:'ERR_TLS_HANDSHAKE_TIMEOUT'});
 assert.match(timeout,/Тайм-аут/);
 assert.doesNotMatch(timeout,/PRIVATE_VALUE/);
});


test('H1Cloud HTTP errors are actionable without revealing subscription tokens',()=>{
 const secret='https://private.example/sub?token=TOP_SECRET';
 for(const [status,expected] of [[401,/401/],[403,/403/],[404,/404/],[429,/429/],[502,/5xx/],[302,/3xx/]]){
  const message=subscriptionErrorMessage({message:'Subscription HTTP response',statusCode:status,url:secret});
  assert.match(message,expected);
  assert.doesNotMatch(message,/TOP_SECRET|private\.example/);
 }
});

test('Node22 DNS connection failure is explained with a safe diagnostic code',()=>{
 const error={code:'ERR_INVALID_IP_ADDRESS',message:'Bad IP in private https://provider.example/sub?key=SECRET'};
 assert.match(subscriptionErrorMessage(error),/Node\.js 22/);
 assert.equal(subscriptionDiagnosticCode(error),'ERR_INVALID_IP_ADDRESS');
 assert.doesNotMatch(subscriptionErrorMessage(error),/SECRET|provider\.example/);
});
test('HTTP and unknown internal errors expose only safe allowlisted codes',()=>{
 assert.equal(subscriptionDiagnosticCode({
  message:'Subscription HTTP response',statusCode:403,url:'https://private.example/key=HIDDEN'
 }),'HTTP_403');
 assert.equal(subscriptionDiagnosticCode({code:'FATAL_https://bad.example/SECRET',message:'key=SECRET'}),'HTTPS_UNKNOWN');
 assert.equal(subscriptionDiagnosticCode({message:'Unsupported subscription format'}),'FORMAT_UNSUPPORTED');
});
