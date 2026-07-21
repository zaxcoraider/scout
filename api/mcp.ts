import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../src/mcp.js';
import {
  encodePaymentRequired,
  getPaymentHeader,
  paymentRequiredBody,
  scoutPaymentRequirements,
  settlePaymentHeader,
} from '../src/payment/gate.js';

/**
 * Production MCP endpoint (Vercel).
 *
 * x402 contract (confirmed against OKX listing review 2026-07-21 — their buyer tooling
 * probes the endpoint with GET before paying, so the challenge must be discoverable on
 * EVERY method, not just POST):
 *   any method without payment -> 402 + PAYMENT-REQUIRED challenge
 *   POST with payment          -> the verdict
 *   non-POST with payment      -> 405 (rejected BEFORE settlement — never take money
 *                                 for a request we cannot serve)
 *   OPTIONS                    -> 204 CORS preflight (never gated)
 */
export default async function handler(
  req: IncomingMessage & { method?: string; body?: unknown; url?: string },
  res: ServerResponse,
) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('allow', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'access-control-allow-headers',
      'content-type, payment-signature, x-payment, mcp-session-id',
    );
    res.end();
    return;
  }

  // Payment gate runs FIRST — before the method check, before validation, before any
  // simulation compute. An unpaid probe of any method must receive the full challenge.
  const resource = `https://${req.headers['host'] ?? 'scout'}${req.url ?? '/api/mcp'}`;
  const header = getPaymentHeader(req.headers);
  if (!header) {
    const challenge = paymentRequiredBody(resource, 'Payment required.');
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json');
    res.setHeader('PAYMENT-REQUIRED', encodePaymentRequired(challenge));
    res.end(JSON.stringify(challenge));
    return;
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Paid calls use POST.' }));
    return;
  }

  // Verify + settle (real when OKX creds are set; unverified pass-through otherwise).
  const outcome = await settlePaymentHeader(header, scoutPaymentRequirements());
  if (!outcome.ok) {
    const challenge = paymentRequiredBody(resource, outcome.reason);
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json');
    res.setHeader('PAYMENT-REQUIRED', encodePaymentRequired(challenge));
    res.end(JSON.stringify(challenge));
    return;
  }
  if (outcome.paymentResponse) res.setHeader('PAYMENT-RESPONSE', outcome.paymentResponse);

  // Stateless: a fresh server + transport per invocation. Exactly what serverless wants.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => void transport.close());

  const server = createMcpServer();
  await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req, res, req.body);
}
