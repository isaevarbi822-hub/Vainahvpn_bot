import {createPublicKey,verify} from 'node:crypto';

// Verify a Clerk JWT with a pinned public key managed in Netlify.
// No token payload is trusted before RS256 verification.
export function verifyClerkToken(token,env=process.env,now=Date.now()){
 const pem=env.CLERK_JWT_VERIFICATION_KEY;
 const issuer=env.CLERK_ISSUER;
 if(typeof pem!=='string'||!pem.includes('BEGIN PUBLIC KEY')||
    typeof issuer!=='string'||!issuer.startsWith('https://')||
    typeof token!=='string'||token.length>8192)return null;
 const parts=token.split('.');
 if(parts.length!==3||parts.some(s=>!s||!/^[A-Za-z0-9_-]+$/.test(s)))return null;
 try{
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  if(header.alg!=='RS256'||header.typ && header.typ!=='JWT')return null;
  const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  if(payload.iss!==issuer||typeof payload.sub!=='string'||
    !/^user_[A-Za-z0-9]{8,128}$/.test(payload.sub)||
    !Number.isSafeInteger(payload.exp)||payload.exp<=Math.floor(now/1000)||
    !Number.isSafeInteger(payload.nbf)||payload.nbf>Math.floor(now/1000)+30||
    !Number.isSafeInteger(payload.iat)||payload.iat>Math.floor(now/1000)+30)return null;
  // Require audience only if the application configures it.
  if(env.CLERK_JWT_AUDIENCE){
   const aud=Array.isArray(payload.aud)?payload.aud:[payload.aud];
   if(!aud.includes(env.CLERK_JWT_AUDIENCE))return null;
  }
  const key=createPublicKey(pem);
  if(key.asymmetricKeyType!=='rsa')return null;
  if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,
    Buffer.from(parts[2],'base64url')))return null;
  return {provider:'clerk',subject:payload.sub};
 }catch{return null}
}
export function clerkIdentityFromRequest(request,env=process.env){
 const auth=request.headers.get('authorization')||'';
 const match=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(auth);
 return match?verifyClerkToken(match[1],env):null;
}
