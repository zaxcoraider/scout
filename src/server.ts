import Fastify from 'fastify';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { env } from './env.js';
import { checkTransaction } from './check.js';
import { SUPPORTED_CHAIN_IDS, CHAINS } from './chains/config.js';
import { paymentGate } from './payment/gate.js';
import { DISCLAIMER } from './types.js';

const supportedList = SUPPORTED_CHAIN_IDS.map((id) => `${id} (${CHAINS[id]!.name})`).join(', ');

// Security contract (f): .strict() — unknown fields rejected.
const CheckTransactionInput = z
  .object({
    chainId: z
      .number()
      .int()
      .refine((id) => SUPPORTED_CHAIN_IDS.includes(id), {
        message: `Unsupported chain. PreFlight supports: ${supportedList}.`,
      })
      .describe('196 for X Layer, 1 for Ethereum.'),
    from: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Expected a 42-character 0x address.')
      .describe('The wallet that would sign. Example: 0x1234…abcd'),
    to: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/, 'Expected a 42-character 0x address.')
      .describe('The contract or wallet being called.'),
    value: z
      .string()
      .regex(/^\d+$/, 'Expected a decimal string in wei.')
      .optional()
      .describe('Native amount in wei, as a decimal string. Example: "1000000000000000000"'),
    data: z
      .string()
      .regex(/^0x[a-fA-F0-9]*$/, 'Expected 0x-prefixed hex.')
      .max(262144, 'Calldata too large.')
      .optional()
      .describe('The calldata about to be signed. Example: 0x095ea7b3…'),
  })
  .strict();

const server = new McpServer({ name: 'preflight', version: '0.1.0' });

server.registerTool(
  'preflight_check_transaction',
  {
    description:
      'Simulates a pending transaction and reports what it ACTUALLY does — balance changes, token approvals granted, and whether it reverts — with a plain-English safety verdict (SAFE / CAUTION / DANGER). Call this before signing or broadcasting anything. Returns safety signals, not a guarantee.',
    inputSchema: CheckTransactionInput.shape,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (args) => {
    const input = CheckTransactionInput.parse(args);

    const result = await checkTransaction({
      chainId: input.chainId,
      from: input.from as `0x${string}`,
      to: input.to as `0x${string}`,
      ...(input.value !== undefined ? { value: BigInt(input.value) } : {}),
      ...(input.data !== undefined ? { data: input.data as `0x${string}` } : {}),
    });

    return {
      // Text first so every MCP client renders something useful without parsing.
      content: [{ type: 'text' as const, text: `${result.verdict} — ${result.headline}` }],
      structuredContent: result as unknown as Record<string, unknown>,
    };
  },
);

const app = Fastify({ logger: false });

app.get('/healthz', async () => ({
  ok: true,
  version: '0.1.0',
  // Security contract (e): chain connectivity as booleans. Never the RPC URLs.
  chains: SUPPORTED_CHAIN_IDS,
  priceUsdt: env.PREFLIGHT_PRICE_USDT,
  disclaimer: DISCLAIMER,
}));

// x402: GET on the paid endpoint is 405, per OKX's reference listing.
app.get('/mcp', async (_req, reply) => reply.code(405).send({ error: 'Use POST.' }));

app.post('/mcp', async (req, reply) => {
  // Payment gate runs FIRST — before validation, before any simulation compute.
  const paid = await paymentGate(req, reply);
  if (!paid) return;

  // Stateless mode: a fresh transport per request, no session affinity. Lets the service
  // scale horizontally behind a load balancer, which is what pay-per-call traffic needs.
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  reply.raw.on('close', () => void transport.close());

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
  console.log(`PreFlight listening on ${address}`);
});
