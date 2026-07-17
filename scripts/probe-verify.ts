/**
 * Diagnostic: replay a signed PaymentPayload against the facilitator's /verify and print the
 * raw envelope (status + code + msg). Never calls /settle — no funds move. Local use only.
 *
 * Usage: node --env-file=.env --import tsx scripts/probe-verify.ts <path-to-auth-header-file>
 */
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const authHeaderFile = process.argv[2];
if (!authHeaderFile) throw new Error('pass the auth-header file path');

const paymentPayload = JSON.parse(
  Buffer.from(readFileSync(authHeaderFile, 'utf8').trim(), 'base64').toString('utf8'),
);

const requirements = {
  scheme: 'exact',
  network: 'eip155:196',
  asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
  amount: '10000',
  payTo: process.env.SCOUT_PAYTO_ADDRESS,
  maxTimeoutSeconds: 300,
  extra: { name: 'USD₮0', version: '1' },
};

const body = JSON.stringify({ x402Version: 2, paymentPayload, paymentRequirements: requirements });
const path = '/api/v6/pay/x402/verify';
const ts = new Date().toISOString();
const sign = createHmac('sha256', process.env.SCOUT_OKX_API_SECRET!)
  .update(`${ts}POST${path}${body}`)
  .digest('base64');

const res = await fetch(`https://web3.okx.com${path}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'OK-ACCESS-KEY': process.env.SCOUT_OKX_API_KEY!,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-PASSPHRASE': process.env.SCOUT_OKX_API_PASSPHRASE!,
    'OK-ACCESS-TIMESTAMP': ts,
  },
  body,
});

console.log('HTTP', res.status);
console.log(await res.text());
