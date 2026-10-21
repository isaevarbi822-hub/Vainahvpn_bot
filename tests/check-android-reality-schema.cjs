#!/usr/bin/env node
'use strict';
/**
 * Verify the exact JSON template embedded in Android MobileRealityConfig
 * against a pinned upstream sing-box, using dummy values only.
 * This checks schema validity, NOT real packet forwarding or DNS routing.
 */
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const core=process.argv[2];
if(!core||!path.isAbsolute(core))throw Error('PINNED_CORE_REQUIRED');
const source=fs.readFileSync('native/android/app/src/main/java/app/vainah/vpn/MobileRealityConfig.kt','utf8');
const template=source.match(/return """(\{.*\})"""/);
if(!template)throw Error('ANDROID_CONFIG_TEMPLATE_NOT_FOUND');
const defaultTokens={
  '@HOST@':JSON.stringify('vpn.example.org'),
  '@PORT@':'443',
  '@UUID@':JSON.stringify('123e4567-e89b-42d3-a456-426614174000'),
  '@FLOW@':'',
  '@SNI@':JSON.stringify('www.example.org'),
  '@FP@':JSON.stringify('chrome'),
  '@PBK@':JSON.stringify('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
  '@SID@':JSON.stringify('abcd')
};
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vainah-android-schema-'));
try{
  for(const variant of ['tcp','grpc']){
    const extra=variant==='grpc'?
      ',"transport":{"type":"grpc","service_name":"vainah-svc"}':'';
    const tokens={...defaultTokens,'@GRPC@':extra};
    let json=template[1];
    for(const [key,val] of Object.entries(tokens)){
      if(!json.includes(key))throw Error('MISSING_CONFIG_FIELD');
      json=json.replaceAll(key,val);
    }
    if(/@[A-Z_]+@/.test(json))throw Error('UNKNOWN_TEMPLATE_FIELD');
    const config=JSON.parse(json);
    if(config.inbounds[0].type!=='tun'||config.inbounds[0].auto_route!==true||
       config.outbounds[0].type!=='vless'||
       config.outbounds[0].tls.reality.enabled!==true||
       config.dns.final!=='private-dns'||config.route.final!=='vainah-primary')
      throw Error('EXPECTED_FULL_ROUTE_CONFIG_MISSING');
    if(variant==='grpc' &&
       (config.outbounds[0].transport?.type!=='grpc'||
        config.outbounds[0].transport.service_name!=='vainah-svc'))
      throw Error('GRPC_CONFIG_MISSING');
    if(variant==='tcp' && config.outbounds[0].transport)
      throw Error('TCP_TRANSPORT_CHANGED');
    const filename=path.join(dir,variant+'.json');
    fs.writeFileSync(filename,json,{mode:0o600});
    execFileSync(core,['check','-c',filename],{stdio:'ignore',timeout:12000});
  }
  process.stdout.write('Android H1Cloud TCP and gRPC Reality templates accepted by pinned sing-box (synthetic profiles only).\n');
}finally{
  fs.rmSync(dir,{recursive:true,force:true});
}
