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

describe('APPROVAL_TO_EOA', () => {
  it('flags an approval whose spender has no bytecode', () => {
    const approvalDiffs = [
      {
        token: '0xtok',
        owner: '0xme',
        spender: DRAINER,
        amount: 500n,
        isUnlimited: false,
        isAllTokens: false,
      },
    ];
    const f = evaluateAll(sim({ approvalDiffs }), ctx({ spenderIsEOA: { [DRAINER]: true } }));
    expect(ids(f)).toContain('APPROVAL_TO_EOA');
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
});
