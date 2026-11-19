# Oracle402: a pay-per-query forecast oracle for AI agents

**Track:** Agentic Payments and AI · **Chain award:** Best use of Arc · **Bounty:** Gemini Prediction Markets

AI agents can't know the future: their weights are frozen. Prediction markets price the future continuously.
Oracle402 turns Gemini's live prediction-market odds into a metered API that any agent can buy from for a
fraction of a cent in USDC, while a policy engine keeps the agent inside a budget it cannot exceed.

## What it does
1. An agent is asked a forward-looking question ("Will the Fed cut in December?").
2. It searches markets for **free**, then decides whether a paid forecast is worth the money.
3. It checks the advertised price, passes the spending policy, and pays over **x402** with a gasless USDC nanopayment on **Arc testnet** (Circle Gateway).
4. It receives market-implied probabilities and answers with caveats.
5. A human watches a live dashboard: budget, per-payment ledger, kill switch, approval prompts.

## Architecture
```
 Agent (LLM loop)                    Seller API (Express)                 Gemini Prediction Markets
 ┌────────────────────┐  free   ┌──────────────────────────┐  public REST ┌──────────────────┐
 │ search_markets  ───┼────────▶│ GET /markets?q=          │─────────────▶│ /v1/prediction-  │
 │ buy_forecast       │  402    │ GET /forecast/:ticker    │              │  markets/events  │
 │   ▲ Policy.check() │◀────────│   x402 paywall ($0.001)  │              └──────────────────┘
 │   │ GatewayClient  │  pay    └───────────┬──────────────┘
 │   └─ signs EIP-3009├────────────────────▶│ settle via Circle Gateway
 └─────────┬──────────┘                     ▼
           │ dashboard :3001        Arc testnet: USDC (native gas token), batched onchain settlement
```

## The agent's decision loop (`src/agent.ts`)
1. LLM receives the question plus a system prompt with budget rules.
2. `search_markets(query)`: free discovery, returns tickers only (no probabilities).
3. LLM chooses at most one event; `buy_forecast(ticker)` reads the advertised price from `/pricing`.
4. **`Policy.check()`** returns allow, deny, or needs-approval (see below).
5. On allow: sign and pay over x402, then record the payment in the ledger.
6. On deny: the reason goes back to the LLM, which must NOT retry and answers with caveats.
7. Every step is written to a visible decision trace (dashboard).

## Safety limits (`src/policy.ts`)
| Control | Default | Behavior |
|---|---|---|
| Hard budget cap | 0.01 USDC | Purchases beyond it are refused |
| Per-call cap | 0.005 USDC | A single call above it is refused |
| Host allowlist | seller host only | Agent can only pay approved hosts |
| Human approval | after 50% of budget | Each further purchase waits for a human (90s timeout = deny) |
| Kill switch | off | Instantly halts all spending, denies any pending approval |
| Pre-payment validation | always | Unknown tickers return 404 *before* the paywall, so agents are never charged for nothing |

## How we use Arc
- Payments settle in USDC on **Arc testnet** (USDC is the native gas token, so cost is predictable).
- Gasless x402 nanopayments via **Circle Gateway** (`@circle-fin/x402-batching`): the buyer signs EIP-3009 authorizations offchain; Gateway batches them into a single onchain settlement.
- One-time onchain step: the buyer deposits USDC into its Gateway balance (`npm run deposit`).
- Network: Arc Testnet, chain ID `5042002` (x402 network `eip155:5042002`), Circle Gateway domain `26`.
- Contracts/addresses used (from [Circle USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses) and [Gateway contract addresses](https://developers.circle.com/gateway/references/contract-addresses); both also appear in our live `PAYMENT-REQUIRED` header):
  - Arc testnet USDC: [`0x3600000000000000000000000000000000000000`](https://testnet.arcscan.app/address/0x3600000000000000000000000000000000000000)
  - Circle Gateway Wallet contract (Arc testnet, x402 `verifyingContract`): [`0x0077777d7EBA4688BDeF3E311b846F25870A19B9`](https://testnet.arcscan.app/address/0x0077777d7EBA4688BDeF3E311b846F25870A19B9)
  - Circle Gateway Minter (Arc testnet): `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B`
  - Buyer wallet: `0x7933C00e2255D94717b7F8266eCD0066D02f310b`  ·  Seller wallet: `0xda3Bd18EfbB8A543b6574279ac026A8EAd96d849`
  - USDC approval tx: [`0x1a1b6e90c29926ba5c182c510d1098a780fe862e589b8fecd5dfc605363a7af9`](https://testnet.arcscan.app/tx/0x1a1b6e90c29926ba5c182c510d1098a780fe862e589b8fecd5dfc605363a7af9)
  - Gateway deposit tx (5 USDC): [`0x64b09654489ae4041eaa9d4633aa974fa087437fd3e5eed1cfe3756ac7d022c4`](https://testnet.arcscan.app/tx/0x64b09654489ae4041eaa9d4633aa974fa087437fd3e5eed1cfe3756ac7d022c4)
  - Example batch settlement tx (Gateway `submitBatch` settling our x402 payments, buyer -> seller): [`0x38cadf8537763a5d3cbdb63539ba6c0a29408962178d892b989510bdf78bbfce`](https://testnet.arcscan.app/tx/0x38cadf8537763a5d3cbdb63539ba6c0a29408962178d892b989510bdf78bbfce)

## How we use Gemini Prediction Markets
Seller calls the public REST API (`/v1/prediction-markets/events`, `/events/{ticker}`), reads each contract's
`prices.bestBid / bestAsk / lastTradePrice` and returns the **midpoint (or last trade) as the market-implied probability**.

## Run it
```bash
rm -rf node_modules && npm install
cp .env.example .env
npm run wallets            # paste output into .env
# fund BUYER_ADDRESS with testnet USDC: https://faucet.circle.com (choose Arc Testnet)
npm run deposit            # one-time: USDC -> Gateway balance
npm run seller             # terminal 1  (port 3000)
npm run agent              # terminal 2  (dashboard on http://localhost:3001)
```
Offline dry run (no wallets, no network): `npm run seller:mock` and `npm run agent:mock`.

## Demo script (2-3 min)
1. Ask "Will the Fed cut rates in December?": watch the free search, the policy check, the payment, the answer.
2. Ask more until spend crosses the auto-approve line: the approval prompt appears; approve one, deny one.
3. Run to the hard cap: the agent is refused and explains why.
4. Hit the kill switch; show the ledger. Its Tx/ref column holds Circle Gateway transfer IDs, not onchain hashes: the onchain proof is the Gateway batch settlement tx linked under "How we use Arc".

## What we'd build next
Dynamic pricing by market liquidity, multi-market aggregation, a discoverable agent marketplace listing, and per-agent budgets.

## Built with / credits
Circle Gateway Nanopayments + x402 (`@circle-fin/x402-batching`), Arc testnet, Gemini Prediction Markets API,
Anthropic API (agent LLM), Express, TypeScript. Built during the UBC 2026 Hackathon.
