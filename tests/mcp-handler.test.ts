import { describe, it, expect } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import handler from '../api/mcp.js';

/**
 * Method/gate contract of the production handler — the exact behaviour OKX's listing
 * review probes (their buyer tooling GETs the endpoint unpaid and must receive the
 * PAYMENT-REQUIRED challenge; rejection 2026-07-21 was caused by GET returning a bare 405).
 */

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
}

function mockReq(method: string, headers: Record<string, string> = {}) {
  return {
    method,
    url: '/mcp',
    headers: { host: 'scout.test', ...headers },
  } as unknown as IncomingMessage & { method?: string; body?: unknown; url?: string };
}

function mockRes(): { res: ServerResponse; out: MockRes } {
  const out: MockRes = { statusCode: 200, headers: {}, body: '', ended: false };
  const res = {
    get statusCode() {
      return out.statusCode;
    },
    set statusCode(code: number) {
      out.statusCode = code;
    },
    setHeader(name: string, value: string) {
      out.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      if (chunk) out.body = chunk;
      out.ended = true;
    },
    on() {},
  } as unknown as ServerResponse;
  return { res, out };
}

function decodeChallenge(header: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
}

describe('api/mcp handler — unpaid requests get the challenge on every method', () => {
  // The reviewer's probe: unpaid GET must yield the full challenge, not 405.
  it('GET without payment -> 402 with a decodable PAYMENT-REQUIRED header', async () => {
    const { res, out } = mockRes();
    await handler(mockReq('GET'), res);

    expect(out.statusCode).toBe(402);
    const challenge = decodeChallenge(out.headers['payment-required']);
    expect(challenge['x402Version']).toBe(2);
    const accepts = challenge['accepts'] as Array<Record<string, unknown>>;
    expect(accepts).toHaveLength(1);
    expect(accepts[0]).toMatchObject({
      scheme: 'exact',
      network: 'eip155:196',
      maxTimeoutSeconds: 300,
    });
    // Body carries the same challenge as the header.
    expect(JSON.parse(out.body)).toEqual(challenge);
  });

  it('POST without payment -> 402 with the same challenge', async () => {
    const { res, out } = mockRes();
    await handler(mockReq('POST'), res);

    expect(out.statusCode).toBe(402);
    expect(decodeChallenge(out.headers['payment-required'])['x402Version']).toBe(2);
  });

  it('HEAD without payment -> 402 challenge header present', async () => {
    const { res, out } = mockRes();
    await handler(mockReq('HEAD'), res);

    expect(out.statusCode).toBe(402);
    expect(out.headers['payment-required']).toBeTruthy();
  });
});

describe('api/mcp handler — paid non-POST is rejected before settlement', () => {
  // A paid GET has nothing to serve; it must 405 WITHOUT the challenge (payment was
  // presented) and without settling. In test env the facilitator is unconfigured, so
  // reaching settlement would pass the gate — a 405 here proves the method check runs
  // before settlePaymentHeader.
  it('GET with a payment header -> 405, no PAYMENT-REQUIRED, no PAYMENT-RESPONSE', async () => {
    const { res, out } = mockRes();
    await handler(mockReq('GET', { 'payment-signature': 'sig' }), res);

    expect(out.statusCode).toBe(405);
    expect(out.headers['payment-required']).toBeUndefined();
    expect(out.headers['payment-response']).toBeUndefined();
  });
});

describe('api/mcp handler — OPTIONS preflight is never gated', () => {
  it('OPTIONS -> 204 with CORS headers and no challenge', async () => {
    const { res, out } = mockRes();
    await handler(mockReq('OPTIONS'), res);

    expect(out.statusCode).toBe(204);
    expect(out.ended).toBe(true);
    expect(out.headers['access-control-allow-methods']).toContain('POST');
    expect(out.headers['access-control-allow-headers']).toContain('payment-signature');
    expect(out.headers['payment-required']).toBeUndefined();
  });
});
