# Devpost submission draft: Oracle402

Copy each section into the matching Devpost field. Lines starting with **TODO** must be resolved before submitting.

---

## 1. Project name
Oracle402

## 2. Tagline
Pay-per-query prediction-market odds for AI agents

## 3. Short description
A forecast API that AI agents pay per call: $0.001 USDC over x402 via Circle Gateway on Arc, returning Gemini prediction-market odds. A policy engine and a dashboard keep spending inside budget caps, human approval and a kill switch.

## 4. Submission selections
- [ ] Main track: **Agentic Payments and AI**
- [ ] Chain award: **Best use of Arc** (NOT Solana)
- [ ] Bounty: **Gemini Prediction Markets**
- [ ] Opt in to: the main track prize, the Best use of Arc chain award, and the Gemini Prediction Markets bounty
- **TODO:** match these to the exact checkbox labels on the Devpost form, and confirm at least one team member can attend the closing ceremony on Sat Nov 21 (required to win).

## 5. Written answers

### What did you build?
Oracle402 is a pay-per-query forecast oracle for AI agents. A seller API wraps Gemini's public Prediction Markets data. Market search is free; a forecast for one event (the market-implied probability of each contract) costs $0.001 USDC, paid over x402 with Circle Gateway nanopayments on Arc testnet. A buyer agent decides when a forecast is worth paying for, and every payment passes a policy engine: hard budget cap, per-call cap, host allowlist, human approval after half the budget is spent, and a kill switch. A dashboard shows the budget, the payment ledger, the agent's decision trace, approval prompts and the kill switch. We tested it with real testnet USDC: 14 paid calls, and the payments appear in an onchain Gateway batch settlement on Arc.

**TODO:** the agent is built as an LLM tool-use loop (Anthropic API), but every test so far ran in its scripted fallback mode. Confirm LLM mode works end to end before submitting, or reword this to say the scripted mode was what we tested.

### What problem does it solve?
AI agents are frozen at their training cutoff, so they cannot know what is likely to happen next. Prediction markets price the future continuously, but agents can't easily pay for that data: API keys, subscriptions and accounts are built for humans, and card payments are too expensive for sub-cent requests. Giving an agent a wallet creates a second problem: nothing stops it from overspending. Oracle402 addresses both. The seller charges a tenth of a cent per forecast over HTTP 402, so an agent pays only for the data it uses, with no account. The buyer side wraps every payment in explicit, auditable limits that a human controls in real time: caps, an approval gate and a kill switch.

### How does it work?
1. The agent calls `GET /markets?q=` (free) on the seller, which searches Gemini's active prediction-market events and returns tickers and titles without prices.
2. It picks one event and reads the advertised price from `GET /pricing` (free) before spending anything.
3. `Policy.check()` allows the call, denies it, or asks a human on the dashboard to approve it.
4. If allowed, the agent requests `GET /forecast/:ticker`. The seller checks that the ticker exists (unknown tickers get a 404 before the paywall, so no charge) and returns HTTP 402 with payment requirements for Arc testnet.
5. Circle's `GatewayClient` signs a gasless USDC authorization, retries, and the seller returns Gemini's live bid, ask and last trade converted to probabilities.
6. The payment is logged to the ledger and decision trace on the dashboard. Gateway later settles the payments onchain in a batch.

### What makes it unique?
Most agent-payment demos show that an agent can pay. Oracle402 also shows what happens when it should not. Every guardrail fires against real payments, not mocks. In our test run, the first five purchases went through automatically. From the sixth, a human had to approve each one, and a denied request made no payment. The eleventh was refused at the hard budget cap, and the kill switch blocked further spending. The seller is agent-friendly too: discovery and pricing are free, and it checks the ticker exists before taking payment, so an agent is never charged for a 404. The data itself is a good fit for per-call pricing: prediction-market odds go stale within minutes, and an agent usually needs only one market's odds, once. Settlement uses Circle Gateway batching on Arc, so each sub-cent payment costs the buyer no gas.

### What would you build next?
- Prices that vary with market liquidity and how fresh the quote is, advertised through the free `/pricing` endpoint so agents still see the cost before paying.
- Forecasts that combine several related markets into one answer, such as a probability distribution across BTC price strikes.
- Separate budgets and policies per agent and per task, stored persistently. Today the ledger and spend counter live in memory and reset on restart.
- Listing the seller in an agent service directory so agents can discover it without a hard-coded URL.
- A move from Arc testnet to mainnet, with spending reports a human can reconcile against the onchain settlement batches.

## 6. Built with
TypeScript, Node.js, Express, x402, Circle Gateway, Circle Nanopayments (@circle-fin/x402-batching), USDC, Arc, viem, Gemini Prediction Markets API, Anthropic API, Claude

(**TODO:** keep "Anthropic API, Claude" only if LLM mode is confirmed working.)

## 7. Links
- GitHub repo: https://github.com/moha2048/oracle402 (**TODO:** confirm it is public and the push succeeded)
- Demo video: **TODO:** YouTube or Google Drive URL (set to public / anyone with the link)
- README sections to point judges at:
  - Architecture: https://github.com/moha2048/oracle402#architecture
  - Decision loop: https://github.com/moha2048/oracle402#the-agents-decision-loop-srcagentts
  - Safety limits: https://github.com/moha2048/oracle402#safety-limits-srcpolicyts
  - Arc usage, contract addresses and tx links: https://github.com/moha2048/oracle402#how-we-use-arc
  - Gemini usage: https://github.com/moha2048/oracle402#how-we-use-gemini-prediction-markets
- Gateway batch settlement tx (Arc testnet): https://testnet.arcscan.app/tx/0x38cadf8537763a5d3cbdb63539ba6c0a29408962178d892b989510bdf78bbfce
- Gateway deposit tx (Arc testnet): https://testnet.arcscan.app/tx/0x64b09654489ae4041eaa9d4633aa974fa087437fd3e5eed1cfe3756ac7d022c4

