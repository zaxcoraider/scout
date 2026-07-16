import { z } from 'zod';

// Security contract (b): all secrets via env, validated at boot. Boot fails loudly.
const EnvSchema = z.object({
  SCOUT_RPC_196: z.string().url(),
  SCOUT_RPC_1: z.string().url(),
  SCOUT_PRICE_USDT: z.coerce.number().positive().default(0.01),
  SCOUT_PAYTO_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  // OKX x402 facilitator credentials — OPTIONAL. When all three are present, Scout verifies
  // and settles payments for real. When absent, the gate runs unverified (pre-settlement
  // behaviour) so the endpoint keeps working while settlement is rolled out. Secrets only —
  // never logged, never in code.
  SCOUT_OKX_API_KEY: z.string().optional(),
  SCOUT_OKX_API_SECRET: z.string().optional(),
  SCOUT_OKX_API_PASSPHRASE: z.string().optional(),
  // Facilitator host. Not user-supplied — fixed by env, per security contract (d).
  SCOUT_X402_FACILITATOR_URL: z.string().url().default('https://web3.okx.com'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // Security contract (b): never print env VALUES. Only the failing keys.
  const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
  throw new Error(`Invalid environment. Fix these keys (see .env.example): ${keys}`);
}

export const env = parsed.data;
