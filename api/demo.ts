import type { IncomingMessage, ServerResponse } from 'node:http';
import { checkTransaction, type CheckInput } from '../src/check.js';

/**
 * Free showcase endpoint for the landing page. Runs the REAL engine — but only on this
 * fixed, server-side scenario whitelist, so it can never be used to freeload the paid
 * /mcp service (no user input reaches the engine; the only accepted input is a key).
 */

const EOA = '0x1111111111111111111111111111111111111111';
const WHALE = '0x28C6c06298d514Db089934071355E5743bf21d60';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const BAYC = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';

const SCENARIOS: Record<string, { title: string; input: CheckInput }> = {
  drainer: {
    title: 'Unlimited token approval to a stranger’s wallet',
    input: {
      chainId: 1,
      from: WHALE,
      to: USDC,
      data: `0x095ea7b3${EOA.slice(2).padStart(64, '0')}${'f'.repeat(64)}` as `0x${string}`,
    },
  },
  nft: {
    title: 'Blanket approval over an entire NFT collection',
    input: {
      chainId: 1,
      from: WHALE,
      to: BAYC,
      data: `0xa22cb465${EOA.slice(2).padStart(64, '0')}${'1'.padStart(64, '0')}` as `0x${string}`,
    },
  },
  hidden: {
    title: 'A "claim" that quietly transfers 25,000 USDC out',
    input: {
      chainId: 1,
      from: WHALE,
      to: USDC,
      data: `0xa9059cbb${EOA.slice(2).padStart(64, '0')}${(25_000_000_000n).toString(16).padStart(64, '0')}` as `0x${string}`,
    },
  },
  safe: {
    title: 'A normal 0.001 ETH transfer',
    input: { chainId: 1, from: WHALE, to: EOA, value: 1000000000000000n },
  },
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('content-type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'Use GET.' }));
    return;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const key = url.searchParams.get('scenario') ?? '';
  const scenario = SCENARIOS[key];
  if (!scenario) {
    // Security contract (g): never echo the raw input back.
    res.statusCode = 400;
    res.end(JSON.stringify({ error: 'Unknown scenario.', scenarios: Object.keys(SCENARIOS) }));
    return;
  }

  try {
    const result = await checkTransaction(scenario.input);
    // Same fixed inputs for everyone — cache at the edge so replays cost nothing.
    res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.end(
      JSON.stringify({
        scenario: key,
        title: scenario.title,
        input: { ...scenario.input, value: scenario.input.value?.toString() },
        result,
      }),
    );
  } catch {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Simulation temporarily unavailable.' }));
  }
}
