import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../src/env.js';
import { SUPPORTED_CHAIN_IDS } from '../src/chains/config.js';
import { facilitatorConfigured } from '../src/payment/facilitator.js';
import { DISCLAIMER } from '../src/types.js';

export default function handler(_req: IncomingMessage, res: ServerResponse) {
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      ok: true,
      version: '0.1.0',
      // Security contract (e): chain ids only. Never the RPC URLs.
      chains: SUPPORTED_CHAIN_IDS,
      priceUsdt: env.SCOUT_PRICE_USDT,
      // Boolean status only — never the credential values (security contract e).
      // 'active'  = OKX facilitator creds present, payments verified + settled.
      // 'unverified' = no creds; gate passes through without settling.
      payments: facilitatorConfigured() ? 'active' : 'unverified',
      disclaimer: DISCLAIMER,
    }),
  );
}
