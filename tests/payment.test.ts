import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signOkxRequest, facilitatorConfigured, okxCodeOk } from '../src/payment/facilitator.js';
import {
  getPaymentHeader,
  decodePaymentHeader,
  settlePaymentHeader,
  scoutPaymentRequirements,
  paymentRequiredBody,
  encodePaymentRequired,
} from '../src/payment/gate.js';

describe('signOkxRequest', () => {
  const secret = 'test-secret';
  const ts = '2026-07-16T10:00:00.000Z';
  const path = '/api/v6/pay/x402/verify';
  const body = '{"x402Version":2}';

  // Locks the contract's bug-prone parts: prehash order and base64 digest.
  it('is base64(HMAC-SHA256(secret, ts+METHOD+path+body))', () => {
    const expected = createHmac('sha256', secret)
      .update(`${ts}POST${path}${body}`)
      .digest('base64');
    expect(signOkxRequest(secret, ts, 'POST', path, body)).toBe(expected);
  });

  // The method must be uppercased before signing — OKX rejects a lowercase verb.
  it('uppercases the HTTP method', () => {
    expect(signOkxRequest(secret, ts, 'post', path, body)).toBe(
      signOkxRequest(secret, ts, 'POST', path, body),
    );
  });

  it('changes when any input changes', () => {
    const base = signOkxRequest(secret, ts, 'POST', path, body);
    expect(signOkxRequest('other', ts, 'POST', path, body)).not.toBe(base);
    expect(signOkxRequest(secret, ts, 'POST', path, '{}')).not.toBe(base);
  });
});

describe('okxCodeOk', () => {
  // The facilitator returns code 0 as a NUMBER; other OKX APIs use the string "0".
  // A strict string check made successful verifies read as failures (found live 2026-07-17).
  it('accepts both numeric and string zero', () => {
    expect(okxCodeOk(0)).toBe(true);
    expect(okxCodeOk('0')).toBe(true);
  });

  it('rejects error codes and absent values', () => {
    expect(okxCodeOk(50011)).toBe(false);
    expect(okxCodeOk('50011')).toBe(false);
    expect(okxCodeOk(undefined)).toBe(false);
    expect(okxCodeOk(null)).toBe(false);
  });
});

describe('getPaymentHeader', () => {
  it('prefers PAYMENT-SIGNATURE and falls back to X-PAYMENT', () => {
    expect(getPaymentHeader({ 'payment-signature': 'sig' })).toBe('sig');
    expect(getPaymentHeader({ 'x-payment': 'legacy' })).toBe('legacy');
    expect(getPaymentHeader({ 'payment-signature': 'sig', 'x-payment': 'legacy' })).toBe('sig');
  });

  it('rejects empty, missing, and array headers', () => {
    expect(getPaymentHeader({})).toBeUndefined();
    expect(getPaymentHeader({ 'payment-signature': '' })).toBeUndefined();
    expect(getPaymentHeader({ 'payment-signature': ['a', 'b'] })).toBeUndefined();
  });
});

describe('decodePaymentHeader', () => {
  it('round-trips a base64-encoded JSON payload', () => {
    const payload = { x402Version: 2, foo: 'bar' };
    const header = Buffer.from(JSON.stringify(payload)).toString('base64');
    expect(decodePaymentHeader(header)).toEqual(payload);
  });

  it('returns null on malformed input', () => {
    expect(decodePaymentHeader('not-base64-json!!')).toBeNull();
    expect(decodePaymentHeader('')).toBeNull();
  });
});

describe('settlePaymentHeader (no creds configured in test env)', () => {
  // The test env sets no OKX creds, so the facilitator is not configured.
  it('confirms the facilitator is unconfigured under test', () => {
    expect(facilitatorConfigured()).toBe(false);
  });

  // Pre-settlement behaviour: pass through unverified so the live endpoint keeps working.
  it('passes through UNVERIFIED without calling the network', async () => {
    const outcome = await settlePaymentHeader('any-header', scoutPaymentRequirements());
    expect(outcome.ok).toBe(true);
    expect(outcome.verified).toBe(false);
    expect(outcome.paymentResponse).toBeUndefined();
  });
});

// Pinned to @okxweb3/x402-core's wire format (x402 v2) — the shape OKX listing review
// validates: {x402Version, resource, accepts:[{scheme, network, asset, amount, payTo,
// maxTimeoutSeconds, extra}]}, base64-encoded into the PAYMENT-REQUIRED header.
describe('scoutPaymentRequirements', () => {
  it('advertises price in base units of USD₮0 (OKX default X Layer stablecoin)', () => {
    const reqs = scoutPaymentRequirements();
    expect(reqs.amount).toBe('10000'); // 0.01 * 10^6
    expect(reqs.asset).toBe('0x779ded0c9e1022225f8e0630b35a9b54be713736');
    expect(reqs.payTo).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(reqs.extra).toEqual({ name: 'USD₮0', version: '1' });
  });

  it('matches the facilitator-supported scheme and network', () => {
    const reqs = scoutPaymentRequirements();
    expect(reqs.scheme).toBe('exact');
    expect(reqs.network).toBe('eip155:196');
    expect(reqs.maxTimeoutSeconds).toBe(300);
  });

  it('carries no legacy v1 field names', () => {
    const reqs = scoutPaymentRequirements() as Record<string, unknown>;
    expect(reqs).not.toHaveProperty('maxAmountRequired');
    expect(reqs).not.toHaveProperty('resource');
    expect(reqs).not.toHaveProperty('description');
    expect(reqs).not.toHaveProperty('mimeType');
  });
});

describe('paymentRequiredBody + PAYMENT-REQUIRED header', () => {
  it('is a full x402 v2 challenge with top-level resource metadata', () => {
    const body = paymentRequiredBody('https://scout.example/mcp');
    expect(body.x402Version).toBe(2);
    expect(body.resource.url).toBe('https://scout.example/mcp');
    expect(body.resource.mimeType).toBe('application/json');
    expect(body.accepts).toHaveLength(1);
  });

  it('includes error only when given', () => {
    expect(paymentRequiredBody('https://x')).not.toHaveProperty('error');
    expect(paymentRequiredBody('https://x', 'Payment required.')).toHaveProperty(
      'error',
      'Payment required.',
    );
  });

  it('encodes to standard base64 that round-trips to the same challenge', () => {
    const body = paymentRequiredBody('https://scout.example/mcp');
    const header = encodePaymentRequired(body);
    expect(header).toMatch(/^[A-Za-z0-9+/]*={0,2}$/); // standard base64, not base64url
    expect(JSON.parse(Buffer.from(header, 'base64').toString('utf8'))).toEqual(body);
  });
});
