'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {normalizeVpnLink}=require('../shared/clipboard-link.cjs');
const sample='https://panel.example.com:8443/sub?token=TOP_SECRET_123';
const vless='vless://12345678-1234-1234-1234-123456789abc@de.example.com:443?security=reality&type=tcp&pbk=AbCdEfGhIjKlMnOpQrStUvWxYz012345&sni=example.com';
test('pasting plain H1 and VLESS links does not change embedded bearer tokens',()=>{
 for(const url of [sample,vless]){
  for(const input of [url,'  '+url+'  ','<'+url+'>','"'+url+'"',"'"+url+"'",'\uFEFF'+url]){
   assert.equal(normalizeVpnLink(input),url);
  }
 }
});
test('clipboard import rejects arbitrary prose, script URLs and oversized content',()=>{
 for(const input of ['','   ','not a link','https://example.com\nhttps://other.com',
  'http://example.com','file:///C:/secret','javascript:alert(1)','<https://example.com',
  'https://example.com/hello world',null,undefined,42,'x'.repeat(9000)]){
  assert.equal(normalizeVpnLink(input),null);
 }
});
test('clipboard read requires trusted renderer and native editing is restored',()=>{
 const main=fs.readFileSync(require('node:path').join(__dirname,'..','src','main.cjs'),'utf8');
 const preload=fs.readFileSync(require('node:path').join(__dirname,'..','src','preload.cjs'),'utf8');
 const html=fs.readFileSync(require('node:path').join(__dirname,'..','ui','index.html'),'utf8');
 const ui=fs.readFileSync(require('node:path').join(__dirname,'..','ui','app.js'),'utf8');
 assert.match(main,/Menu\.setApplicationMenu\(Menu\.buildFromTemplate/);
 assert.match(main,/\{role:'paste'\}/);
 assert.match(main,/webContents\.on\('context-menu'/);
 assert.match(main,/if\(!params\.isEditable/);
 assert.match(main,/ipcMain\.handle\('vainah:paste-vpn-link',event=>\{/);
 assert.match(main,/if\(!authorizedSender\(event\)\)/);
 assert.match(main,/normalizeVpnLink\(clipboard\.readText\(\)\)/);
 assert.match(preload,/pasteVpnLink:\(\)=>ipcRenderer\.invoke\('vainah:paste-vpn-link'\)/);
 assert.match(html,/id="paste-vpn-link"/);
 assert.match(html,/id="vless-key"/);
 assert.match(ui,/pasteButton\.addEventListener\('click'/);
 assert.match(ui,/linkField\.value=result\.link/);
 assert.doesNotMatch(main+ui,/console\.log\(.*(?:link|clipboard|token)/i);
});
