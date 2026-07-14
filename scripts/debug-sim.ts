/** Surface the raw simulateCalls error/output that check.ts's fallback is swallowing. */
import { createPublicClient, http, parseEther } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com'),
});

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WHALE = '0x28C6c06298d514Db089934071355E5743bf21d60';
const EOA = '0x1111111111111111111111111111111111111111';
const APPROVE = ('0x095ea7b3' + EOA.slice(2).padStart(64, '0') + 'f'.repeat(64)) as `0x${string}`;

async function attempt(label: string, fn: () => Promise<unknown>) {
  console.log(`\n=== ${label} ===`);
  try {
    const r = await fn();
    console.log(JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  } catch (e) {
    console.log('ERROR:', e instanceof Error ? e.message.split('\n')[0] : e);
  }
}

await attempt('approve + traceAssetChanges + stateOverrides (what check.ts does)', () =>
  client.simulateCalls({
    account: WHALE,
    calls: [{ to: USDC, data: APPROVE }],
    traceAssetChanges: true,
    stateOverrides: [{ address: WHALE, balance: 10n ** 20n }],
  }),
);

await attempt('approve + traceAssetChanges, NO stateOverrides', () =>
  client.simulateCalls({
    account: WHALE,
    calls: [{ to: USDC, data: APPROVE }],
    traceAssetChanges: true,
  }),
);

await attempt('approve, no tracing at all', () =>
  client.simulateCalls({ account: WHALE, calls: [{ to: USDC, data: APPROVE }] }),
);

await attempt('native transfer + traceAssetChanges (does it see native movement?)', () =>
  client.simulateCalls({
    account: WHALE,
    calls: [{ to: EOA, value: parseEther('0.001') }],
    traceAssetChanges: true,
  }),
);
