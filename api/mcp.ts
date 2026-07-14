import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from '../src/mcp.js';
import { hasPayment, paymentRequiredBody } from '../src/payment/gate.js';

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
  if (!hasPayment(req.headers['x-payment'])) {
    const host = req.headers['host'] ?? 'preflight';
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(paymentRequiredBody(`https://${host}${req.url ?? '/api/mcp'}`)));
    return;
  }

  // Stateless: a fresh server + transport per invocation. Exactly what serverless wants.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => void transport.close());

  const server = createMcpServer();
  await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req, res, req.body);
}
