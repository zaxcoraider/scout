import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

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

export function paymentRequiredBody(resource: string) {
  return {
    x402Version: 1,
    error: 'X-PAYMENT header is required',
    accepts: [
      {
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
      },
    ],
  };
}

/**
 * Framework-agnostic: is a payment payload present?
 *
 * TODO(before listing): verify + settle via the OKX facilitator, then set X-PAYMENT-RESPONSE.
 * Until then this only asserts a payload EXISTS. Never log its value.
 */
export function hasPayment(header: string | string[] | undefined): boolean {
  return typeof header === 'string' && header.length > 0;
}

/** Fastify adapter (local dev server). Returns true if the request may proceed. */
export async function paymentGate(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  if (!hasPayment(req.headers['x-payment'])) {
    await reply.code(402).send(paymentRequiredBody(`${req.protocol}://${req.hostname}${req.url}`));
    return false;
  }
  return true;
}
