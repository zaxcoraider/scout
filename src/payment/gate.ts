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

// USDT on X Layer. Settlement asset for OKX.AI.
const USDT_XLAYER = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
const USDT_DECIMALS = 6;

function toBaseUnits(amount: number, decimals: number): string {
  return BigInt(Math.round(amount * 10 ** decimals)).toString();
}

/**
 * The single source of truth for what Scout charges. Both the advertised 402 body and the
 * payload handed to the facilitator derive from this — they must never drift apart.
 *
 * TODO(live reconciliation, needs OKX API creds): OKX's facilitator documents scheme
 * "aggr_deferred", network "eip155:196", x402Version 2, and settlement assets USDG / USD₮0 /
 * USDC (addresses differ from the USDT below). The values here match our original reference
 * listing (exact / xlayer). Confirm the exact shape OKX marketplace clients sign against with
 * a real payment, then align both the advertised body and this object.
 */
export function scoutPaymentRequirements(resource: string): PaymentRequirements {
  return {
    scheme: 'exact',
    network: 'xlayer',
    maxAmountRequired: toBaseUnits(env.SCOUT_PRICE_USDT, USDT_DECIMALS),
    resource,
    description:
      'Simulate a pending transaction and return a plain-English safety verdict (SAFE / CAUTION / DANGER).',
    mimeType: 'application/json',
    payTo: env.SCOUT_PAYTO_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: USDT_XLAYER,
    extra: { name: 'USDT', decimals: USDT_DECIMALS },
  };
}

export function paymentRequiredBody(resource: string) {
  return {
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [scoutPaymentRequirements(resource)],
  };
}

/**
 * Framework-agnostic: is a payment payload present?
 * Absence → 402. This never inspects or logs the header value.
 */
export function hasPayment(header: string | string[] | undefined): boolean {
  return typeof header === 'string' && header.length > 0;
}

/** Decode the base64 X-PAYMENT header into its JSON payload. Returns null if malformed. */
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
  /** Base64 X-PAYMENT-RESPONSE to echo back to the caller, when settled. */
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
    return { ok: false, verified: true, reason: 'Malformed X-PAYMENT payload.' };
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

    // X-PAYMENT-RESPONSE: proof of settlement echoed to the caller. No identifiers logged.
    const paymentResponse = Buffer.from(
      JSON.stringify({ success: true, network: settled.network ?? null }),
    ).toString('base64');
    return { ok: true, verified: true, paymentResponse };
  } catch {
    // Deliberately not echoing the error — contract (g). Facilitator faults read as rejection.
    return { ok: false, verified: true, reason: 'Payment processing is temporarily unavailable.' };
  }
}

/** Fastify adapter (local dev server). Returns true if the request may proceed. */
export async function paymentGate(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const resource = `${req.protocol}://${req.hostname}${req.url}`;
  const header = req.headers['x-payment'];

  if (!hasPayment(header)) {
    await reply.code(402).send(paymentRequiredBody(resource));
    return false;
  }

  const outcome = await settlePaymentHeader(header as string, scoutPaymentRequirements(resource));
  if (!outcome.ok) {
    await reply.code(402).send({ ...paymentRequiredBody(resource), error: outcome.reason });
    return false;
  }

  if (outcome.paymentResponse) reply.header('X-PAYMENT-RESPONSE', outcome.paymentResponse);
  return true;
}
