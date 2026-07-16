import { formatUnits } from 'viem';
import type { SimulationResult, StaticContext, Finding } from '../types.js';
import { truncateAddress } from '../log.js';

/**
 * Each heuristic is a pure function: (SimulationResult, StaticContext) -> Finding | null.
 * No I/O in here. Static context is fetched at the edge (src/context/fetch.ts) and passed in.
 */
export type Heuristic = (sim: SimulationResult, ctx: StaticContext) => Finding | null;

/** A spender allowed to move your tokens forever, in any amount. The classic drainer setup. */
const UNLIMITED_APPROVAL: Heuristic = (sim) => {
  const hit = sim.approvalDiffs.find((a) => a.isUnlimited && !a.isAllTokens);
  if (!hit) return null;
  return {
    id: 'UNLIMITED_APPROVAL',
    severity: 'danger',
    detail: `This grants ${truncateAddress(hit.spender)} permission to move an UNLIMITED amount of your tokens, at any time in the future — not just now.`,
  };
};

/** setApprovalForAll on an NFT collection: hands over every token you own in it, plus future ones. */
const NFT_BLANKET_APPROVAL: Heuristic = (sim) => {
  const hit = sim.approvalDiffs.find((a) => a.isAllTokens);
  if (!hit) return null;
  return {
    id: 'NFT_BLANKET_APPROVAL',
    severity: 'danger',
    detail: `This gives ${truncateAddress(hit.spender)} control of EVERY NFT you own in this collection — including ones you buy later.`,
  };
};

/**
 * A legitimate approval goes to a contract (a router, a marketplace). An approval to a plain
 * wallet is not a protocol interaction — it is a person taking your tokens.
 */
const APPROVAL_TO_EOA: Heuristic = (sim, ctx) => {
  const hit = sim.approvalDiffs.find((a) => ctx.spenderIsEOA[a.spender.toLowerCase()]);
  if (!hit) return null;
  return {
    id: 'APPROVAL_TO_EOA',
    severity: 'danger',
    detail: `The approval goes to ${truncateAddress(hit.spender)}, which is a personal wallet, not a contract. Real apps never need this.`,
  };
};

const KNOWN_DRAINER: Heuristic = (_sim, ctx) => {
  if (!ctx.knownDrainerHit) return null;
  return {
    id: 'KNOWN_DRAINER',
    severity: 'danger',
    detail: `An address in this transaction (${truncateAddress(ctx.knownDrainerHit)}) is on a public blacklist of known scam and drainer addresses (ScamSniffer).`,
  };
};

/** The transaction reverts. Not malicious, but you'd burn gas for nothing. */
const TX_REVERTS: Heuristic = (sim) => {
  if (sim.success) return null;
  return {
    id: 'TX_REVERTS',
    severity: 'caution',
    detail: 'This transaction fails when simulated. You would pay gas and get nothing.',
  };
};

/**
 * You call a contract function and value leaves, but nothing comes back.
 *
 * Guarded on `hasCalldata` deliberately: a bare value transfer with no calldata is a payment
 * the user typed out themselves. Flagging that would mark every ordinary send as suspicious,
 * and a safety tool that cries wolf on normal behaviour is one users learn to ignore.
 * Scout only reports what you did NOT ask for.
 */
const NO_INCOMING_VALUE: Heuristic = (sim, ctx) => {
  if (!ctx.hasCalldata) return null;
  if (sim.balanceDiffs.length === 0) return null;
  const anyIncoming = sim.balanceDiffs.some((d) => d.diff > 0n);
  const outgoing = sim.balanceDiffs.filter((d) => d.diff < 0n);
  if (anyIncoming || outgoing.length === 0) return null;
  const worst = outgoing[0]!;
  const amount = formatUnits(-worst.diff, worst.decimals);
  const label = worst.token === 'native' ? ctx.nativeSymbol : worst.token;
  return {
    id: 'NO_INCOMING_VALUE',
    severity: 'caution',
    detail: `${amount} ${label} leaves your wallet and nothing comes back. If you expected a swap or a purchase, this is not one.`,
  };
};

export const HEURISTICS: Heuristic[] = [
  KNOWN_DRAINER,
  UNLIMITED_APPROVAL,
  NFT_BLANKET_APPROVAL,
  APPROVAL_TO_EOA,
  TX_REVERTS,
  NO_INCOMING_VALUE,
];

export function evaluateAll(sim: SimulationResult, ctx: StaticContext): Finding[] {
  return HEURISTICS.map((h) => h(sim, ctx)).filter((f): f is Finding => f !== null);
}
