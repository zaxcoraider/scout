import type { Address } from 'viem';
import { getChain } from '../chains/config.js';
import type { SimulationResult, StaticContext } from '../types.js';
import drainers from '../data/drainers.json' with { type: 'json' };

const DRAINER_SET = new Set(drainers.addresses.map((a) => a.toLowerCase()));

/**
 * All the network I/O the heuristics need, done once, at the edge. Heuristics stay pure.
 * Security contract (d): only talks to the allowlisted RPC for this chain. No scanner APIs.
 */
export async function fetchStaticContext(
  chainId: number,
  to: Address,
  sim: SimulationResult,
  hasCalldata: boolean,
): Promise<StaticContext> {
  const { client, nativeSymbol } = getChain(chainId);

  const spenders = [...new Set(sim.approvalDiffs.map((a) => a.spender.toLowerCase()))];

  const [toCode, ...spenderCodes] = await Promise.all([
    client.getCode({ address: to }),
    ...spenders.map((s) => client.getCode({ address: s as Address })),
  ]);

  const spenderIsEOA: Record<string, boolean> = {};
  spenders.forEach((spender, i) => {
    const code = spenderCodes[i];
    spenderIsEOA[spender] = !code || code === '0x';
  });

  const candidates = [to.toLowerCase(), ...spenders];
  const knownDrainerHit = candidates.find((a) => DRAINER_SET.has(a)) ?? null;

  return {
    chainId,
    nativeSymbol,
    toIsEOA: !toCode || toCode === '0x',
    toCodeSize: toCode ? (toCode.length - 2) / 2 : 0,
    spenderIsEOA,
    knownDrainerHit,
    hasCalldata,
  };
}
