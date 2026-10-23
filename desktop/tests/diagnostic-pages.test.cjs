'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {diagnosticPage}=require('../shared/diagnostic-pages.cjs');

test('diagnostics use named HTTPS URLs, not user-controlled remote locations',()=>{
  for(const code of ['ip','dns','ipv6']) {
    const url=diagnosticPage(code);
    assert.equal(new URL(url).protocol,'https:');
  }
  for(const bad of ['javascript:alert(1)','file:///etc/passwd','constructor',
    'https://evil.invalid','__proto__',null])assert.equal(diagnosticPage(bad),null);
});
