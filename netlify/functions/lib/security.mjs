import { createHmac, timingSafeEqual } from 'node:crypto';

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyRollypaySignature({ rawBody, timestamp, signature, secret, now = Date.now() }) {
  if (typeof rawBody !== 'string' || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)) return false;
  if (typeof signature !== 'string' || !/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  if (!secret || typeof secret !== 'string') return false;
  const delta = Math.abs(now - Number(timestamp) * 1000);
  if (!Number.isFinite(delta) || delta > 300_000) return false;
  const expected = createHmac('sha256', secret).update(timestamp + '.' + rawBody, 'utf8').digest('hex');
  return safeEqual(expected, signature.toLowerCase());
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

export function isAdminRequest(request, config = process.env) {
  const actual = request.headers.get('x-vainah-test-token') || '';
  const stored = config.ROLLYPAY_TEST_TOKEN || '';
  return stored.length >= 24 && safeEqual(actual, stored);
}
