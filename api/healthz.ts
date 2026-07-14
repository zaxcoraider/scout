import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '../src/env.js';
import { SUPPORTED_CHAIN_IDS } from '../src/chains/config.js';
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
      priceUsdt: env.PREFLIGHT_PRICE_USDT,
      disclaimer: DISCLAIMER,
    }),
  );
}
