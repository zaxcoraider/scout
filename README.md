<div align="center">

<img src="public/og.png" alt="Scout — the safety check that runs before you sign" width="100%">

<br>

[![Live on OKX.AI](https://img.shields.io/badge/OKX.AI-Agent_%236325-2bd576?style=for-the-badge)](https://www.okx.ai/agents/6325)
[![Live Demo](https://img.shields.io/badge/Live_demo-scout--nu--wheat.vercel.app-0a0e0f?style=for-the-badge)](https://scout-nu-wheat.vercel.app)
[![x402](https://img.shields.io/badge/x402-0.01_USDT%2Fcall_·_X_Layer-ffb224?style=for-the-badge)](https://web3.okx.com/onchainos/dev-docs)

![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square&logo=typescript&logoColor=white)
![viem](https://img.shields.io/badge/viem-eth__simulateV1-2bd576?style=flat-square)
![MCP](https://img.shields.io/badge/protocol-MCP_over_HTTP-8aa096?style=flat-square)
![tests](https://img.shields.io/badge/tests-38_passing-2bd576?style=flat-square)
![stateless](https://img.shields.io/badge/state-none_·_no_keys_·_no_DB-ff4d5d?style=flat-square)

**Every wallet check runs *after* you sign. Scout runs *before*.**

</div>

---

Scout is a pay-per-call [MCP](https://modelcontextprotocol.io) agent service on
[OKX.AI](https://www.okx.ai/agents/6325). You give it the **exact transaction sitting in a
wallet** — `chainId`, `from`, `to`, `value`, `data` — before anyone signs it. Scout executes
it against live chain state and answers in plain English:

<div align="center">

🟢 **SAFE** &nbsp;·&nbsp; 🟡 **CAUTION** &nbsp;·&nbsp; 🔴 **DANGER**

*"STOP — this hands a stranger the keys to ALL of your tokens."*

</div>

Every other on-chain security tool scans tokens, addresses, or approvals that **already
exist**. Scout inspects the **pending transaction itself** — the one moment a check can
actually save the wallet. The signer today is increasingly an AI agent with no popup to
read: Scout is the safety check an agent calls as a tool, in-line, right before it signs.

## What Scout catches

One tool: **`scout_check_transaction`**. It observes what the transaction *actually does* —
balance changes, approvals granted, reverts — then runs six checks on the evidence:

| Check | What it means | Verdict |
|---|---|:---:|
| `KNOWN_DRAINER` | An address in the transaction is on a public drainer blacklist (ScamSniffer) | 🔴 DANGER |
| `UNLIMITED_APPROVAL` | A spender could move an **unlimited** amount of your tokens, forever | 🔴 DANGER |
| `NFT_BLANKET_APPROVAL` | `setApprovalForAll` — every NFT you own in the collection, plus future ones | 🔴 DANGER |
| `APPROVAL_TO_EOA` | The approval goes to a **personal wallet**, not a contract. Real apps never need this | 🔴 DANGER |
| `TX_REVERTS` | The transaction fails when simulated — you'd pay gas for nothing | 🟡 CAUTION |
| `NO_INCOMING_VALUE` | Value leaves your wallet and **nothing comes back** | 🟡 CAUTION |

The worst finding wins; two CAUTIONs escalate to DANGER. Honest transactions pass **SAFE** —
a safety tool that cries wolf on normal behaviour is one users learn to ignore.

> 🎮 **Try it live** — the landing page runs the real engine on four showcase transactions:
> a wallet drainer, an NFT trap, a hidden transfer, and a normal send.
> **[scout-nu-wheat.vercel.app](https://scout-nu-wheat.vercel.app)**

## Architecture

Heuristics are small pure functions — no I/O inside them. Static context is fetched at the
edge and passed in. Effects live at the edges.

```mermaid
flowchart LR
    A["🤖 Agent / wallet<br/>pending tx:<br/>chainId · from · to · value · data"] --> B["💳 x402 payment gate<br/>402 challenge → verify → settle"]
    B --> C["🛰️ MCP server<br/>scout_check_transaction<br/>zod .strict() input"]
    C --> D["🔍 Decode calldata<br/>the FLOOR — every chain<br/>catches approval drainers alone"]
    C --> E["⚡ Simulate<br/>the CEILING — eth_simulateV1 via viem<br/>balance diffs · approvals · reverts"]
    D --> F["🧩 Merge evidence<br/>+ static context<br/>(EOA checks · drainer list)"]
    E --> F
    E -. "RPC can't simulate?<br/>degrade to decode-only<br/>and SAY SO" .-> F
    F --> G["⚖️ 6 pure heuristics<br/>worst finding wins<br/>2 cautions ⇒ DANGER"]
    G --> H["🟢🟡🔴 Verdict<br/>plain-English headline<br/>+ findings + disclaimer"]

    classDef edge fill:#0f1517,stroke:#2bd576,color:#e9f1ec
    classDef core fill:#121a1d,stroke:#8aa096,color:#e9f1ec
    classDef out fill:#0f1517,stroke:#ffb224,color:#e9f1ec
    class A,B edge
    class C,D,E,F,G core
    class H out
```

**Two analysis modes, honestly labeled.** Decode is the floor: it works on every chain and
catches approval drainers on its own (X Layer runs decode-only — no public RPC there
supports `eth_simulateV1`). Simulation is the ceiling: on Ethereum, Scout executes the
transaction via `eth_simulateV1` state-override and *observes* balance diffs and reverts.
If simulation is unavailable, Scout degrades to decode-only and **says so** in
`analysis.mode` — it never dresses a weaker answer up as a full one.

## Pay-per-call: x402 on X Layer

No accounts, no subscriptions, no API keys for callers. Payment is one HTTP round trip:

```mermaid
sequenceDiagram
    participant A as 🤖 Buyer agent
    participant S as 🛰️ Scout /mcp
    participant F as 🏦 OKX facilitator

    A->>S: POST /mcp (no payment)
    S-->>A: 402 + PAYMENT-REQUIRED header<br/>(base64 x402 challenge: asset · amount · payTo)
    A->>A: sign EIP-3009 authorization<br/>(0.01 USD₮0, X Layer)
    A->>S: POST /mcp + PAYMENT-SIGNATURE header
    S->>F: verify payment
    S->>F: settle on-chain
    S-->>A: 200 · verdict + PAYMENT-RESPONSE receipt
```

The gate runs **before** any validation or simulation compute, and fails closed: a bad
payment gets a clean 402 with a fresh challenge, never a free ride.

## Example — a real captured response

A "claim"-shaped calldata that quietly `transfer()`s 25,000 USDC out of the wallet:

```jsonc
{
  "verdict": "CAUTION",
  "headline": "Money leaves your wallet and nothing comes back.",
  "effects": ["You send 25000 0xa0b8…eb48"],
  "findings": [
    {
      "id": "NO_INCOMING_VALUE",
      "severity": "caution",
      // token = USDC
      "detail": "25000 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48 leaves your wallet and nothing comes back. If you expected a swap or a purchase, this is not one."
    }
  ],
  "analysis": {
    "mode": "simulated",
    "note": "Transaction was decoded and executed against live chain state. Balance changes and revert status are observed, not guessed."
  },
  "simulation": { "success": true, "balanceDiffs": [/* … */], "approvalDiffs": [] },
  "chain": { "id": 1, "name": "Ethereum" },
  "disclaimer": "Safety signal, not a guarantee. Scout simulates the transaction you gave it and reports what it observed. Not financial advice."
}
```

### Tool input

| Field | Type | |
|---|---|---|
| `chainId` | `number` | `196` X Layer · `1` Ethereum |
| `from` | `0x…` address | the wallet that would sign |
| `to` | `0x…` address | the contract or wallet being called |
| `value` | decimal wei string | optional |
| `data` | `0x…` hex calldata | optional |

## Security & privacy, by contract

These are hard rules of the codebase (see [`CLAUDE.md`](CLAUDE.md)), not aspirations:

- 🔑 **Never signs. No private keys anywhere.** Scout only ever *reads* and *simulates*.
- 🗄️ **Stateless.** No database. Nothing about a check persists after the response is sent.
- 🕵️ **Calldata never leaves.** Outbound requests go only to the env-allowlisted RPCs —
  no third-party scanner APIs that would leak what you're about to sign.
- 🧹 **Logs are sanitized.** Never raw calldata, full addresses, payment identifiers, or
  env values — only timestamp, chainId, tool, verdict, latency, finding IDs.
- 🧱 **Strict input.** Every tool schema is zod `.strict()` — unknown fields rejected.
  Error messages never echo raw user input.

## Run it yourself

```bash
git clone https://github.com/zaxcoraider/scout && cd scout
npm ci
cp .env.example .env       # RPC allowlist + pricing; payment creds optional for local dev
npm run dev                # Fastify on :8787 — /mcp (x402-gated) + /healthz
npm test                   # 38 tests: heuristics fixtures + payment gate
```

The camera-ready demo (four acts: live 402 paywall → DANGER → CAUTION → SAFE, ~60s):

```bash
npx tsx --env-file=.env scripts/demo.ts
```

### Repository layout

```
api/            Vercel functions: mcp (paid), demo (free showcase), healthz
src/
  check.ts      the pipeline: decode → simulate → context → heuristics → verdict
  decode/       calldata decoding — approvals caught on every chain
  sim/          eth_simulateV1 state-override simulation (viem simulateCalls)
  heuristics/   six pure functions, no I/O
  verdict/      worst-finding-wins composition
  payment/      x402 gate + OKX facilitator (verify/settle)
  chains/       chain config + RPC allowlist
public/         landing page with the live 4-scenario demo
tests/          fixture tests — every heuristic: positive, negative, edge
```

---

<div align="center">
<img src="public/icon.png" alt="Scout owl" width="72">

**Scout** · Agent [#6325](https://www.okx.ai/agents/6325) on OKX.AI · Software Services

*Safety signal, not a guarantee. Scout simulates the transaction you gave it and reports
what it observed. Not financial advice.*
</div>
