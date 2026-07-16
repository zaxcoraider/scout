/**
 * End-to-end over real HTTP: the 402 gate, then a paid MCP tools/call returning a verdict.
 * Server must be running (npm run dev).
 */
const URL = 'http://localhost:8787/mcp';

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WHALE = '0x28C6c06298d514Db089934071355E5743bf21d60';
const EOA = '0x1111111111111111111111111111111111111111';
const APPROVE = '0x095ea7b3' + EOA.slice(2).padStart(64, '0') + 'f'.repeat(64);

const MCP_ACCEPT = 'application/json, text/event-stream';

async function call(headers: Record<string, string>, body: unknown) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, text: await res.text() };
}

console.log('=== 1. Unpaid call (expect HTTP 402 + payment instructions) ===');
const unpaid = await call({}, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
console.log(`HTTP ${unpaid.status}`);
console.log(unpaid.text.slice(0, 500));

console.log('\n=== 2. Paid call: tools/call scout_check_transaction (drainer approval) ===');
const paid = await call(
  { 'x-payment': 'demo-payment-payload' },
  {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'scout_check_transaction',
      arguments: { chainId: 1, from: WHALE, to: USDC, data: APPROVE },
    },
  },
);
console.log(`HTTP ${paid.status}`);

// Streamable HTTP replies as SSE; pull the JSON payload out of the data: line.
const line = paid.text.split('\n').find((l) => l.startsWith('data:'));
const payload = line ? JSON.parse(line.slice(5).trim()) : JSON.parse(paid.text);
const structured = payload?.result?.structuredContent;

if (structured) {
  console.log(`\n  verdict:  ${structured.verdict}`);
  console.log(`  headline: ${structured.headline}`);
  console.log(`  mode:     ${structured.analysis?.mode}`);
  console.log(`  findings: ${structured.findings?.map((f: { id: string }) => f.id).join(', ')}`);
  console.log(`  effects:  ${structured.effects?.join(' | ')}`);
  console.log(`\n${structured.verdict === 'DANGER' ? '✅ E2E PASS' : '❌ E2E FAIL'}`);
} else {
  console.log('❌ No structuredContent. Raw:\n', paid.text.slice(0, 800));
}
