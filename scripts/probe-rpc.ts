/**
 * Which public RPCs actually support eth_simulateV1 (+ eth_createAccessList)?
 * The whole anvil-free design rests on this. Find out before building further.
 */
const CANDIDATES: Record<string, string[]> = {
  ethereum: [
    'https://ethereum-rpc.publicnode.com',
    'https://eth.drpc.org',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
    'https://eth.merkle.io',
  ],
  xlayer: [
    'https://rpc.xlayer.tech',
    'https://xlayerrpc.okx.com',
    'https://endpoints.omniatech.io/v1/xlayer/mainnet/public',
  ],
};

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { error?: { message: string }; result?: unknown };
  if (json.error) throw new Error(json.error.message.slice(0, 60));
  return json.result;
}

async function probe(url: string) {
  const out: string[] = [];
  try {
    const id = (await rpc(url, 'eth_chainId', [])) as string;
    out.push(`chainId=${parseInt(id, 16)}`);
  } catch (e) {
    return `  ✗ ${url}\n      DEAD: ${e instanceof Error ? e.message : e}`;
  }

  // The call that matters.
  try {
    await rpc(url, 'eth_simulateV1', [
      { blockStateCalls: [{ calls: [] }], traceTransfers: true },
      'latest',
    ]);
    out.push('eth_simulateV1=YES');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    out.push(`eth_simulateV1=NO (${msg})`);
  }

  return `  • ${url}\n      ${out.join('  |  ')}`;
}

async function main() {
  for (const [chain, urls] of Object.entries(CANDIDATES)) {
    console.log(`\n=== ${chain} ===`);
    const results = await Promise.all(urls.map(probe));
    results.forEach((r) => console.log(r));
  }
}

void main();
