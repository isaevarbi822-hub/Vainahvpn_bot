import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyClerkToken,clerkIdentityFromRequest} from '../netlify/functions/lib/clerk-identity.mjs';

const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const env={CLERK_JWT_VERIFICATION_KEY:keys.publicKey.export({type:'spki',format:'pem'}),CLERK_ISSUER:'https://verified.example.test'};
const now=Date.now();
const claims={iss:env.CLERK_ISSUER,sub:'user_123456789ABCDEF',iat:Math.floor(now/1000)-10,
 nbf:Math.floor(now/1000)-10,exp:Math.floor(now/1000)+300};
function jwt(payload=claims,header={alg:'RS256',typ:'JWT'}){
 const body=[header,payload].map(p=>Buffer.from(JSON.stringify(p)).toString('base64url')).join('.');
 return body+'.'+sign('RSA-SHA256',Buffer.from(body),keys.privateKey).toString('base64url');
}
test('verified Clerk RS256 user becomes a provider-scoped owner candidate',()=>{
 assert.deepEqual(verifyClerkToken(jwt(),env,now),{provider:'clerk',subject:claims.sub});
 assert.deepEqual(clerkIdentityFromRequest(new Request('https://example.test',{headers:{
  authorization:'Bearer '+jwt()}}),env),{provider:'clerk',subject:claims.sub});
});
test('reject forged, expired, wrong issuer, wrong audience and unsigned tokens',()=>{
 assert.equal(verifyClerkToken(jwt({...claims,iss:'https://evil.example'}),env,now),null);
 assert.equal(verifyClerkToken(jwt({...claims,exp:Math.floor(now/1000)-1}),env,now),null);
 assert.equal(verifyClerkToken(jwt({...claims,sub:'attacker'}),env,now),null);
 assert.equal(verifyClerkToken(jwt(claims,{alg:'none'}),env,now),null);
 assert.equal(verifyClerkToken(jwt().slice(0,-2)+'zz',env,now),null);
 assert.equal(verifyClerkToken(jwt(),{...env,CLERK_JWT_AUDIENCE:'unmatched'},now),null);
 assert.equal(verifyClerkToken(jwt(),{...env,CLERK_JWT_VERIFICATION_KEY:''},now),null);
});
