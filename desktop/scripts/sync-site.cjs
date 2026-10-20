'use strict';
/**
 * Mirrors every static file from canonical site/ into a desktop build bundle.
 * Source site files are never edited. Netlify Functions run remotely and are
 * NOT functional when this snapshot is opened with file://.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const source=path.join(root,'site');
const dest=path.join(root,'desktop','site-mirror');
if(!fs.existsSync(path.join(source,'index.html')))throw Error('Missing canonical site/index.html');
const files=[];
function visit(dir,relative=''){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(item.isSymbolicLink())throw Error('Symlink forbidden in website mirror: '+item.name);
  if(item.isDirectory())visit(path.join(dir,item.name),path.join(relative,item.name));
  else if(item.isFile())files.push(path.join(relative,item.name));
 }
}
visit(source);
fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(dest,{recursive:true});
const manifest={source:'site/',files:[]};
for(const relative of files.sort()){
 const origin=path.join(source,relative);
 const target=path.join(dest,relative);
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.copyFileSync(origin,target);
 manifest.files.push({path:relative.split(path.sep).join('/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(origin)).digest('hex')});
}
fs.writeFileSync(path.join(dest,'mirror-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Mirrored '+manifest.files.length+' site files into desktop/site-mirror');
