import { parseEventLogs, erc20Abi, maxUint256, type Hex, type Address } from 'viem';
import { getChain } from '../chains/config.js';
import type { SimulationResult, BalanceDiff, ApprovalDiff } from '../types.js';

/**
 * We deliberately do NOT use viem's `traceAssetChanges`.
 *
 * Two reasons, both found by probing the live RPC (scripts/debug-sim.ts, 2026-07-14):
 *  1. It runs an internal eth_createAccessList that our stateOverrides don't reach, so it
 *     rejects with "total cost exceeds balance" before simulating anything.
 *  2. Its assetChanges only surface ERC-20s discovered via the access list — a plain native
 *     ETH transfer produces an EMPTY assetChanges array. Silently wrong, which is worse.
 *
 * Instead: simulate without tracing (this works), then read Transfer/Approval events out of
 * the logs ourselves. Deterministic, and we control exactly what "a balance change" means.
 */

const approvalForAllAbi = [
  {
    type: 'event',
    name: 'ApprovalForAll',
    inputs: [
      { name: 'owner', type: 'address', indexed: true },
      { name: 'operator', type: 'address', indexed: true },
      { name: 'approved', type: 'bool', indexed: false },
    ],
  },
] as const;

export interface SimulateInput {
  chainId: number;
  from: Address;
  to: Address;
  value?: bigint;
  data?: Hex;
  blockNumber?: bigint;
}

export async function simulateTransaction(input: SimulateInput): Promise<SimulationResult> {
  const { client } = getChain(input.chainId);

  const { results } = await client.simulateCalls({
    account: input.from,
    calls: [
      {
        to: input.to,
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.data !== undefined ? { data: input.data } : {}),
      },
    ],
    ...(input.blockNumber !== undefined ? { blockNumber: input.blockNumber } : {}),
    // Fund the caller so a bare gas shortfall never masquerades as a malicious revert.
    stateOverrides: [{ address: input.from, balance: 10n ** 20n }],
  });

  const result = results[0];
  if (!result) throw new Error('Simulation returned no result.');

  const logs = result.logs ?? [];

  return {
    success: result.status === 'success',
    ...(result.status !== 'success' ? { revertReason: 'Transaction reverted.' } : {}),
    gasUsed: result.gasUsed,
    balanceDiffs: extractBalanceDiffs(logs, input.from, input.value),
    approvalDiffs: extractApprovals(logs, input.from),
  };
}

/**
 * ERC-20 movement comes from Transfer events; native movement is simply the `value` field —
 * it never appears in a log, which is exactly what viem's tracing got wrong.
 */
function extractBalanceDiffs(
  logs: readonly unknown[],
  owner: Address,
  value: bigint | undefined,
): BalanceDiff[] {
  const diffs: BalanceDiff[] = [];
  const me = owner.toLowerCase();

  if (value !== undefined && value > 0n) {
    diffs.push({
      token: 'native',
      address: owner,
      decimals: 18,
      before: 0n,
      after: 0n,
      diff: -value, // leaving the wallet
    });
  }

  const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: logs as never });

  // Net per token: a token can both leave and arrive within one transaction (that's a swap).
  const net = new Map<string, bigint>();
  for (const log of transfers) {
    const { from, to, value: amount } = log.args;
    const token = log.address.toLowerCase();
    if (from.toLowerCase() === me) net.set(token, (net.get(token) ?? 0n) - amount);
    if (to.toLowerCase() === me) net.set(token, (net.get(token) ?? 0n) + amount);
  }

  for (const [token, diff] of net) {
    if (diff === 0n) continue;
    diffs.push({
      token, // address; the composer truncates it for display
      address: owner,
      decimals: 18, // TODO(pre-listing): read decimals() so amounts render exactly
      before: 0n,
      after: 0n,
      diff,
    });
  }

  return diffs;
}

/**
 * Approvals are the drainer's weapon: they move nothing in THIS transaction, so a naive
 * balance check says "nothing left your wallet" and calls it safe. The theft comes later.
 */
function extractApprovals(logs: readonly unknown[], owner: Address): ApprovalDiff[] {
  const out: ApprovalDiff[] = [];
  const me = owner.toLowerCase();

  for (const log of parseEventLogs({ abi: erc20Abi, eventName: 'Approval', logs: logs as never })) {
    const { owner: logOwner, spender, value } = log.args;
    if (logOwner.toLowerCase() !== me) continue;
    out.push({
      token: log.address,
      owner: logOwner,
      spender,
      amount: value,
      // Drainers dodge exact-max checks with 2^256-2 or 2^255. Anything absurd counts.
      isUnlimited: value > maxUint256 / 2n,
      isAllTokens: false,
    });
  }

  for (const log of parseEventLogs({
    abi: approvalForAllAbi,
    eventName: 'ApprovalForAll',
    logs: logs as never,
  })) {
    const { owner: logOwner, operator, approved } = log.args;
    if (!approved || logOwner.toLowerCase() !== me) continue;
    out.push({
      token: log.address,
      owner: logOwner,
      spender: operator,
      amount: maxUint256,
      isUnlimited: true,
      isAllTokens: true,
    });
  }

  return out;
}
