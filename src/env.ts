import { z } from 'zod';

// Security contract (b): all secrets via env, validated at boot. Boot fails loudly.
const EnvSchema = z.object({
  SCOUT_RPC_196: z.string().url(),
  SCOUT_RPC_1: z.string().url(),
  SCOUT_PRICE_USDT: z.coerce.number().positive().default(0.01),
  SCOUT_PAYTO_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
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
