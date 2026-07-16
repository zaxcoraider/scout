# Scout — OKX.AI ASP Hackathon Submission Kit

> **Deadline: Jul 17, 2026 · 23:59 UTC.** Listing must PASS OKX internal review AND be
> LIVE to stay eligible — review takes up to 24h, so submit for listing today.

---

## 0. Critical path / checklist

- [ ] Deploy Scout to Vercel → get public URL (e.g. `https://scout-xxxx.vercel.app`)
- [ ] Set `SCOUT_PAYTO_ADDRESS` to REAL receiving wallet (not `0x0000…`)
- [ ] Verify live `/mcp` returns 402 gate + DANGER verdict on the drainer fixture
- [ ] Register A2MCP ASP via Onchain OS agent (steps 2–5 of the tutorial) — **starts review; OKX reviews in parallel during the submission window**
- [ ] Post on X with `#OKXAI` — intro + use case + ≤90s demo/walkthrough **embedded in the post** (no separate video upload) → copy the post link
- [ ] Submit Google form (ASP details + X post link) before Jul 17 23:59 UTC

Submission window: Jul 3 – **Jul 17 23:59 UTC**. Get listed early — OKX reviews and
approves in parallel during the window, so being in the queue sooner = safer.

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

Target: show the DANGER path — a wallet-drainer approval — because it's the money shot.

| Time | Shot | What to show / say |
|------|------|--------------------|
| 0:00–0:08 | Title card | "Scout — simulate any transaction before you sign it." |
| 0:08–0:20 | The problem | Text overlay: "Wallets get drained the moment you sign. Nothing checks the transaction itself — until now." |
| 0:20–0:35 | The call | Show an agent / terminal calling `scout_check_transaction` with a real drainer approval: an unlimited `approve()` to a plain wallet (EOA). Keep the JSON visible. |
| 0:35–0:55 | The verdict | Cut to the response: **DANGER — "STOP — this hands a stranger the keys to ALL of your tokens."** Highlight findings `UNLIMITED_APPROVAL`, `APPROVAL_TO_EOA`, and `mode: simulated`. |
| 0:55–1:12 | Contrast | Run a benign swap → **SAFE**. Show Scout doesn't cry wolf: normal activity passes clean. |
| 1:12–1:25 | Why it's different | Overlay: "Only ASP that simulates PENDING calldata. Never signs. No keys. Stateless. Calldata never leaves." |
| 1:25–1:30 | Close | "Scout. Live on OKX.AI. #OKXAI" + the marketplace link. |

**Demo command** (reuse the verified e2e — produces the exact DANGER output on camera):
```bash
npx tsx scripts/e2e.ts
```

---

## 4. Google form answers — the ACTUAL 7 fields (submit before Jul 17 23:59 UTC)

Form: OKX.AI Genesis Hackathon. Email (`zaxemoboy006@gmail.com`) is pre-filled.
All 7 fields are required. Note: the form has NO endpoint/pricing/repo field — those
live only in the OKX listing itself.

1. **ASP Name*** — `Scout`
2. **Agent ID*** — `<the ID OKX gives you after the ASP is listed>`
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
