/**
 * VLESS + Reality compatibility preflight.
 * An in-memory checker ONLY. Do not log input or return connection secrets.
 * The verdict is NOT evidence that a VPN tunnel exists.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST=/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i;
const B64URL=/^[A-Za-z0-9_-]{43}$/;
const HEX=/^[a-f0-9]{0,16}$/i;
const ALLOWED_TRANSPORTS=new Set(['tcp','grpc']);
const reasons=Object.freeze({
 INVALID:'Некорректный формат конфигурации',
 SECURITY:'Требуется Reality',
 KEY:'Некорректный открытый ключ Reality',
 ADDRESS:'Некорректный адрес сервера',
 SERVER_NAME:'Не указан корректный SNI',
 TRANSPORT:'Транспорт требует отдельной поддержки',
 FINGERPRINT:'Неподдерживаемый fingerprint',
 SHORT_ID:'Некорректный short ID'
});
const reject=code=>Object.freeze({compatible:false,code,description:reasons[code]});
export function preflightVlessReality(input){
 if(typeof input!=='string'||input.length>8192||/[\x00-\x1f\x7f]/.test(input))
  return reject('INVALID');
 let u;
 try{u=new URL(input)}catch{return reject('INVALID')}
 if(u.protocol!=='vless:'||!UUID.test(u.username)||u.password||!HOST.test(u.hostname)||
    !/^\d{1,5}$/.test(u.port)||Number(u.port)<1||Number(u.port)>65535)
    return reject('ADDRESS');
 if(u.searchParams.get('security')!=='reality')return reject('SECURITY');
 if(!B64URL.test(u.searchParams.get('pbk')||''))return reject('KEY');
 const sni=u.searchParams.get('sni')||'';
 if(!HOST.test(sni)||!sni.includes('.'))return reject('SERVER_NAME');
 const transport=u.searchParams.get('type')||'tcp';
 if(!ALLOWED_TRANSPORTS.has(transport))return reject('TRANSPORT');
 const fp=u.searchParams.get('fp')||'chrome';
 if(!['chrome','firefox','safari','ios','android','edge'].includes(fp))return reject('FINGERPRINT');
 const sid=u.searchParams.get('sid')||'';
 if(!HEX.test(sid)||sid.length%2!==0)return reject('SHORT_ID');
 // Never return input, host, SNI, UUID, pbk, sid, paths, tokens or parsed URL.
 return Object.freeze({compatible:true,protocol:'vless-reality',transport,verifiedTunnel:false});
}
