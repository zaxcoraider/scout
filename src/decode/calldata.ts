import { decodeFunctionData, erc20Abi, maxUint256, type Hex, type Address } from 'viem';
import type { ApprovalDiff } from '../types.js';

/**
 * Static calldata decoding — the layer that ALWAYS works, on every chain.
 *
 * Why this exists: no public X Layer RPC supports eth_simulateV1 (probed 2026-07-14; OKX's
 * own endpoints return 403). Simulation is therefore impossible on the chain we most need to
 * support. But a drainer's ask is *in the calldata* — approve(spender, 2^256-1) needs no
 * simulation to recognise. Decode is the product; simulation is the enrichment.
 */

const setApprovalForAllAbi = [
  {
    type: 'function',
    name: 'setApprovalForAll',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export interface DecodedIntent {
  /** Approvals this calldata would grant. Empty if it isn't an approval. */
  approvals: ApprovalDiff[];
  /** Human-readable function name, if we recognised it. */
  functionName: string | null;
}

export function decodeCalldata(data: Hex | undefined, from: Address, to: Address): DecodedIntent {
  if (!data || data === '0x' || data.length < 10) {
    return { approvals: [], functionName: null };
  }

  // ERC-20 approve(spender, value)
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data });
    if (decoded.functionName === 'approve') {
      const [spender, value] = decoded.args as [Address, bigint];
      return {
        functionName: 'approve',
        approvals: [
          {
            token: to,
            owner: from,
            spender,
            amount: value,
            // Drainers dodge exact-max checks with 2^256-2, 2^255, etc. Anything absurd counts.
            isUnlimited: value > maxUint256 / 2n,
            isAllTokens: false,
          },
        ],
      };
    }
    return { approvals: [], functionName: decoded.functionName };
  } catch {
    // Not an ERC-20 call. Fall through.
  }

  // ERC-721/1155 setApprovalForAll(operator, approved)
  try {
    const decoded = decodeFunctionData({ abi: setApprovalForAllAbi, data });
    const [operator, approved] = decoded.args as [Address, boolean];
    if (!approved) return { approvals: [], functionName: 'setApprovalForAll' };
    return {
      functionName: 'setApprovalForAll',
      approvals: [
        {
          token: to,
          owner: from,
          spender: operator,
          amount: maxUint256,
          isUnlimited: true,
          isAllTokens: true,
        },
      ],
    };
  } catch {
    // Unknown function. We still simulate if we can; we just can't name it.
  }

  return { approvals: [], functionName: null };
}

/** Merge decoded approvals with simulated ones, de-duplicating on (token, spender). */
export function mergeApprovals(
  decoded: ApprovalDiff[],
  simulated: ApprovalDiff[],
): ApprovalDiff[] {
  const key = (a: ApprovalDiff) => `${a.token.toLowerCase()}:${a.spender.toLowerCase()}`;
  const merged = new Map<string, ApprovalDiff>();
  for (const a of [...decoded, ...simulated]) merged.set(key(a), a);
  return [...merged.values()];
}
