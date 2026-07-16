/**
 * Probe the OKX x402 facilitator's /supported endpoint to learn the exact payment kinds
 * (scheme / network / asset) it accepts. Use the result to reconcile scoutPaymentRequirements()
 * so real OKX marketplace payments verify and settle.
 *
 * Run locally with your OKX creds in .env:
 *   npx tsx scripts/probe-facilitator.ts
 *
 * Requires SCOUT_OKX_API_KEY / SECRET / PASSPHRASE. Never commits or logs the credentials.
 */
import { facilitatorConfigured, getSupported } from '../src/payment/facilitator.js';

if (!facilitatorConfigured()) {
  console.error(
    'OKX creds not set. Add SCOUT_OKX_API_KEY / SCOUT_OKX_API_SECRET / SCOUT_OKX_API_PASSPHRASE to .env.',
  );
  process.exit(1);
}

try {
  const supported = await getSupported();
  console.log('=== OKX facilitator /supported ===');
  console.log(JSON.stringify(supported, null, 2));
} catch (err) {
  console.error('Probe failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
