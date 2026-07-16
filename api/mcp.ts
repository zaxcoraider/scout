import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../src/mcp.js';
import {
  hasPayment,
  paymentRequiredBody,
  scoutPaymentRequirements,
  settlePaymentHeader,
} from '../src/payment/gate.js';

/**
 * Production MCP endpoint (Vercel).
 *
 * x402 contract, matching OKX's own reference listing (Onchain Data Explorer):
 *   POST without payment -> 402 + payment requirements
 *   POST with payment    -> the verdict
 *   GET                  -> 405
 */
export default async function handler(
  req: IncomingMessage & { method?: string; body?: unknown; url?: string },
  res: ServerResponse,
) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Use POST.' }));
    return;
  }

  // Payment gate runs FIRST — before validation, before any simulation compute.
  const resource = `https://${req.headers['host'] ?? 'scout'}${req.url ?? '/api/mcp'}`;
  const header = req.headers['x-payment'];
  if (!hasPayment(header)) {
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(paymentRequiredBody(resource)));
    return;
  }

  // Verify + settle (real when OKX creds are set; unverified pass-through otherwise).
  const outcome = await settlePaymentHeader(header as string, scoutPaymentRequirements(resource));
  if (!outcome.ok) {
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ...paymentRequiredBody(resource), error: outcome.reason }));
    return;
  }
  if (outcome.paymentResponse) res.setHeader('X-PAYMENT-RESPONSE', outcome.paymentResponse);

  // Stateless: a fresh server + transport per invocation. Exactly what serverless wants.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => void transport.close());

  const server = createMcpServer();
  await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req, res, req.body);
}
