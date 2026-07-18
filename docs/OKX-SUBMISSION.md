# Scout — OKX.AI ASP Hackathon Submission Kit

> **Deadline: Jul 27, 2026 · 23:59 UTC** (extended from Jul 17). Listing must PASS OKX
> internal review AND be LIVE to stay eligible — review takes up to 24h.

---

## 0. Critical path / checklist

- [x] Deploy Scout to Vercel → `https://scout-nu-wheat.vercel.app`
- [x] Set `SCOUT_PAYTO_ADDRESS` to REAL receiving wallet
- [x] Verify live `/mcp` returns 402 gate + DANGER verdict on the drainer fixture
- [x] Register A2MCP ASP — **Agent ID 6325**; rejected twice (avatar; x402 challenge), both fixed 2026-07-17: recon-owl avatar live, 402 now serves the `PAYMENT-REQUIRED` header validated against OKX's own SDK schema
- [ ] Resubmit for review (`activate #6325`) — only with explicit user go-ahead
- [ ] Post on X with `#OKXAI` — intro + use case + ≤90s demo/walkthrough **embedded in the post** (no separate video upload) → copy the post link
- [ ] Submit Google form (ASP details + X post link) before Jul 27 23:59 UTC

---

## 1. A2MCP listing details (feed these to the Onchain OS agent in step 4)

**Service type:** A2MCP (Agent-to-MCP)

**Name:** `Scout`

**One-line tagline:** Simulate any transaction before you sign it.

**Category:** Software Services / Security

**Pricing:** Fixed price per call — **0.01 USDT** (x402, OKX Payment SDK)

**Endpoint:** `https://<your-vercel-url>/mcp`  *(x402-compliant paid endpoint)*

**Tool:** `scout_check_transaction`

**Description (short, for the marketplace row):**
> Scout takes the exact calldata you're about to sign, executes it against live chain
> state, and tells you in plain English what it actually does — balance changes, token
> approvals granted, and whether it reverts — with a SAFE / CAUTION / DANGER verdict.
> The one safety check that happens BEFORE you sign, not after.

**Description (long, for the listing body):**
> Every other on-chain security tool scans tokens, addresses, or approvals that already
> exist. Scout is different: it inspects the *pending transaction itself*. Give it the
> `chainId`, `from`, `to`, `value`, and `data` you're about to sign, and Scout simulates
> the call against live chain state and reports what would actually happen to your wallet.
>
> It catches the attacks that matter at signing time: unlimited token approvals, NFT
> blanket `setApprovalForAll`, approvals sent to a personal wallet instead of a contract,
> known drainer addresses, transactions that revert, and value that leaves with nothing
> coming back. The output is one plain-English verdict — SAFE, CAUTION, or DANGER — plus a
> headline a non-technical person understands.
>
> Privacy by design: Scout never signs, holds no private keys, is fully stateless (nothing
> is persisted after the response), and never forwards your calldata to any third-party
> scanner. Your pending transaction stays between you and the RPC.
>
> Supported chains: X Layer (196) and Ethereum (1). Safety signals, not a guarantee. Not
> financial advice.

**Input schema (`scout_check_transaction`):**
- `chainId` (number) — 196 for X Layer, 1 for Ethereum
- `from` (0x address) — the wallet that would sign
- `to` (0x address) — the contract or wallet being called
- `value` (decimal wei string, optional)
- `data` (0x hex calldata, optional)

---

## 2. X post (#OKXAI) — you post this from your account

**Option A — single post:**
> Meet Scout 🛰️ — the only OKX.AI agent that checks a transaction BEFORE you sign it.
>
> Paste the calldata you're about to approve. Scout simulates it and tells you in plain
> English what it really does: unlimited approvals, drainers, value that never comes back.
>
> SAFE / CAUTION / DANGER. Live on OKX.AI 👇
> #OKXAI

