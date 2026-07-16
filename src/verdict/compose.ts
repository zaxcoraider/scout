import { formatUnits } from 'viem';
import type {
  Finding,
  SimulationResult,
  Verdict,
  ScoutResponse,
  StaticContext,
  AnalysisMode,
} from '../types.js';
import { DISCLAIMER } from '../types.js';
import { getChain } from '../chains/config.js';
import { truncateAddress } from '../log.js';

/** Worst finding wins; two or more CAUTIONs escalate to DANGER. */
export function scoreVerdict(findings: Finding[]): Verdict {
  if (findings.some((f) => f.severity === 'danger')) return 'DANGER';
  const cautions = findings.filter((f) => f.severity === 'caution').length;
  if (cautions >= 2) return 'DANGER';
  if (cautions === 1) return 'CAUTION';
  return 'SAFE';
}

/**
 * The headline is the product. If a non-technical person reads one sentence and understands
 * what would have happened to them, Scout worked. Keyed by the worst finding.
 */
const HEADLINES: Record<string, string> = {
  KNOWN_DRAINER: 'STOP — this address is a known wallet drainer.',
  UNLIMITED_APPROVAL: 'STOP — this hands a stranger the keys to ALL of your tokens.',
  NFT_BLANKET_APPROVAL: 'STOP — this gives away control of every NFT in this collection.',
  APPROVAL_TO_EOA: 'STOP — you are giving a person, not an app, permission to take your tokens.',
  TX_REVERTS: 'This will fail. You would pay gas for nothing.',
  NO_INCOMING_VALUE: 'Money leaves your wallet and nothing comes back.',
};

function headlineFor(verdict: Verdict, findings: Finding[]): string {
  if (verdict === 'SAFE') return 'Looks fine. This does what it says.';
  const worst = findings.find((f) => f.severity === 'danger') ?? findings[0];
  return (worst && HEADLINES[worst.id]) ?? 'Something about this transaction looks wrong.';
}

/** Plain-English "here is what this actually does", in the order a human cares about. */
function describeEffects(sim: SimulationResult, nativeSymbol: string): string[] {
  const effects: string[] = [];

  for (const a of sim.approvalDiffs) {
    if (a.isAllTokens) {
      effects.push(`${truncateAddress(a.spender)} gets control of ALL your NFTs in this collection`);
    } else if (a.isUnlimited) {
      effects.push(`${truncateAddress(a.spender)} gets UNLIMITED access to your tokens`);
    } else {
      effects.push(`${truncateAddress(a.spender)} can spend some of your tokens`);
    }
  }

  for (const d of sim.balanceDiffs) {
    if (d.diff === 0n) continue;
    const amount = formatUnits(d.diff < 0n ? -d.diff : d.diff, d.decimals);
    const label = d.token === 'native' ? nativeSymbol : truncateAddress(d.token);
    effects.push(d.diff < 0n ? `You send ${amount} ${label}` : `You receive ${amount} ${label}`);
  }

  if (effects.length === 0) effects.push('Nothing moves and no permissions change.');
  return effects;
}

const MODE_NOTES: Record<AnalysisMode, string> = {
  simulated:
    'Transaction was decoded and executed against live chain state. Balance changes and revert status are observed, not guessed.',
  decoded:
    "Transaction was decoded from its calldata. This chain's RPC does not expose transaction simulation, so balance changes are not available — but approvals and permissions granted are read directly from the call and are fully accurate.",
};

export function compose(
  sim: SimulationResult,
  ctx: StaticContext,
  findings: Finding[],
  mode: AnalysisMode,
): ScoutResponse {
  const verdict = scoreVerdict(findings);
  const chain = getChain(ctx.chainId);

  return {
    verdict,
    headline: headlineFor(verdict, findings),
    effects: describeEffects(sim, chain.nativeSymbol),
    findings,
    analysis: { mode, note: MODE_NOTES[mode] },
    simulation: {
      success: sim.success,
      ...(sim.revertReason !== undefined ? { revertReason: sim.revertReason } : {}),
      balanceDiffs: sim.balanceDiffs.map((d) => ({
        token: d.token,
        address: truncateAddress(d.address),
        diff: formatUnits(d.diff, d.decimals),
      })),
      approvalDiffs: sim.approvalDiffs.map((a) => ({
        token: truncateAddress(a.token),
        spender: truncateAddress(a.spender),
        amount: a.isUnlimited ? 'UNLIMITED' : a.amount.toString(),
      })),
    },
    chain: { id: chain.id, name: chain.name },
    checkedAt: new Date().toISOString(),
    disclaimer: DISCLAIMER,
  };
}
