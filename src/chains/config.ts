import { createPublicClient, http, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { defineChain } from 'viem';
import { env } from '../env.js';

// X Layer — OKX's chain, chainId 196. Where OKX.AI agent activity settles.
export const xLayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: [env.PREFLIGHT_RPC_196] } },
});

export interface ChainEntry {
  id: number;
  name: string;
  nativeSymbol: string;
  client: PublicClient;
  /**
   * Does this chain's RPC support eth_simulateV1?
   *
   * Probed 2026-07-14 (scripts/probe-rpc.ts): Ethereum publicnode/drpc = YES.
   * X Layer = NO — rpc.xlayer.tech AND xlayerrpc.okx.com both return HTTP 403 for the method.
   * Anvil forking would hit the same wall (CDK zkEVM), so this is not a fixable RPC choice.
   *
   * When false, PreFlight runs decode-only: static calldata analysis + getCode. That still
   * catches every approval-based drainer, which is the DANGER path that matters.
   */
  canSimulate: boolean;
}

// Adding a chain = one entry here + one RPC env var. Nothing else.
// Security contract (d): these RPC URLs are the ONLY outbound hosts. No user-supplied URLs.
export const CHAINS: Record<number, ChainEntry> = {
  196: {
    id: 196,
    name: 'X Layer',
    nativeSymbol: 'OKB',
    client: createPublicClient({ chain: xLayer, transport: http(env.PREFLIGHT_RPC_196) }),
    canSimulate: false,
  },
  1: {
    id: 1,
    name: 'Ethereum',
    nativeSymbol: 'ETH',
    client: createPublicClient({ chain: mainnet, transport: http(env.PREFLIGHT_RPC_1) }),
    canSimulate: true,
  },
};

export const SUPPORTED_CHAIN_IDS = Object.keys(CHAINS).map(Number);

export function getChain(chainId: number): ChainEntry {
  const entry = CHAINS[chainId];
  if (!entry) {
    // Security contract (g): actionable, but never echoes raw input back.
    const supported = SUPPORTED_CHAIN_IDS.map((id) => `${id} (${CHAINS[id]!.name})`).join(', ');
    throw new Error(`Unsupported chainId. PreFlight supports: ${supported}.`);
  }
  return entry;
}
