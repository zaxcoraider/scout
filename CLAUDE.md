# PreFlight — Project Constitution

Pay-per-call MCP server that simulates a **pending transaction** and returns a plain-English
safety verdict. The one thing no other OKX.AI security agent does: take the exact calldata a
user/agent is about to sign, execute it, and report what actually happens.

## Positioning (decided after scraping the live okx.ai marketplace, 2026-07-14)

Seven live competitors scan **tokens, addresses, or existing approvals** (CertiK @0.001,
SentryX, Onchain Shield, CA X-Ray, AddressX, IronClaw, GlassDesk). **None simulate pending
calldata.** That gap is the entire product.

- Do NOT build token-scan or address-scan tools. CertiK owns token scan at 0.001 USDT.
- ONE tool: `preflight_check_transaction`. Scope creep here is how we lose.
- Category: Software Services. Contends for Best Product + Revenue Rocket.

## Stack

TypeScript (strict), `@modelcontextprotocol/sdk`, `zod`, `viem`, `fastify`, `vitest`.

**Simulation is eth_call state-override via viem (`simulateCalls`) — NOT anvil forks.**
Rationale: X Layer is a Polygon CDK zkEVM and may not fork correctly under anvil. No child
processes, no port pools, no SIGKILL timers, no Foundry-in-Docker. Deterministic and fast.
Do not reintroduce anvil.

No new runtime deps without asking.

## SECURITY CONTRACT (violating any clause is a P0 bug)

a. **No private keys anywhere in this codebase, ever. This service never signs.**
b. All secrets via `process.env`, validated at boot with zod. `.env` is gitignored;
   `.env.example` holds placeholders only.
c. **Never pass user input to a shell.** Child processes (if ever) use `execFile`/`spawn`
   with argument arrays only — never string commands.
d. Outbound network requests only to RPC URLs from the env allowlist. **No user-supplied
   URLs. No third-party scanner APIs** (they leak the caller's calldata — our not doing this
   is a marketing point).
e. **Logging:** never log raw calldata, full addresses (truncate `0xAB12…34CD`), payment
   identifiers, or env values. Log only: timestamp, chainId, tool name, verdict, latency ms,
   finding IDs.
f. Every tool input schema is zod `.strict()` — unknown fields rejected.
g. Error messages never echo raw user input verbatim.
h. **Stateless.** No database. Nothing about a check is persisted after the response is sent.

## Testing rule

Every heuristic gets a fixture test (positive + negative + edge) before it counts as done.

## Style

Heuristics are small pure functions — no I/O inside them. Static context is fetched at the
edge and passed in. Effects at the edges.

## Compliance language (listing + tool descriptions)

Never the words "audit" or "guarantee". Say "safety signals". Every response carries the
`disclaimer` field. Not financial advice.
