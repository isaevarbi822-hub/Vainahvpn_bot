import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const app = path => new URL('../native/'+path,import.meta.url);
const read = path => readFileSync(app(path),'utf8');
const android='android/app/src/main/java/app/vainah/vpn/';
const ios='ios/Sources/';

test('Both platform project definitions and first-class native source trees exist',()=>{
  for(const path of [
    'README.md','ARCHITECTURE.md',
    'android/settings.gradle.kts','android/app/build.gradle.kts',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/values/strings.xml',
    android+'MainActivity.kt',android+'VainahVpnService.kt',
    android+'TunnelEngine.kt',android+'SubscriptionLink.kt',android+'SecureSubscription.kt',
    'ios/project.yml',ios+'App/VainahApp.swift',ios+'App/ContentView.swift',
    ios+'App/TunnelController.swift',ios+'Shared/SubscriptionLink.swift',
    ios+'Shared/SecureSubscription.swift',
    ios+'TunnelExtension/PacketTunnelProvider.swift',
    'ios/Tests/SubscriptionLinkTests.swift'
  ])assert.ok(existsSync(app(path)),path);
  assert.match(read('android/app/build.gradle.kts'),/applicationId = "app\.vainah\.vpn"/);
  assert.match(read('ios/project.yml'),/VainahPacketTunnel:/);
});

test('Android manifest reserves VPN service exclusively for OS and uses foreground type',()=>{
  const xml=read('android/app/src/main/AndroidManifest.xml');
  assert.match(xml,/android\.permission\.BIND_VPN_SERVICE/);
  assert.match(xml,/android\.net\.VpnService/);
  assert.match(xml,/android:foregroundServiceType="systemExempted"/);
  assert.match(xml,/android:usesCleartextTraffic="false"/);
  assert.match(xml,/android:allowBackup="false"/);
  assert.match(xml,/android:name="\.VainahVpnService"[\\s\\S]*?android:exported="true"[\\s\\S]*?android:permission="android\\.permission\\.BIND_VPN_SERVICE"/);
  assert.doesNotMatch(xml,/READ_SMS|READ_CONTACTS|QUERY_ALL_PACKAGES/);
});

test('Android saves profile with AES-GCM and Keystore, not plaintext',()=>{
  const vault=read(android+'SecureSubscription.kt');
  assert.match(vault,/AndroidKeyStore/);
  assert.match(vault,/AES\/GCM\/NoPadding/);
  assert.match(vault,/KEY_ALGORITHM_AES/);
  assert.match(vault,/setKeySize\(256\)/);
  assert.doesNotMatch(vault,/Log\.|printStackTrace|android\.util\.Log/);
  assert.doesNotMatch(vault,/putString\("plaintext"/);
  assert.match(vault,/SubscriptionLink\.validate/);
});

test('iOS stores profile in Keychain using device-only accessibility',()=>{
  const code=read(ios+'Shared/SecureSubscription.swift');
  assert.match(code,/import Security/);
  assert.match(code,/SecItemAdd/);
  assert.match(code,/SecItemCopyMatching/);
  assert.match(code,/kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly/);
  assert.match(code,/SecItemDelete/);
  assert.doesNotMatch(code,/UserDefaults|print\(/);
});

test('No fake Connected state when VLESS transport is missing',()=>{
  const androidEngine=read(android+'TunnelEngine.kt');
  assert.match(androidEngine,/override val ready = false/);
  assert.match(androidEngine,/Result\.failure\(/);
  assert.match(androidEngine,/H1Cloud|VLESS|VLESS engine/);
  const androidUi=read(android+'MainActivity.kt');
  assert.match(androidUi,/VpnService\.prepare\(this\)/);
  assert.match(androidUi,/EngineRegistry\.active\.ready/);
  assert.match(androidUi,/Не подключено/);
  const iosEngine=read(ios+'App/TunnelController.swift');
  assert.match(iosEngine,/static let available = false/);
  assert.match(iosEngine,/guard VLESSCore\.available else/);
  assert.match(iosEngine,/startVPNTunnel\(\)/);
  const extension=read(ios+'TunnelExtension/PacketTunnelProvider.swift');
  assert.match(extension,/NEPacketTunnelProvider/);
  assert.match(extension,/completionHandler\(error\)/);
  assert.doesNotMatch(extension,/completionHandler\(nil\)/);
});

test('No legacy website checkout code or secrets are included in native sources',()=>{
  const files=[
    read(android+'MainActivity.kt'),read(android+'SecureSubscription.kt'),
    read(android+'TunnelEngine.kt'),read(android+'VainahVpnService.kt'),
    read(ios+'App/ContentView.swift'),read(ios+'App/TunnelController.swift'),
    read(ios+'Shared/SecureSubscription.swift'),read(ios+'TunnelExtension/PacketTunnelProvider.swift')
  ];
  const combined=files.join('\n');
  assert.doesNotMatch(combined,/ROLLYPAY_API_KEY|PANEL_API_TOKEN|TELEGRAM_BOT_TOKEN|DATABASE_URL|CLERK_SECRET_KEY/);
  assert.doesNotMatch(combined,/pk_live_|sk_live_|SECRET_KEY=|subscriptionUrl\s*=\s*"https:\/\//);
  assert.doesNotMatch(combined,/\.establish\(\)|setTunnelNetworkSettings\(/);
  const catalog=readFileSync(new URL('../netlify/functions/lib/plan-catalog.mjs',import.meta.url),'utf8');
  assert.match(catalog,/return false;/);
});

test('User retains existing site for web login and diagnostic flow',()=>{
  for(const path of [android+'MainActivity.kt',ios+'App/ContentView.swift']){
    const code=read(path);
    assert.ok(code.includes('https://vainahvpnbot0.netlify.app/account.html'));
    assert.ok(code.includes('https://vainahvpnbot0.netlify.app/diagnostics.html'));
  }
  assert.match(read('ios/project.yml'),/packet-tunnel-provider/);
  assert.match(read('android/app/src/main/AndroidManifest.xml'),/<service/);
});

test('Only HTTPS subscription formats may enter secure native stores',()=>{
  const kotlin=read(android+'SubscriptionLink.kt');
  const swift=read(ios+'Shared/SubscriptionLink.swift');
  assert.match(kotlin,/u\.scheme != "https"/);
  assert.match(kotlin,/rawUserInfo != null/);
  assert.match(kotlin,/rawFragment != null/);
  assert.match(swift,/parts\.scheme\?\.lowercased\(\) == "https"/);
  assert.match(swift,/parts\.user == nil, parts\.password == nil/);
  assert.match(swift,/parts\.fragment == nil/);
  assert.match(read('ios/Tests/SubscriptionLinkTests.swift'),/vless:\/\//);
  assert.match(read('android/app/src/test/java/app/vainah/vpn/SubscriptionLinkTest.kt'),/vless:\/\//);
});
