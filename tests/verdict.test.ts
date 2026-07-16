import { describe, it, expect } from 'vitest';
import { maxUint256 } from 'viem';
import { scoreVerdict } from '../src/verdict/compose.js';
import { evaluateAll } from '../src/heuristics/index.js';
import type { SimulationResult, StaticContext, Finding } from '../src/types.js';

const DRAINER = '0x00000000000000000000000000000000deadbeef';
const ROUTER = '0x1111111111111111111111111111111111111111';

function sim(over: Partial<SimulationResult> = {}): SimulationResult {
  return {
    success: true,
    gasUsed: 21000n,
    balanceDiffs: [],
    approvalDiffs: [],
    ...over,
  };
}

function ctx(over: Partial<StaticContext> = {}): StaticContext {
  return {
    chainId: 1,
    nativeSymbol: 'ETH',
    toIsEOA: false,
    toCodeSize: 100,
    spenderIsEOA: {},
    knownDrainerHit: null,
    hasCalldata: true,
    ...over,
  };
}

const ids = (f: Finding[]) => f.map((x) => x.id);

describe('scoreVerdict', () => {
  it('is SAFE with no findings', () => {
    expect(scoreVerdict([])).toBe('SAFE');
  });

  it('escalates two CAUTIONs to DANGER', () => {
    const two: Finding[] = [
      { id: 'A', severity: 'caution', detail: '' },
      { id: 'B', severity: 'caution', detail: '' },
    ];
    expect(scoreVerdict(two)).toBe('DANGER');
  });

  it('stays CAUTION on a single caution', () => {
    expect(scoreVerdict([{ id: 'A', severity: 'caution', detail: '' }])).toBe('CAUTION');
  });
});

describe('UNLIMITED_APPROVAL', () => {
  const approval = (amount: bigint) => ({
    token: '0xtok',
    owner: '0xme',
    spender: ROUTER,
    amount,
    isUnlimited: amount > maxUint256 / 2n,
    isAllTokens: false,
  });

  it('fires on a max-uint approval', () => {
    const f = evaluateAll(sim({ approvalDiffs: [approval(maxUint256)] }), ctx());
    expect(ids(f)).toContain('UNLIMITED_APPROVAL');
    expect(scoreVerdict(f)).toBe('DANGER');
  });

  it('does NOT fire on a bounded approval', () => {
    const f = evaluateAll(sim({ approvalDiffs: [approval(1_000_000n)] }), ctx());
    expect(ids(f)).not.toContain('UNLIMITED_APPROVAL');
  });

  // The edge case that matters: drainers dodge exact maxUint256 checks by asking for
  // maxUint256 - 1, or 2^255. Anything absurd must still read as unlimited.
  it('fires on maxUint256 - 1 (evasion attempt)', () => {
    const f = evaluateAll(sim({ approvalDiffs: [approval(maxUint256 - 1n)] }), ctx());
    expect(ids(f)).toContain('UNLIMITED_APPROVAL');
  });
});

describe('NFT_BLANKET_APPROVAL', () => {
  const allTokens = {
    token: '0xnft',
    owner: '0xme',
    spender: ROUTER,
    amount: 0n,
    isUnlimited: false,
    isAllTokens: true,
  };

  it('fires on setApprovalForAll', () => {
    const f = evaluateAll(sim({ approvalDiffs: [allTokens] }), ctx());
    expect(ids(f)).toContain('NFT_BLANKET_APPROVAL');
    expect(scoreVerdict(f)).toBe('DANGER');
  });

  it('does NOT fire on a per-token approval', () => {
    const single = { ...allTokens, isAllTokens: false, amount: 1_000n };
    const f = evaluateAll(sim({ approvalDiffs: [single] }), ctx());
    expect(ids(f)).not.toContain('NFT_BLANKET_APPROVAL');
  });

  // Edge: a blanket approval that is also flagged unlimited must report as NFT_BLANKET only.
  // UNLIMITED_APPROVAL guards on `!isAllTokens` precisely so the same grant is not counted
  // twice under two different findings — this locks that guard in place.
  it('does not double-count with UNLIMITED_APPROVAL', () => {
    const both = { ...allTokens, isUnlimited: true };
    const f = evaluateAll(sim({ approvalDiffs: [both] }), ctx());
    expect(ids(f)).toContain('NFT_BLANKET_APPROVAL');
    expect(ids(f)).not.toContain('UNLIMITED_APPROVAL');
  });
});

