import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { signOkxRequest, facilitatorConfigured } from '../src/payment/facilitator.js';
import {
  hasPayment,
  decodePaymentHeader,
  settlePaymentHeader,
  scoutPaymentRequirements,
  paymentRequiredBody,
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

describe('hasPayment', () => {
  it('true only for a non-empty string header', () => {
    expect(hasPayment('x')).toBe(true);
    expect(hasPayment('')).toBe(false);
    expect(hasPayment(undefined)).toBe(false);
    expect(hasPayment(['x'])).toBe(false); // array header is not a valid single payload
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
    const reqs = scoutPaymentRequirements('https://scout.example/mcp');
    const outcome = await settlePaymentHeader('any-header', reqs);
    expect(outcome.ok).toBe(true);
    expect(outcome.verified).toBe(false);
    expect(outcome.paymentResponse).toBeUndefined();
  });
});

describe('scoutPaymentRequirements', () => {
  it('advertises price in USDT base units and the configured payTo', () => {
    const reqs = scoutPaymentRequirements('https://scout.example/mcp');
    expect(reqs.maxAmountRequired).toBe('10000'); // 0.01 USDT * 10^6
    expect(reqs.resource).toBe('https://scout.example/mcp');
    expect(reqs.asset).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(reqs.payTo).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  // Pinned to the OKX facilitator's GET /supported (probed 2026-07-17): exact / eip155:196 / v2.
  it('matches the facilitator-supported scheme, network, and x402 version', () => {
    const reqs = scoutPaymentRequirements('https://scout.example/mcp');
    expect(reqs.scheme).toBe('exact');
    expect(reqs.network).toBe('eip155:196');
    expect(paymentRequiredBody('https://scout.example/mcp').x402Version).toBe(2);
  });
});
