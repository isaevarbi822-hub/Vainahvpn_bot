import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {accountStatus} from '../netlify/functions/mobile-account.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const env={
 CLERK_PUBLISHABLE_KEY:'pk_test_'+'a'.repeat(24),
 CLERK_SECRET_KEY:'sk_test_'+'b'.repeat(24),
 SESSION_SIGNING_KEY:'s'.repeat(40),
 PUBLIC_SITE_ORIGIN:'https://vpn.example.test'
};
const url='https://vpn.example.test/.netlify/functions/mobile-account';

test('Clerk callback re-renders account and obtains a new server verification',()=>{
 const ui=read('native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt');
 const auth=read('native/android/app/src/clerk/java/app/vainah/vpn/ClerkLoginActivity.kt');
 assert.match(ui,/override fun onActivityResult\(/);
 assert.match(ui,/requestCode==requestClerkLogin/);
 assert.match(ui,/if\(displayedClerkSignedIn!=clerkLoggedIn\(\)\)renderPage\(\)/);
 assert.match(ui,/refreshVerifiedDeliveryEmail\(\)/);
 assert.match(ui,/account\?\.authenticated==true && account\.verifiedDeliveryEmail/);
 assert.match(ui,/CLERK_ENDPOINT_NOT_DEPLOYED/);
 assert.match(ui,/CLERK_SERVER_SETUP/);
 assert.match(auth,/onAuthComplete = \{ setResult\(RESULT_OK\); finish\(\) \}/);
 assert.match(auth,/setResult\(RESULT_OK\); finish\(\)/);
});

test('Clerk account verification is completely server owned and fail closed',async()=>{
 const req=new Request(url,{headers:{authorization:'Bearer '+ 'x'.repeat(80)}});
 const missing=await accountStatus(req,{});
 assert.equal(missing.status,503);
 assert.equal((await missing.json()).emailVerified,false);
 const invalid=await accountStatus(req,env,async()=>null);
 assert.equal(invalid.status,401);
 assert.equal((await invalid.json()).authenticated,false);
 const phone=await accountStatus(req,env,async()=>({provider:'clerk',subject:'f'.repeat(64),email:null}));
 assert.deepEqual(await phone.json(),{
    authenticated:true,emailVerified:false,deliveryEmailRequired:true
 });
 const email=await accountStatus(req,env,async()=>({provider:'clerk',subject:'f'.repeat(64),email:'verified@example.test'}));
 assert.deepEqual(await email.json(),{
    authenticated:true,emailVerified:true,deliveryEmailRequired:true
 });
});
