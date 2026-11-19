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
- `src/policy.ts`: spending guardrails. `src/agent.ts`: decision loop (Anthropic tool use; scripted fallback if no ANTHROPIC_API_KEY). `src/agent-server.ts`: dashboard API on :3001. `public/index.html`: dashboard.
- `scripts/`: generate-wallets, deposit, balance. Commands: `npm run seller | agent | balance | deposit | typecheck`, plus `seller:mock` / `agent:mock`.

## Status (as of Thu Nov 19 ~1:45 PM)
VERIFIED on the user's Mac: wallets generated into .env; buyer funded from Circle faucet; `npm run deposit 5` succeeded (real Arc testnet txs, in README); `npm run balance` shows Gateway available = 5 USDC; seller starts with live Gemini (mock gemini: false).
VERIFIED in sandbox only (mocked Gemini + mocked pay): policy flow (auto-approve, human approval/deny, hard cap, kill switch), dashboard API.
VERIFIED live Gemini: 1003 active events (Sports, Crypto, Commodities, Weather); `search=` is a title substring match; titles use tickers ("BTC price on November 30", "Fed decision in December?"). Added alias map + merged keyword search; demo chips now use Fed December / BTC Nov 30 / crypto bill (persist through judging; Nov 19 markets expire today).
NOT YET VERIFIED: (1) [partly resolved above] live Gemini search: `/markets?q=bitcoin` returned `{"markets":[]}`; real Gemini shape is `{data:[{id,title,ticker,category,status,contracts:[{label,ticker,instrumentSymbol,expiryDate,prices:{bestBid,bestAsk,lastTradePrice,buy,sell}}]}]}`. Active markets seem sports-heavy; need to find what exists (categories, whether `search=` works) and build demo questions around REAL live markets. (2) x402 paywall returns 402 unpaid, and `GatewayClient.pay()` completes a real payment; (3) LLM mode; (4) dashboard end-to-end against real payments.

## Gotchas
- Gemini and Circle are unreachable from Claude's cloud sandbox; only this machine reaches them. Test real flows here.
- Seller runs without watch mode: restart `npm run seller` after editing src/.
- `.env` holds TESTNET private keys; never commit it (it's gitignored). Don't print keys.
- Dashboard question chips and mock fixtures reference Fed/BTC/ETH; replace with markets that actually exist on live Gemini.
- Prices from Gemini are strings in [0,1]; probability = midpoint of bestBid/bestAsk, else lastTradePrice.

## Remaining TODO (priority order)
1. Fix live Gemini search + pick real demo markets. 2. Confirm 402 and one real paid call end to end (ledger shows tx). 3. Add ANTHROPIC_API_KEY, test LLM loop. 4. git init, public GitHub repo. 5. README: fill Arc USDC + Gateway contract addresses and a batch settlement tx. 6. Record 2-3 min demo (ask, pay, approval, hit cap, kill switch, ledger). 7. Devpost: select track Agentic, chain award Arc, bounty Gemini, opt in to prizes, written answers, links; submit by ~10:30 AM Fri.
