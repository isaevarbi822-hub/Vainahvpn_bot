import { json, verifyRollypaySignature } from './lib/security.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const secret = process.env.ROLLYPAY_SIGNING_SECRET;
  if (!secret) return json({ error: 'Not configured' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 32_768) return json({ error: 'Too large' }, 413);
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 32_768) return json({ error: 'Too large' }, 413);
  if (!verifyRollypaySignature({
    rawBody,
    timestamp: request.headers.get('x-timestamp'),
    signature: request.headers.get('x-signature'),
    secret
  })) return json({ error: 'Bad signature or stale timestamp' }, 403);

  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }

  // Real payments MUST NOT be acknowledged as processed: no purchase ledger
  // or H1Cloud provisioning is implemented yet.
  if (event.test !== true || request.headers.get('x-test-mode')?.toLowerCase() !== 'true') {
    console.warn('PRODUCTION PAYMENT NOT CONFIGURED: callback not acknowledged as processed');
    return json({ error: 'Production payments disabled' }, 503);
  }
  if (!/^payment\.(created|paid|canceled|expired|refunded|chargeback)$/.test(event.event_type || '')) {
    return json({ status: 'ignored' });
  }
  if (typeof event.payment_id !== 'string' || typeof event.order_id !== 'string' ||
      !event.order_id.startsWith('vainah_sandbox_')) return json({ error: 'Unexpected test order' }, 400);

  // For sandbox testing only. This log is not a durable purchase ledger.
  console.info('VAINAH_Rollypay_SANDBOX_CALLBACK', {
    event: event.event_type,
    payment_id: event.payment_id,
    order_id: event.order_id,
    test: true
  });
  return json({ ok: true, test: true, message: 'Sandbox callback signature verified' });
}
