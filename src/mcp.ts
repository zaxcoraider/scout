import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkTransaction } from './check.js';
import { SUPPORTED_CHAIN_IDS, CHAINS } from './chains/config.js';
import { DISCLAIMER } from './types.js';

const supportedList = SUPPORTED_CHAIN_IDS.map((id) => `${id} (${CHAINS[id]!.name})`).join(', ');

// Security contract (f): .strict() — unknown fields rejected.
export const CheckTransactionInput = z
  .object({
    chainId: z
      .number()
      .int()
      .refine((id) => SUPPORTED_CHAIN_IDS.includes(id), {
        message: `Unsupported chain. Scout supports: ${supportedList}.`,
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

/**
 * The deliverable for a PAID GET. Buyer tooling (task-402-pay) may replay a payment with
 * the same GET it probed with; a paid request must always receive a deliverable, so GET
 * gets the service descriptor: what the tool does and exactly how to invoke it over MCP.
 */
export function serviceDescriptor(resource: string) {
  return {
    service: 'Scout — Pre-Sign Transaction Check',
    version: '0.1.0',
    tool: 'scout_check_transaction',
    description:
      'Simulates the exact pending transaction against live chain state and returns a plain-English SAFE / CAUTION / DANGER verdict.',
    invoke: {
      transport: 'MCP Streamable HTTP',
      method: 'POST',
      url: resource,
      note: 'POST an MCP tools/call for scout_check_transaction with your PAYMENT-SIGNATURE header.',
      input: {
        chainId: `one of: ${SUPPORTED_CHAIN_IDS.join(', ')}`,
        from: '0x… wallet that would sign',
        to: '0x… contract or wallet being called',
        value: 'optional wei as decimal string',
        data: 'optional 0x calldata about to be signed',
      },
    },
    disclaimer: DISCLAIMER,
  };
}

/** Fresh server per request — stateless, so it scales horizontally / on serverless. */
export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'scout', version: '0.1.0' });

  server.registerTool(
    'scout_check_transaction',
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

  return server;
}
