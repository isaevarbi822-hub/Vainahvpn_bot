import { randomUUID } from 'node:crypto';
import { isAdminRequest, json } from './lib/security.mjs';

const BASE = 'https://rollypay.io/api/v1/payments';

async function callRollypay(path, options = {}) {
  if (!process.env.ROLLYPAY_API_KEY) throw new Error('API key not configured');
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      'X-API-Key': process.env.ROLLYPAY_API_KEY,
      'X-Nonce': randomUUID(),
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) { console.error('Rollypay API HTTP status:', response.status); throw new Error('Rollypay HTTP ' + response.status); }
  return body;
}

export default async function handler(request) {
  if (!process.env.ROLLYPAY_TEST_TOKEN || process.env.ROLLYPAY_TEST_TOKEN.length < 24) {
    return json({
      error: 'Тестовый пароль не настроен в Netlify (ROLLYPAY_TEST_TOKEN).',
      diagnostic: 'TEST_TOKEN_NOT_CONFIGURED'
    }, 503);
  }
  if (!isAdminRequest(request)) {
    return json({
      error: 'Тестовый пароль не совпадает со значением ROLLYPAY_TEST_TOKEN в Netlify.',
      diagnostic: 'INVALID_TEST_TOKEN'
    }, 403);
  }
  if (request.method !== 'POST' && request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    if (request.method === 'POST') {
      if (!process.env.ROLLYPAY_API_KEY) return json({ error: 'Missing ROLLYPAY_API_KEY in Netlify' }, 503);
      const orderId = 'vainah_sandbox_' + randomUUID();
      // Always sandbox. Not controlled by caller. No billing, no VPN provisioning.
      const payload = {
        amount: '1500.00',
        payment_currency: 'RUB',
        order_id: orderId,
        description: 'VAINAH VPN — проверка интеграции (ТЕСТ)',
        test: true
      };
      // Terminal ID omitted: Rollypay determines the terminal from its API key.
      const payment = await callRollypay('', { method: 'POST', body: JSON.stringify(payload) });
      if (payment.test !== true && payment.environment !== 'sandbox') {
        console.error('Rollypay returned non-sandbox payment for test request');
        return json({ error: 'Rollypay did not confirm sandbox mode' }, 502);
      }
      if (!payment.payment_id || !payment.pay_url || !/^https:\/\//i.test(payment.pay_url)) {
        return json({ error: 'Unexpected Rollypay response' }, 502);
      }
      return json({
        test: true, paymentId: payment.payment_id, orderId,
        payUrl: payment.pay_url, status: payment.status || 'created'
      });
    }
    const paymentId = new URL(request.url).searchParams.get('paymentId') || '';
    if (!/^pay_[a-zA-Z0-9-]{8,100}$/.test(paymentId)) return json({ error: 'Invalid payment ID' }, 400);
    const payment = await callRollypay('/' + encodeURIComponent(paymentId));
    if (payment.test !== true && payment.environment !== 'sandbox') return json({ error: 'Not a sandbox payment' }, 403);
    return json({ test: true, paymentId, status: String(payment.status || 'unknown') });
  } catch (e) {
    const failure = String(e?.message || '');
    const httpStatus = /^Rollypay HTTP ([0-9]{3})$/.exec(failure)?.[1];
    const diagnostic = httpStatus ? 'ROLLYPAY_HTTP_' + httpStatus
      : e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'ROLLYPAY_TIMEOUT'
      : 'ROLLYPAY_NETWORK_OR_RESPONSE';
    console.error('Rollypay sandbox error diagnostic:', diagnostic);
    return json({ error: 'Не удалось создать тестовый платёж Rollypay.', diagnostic }, 502);
  }
}
