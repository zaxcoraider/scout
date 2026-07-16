export type Severity = 'safe' | 'caution' | 'danger';
export type Verdict = 'SAFE' | 'CAUTION' | 'DANGER';

export interface BalanceDiff {
  token: string; // symbol, or "native"
  address: string; // holder
  decimals: number;
  before: bigint;
  after: bigint;
  diff: bigint; // negative = leaves your wallet
}

export interface ApprovalDiff {
  token: string;
  owner: string;
  spender: string;
  amount: bigint;
  isUnlimited: boolean;
  /** setApprovalForAll(true) on an NFT collection — grants the whole collection. */
  isAllTokens: boolean;
}

export interface SimulationResult {
  success: boolean;
  revertReason?: string;
  gasUsed: bigint;
  balanceDiffs: BalanceDiff[];
  approvalDiffs: ApprovalDiff[];
}

/** Everything the heuristics need that requires I/O — fetched at the edge, passed in pure. */
export interface StaticContext {
  chainId: number;
  /** Symbol of the chain's native coin (ETH, OKB) — for human-readable effects. */
  nativeSymbol: string;
  /** `to` has no bytecode → it's an EOA, not a contract. */
  toIsEOA: boolean;
  /** Bytecode size of `to`. 0 = EOA. */
  toCodeSize: number;
  spenderIsEOA: Record<string, boolean>;
  knownDrainerHit: string | null;
  /**
   * Was there calldata? A bare value transfer is a payment the user explicitly asked for —
   * nothing is hidden, so it must not be flagged. Scout's job is revealing what you did
   * NOT ask for.
   */
  hasCalldata: boolean;
}

export interface Finding {
  id: string;
  severity: Severity;
  detail: string;
}

/**
 * How deep the analysis went. Reported to the caller — we never pass off a decode-only
 * result as a full simulation.
 *
 * `simulated` — calldata decoded AND executed; balance diffs and revert status are real.
 * `decoded`   — calldata decoded only (chain's RPC has no eth_simulateV1, e.g. X Layer).
 *               Approval-based risks are still fully detected; balance diffs are not available.
 */
export type AnalysisMode = 'simulated' | 'decoded';

export interface PreflightResponse {
  verdict: Verdict;
  headline: string;
  effects: string[];
  findings: Finding[];
  analysis: {
    mode: AnalysisMode;
    note: string;
  };
  simulation: {
    success: boolean;
    revertReason?: string;
    balanceDiffs: Array<{ token: string; address: string; diff: string }>;
    approvalDiffs: Array<{ token: string; spender: string; amount: string }>;
  };
  chain: { id: number; name: string };
  checkedAt: string;
  disclaimer: string;
}

export const DISCLAIMER =
  'Safety signal, not a guarantee. Scout simulates the transaction you gave it and reports what it observed. Not financial advice.';