describe('APPROVAL_TO_EOA', () => {
  const approvalTo = (spender: string) => [
    { token: '0xtok', owner: '0xme', spender, amount: 500n, isUnlimited: false, isAllTokens: false },
  ];

  it('flags an approval whose spender has no bytecode', () => {
    const f = evaluateAll(
      sim({ approvalDiffs: approvalTo(DRAINER) }),
      ctx({ spenderIsEOA: { [DRAINER]: true } }),
    );
    expect(ids(f)).toContain('APPROVAL_TO_EOA');
    expect(scoreVerdict(f)).toBe('DANGER');
  });

  it('does NOT fire when the spender is a contract', () => {
    const f = evaluateAll(
      sim({ approvalDiffs: approvalTo(ROUTER) }),
      ctx({ spenderIsEOA: { [ROUTER]: false } }),
    );
    expect(ids(f)).not.toContain('APPROVAL_TO_EOA');
  });

  // Edge: the spender in the diff can be mixed-case (checksummed) while the EOA map is keyed
  // lowercase. The heuristic lowercases before lookup; if it stopped, this would miss.
  it('matches a checksummed spender against a lowercase EOA map', () => {
    const CHECKSUMMED = '0xAbC0000000000000000000000000000000DeaD';
    const f = evaluateAll(
      sim({ approvalDiffs: approvalTo(CHECKSUMMED) }),
      ctx({ spenderIsEOA: { [CHECKSUMMED.toLowerCase()]: true } }),
    );
    expect(ids(f)).toContain('APPROVAL_TO_EOA');
  });
});

describe('TX_REVERTS', () => {
  it('flags a transaction that fails when simulated', () => {
    const f = evaluateAll(sim({ success: false }), ctx());
    expect(ids(f)).toContain('TX_REVERTS');
    expect(scoreVerdict(f)).toBe('CAUTION');
  });

  it('does NOT fire on a successful transaction', () => {
    const f = evaluateAll(sim({ success: true }), ctx());
    expect(ids(f)).not.toContain('TX_REVERTS');
  });

  // Edge: a revert that also drains value is two cautions, which escalate to DANGER. Confirms
  // the finding co-exists with NO_INCOMING_VALUE rather than masking it.
  it('co-exists with NO_INCOMING_VALUE and escalates to DANGER', () => {
    const balanceDiffs = [
      { token: 'USDT', address: '0xme', decimals: 6, before: 100n, after: 0n, diff: -100n },
    ];
    const f = evaluateAll(sim({ success: false, balanceDiffs }), ctx({ hasCalldata: true }));
    expect(ids(f)).toEqual(expect.arrayContaining(['TX_REVERTS', 'NO_INCOMING_VALUE']));
    expect(scoreVerdict(f)).toBe('DANGER');
  });
});

describe('NO_INCOMING_VALUE', () => {
  it('flags a contract call where value leaves and nothing returns', () => {
    const balanceDiffs = [
      { token: 'USDT', address: '0xme', decimals: 6, before: 100n, after: 0n, diff: -100n },
    ];
    const f = evaluateAll(sim({ balanceDiffs }), ctx({ hasCalldata: true }));
    expect(ids(f)).toContain('NO_INCOMING_VALUE');
  });

  it('does NOT flag a swap (something comes back)', () => {
    const balanceDiffs = [
      { token: 'USDT', address: '0xme', decimals: 6, before: 100n, after: 0n, diff: -100n },
      { token: 'WETH', address: '0xme', decimals: 18, before: 0n, after: 5n, diff: 5n },
    ];
    const f = evaluateAll(sim({ balanceDiffs }), ctx({ hasCalldata: true }));
    expect(ids(f)).not.toContain('NO_INCOMING_VALUE');
  });

  // The false-positive that would sink the product: a plain ETH send is a payment the user
  // typed themselves. Nothing is hidden. If we flag this, we flag everything, and users
  // learn to click through our warnings — which is worse than having no warnings.
  it('does NOT flag a bare value transfer with no calldata', () => {
    const balanceDiffs = [
      { token: 'native', address: '0xme', decimals: 18, before: 0n, after: 0n, diff: -(10n ** 15n) },
    ];
    const f = evaluateAll(sim({ balanceDiffs }), ctx({ hasCalldata: false }));
    expect(ids(f)).not.toContain('NO_INCOMING_VALUE');
    expect(scoreVerdict(f)).toBe('SAFE');
  });
});

describe('KNOWN_DRAINER', () => {
  it('is DANGER on a list hit', () => {
    const f = evaluateAll(sim(), ctx({ knownDrainerHit: DRAINER }));
    expect(ids(f)).toContain('KNOWN_DRAINER');
    expect(scoreVerdict(f)).toBe('DANGER');
  });

  it('does NOT fire when no address is on the drainer list', () => {
    const f = evaluateAll(sim(), ctx({ knownDrainerHit: null }));
    expect(ids(f)).not.toContain('KNOWN_DRAINER');
    expect(scoreVerdict(f)).toBe('SAFE');
  });

  // Edge: a drainer hit fires even on an otherwise-benign-looking transaction (no approvals,
  // no value movement). The list is authoritative — it does not need a second signal to agree.
  it('fires on an otherwise-empty transaction', () => {
    const f = evaluateAll(sim({ balanceDiffs: [], approvalDiffs: [] }), ctx({ knownDrainerHit: DRAINER }));
    expect(ids(f)).toEqual(['KNOWN_DRAINER']);
  });
});
