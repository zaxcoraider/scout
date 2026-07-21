import Fastify from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from './env.js';
import { createMcpServer, serviceDescriptor } from './mcp.js';
import { SUPPORTED_CHAIN_IDS } from './chains/config.js';
import { paymentGate } from './payment/gate.js';
import { facilitatorConfigured } from './payment/facilitator.js';
import { DISCLAIMER } from './types.js';

/** Local dev server. Production runs on Vercel via api/ — see api/mcp.ts. */
const app = Fastify({ logger: false });

app.get('/healthz', async () => ({
  ok: true,
  version: '0.1.0',
  // Security contract (e): chain ids only. Never the RPC URLs.
  chains: SUPPORTED_CHAIN_IDS,
  priceUsdt: env.SCOUT_PRICE_USDT,
  payments: facilitatorConfigured() ? 'active' : 'unverified',
  disclaimer: DISCLAIMER,
}));

// x402: OKX buyer tooling probes with GET (unpaid → the 402 challenge) and may replay
// the paid call with GET too (paid → the service descriptor deliverable). Confirmed
// against listing review + a real task-402-pay run, 2026-07-21.
app.get('/mcp', async (req, reply) => {
  const paid = await paymentGate(req, reply);
  if (!paid) return;
  return reply.send(serviceDescriptor(`${req.protocol}://${req.hostname}${req.url}`));
});

app.post('/mcp', async (req, reply) => {
  // Payment gate runs FIRST — before validation, before any simulation compute.
  const paid = await paymentGate(req, reply);
  if (!paid) return;

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  reply.raw.on('close', () => void transport.close());

  const server = createMcpServer();
  // The SDK types `Transport.sessionId` as required while the streamable transport leaves it
  // optional; incompatible only under exactOptionalPropertyTypes, not at runtime.
  await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
  await transport.handleRequest(req.raw, reply.raw, req.body);
});

app.listen({ port: env.PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('Failed to start:', err.message);
    process.exit(1);
  }
  console.log(`Scout listening on ${address}`);
});
