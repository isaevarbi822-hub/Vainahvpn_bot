/**
 * RollyPay identifiers are opaque. Sandbox responses may use a UUID rather than
 * the optional pay_ prefix. Only permit one bounded URL-safe path segment.
 * Payment ownership, amount and paid status are checked separately against the
 * provider and database; format validation is NOT a payment confirmation.
 */
export const PAYMENT_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/;
export const PAY_URL_PATH_PATTERN=/^\/pay\/[A-Za-z0-9][A-Za-z0-9_-]{5,255}\/?$/;
export function validPaymentId(id) {
  return typeof id==='string' && PAYMENT_ID_PATTERN.test(id);
}
