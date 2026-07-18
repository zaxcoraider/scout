/**
 * Camera-ready demo for the ≤90s hackathon video. One command, three acts, paced for
 * screen recording (~50s total):
 *
 *   1. The live endpoint's x402 paywall — proves this is a real paid API, live right now.
 *   2. A wallet-drainer approval (unlimited approve() to an EOA) → DANGER, simulated on mainnet.
 *   3. A claim-shaped calldata that quietly transfers 25,000 USDC out → CAUTION.
 *   4. A plain ETH transfer → SAFE — Scout doesn't cry wolf. Full verdict range on camera.
 *
 * Run:  npx tsx --env-file=.env scripts/demo.ts
 * Record the terminal full-screen, font 18pt+. Title/close cards are overlays in the editor
 * (shot list in docs/OKX-SUBMISSION.md §3).
 */
import { checkTransaction } from '../src/check.js';

const LIVE = 'https://scout-nu-wheat.vercel.app/mcp';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WHALE = '0x28C6c06298d514Db089934071355E5743bf21d60';
const STRANGER = '0x1111111111111111111111111111111111111111';
const DRAIN_CALLDATA = ('0x095ea7b3' +
  STRANGER.slice(2).padStart(64, '0') +
  'f'.repeat(64)) as `0x${string}`;

const RED = '\x1b[1;31m';
const GREEN = '\x1b[1;32m';
const YELLOW = '\x1b[1;33m';
const CYAN = '\x1b[1;36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function typewriter(line: string, delayMs = 12): Promise<void> {
  for (const ch of line) {
    process.stdout.write(ch);
    await sleep(delayMs);
  }
  process.stdout.write('\n');
}

function banner(text: string): void {
  console.log(`\n${CYAN}${'━'.repeat(64)}${RESET}`);
  console.log(`${CYAN}  ${text}${RESET}`);
  console.log(`${CYAN}${'━'.repeat(64)}${RESET}\n`);
}

function verdictBlock(verdict: string, headline: string): void {
  const color = verdict === 'DANGER' ? RED : verdict === 'CAUTION' ? YELLOW : GREEN;
  console.log(`\n  ${color}┌${'─'.repeat(56)}┐${RESET}`);
  console.log(`  ${color}│  ${verdict.padEnd(54)}│${RESET}`);
  console.log(`  ${color}└${'─'.repeat(56)}┘${RESET}`);
  console.log(`  ${color}${headline}${RESET}\n`);
}

async function main(): Promise<void> {
  banner('SCOUT 🛰️  · the safety check that runs BEFORE you sign');
  await sleep(2000);

  // ── Act 1: the paywall is real ────────────────────────────────────────────
  banner('1 · Scout is a LIVE paid API on OKX.AI (x402, pay-per-call)');
  await typewriter(`${DIM}POST ${LIVE}  (no payment attached)${RESET}`);
  const res = await fetch(LIVE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
  const gate = (await res.json()) as {
    accepts?: [{ amount: string; network: string; extra: { name: string } }];
  };
  const a = gate.accepts?.[0];
  console.log(`\n  ${YELLOW}HTTP ${res.status} Payment Required${RESET}`);
  if (a) {
    const price = Number(a.amount) / 1e6;
    console.log(`  ${DIM}price: ${price} ${a.extra.name} per call · network: ${a.network}${RESET}`);
  }
  await sleep(2500);

  // ── Act 2: the drainer ────────────────────────────────────────────────────
  banner("2 · A 'harmless' transaction lands in your wallet. Sign it?");
  const drainInput = { chainId: 1, from: WHALE, to: USDC, data: DRAIN_CALLDATA };
  await typewriter(JSON.stringify(drainInput, null, 2), 4);
  await sleep(1500);
  await typewriter(`\n${DIM}scout_check_transaction — simulating against live Ethereum state…${RESET}`);
  const danger = await checkTransaction(drainInput);
  verdictBlock(danger.verdict, danger.headline);
  for (const f of danger.findings) console.log(`  ${RED}✗${RESET} ${f.id} — ${f.detail}`);
  console.log(`\n  ${DIM}analysis mode: ${danger.analysis.mode}${RESET}`);
  await sleep(3500);

  // ── Act 3: the hidden transfer ───────────────────────────────────────────
  banner('3 · A "claim rewards" button. The calldata says otherwise.');
  const hiddenInput = {
    chainId: 1,
    from: WHALE,
    to: USDC,
    data: `0xa9059cbb${STRANGER.slice(2).padStart(64, '0')}${(25_000_000_000n).toString(16).padStart(64, '0')}` as `0x${string}`,
  };
  await typewriter(JSON.stringify(hiddenInput, null, 2), 4);
  const caution = await checkTransaction(hiddenInput);
  verdictBlock(caution.verdict, caution.headline);
  for (const f of caution.findings) console.log(`  ${YELLOW}!${RESET} ${f.id} — ${f.detail}`);
  await sleep(3000);

  // ── Act 4: no false alarms ───────────────────────────────────────────────
  banner("4 · And a normal transfer? Scout doesn't cry wolf.");
  const safeInput = { chainId: 1, from: WHALE, to: STRANGER, value: '1000000000000000' };
  await typewriter(JSON.stringify(safeInput, null, 2), 4);
  const safe = await checkTransaction(safeInput);
  verdictBlock(safe.verdict, safe.headline);
  for (const e of safe.effects) console.log(`  ${GREEN}·${RESET} ${e}`);
  await sleep(2500);

  console.log(`\n${CYAN}  Scout · agent #6325 · live on OKX.AI · #OKXAI${RESET}\n`);
}

void main();
