import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../native/android/app/src/clerk/java/app/vainah/vpn/ClerkLoginActivity.kt',import.meta.url),'utf8');
const account=readFileSync(new URL('../native/android/app/src/main/java/app/vainah/vpn/MainActivity.kt',import.meta.url),'utf8');
const gradle=readFileSync(new URL('../native/android/app/build.gradle.kts',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/native-mobile.yml',import.meta.url),'utf8');

test('sign-in and sign-up identify by email OR phone, not mandatory both',()=>{
  assert.match(app,/Text\("По email"\)/);
  assert.match(app,/Text\("По телефону"\)/);
  assert.match(app,/if \(method == "email"\)/);
  assert.match(app,/initialIdentifier = identifier/);
  assert.match(app,/persistIdentifiers = false/);
  assert.match(app,/onDismiss = \{ chosenIdentifier = null \}/);
  assert.match(account,/Регистрация по email ИЛИ телефону/);
});

test('international country codes use real metadata rather than a short hardcoded whitelist',()=>{
  assert.match(app,/PhoneNumberUtil\.getInstance\(\)/);
  assert.match(app,/phone\.supportedRegions/);
  assert.match(app,/getCountryCodeForRegion\(region\)/);
  assert.match(app,/nationalNumber/);
  assert.match(app,/PhoneNumberUtil\.PhoneNumberFormat\.E164/);
  assert.match(app,/isValidNumber\(parsed\)/);
  assert.match(app,/query\.isBlank\(\)/);
  assert.match(app,/SMS придёт, если страна разрешена/);
  assert.match(gradle,/com\.googlecode\.libphonenumber:libphonenumber:9\.0\.41/);
});

test('OTP stays within Clerk and the real VPN engine remains enabled in combined preview',()=>{
  assert.match(app,/AuthView\(/);
  assert.doesNotMatch(app,/twilio|TWILIO_|createVerification|passwordHash|SecretKey/);
  assert.match(workflow,/-PvainahEnableLibbox=true/);
  assert.match(workflow,/-PvainahEnableClerk=true/);
  assert.match(workflow,/VainahVPN-0\.5\.8-Android-libbox-Clerk-RollyPay-sandbox/);
  assert.match(gradle,/versionName = "0\.5\.8"/);
});
