import { createHmac } from 'node:crypto';
import { env } from '../env.js';

/**
 * OKX x402 facilitator client.
 *
 * Docs: https://web3.okx.com/onchainos/dev-docs/payments/api-http-batch
 * Base: {SCOUT_X402_FACILITATOR_URL}/api/v6/pay/x402
 *   POST /verify — validate a buyer's signed payment payload
 *   POST /settle — queue the verified authorization for batch settlement
 *
 * Security contract:
 *  - credentials only via process.env, never in code, never logged (contract b, e)
 *  - never log the payment payload or any payment identifier (contract e)
 *  - facilitator host comes from env, never from the request (contract d)
 */

const PATH_PREFIX = '/api/v6/pay/x402';

// OKX documents x402Version 2 for the facilitator body.
const X402_VERSION = 2;

/** Seller-side payment requirements — the shape advertised in the 402 body and sent to verify. */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string | null;
  payer?: string;
}

export interface SettleResult {
  success: boolean;
  errorReason?: string | null;
  payer?: string;
  transaction?: string;
  network?: string;
  status?: string;
}

/** All three creds present → real settlement is possible. Otherwise Scout runs unverified. */
export function facilitatorConfigured(): boolean {
  return Boolean(
    env.SCOUT_OKX_API_KEY && env.SCOUT_OKX_API_SECRET && env.SCOUT_OKX_API_PASSPHRASE,
  );
}

/**
 * OKX API request signature.
 *   sign = base64( HMAC-SHA256( secret, timestamp + METHOD + requestPath + body ) )
 *
 * Pure and deterministic. The bug-prone parts — METHOD uppercasing and concatenation order —
 * are locked by a fixture test.
 */
export function signOkxRequest(
  secret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
): string {
  const prehash = `${timestamp}${method.toUpperCase()}${requestPath}${body}`;
  return createHmac('sha256', secret).update(prehash).digest('base64');
}

interface FacilitatorBody {
  x402Version: number;
  paymentPayload: unknown;
  paymentRequirements: PaymentRequirements;
}

/** OKX envelope: { code: "0", msg, data }. code !== "0" is an application-level error. */
interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T;
}

async function callFacilitator<T>(endpoint: '/verify' | '/settle', body: FacilitatorBody): Promise<T> {
  // Callers gate on facilitatorConfigured(); assert non-null for the type checker.
  const key = env.SCOUT_OKX_API_KEY!;
  const secret = env.SCOUT_OKX_API_SECRET!;
  const passphrase = env.SCOUT_OKX_API_PASSPHRASE!;

  const requestPath = `${PATH_PREFIX}${endpoint}`;
  const payload = JSON.stringify(body);
  const timestamp = new Date().toISOString();
  const sign = signOkxRequest(secret, timestamp, 'POST', requestPath, payload);

  const res = await fetch(`${env.SCOUT_X402_FACILITATOR_URL}${requestPath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'OK-ACCESS-KEY': key,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-PASSPHRASE': passphrase,
      'OK-ACCESS-TIMESTAMP': timestamp,
    },
    body: payload,
    signal: AbortSignal.timeout(15_000),
  });

  // Contract (g): error messages never echo raw user input — only endpoint + status/code.
  if (!res.ok) throw new Error(`Facilitator ${endpoint} HTTP ${res.status}`);
  const json = (await res.json()) as OkxEnvelope<T>;
  if (json.code !== '0') throw new Error(`Facilitator ${endpoint} rejected (code ${json.code})`);
  return json.data;
}

export function verifyPayment(
  paymentPayload: unknown,
  requirements: PaymentRequirements,
): Promise<VerifyResult> {
  return callFacilitator<VerifyResult>('/verify', {
    x402Version: X402_VERSION,
    paymentPayload,
    paymentRequirements: requirements,
  });
}

export function settlePayment(
  paymentPayload: unknown,
  requirements: PaymentRequirements,
): Promise<SettleResult> {
  return callFacilitator<SettleResult>('/settle', {
    x402Version: X402_VERSION,
    paymentPayload,
    paymentRequirements: requirements,
  });
}
