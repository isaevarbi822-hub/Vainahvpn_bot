'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');

/** Wintun must come from the pinned, signed release included in our build.
 * Never download drivers or load untrusted arbitrary paths at runtime.
 */
async function checkTunDependencies(engine) {
  if(typeof engine!=='string'||!path.isAbsolute(engine)||
     path.basename(engine).toLowerCase()!=='sing-box.exe')return {ok:false};
  const directory=path.dirname(engine);
  try{
    const required=['sing-box.exe','wintun.dll','WINTUN-LICENSE.txt'];
    const infos=await Promise.all(required.map(async name=>{
      const file=path.join(directory,name);
      const info=await fs.lstat(file);
      return info.isFile()&&!info.isSymbolicLink()&&info.size>0;
    }));
    return {ok:infos.every(Boolean)};
  }catch{return {ok:false};}
}
module.exports={checkTunDependencies};
