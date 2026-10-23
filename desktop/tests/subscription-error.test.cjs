'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {subscriptionErrorMessage}=require('../shared/subscription-error.cjs');
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
