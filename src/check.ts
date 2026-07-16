import type { Address, Hex } from 'viem';
import { simulateTransaction } from './sim/simulate.js';
import { decodeCalldata, mergeApprovals } from './decode/calldata.js';
import { fetchStaticContext } from './context/fetch.js';
import { evaluateAll } from './heuristics/index.js';
import { compose } from './verdict/compose.js';
import { logCheck } from './log.js';
import { getChain } from './chains/config.js';
import type { PreflightResponse, SimulationResult } from './types.js';

export interface CheckInput {
  chainId: number;
  from: Address;
  to: Address;
  value?: bigint;
  data?: Hex;
  blockNumber?: bigint;
}

const EMPTY_SIM: SimulationResult = {
  success: true,
  gasUsed: 0n,
  balanceDiffs: [],
  approvalDiffs: [],
};

/**
 * decode (always) -> simulate (where supported) -> context -> heuristics -> verdict.
 *
 * Decode is the floor: it works on every chain and catches approval drainers on its own.
 * Simulation is the ceiling: balance diffs and revert detection, where the RPC allows it.
 * If simulation is unavailable or fails, we degrade to decode-only and SAY SO in the
 * response — never silently return a weaker answer dressed as a full one.
 */
export async function checkTransaction(input: CheckInput): Promise<PreflightResponse> {
  const startedAt = Date.now();
  const chain = getChain(input.chainId);

  const decoded = decodeCalldata(input.data, input.from, input.to);

  let sim: SimulationResult = EMPTY_SIM;
  let mode: 'simulated' | 'decoded' = 'decoded';

  if (chain.canSimulate) {
    try {
      sim = await simulateTransaction(input);
      mode = 'simulated';
    } catch (e) {
      // Fall back rather than fail the call — a decode-only DANGER verdict is far more
      // useful than an error. But NEVER swallow this silently: a permanently-broken
      // simulator that quietly degrades looks exactly like a working one from the outside.
      // (Message only — it may contain addresses, so it must not reach the request log.)
      console.warn(
        `[sim-degraded] chainId=${input.chainId} reason=${e instanceof Error ? e.message.split('\n')[0] : 'unknown'}`,
      );
      sim = EMPTY_SIM;
      mode = 'decoded';
    }
  }

  const withDecoded: SimulationResult = {
    ...sim,
    approvalDiffs: mergeApprovals(decoded.approvals, sim.approvalDiffs),
  };

  const hasCalldata = input.data !== undefined && input.data !== '0x' && input.data.length > 2;
  const ctx = await fetchStaticContext(input.chainId, input.to, withDecoded, hasCalldata);
  const findings = evaluateAll(withDecoded, ctx);
  const response = compose(withDecoded, ctx, findings, mode);

  logCheck({
    chainId: input.chainId,
    tool: 'scout_check_transaction',
    verdict: response.verdict,
    latencyMs: Date.now() - startedAt,
    findingIds: findings.map((f) => f.id),
  });

  return response;
}
