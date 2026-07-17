import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import {
  facilitatorConfigured,
  verifyPayment,
  settlePayment,
  type PaymentRequirements,
} from './facilitator.js';

/**
 * x402 payment gate.
 *
 * Shape confirmed against OKX's own reference listing (Onchain Data Explorer):
 * "All x402 endpoints use HTTP POST; unpaid POST requests receive a 402 payment-required
 * response (GET requests return 405)."
 *
 * Security contract: runs BEFORE validation and BEFORE any simulation compute — the payment
 * gate IS the first line of the rate limiter. Payment identifiers are never logged.
 */

// USD₮0 on X Layer (EIP-3009) — the default settlement stablecoin OKX marketplace wallets
// sign for, per @okxweb3/x402-evm's DEFAULT_STABLECOINS for eip155:196. The extra block is
// the token's EIP-712 domain the payer signs against.
const USDT0_XLAYER = '0x779ded0c9e1022225f8e0630b35a9b54be713736';
const USDT0_DECIMALS = 6;
const USDT0_EXTRA = { name: 'USD₮0', version: '1' };

function toBaseUnits(amount: number, decimals: number): string {
  return BigInt(Math.round(amount * 10 ** decimals)).toString();
}

/**
 * The single source of truth for what Scout charges. The advertised challenge and the
 * paymentRequirements handed to the facilitator both derive from this — they must never
 * drift apart, because the buyer's signature covers exactly these fields.
 *
 * Shape matches @okxweb3/x402-core (x402 v2): {scheme, network, asset, amount, payTo,
 * maxTimeoutSeconds, extra}. Resource metadata lives on the challenge, not here.
 */
export function scoutPaymentRequirements(): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'eip155:196',
    asset: USDT0_XLAYER,
    amount: toBaseUnits(env.SCOUT_PRICE_USDT, USDT0_DECIMALS),
    payTo: env.SCOUT_PAYTO_ADDRESS,
    maxTimeoutSeconds: 300,
    extra: USDT0_EXTRA,
  };
}

/**
 * The full x402 v2 PaymentRequired challenge:
 * {x402Version, resource: {url, description, mimeType}, accepts: [...]}.
 * Base64-encoded into the PAYMENT-REQUIRED response header; also sent as the JSON body.
 */
export function paymentRequiredBody(resource: string, error?: string) {
  return {
    x402Version: 2,
    ...(error ? { error } : {}),
    resource: {
      url: resource,
      description:
        'Simulate a pending transaction and return a plain-English safety verdict (SAFE / CAUTION / DANGER).',
      mimeType: 'application/json',
    },
    accepts: [scoutPaymentRequirements()],
  };
}

/** Standard base64 of the challenge JSON — the PAYMENT-REQUIRED header value. */
export function encodePaymentRequired(challenge: unknown): string {
  return Buffer.from(JSON.stringify(challenge), 'utf8').toString('base64');
}

/**
 * Extract the buyer's payment header. OKX wallets send PAYMENT-SIGNATURE (x402 v2);
 * X-PAYMENT is accepted as the legacy fallback, mirroring the official middleware.
 * Never inspects or logs the header value.
 */
export function getPaymentHeader(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const header = headers['payment-signature'] ?? headers['x-payment'];
  return typeof header === 'string' && header.length > 0 ? header : undefined;
}

/** Decode the base64 payment header into its JSON payload. Returns null if malformed. */
export function decodePaymentHeader(header: string): unknown | null {
  try {
    return JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export interface SettlementOutcome {
  /** May the request proceed? */
  ok: boolean;
  /** true → a real verify+settle ran. false → unverified dev pass-through (no creds set). */
  verified: boolean;
  /** Base64 PAYMENT-RESPONSE to echo back to the caller, when settled. */
  paymentResponse?: string;
  /** Why the payment was rejected (safe, non-echoing text). */
  reason?: string;
}

/**
 * Verify + settle a payment through the OKX facilitator.
 *
 * When facilitator creds are NOT configured, this passes through UNVERIFIED (verified:false) —
 * the pre-settlement behaviour, so the live endpoint keeps serving while settlement is rolled
 * out. When creds ARE configured, a payment must verify AND settle or the call is rejected.
 */
export async function settlePaymentHeader(
  header: string,
  requirements: PaymentRequirements,
): Promise<SettlementOutcome> {
  if (!facilitatorConfigured()) {
    return { ok: true, verified: false };
  }

  const payload = decodePaymentHeader(header);
  if (payload === null) {
    return { ok: false, verified: true, reason: 'Malformed payment payload.' };
  }

  // A facilitator error must never crash the function (500). Reject cleanly instead —
  // fail-closed protects revenue: we do not serve a result we could not settle.
  try {
    const verified = await verifyPayment(payload, requirements);
    if (!verified.isValid) {
      return { ok: false, verified: true, reason: 'Payment failed verification.' };
    }

    const settled = await settlePayment(payload, requirements);
    if (!settled.success) {
      return { ok: false, verified: true, reason: 'Payment settlement was rejected.' };
    }

    // PAYMENT-RESPONSE: the facilitator's settlement receipt, base64-encoded — the same
    // object the official SDK echoes. No identifiers logged.
    const paymentResponse = Buffer.from(JSON.stringify(settled), 'utf8').toString('base64');
    return { ok: true, verified: true, paymentResponse };
  } catch {
    // Deliberately not echoing the error — contract (g). Facilitator faults read as rejection.
    return { ok: false, verified: true, reason: 'Payment processing is temporarily unavailable.' };
  }
}

/** Fastify adapter (local dev server). Returns true if the request may proceed. */
export async function paymentGate(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const resource = `${req.protocol}://${req.hostname}${req.url}`;
  const header = getPaymentHeader(req.headers);

  if (!header) {
    const challenge = paymentRequiredBody(resource, 'Payment required.');
    await reply
      .code(402)
      .header('PAYMENT-REQUIRED', encodePaymentRequired(challenge))
      .send(challenge);
    return false;
  }

  const outcome = await settlePaymentHeader(header, scoutPaymentRequirements());
  if (!outcome.ok) {
    const challenge = paymentRequiredBody(resource, outcome.reason);
    await reply
      .code(402)
      .header('PAYMENT-REQUIRED', encodePaymentRequired(challenge))
      .send(challenge);
    return false;
  }

  if (outcome.paymentResponse) reply.header('PAYMENT-RESPONSE', outcome.paymentResponse);
  return true;
}
