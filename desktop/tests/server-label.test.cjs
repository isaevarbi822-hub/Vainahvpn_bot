'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {safeServerLabel}=require('../shared/server-label.cjs');
test('Desktop may show country names, never raw node identifiers',()=>{
  const asTag=tag=>({outbounds:[{protocol:'vless',tag}]});
  assert.equal(safeServerLabel(asTag('🇵🇱 Польша'),0),'🇵🇱 Польша');
  for(const tag of ['203.0.113.10','vless://private@host',
    '00000000-0000-4000-8000-000000000001',
    'node@example.org','https://private','loc\nsecret'])
    assert.equal(safeServerLabel(asTag(tag),2),'Сервер 3 · VLESS REALITY');
  assert.equal(safeServerLabel({},0),'Сервер 1 · VLESS REALITY');
});