(**TODO:** after pushing, click each anchor link once; GitHub generates anchors from the heading text.)

## 8. Demo video script (about 2:40)

**Setup before recording (not on camera):**
- Terminal 1: `npm run seller`
- Terminal 2: restart the agent with a smaller demo budget so the cap arrives in 6 questions instead of 11:
  `AGENT_BUDGET_USDC=0.004 npm run agent`
  (Budget 0.004 USDC means auto-approve up to 0.002, so purchases 1–2 are automatic, 3+ need approval, and the cap refuses the 5th paid purchase. Each forecast costs 0.001.) Restarting also clears the in-memory ledger.
- Open http://localhost:3001 and check that spend is 0 / 0.004 and the ledger says "No payments yet."
- Open the two arcscan tabs in advance: the deposit tx and the batch settlement tx (links in section 7).
- **TODO:** if LLM mode works by then, record with it and check that the trace shows the model's reasoning. Otherwise record in scripted mode and don't call it an LLM on camera.
- **TODO:** do one full rehearsal. Live market odds change, and the BTC and ETH dates in the chips must still be open markets.

| Time | Show / click | Say |
|---|---|---|
| 0:00–0:15 | Dashboard, full screen | "AI agents can't see the future, but prediction markets price it. Oracle402 sells Gemini's prediction-market odds to agents for a tenth of a cent each, paid in USDC on Arc, with guardrails a human controls." |
| 0:15–0:25 | Point at the Budget card: 0 / 0.004 USDC, kill switch, empty ledger | "The agent has a 0.004 USDC budget. Past half of it, a human must approve each purchase. At the cap, it is refused." |
| 0:25–0:55 | Click the **Fed December?** chip. Scroll the Decision trace as it fills | "First it searches markets for free: here's the December Fed decision market. Then it reads the advertised price, a tenth of a cent, before paying. The policy allows it, and it pays over x402 through Circle Gateway on Arc testnet. Gasless, real testnet USDC." Point at the answer: "These are market-implied odds, not a guess." |
| 0:55–1:10 | Point at the new ledger row: network `eip155:5042002`, the Tx/ref value, "auto" | "Every payment lands in the ledger: Arc testnet, auto-approved. Note that this Tx/ref value is a Circle Gateway transfer ID, not an onchain hash. Gateway batches payments and settles them onchain, and I'll show that settlement at the end." |
| 1:10–1:20 | Click **BTC Nov 30?** | "Second question, BTC on November 30, still under the auto-approve line. It pays, and we get the strike prices nearest 50%." |
| 1:20–1:45 | Click **Crypto bill?** The **Human approval required** modal appears. Click **Approve** | "Now spend would cross the auto-approve line, so the agent stops and asks me. I'll approve this one." The payment completes and the row says "human". |
| 1:45–2:00 | Click **Fed December?** again. Modal appears. Click **Deny** | "Next one, I deny. No payment is made. The agent tells the user it was stopped instead of retrying." Point at the trace line "Human denied… Payment NOT made". |
| 2:00–2:15 | Click **BTC Nov 30?**, then **Approve**. Then click **Crypto bill?** | "Approve one more, and that's the full budget. The next request is refused by the hard cap. No approval prompt, no payment." Point at "DENIED: Budget exhausted". |
| 2:15–2:25 | Click **Reset spend counter**, then **KILL SWITCH**, then click **Fed December?** | "Even with budget available, the kill switch halts all spending." Point at "DENIED: Kill switch is engaged". |
| 2:25–2:40 | Switch to the arcscan tabs: deposit tx, then batch settlement tx | "Onchain: here's the one-time USDC deposit into Circle Gateway on Arc, and here's a Gateway batch settlement that includes our agent's payments to the seller. Many sub-cent payments, one onchain transaction. That's Oracle402." |

Check after recording: the video is 2–3 minutes and set to public or unlisted (YouTube) or "anyone with the link" (Drive), and plays in a logged-out browser.

## 9. Pre-submit checklist ("What to Submit")
- [ ] **Public GitHub repo, built during the hackathon:** pushed to https://github.com/moha2048/oracle402, set to public. Commit history starts Nov 19. `.env` is not in the repo (check on GitHub).
- [x] **README covers** architecture, decision loop, safety limits, Arc contract addresses and tx links (USDC, GatewayWallet, GatewayMinter, deposit tx, batch settlement tx).
- [ ] **README demo script section:** step 4 says "show the ledger with tx hashes", but the ledger shows Gateway transfer IDs. Fix the wording to match the video.
- [ ] **Working demo:** seller and agent run locally on live Gemini and real Arc testnet payments (verified Nov 19). **TODO:** if judges need a deployed URL, decide whether to deploy or explain local-only in the submission.
- [ ] **Demo video:** 2–3 min, accessible link pasted into Devpost.
- [ ] **Written answers:** section 5 pasted; LLM-mode TODO resolved.
- [ ] **Agentic Payments and AI:** agent pays autonomously within policy limits; decision loop and safety limits documented in the README.
- [ ] **Best use of Arc:** Arc contract addresses plus deposit and batch settlement tx links in the README and Devpost links.
- [ ] **Gemini Prediction Markets:** the README section explains which Gemini endpoints we use and how prices become probabilities. The demo shows live Gemini markets.
- [ ] **Selections:** track, Arc chain award (not Solana), Gemini bounty, prize opt-ins ticked.
- [ ] **Team:** all members added on Devpost; someone can attend the closing ceremony Sat Nov 21.
- [ ] **Submitted before Fri Nov 20, 12:00 PM CST** (aim for 10:30 AM).
