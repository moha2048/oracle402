# Oracle402: project context (read this first)

## Deadline and goal
UBC 2026 Hackathon (University Blockchain Conference). **Submission due Fri Nov 20, 12:00 PM CST** on https://ubc-hackathon-2026.devpost.com.
Winners announced Sat Nov 21 at the closing ceremony; must be present in person to win anything. Started Thu Nov 19 ~1:20 PM CST, so time is very tight: prefer the simplest thing that works.

## What we're building
Oracle402: a pay-per-query forecast oracle for AI agents. A seller API wraps Gemini's public Prediction Markets data and charges ~$0.001 USDC per forecast over x402 (Circle Gateway nanopayments on Arc testnet). A buyer agent (LLM tool loop) decides when to pay, under a policy engine (budget cap, per-call cap, host allowlist, human approval above a spend threshold, kill switch). A dashboard at :3001 shows budget, payment ledger, decision trace, approvals, kill switch.
- Main track: Agentic Payments and AI. Chain award: Best use of Arc (not Solana). Bounty: Gemini Prediction Markets.
- Required to submit: public GitHub repo (built during hackathon), working demo/deployed app, 2-3 min demo video (YouTube/Drive, accessible), README with architecture + decision loop + safety limits + Arc contract addresses, written answers (what/problem/how/unique/next).

## Layout
- `src/gemini.ts`: Gemini REST wrapper (searchEvents free, getEventForecast paid). MOCK_GEMINI=1 uses fixtures.
- `src/seller.ts`: Express. Free: /pricing, /markets?q=. Paid (x402): /forecast/:ticker. Pre-checks ticker BEFORE paywall so agents aren't charged for 404s. MOCK_PAY=1 skips paywall (dev only).
- `src/policy.ts`: spending guardrails. `src/agent.ts`: decision loop (Anthropic tool use; scripted fallback if no ANTHROPIC_API_KEY). `src/agent-server.ts`: dashboard API on :3001. `public/index.html`: dashboard. **Frontend work: read `FRONTEND.md` first** (API contract, rules, mock run). Only edit `public/`.
- `scripts/`: generate-wallets, deposit, balance. Commands: `npm run seller | agent | balance | deposit | typecheck`, plus `seller:mock` / `agent:mock`.

## Status (as of Thu Nov 19 ~2:05 PM CST)
VERIFIED on the user's Mac, all against REAL services (no MOCK_*):
- Wallets in .env; buyer funded; `npm run deposit 5` done (txs in README).
- Live Gemini search: 1003 active events; `search=` is a title substring match. `searchEvents` queries the full question + keywords (aliases like bitcoin->btc) in parallel, then ranks by title-word overlap. All 3 dashboard chips resolve to the right market first (FED261211, BTC2611302200, CRYPTOSTRUCT26).
- x402: unpaid `/forecast/:ticker` -> 402 + PAYMENT-REQUIRED (Arc eip155:5042002, 1000 micro-USDC, GatewayWallet verifyingContract). Unknown ticker -> 404 before the paywall.
- Real `GatewayClient.pay()` works (`scripts/paid-call.ts`): 200, `/api/revenue` row, Gateway balance 5 -> 4.999. `paid.transaction` is a Gateway transfer UUID, not an onchain hash; Gateway settles onchain via `submitBatch` on GatewayWallet roughly every 15 min.
- Scripted agent via dashboard API on real payments: ledger rows with network + payer; calls 1-5 auto, 6+ need human approval (deny = no payment), 11th refused by hard cap, kill switch blocks. Answers show at most 6 contracts (ladders: strikes nearest 50%; multi-outcome: most likely first).
- README has Arc USDC / GatewayWallet / GatewayMinter addresses from Circle docs. Git initialised, first commit made, .env ignored.
NOT YET DONE: (1) LLM mode (needs ANTHROPIC_API_KEY credits; the tool result is now slimmed to label+probability); (2) push to a public GitHub repo; (4) demo video; (5) Devpost submission.
Note: agent state (ledger, spend) is in memory, so restart `npm run agent` or POST /api/reset-spend before recording the demo. Gateway balance ~4.987 USDC.

## Gotchas
- Gemini and Circle are unreachable from Claude's cloud sandbox; only this machine reaches them. Test real flows here.
- Seller runs without watch mode: restart `npm run seller` after editing src/.
- `.env` holds TESTNET private keys; never commit it (it's gitignored). Don't print keys.
- Demo chips use Fed December / BTC Nov 30 / crypto bill; these persist through judging. Intraday and Nov 19/20 markets expire.
- Prices from Gemini are strings in [0,1]; probability = midpoint of bestBid/bestAsk, else lastTradePrice.

## Remaining TODO (priority order)
1-2. DONE. 3. Add ANTHROPIC_API_KEY, test LLM loop. 4. Push public GitHub repo (git init done). 5. DONE (README addresses + batch tx). 6. Record 2-3 min demo (ask, pay, approval, hit cap, kill switch, ledger). 7. Devpost: select track Agentic, chain award Arc, bounty Gemini, opt in to prizes, written answers, links; submit by ~10:30 AM Fri.
