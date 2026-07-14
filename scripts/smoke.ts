/**
 * Live smoke test — the moment of truth for the two-layer design.
 *
 * Case 1: Ethereum, unlimited approval to an EOA -> DANGER via full simulation.
 * Case 2: Ethereum, benign ETH transfer          -> not DANGER.
 * Case 3: X Layer, unlimited approval to an EOA  -> DANGER via decode-only (no eth_simulateV1).
 *
 * Case 3 is the one that proves the product survives on the chain that matters.
 *
 * Run: node_modules\.bin\tsx --env-file=.env scripts\smoke.ts
 */
import { checkTransaction } from '../src/check.js';
import type { PreflightResponse } from '../src/types.js';

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT_XLAYER = '0x1E4a5963aBFD975d8c9021ce480b42188849D41d';
const WHALE = '0x28C6c06298d514Db089934071355E5743bf21d60';
const EOA_SPENDER = '0x1111111111111111111111111111111111111111';

const unlimitedApprove = (spender: string) =>
  ('0x095ea7b3' + spender.slice(2).toLowerCase().padStart(64, '0') + 'f'.repeat(64)) as `0x${string}`;

function report(label: string, r: PreflightResponse, expect: string) {
  const pass = r.verdict === expect;
  console.log(`\n${pass ? '✅' : '❌'} ${label}`);
  console.log(`   verdict:  ${r.verdict}  (expected ${expect})`);
  console.log(`   headline: ${r.headline}`);
  console.log(`   mode:     ${r.analysis.mode}`);
  console.log(`   findings: ${r.findings.map((f) => f.id).join(', ') || '(none)'}`);
  console.log(`   effects:  ${r.effects.join(' | ')}`);
  return pass;
}

async function main() {
  const results: boolean[] = [];

  results.push(
    report(
      'ETH  · unlimited USDC approval to an EOA',
      await checkTransaction({
        chainId: 1,
        from: WHALE as `0x${string}`,
        to: USDC_ETH as `0x${string}`,
        data: unlimitedApprove(EOA_SPENDER),
      }),
      'DANGER',
    ),
  );

  results.push(
    report(
      'ETH  · plain 0.001 ETH transfer',
      await checkTransaction({
        chainId: 1,
        from: WHALE as `0x${string}`,
        to: EOA_SPENDER as `0x${string}`,
        value: 10n ** 15n,
      }),
      'SAFE',
    ),
  );

  results.push(
    report(
      'XLAYER · unlimited USDT approval to an EOA (decode-only path)',
      await checkTransaction({
        chainId: 196,
        from: WHALE as `0x${string}`,
        to: USDT_XLAYER as `0x${string}`,
        data: unlimitedApprove(EOA_SPENDER),
      }),
      'DANGER',
    ),
  );

  const passed = results.filter(Boolean).length;
  console.log(`\n${'='.repeat(50)}\n${passed}/${results.length} cases passed\n`);
  if (passed !== results.length) process.exit(1);
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e instanceof Error ? e.message : e);
  process.exit(1);
});