**Option B — thread (if you want room for the demo):**
> 1/ Wallets are drained at the moment you sign — not before. Scout 🛰️ closes that gap.
> It's an OKX.AI ASP that simulates your *pending* transaction and tells you what it
> actually does, in plain English, before you approve. #OKXAI
>
> 2/ Every other scanner checks tokens or addresses that already exist. Scout checks the
> transaction itself — the exact calldata. Unlimited approvals, NFT blanket grants,
> approvals to a stranger's wallet, known drainers, silent value transfers. One verdict:
> SAFE / CAUTION / DANGER.
>
> 3/ Privacy by design: never signs, holds no keys, stateless, and your calldata never
> leaves for a 3rd-party scanner. Pay-per-call on X Layer via x402. [demo ↓]

---

## 3. Demo script (≤90 seconds, shot-by-shot)

Target: the DANGER path is the money shot, but show all three verdicts — no other ASP can.

| Time | Shot | What to show / say |
|------|------|--------------------|
| 0:00–0:08 | Title card | "Scout — simulate any transaction before you sign it." |
| 0:08–0:18 | The problem | Text overlay: "Wallets get drained the moment you sign. Nothing checks the transaction itself — until now." |
| 0:18–0:26 | It's live & paid | Act 1 of the script: the real x402 paywall on the live endpoint — HTTP 402, 0.01 USD₮0 per call on X Layer. |
| 0:26–0:42 | The drainer | Act 2: `scout_check_transaction` on an unlimited `approve()` to a plain wallet (EOA). Keep the JSON visible, then **DANGER — "STOP — this hands a stranger the keys to ALL of your tokens."** Highlight `UNLIMITED_APPROVAL`, `APPROVAL_TO_EOA`, `mode: simulated`. |
| 0:42–0:56 | The hidden transfer | Act 3: a "claim"-shaped calldata that quietly `transfer()`s 25,000 USDC out → **CAUTION — "Money leaves your wallet and nothing comes back."** |
| 0:56–1:08 | Contrast | Act 4: a plain ETH transfer → **SAFE**. Scout doesn't cry wolf: normal activity passes clean. |
| 1:08–1:20 | Why it's different | Overlay: "Only ASP that simulates PENDING calldata. Never signs. No keys. Stateless. Calldata never leaves." |
| 1:20–1:28 | Close | "Scout. Live on OKX.AI. Agent #6325. #OKXAI" + the marketplace link. |

**Demo command** (camera-ready, paced for recording — plays all four acts, ~60s):
```bash
npx tsx --env-file=.env scripts/demo.ts
```
Record the terminal full-screen, dark theme, font 18pt+. Title/problem/why/close cards are
overlays added in the editor.

---

## 4. Google form answers — the ACTUAL 7 fields (submit before Jul 27 23:59 UTC)

Form: OKX.AI Genesis Hackathon. Email (`zaxemoboy006@gmail.com`) is pre-filled.
All 7 fields are required. Note: the form has NO endpoint/pricing/repo field — those
live only in the OKX listing itself.

1. **ASP Name*** — `Scout`
2. **Agent ID*** — `6325`
3. **ASP Description*** —
   > Scout takes the exact calldata you're about to sign, executes it against live chain
   > state, and tells you in plain English what it actually does — balance changes, token
   > approvals granted, and whether it reverts — with a SAFE / CAUTION / DANGER verdict.
   > Unlike scanners that check tokens or addresses that already exist, Scout inspects the
   > *pending transaction itself*, catching unlimited approvals, NFT blanket grants,
   > approvals to a personal wallet, known drainers, reverts, and one-way value transfers —
   > before you sign. Never signs, holds no keys, fully stateless, and never forwards your
   > calldata to a third-party scanner. Pay-per-call via x402 on X Layer. Supported chains:
   > X Layer (196) and Ethereum (1). Safety signals, not a guarantee. Not financial advice.
4. **ASP Type*** — `A2MCP`
5. **X Account Handle*** — `<your @handle>`
6. **X Participation Post (Link)*** — `<your #OKXAI post URL>`
7. **Telegram Handle*** — `<your @handle>`

---

*Compliance note: listing copy avoids the words "audit" and "guarantee"; uses "safety
signals"; every tool response carries the disclaimer; not financial advice. Aligned with
CLAUDE.md constitution.*
