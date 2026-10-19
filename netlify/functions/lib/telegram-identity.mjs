import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Telegram Login Widget authorization, NOT a manually entered @username.
const hash256 = value => createHash('sha256').update(value, 'utf8').digest();
const hmac = (key, value) => createHmac('sha256', key).update(value, 'utf8').digest('hex');
const equalHex = (a,b) => {
  if (!/^[a-f0-9]{64}$/i.test(a||'') || !/^[a-f0-9]{64}$/i.test(b||'')) return false;
  return timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
};

export function verifyTelegramLogin(data, botToken, now = Date.now()) {
  if (!botToken || typeof data !== 'object' || !data || Array.isArray(data)) return null;
  const allowed = new Set(['id','first_name','last_name','username','photo_url','auth_date','hash']);
  if (Object.keys(data).some(key => !allowed.has(key))) return null;
  if (!/^[1-9][0-9]{0,17}$/.test(String(data.id||''))) return null;
  if (!/^[0-9]{10}$/.test(String(data.auth_date||''))) return null;
  const timestamp = Number(data.auth_date)*1000;
  if (!Number.isFinite(timestamp) || timestamp > now+60_000 || now-timestamp > 600_000) return null;
  if (Object.entries(data).some(([key,value])=>key!=='hash' && (typeof value!=='string' && typeof value!=='number'))) return null;
  const checked = Object.entries(data).filter(([key])=>key!=='hash').sort(([a],[b])=>a.localeCompare(b,'en'))
    .map(([key,value])=>key+'='+String(value)).join('\n');
  if (!equalHex(hmac(hash256(botToken), checked), String(data.hash||''))) return null;
  return {telegramId:String(data.id),username:String(data.username||'').slice(0,32),firstName:String(data.first_name||'').slice(0,80)};
}
export function makeSession(user, secret, now=Date.now()) {
  if (!secret || secret.length<32) throw Error('SESSION_SIGNING_KEY is not configured');
  const payload = Buffer.from(JSON.stringify({id:user.telegramId,username:user.username||'',exp:Math.floor(now/1000)+7*86400})).toString('base64url');
  return payload+'.'+hmac(secret,payload);
}
export function readSession(raw, secret, now=Date.now()) {
  if (!secret || secret.length<32 || typeof raw!=='string' || raw.length>1100) return null;
  const match=/^([a-zA-Z0-9_-]+)\.([a-f0-9]{64})$/.exec(raw);
  if (!match || !equalHex(hmac(secret,match[1]),match[2])) return null;
  try {
    const p=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));
    if (!/^[1-9][0-9]{0,17}$/.test(p.id||'') || !Number.isInteger(p.exp) || p.exp<=now/1000) return null;
    return {telegramId:p.id,username:String(p.username||'').slice(0,32)};
  } catch {return null;}
}
export function sessionFromRequest(request,secret=process.env.SESSION_SIGNING_KEY) {
  const cookies=request.headers.get('cookie')||'';
  const token=cookies.split(';').map(x=>x.trim()).find(x=>x.startsWith('__Host-vainah_session='));
  return readSession(token?.slice('__Host-vainah_session='.length)||'',secret);
}
export function sameOrigin(request) {
  const origin=request.headers.get('origin');
  if (!origin) return false;
  try {
    const target=process.env.PUBLIC_SITE_ORIGIN || new URL(request.url).origin;
    return new URL(origin).origin===new URL(target).origin;
  } catch{return false;}
}
export function sessionCookie(value,maxAge=604800) {
  return '__Host-vainah_session='+value+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age='+maxAge;
}
