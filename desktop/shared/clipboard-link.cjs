'use strict';
/**
 * Normalizes a user-pasted VPN URL (including common Telegram wrappers).
 * Never guesses or extracts tokens from arbitrary prose, and never logs keys.
 */
function normalizeVpnLink(input){
 if(typeof input!=='string'||input.length>8192+4)return null;
 let result=input.trim().replace(/^[\uFEFF\u200B\u200C\u200D]+/u,'').trim();
 if(!result)return null;
 // Clipboard apps sometimes place a bare link inside a single pair of
 // angle brackets or quotes. The URL itself is otherwise preserved bytewise.
 if((result.startsWith('<')&&result.endsWith('>'))||
    (result.startsWith('"')&&result.endsWith('"'))||
    (result.startsWith("'")&&result.endsWith("'"))){
  result=result.slice(1,-1).trim();
 }
 if(!result||result.length>8192||/[\u0000-\u0020\u007F]/u.test(result))return null;
 if(!/^https:\/\//i.test(result)&&!/^vless:\/\//i.test(result))return null;
 // Reject userinfo and local-file/other schemes at import time, rather than
 // silently rewriting embedded credentials or guessing URLs.
 return result;
}
module.exports={normalizeVpnLink};
