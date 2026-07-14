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
        maxAmountRequired: toBaseUnits(env.PREFLIGHT_PRICE_USDT, USDT_DECIMALS),
        resource,
        description:
          'Simulate a pending transaction and return a plain-English safety verdict (SAFE / CAUTION / DANGER).',
        mimeType: 'application/json',
        payTo: env.PREFLIGHT_PAYTO_ADDRESS,
        maxTimeoutSeconds: 60,
        asset: USDT_XLAYER,
        extra: { name: 'USDT', decimals: USDT_DECIMALS },
      },
    ],
  };
}

/** Returns true if the request may proceed. Sends 402 itself if not. */
export async function paymentGate(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const payment = req.headers['x-payment'];

  if (!payment || typeof payment !== 'string' || payment.length === 0) {
    await reply.code(402).send(paymentRequiredBody(`${req.protocol}://${req.hostname}${req.url}`));
    return false;
  }

  // TODO(before listing): verify + settle via the OKX facilitator, then set X-PAYMENT-RESPONSE.
  // Until then this only asserts a payment payload is present. Never log its value.
  return true;
}
