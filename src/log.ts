// Security contract (e): never log raw calldata, full addresses, payment ids, or env values.

/** 0xAB12…34CD — the ONLY form an address may take in a log line. */
export function truncateAddress(address: string): string {
  if (address.length < 12) return '0x…';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface CheckLogLine {
  chainId: number;
  tool: string;
  verdict: string;
  latencyMs: number;
  findingIds: string[];
}

export function logCheck(line: CheckLogLine): void {
  // Deliberately NOT logging: calldata, from/to, value, payment identifiers.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      ...line,
    }),
  );
}
