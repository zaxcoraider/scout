import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { checkTransaction } from './check.js';
import { SUPPORTED_CHAIN_IDS, CHAINS } from './chains/config.js';

const supportedList = SUPPORTED_CHAIN_IDS.map((id) => `${id} (${CHAINS[id]!.name})`).join(', ');

// Security contract (f): .strict() — unknown fields rejected.
export const CheckTransactionInput = z
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

/** Fresh server per request — stateless, so it scales horizontally / on serverless. */
export function createMcpServer(): McpServer {
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

  return server;
}
