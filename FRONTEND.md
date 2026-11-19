# Frontend guide (for whoever is working on `public/`)

You can redo the whole dashboard UI without touching the payment, policy or agent code. This file is everything you need. Read it before you start. If you use Claude Code, tell it to read `CLAUDE.md` and this file first.

## Rules (so nothing breaks)

1. **Only edit files in `public/`.** Do not edit `src/`, `scripts/`, `package.json` or `.env`. The backend is verified against real payments and the demo depends on it. If you think the API needs a new field, ask Salah instead of changing it.
2. **Never commit `.env`.** It holds testnet private keys and is gitignored. Never paste keys into code, chat or screenshots.
3. **Do not remove or rename any `/api/*` call** (list below). You may change everything about how the data looks.
4. Static files only: `public/` is served by Express (`express.static`). The simplest route is to keep one `public/index.html` with inline CSS/JS. If you want a framework, it must build to static files into `public/` and you must commit the built output (there is no build step on the demo machine). Do not add a bundler to the repo's root `package.json`.
5. Work on a branch (`git checkout -b frontend`) and open a PR, or hand Salah the file. Do not push to `main` without telling him. The deadline is **Fri Nov 20, 12:00 PM CST**; the frontend should be merged by about 8 PM tonight so Salah can record the demo video on it.
6. Do not turn on `MOCK_PAY` for anything shown in the demo. Mock mode is for development only.

## Run it locally (no money, no keys needed)

```
git clone https://github.com/moha2048/oracle402 && cd oracle402
npm install
npm run seller:mock    # terminal 1: seller on :3000 with fake Gemini data and no paywall
npm run agent:mock     # terminal 2: dashboard + agent API on http://localhost:3001
```

- The mock dashboard shows a "MOCK" tag on payments (`mock: true`). Real mode needs `.env` and the real Circle/Gemini endpoints, so only Salah's Mac can run it. Ask him for a real run to check your UI against it.
- Without `ANTHROPIC_API_KEY` the agent uses a scripted loop (`mode.llm: false`). With a key it becomes an LLM loop (`mode.llm: true`). Both produce the same data shapes.
- The server keeps all state in memory. Restart `npm run agent:mock` to reset, or `POST /api/reset-spend` to zero the spend counter.
- Try the demo flow by asking: "What are the odds on the Fed decision in December?", "Where is the market expecting BTC on November 30?", "Will crypto market structure legislation become law?". Policy defaults: budget 0.01 USDC, price 0.001 per call, human approval needed from the 6th call (spend above 0.005 in the real run), hard stop at the cap, kill switch anytime. Restart with `AGENT_BUDGET_USDC=0.004 npm run agent:mock` to hit the cap fast.

## What the app does (so the UI tells the right story)

Oracle402 sells prediction-market forecasts to AI agents for $0.001 USDC per call over x402 (Circle Gateway nanopayments on Arc testnet). A buyer agent decides when a forecast is worth paying for. Every payment passes a policy engine: budget cap, per-call cap, host allowlist, human approval after half the budget, kill switch. **The dashboard is the human's control panel for that agent.** The demo video is recorded on this page, so the things judges must see are:

1. Budget spent vs cap, filling as the agent buys forecasts.
2. The agent's decision trace (search, policy check, pay, answer).
3. The payment ledger with Gateway transfer IDs (real nanopayments).
4. The approval prompt (a human says yes or no to a payment).
5. The hard cap refusing a payment, and the kill switch stopping everything.

Messaging to keep: "Agent spending, under control." Pay-per-query odds, settled in USDC on Arc. Do not claim LLM mode unless `mode.llm` is true.

## API contract (all same-origin, JSON)

Poll `GET /api/state` about once a second. There is no websocket.

### `GET /api/state` returns

```ts
{
  budgetUsdc: number,          // hard cap, e.g. 0.01
  spentUsdc: number,
  remainingUsdc: number,
  approveAfterUsdc: number,    // spend above this needs human approval, e.g. 0.005
  maxPerCallUsdc: number,      // per-call cap, e.g. 0.005
  allowedHosts: string[],
  killed: boolean,             // kill switch engaged
  running: boolean,            // agent is working on a question
  pending: null | { id: string, ticker: string, priceUsdc: number, reason: string },  // approval waiting on the human
  ledger: LedgerRow[],         // PAID rows only, oldest first
  trace: TraceRow[],           // last 120 entries, oldest first
  lastAnswer: string,          // final answer text for the last question
  gatewayBalanceUsdc: string | null,   // string like "4.982"; null if unknown
  mode: { llm: boolean, mockPay: boolean, seller: string }
}

LedgerRow = { at: string /*ISO*/, question: string, ticker: string, amountUsdc: number,
              payer?: string, network?: string /* "eip155:5042002" */, transaction?: string /* Gateway transfer UUID, NOT an onchain hash */,
              mock: boolean, approvedByHuman: boolean }

TraceRow  = { t: string /*ISO*/, kind: "user"|"think"|"tool"|"policy"|"payment"|"result"|"answer"|"error", msg: string }
```

### Actions (POST, JSON body, all return quickly)

| Call | Body | Effect |
|---|---|---|
| `POST /api/ask` | `{ "question": string }` | Starts the agent. 202 on success, 409 if `running`, 400 if empty. Result shows up in `state`. |
| `POST /api/kill` | none | Kill switch on. Blocks all spending, auto-denies any pending approval. |
| `POST /api/resume` | none | Kill switch off. |
| `POST /api/budget` | `{ "budgetUsdc": number }` | Sets the hard cap. |
| `POST /api/reset-spend` | none | Sets spent back to 0. |
| `POST /api/approve` | `{ "approve": boolean }` | Answers the pending approval. 404 if none pending. |

### Things that are not obvious

- **The ledger holds paid rows only.** Refused payments (blocked by policy, denied by a human, failed) are only in the trace, as `kind:"policy"` with `msg` starting `DENIED:` (policy block) or `Human denied` (human said no or the 90 s timeout hit), and `kind:"error"` starting `payment failed`. An approval request is `kind:"policy"` starting `APPROVAL NEEDED:`. The current `public/index.html` already reconstructs refused rows from the trace in a `refusals()` function: reuse that logic. Do not ask for a backend change.
- **Approval times out after 90 seconds** and counts as denied.
- `ledger[].transaction` is a Circle Gateway transfer ID. The onchain proof is a later batch settlement tx (see the README's Arc section). Never label it "tx hash".
- **Show amounts with at least 3 decimals** (they are sub-cent, e.g. 0.001).
- `pending` non-null means a human must answer. Show a modal and block nothing else on the server (the agent just waits).
- While `running`, `POST /api/ask` returns 409. Disable the Ask button.
- `gatewayBalanceUsdc` refreshes about every 15 s and can be `null`. Render "n/a".
- Fonts or assets from the internet will fail offline. The demo machine has internet, but keep a system-font fallback.

## Current implementation (reference)

`public/index.html` is a single file, about 380 lines: Morpho-style dark theme (near-black `#0b0b0c`, faint grid, accent `#3b6bff`, Inter + JetBrains Mono), hero spend meter, 4-stat policy strip, ask box with 3 chips, kill switch / resume / raise budget / reset spend, ledger and decision-trace panels, approval modal. Status colours: green = paid/ok, amber = awaiting approval, red = denied/blocked/kill switch. `DASHBOARD_REDESIGN.md` is the design brief it was built from. A screenshot is in `docs/dashboard.png`. Use these as a starting point or throw them away; only the API contract above is fixed.

## Done-checklist before you hand it over

- [ ] Ask works, chips work, Enter key works.
- [ ] Spent/budget/remaining/approval/max-per-call/Gateway balance update live.
- [ ] Ledger shows paid rows (and refusals from the trace); trace shows all `kind`s.
- [ ] Approval modal appears for `pending`, Approve and Deny both work.
- [ ] Kill switch hides/disables spending and shows a Resume control; the page clearly shows the killed state.
- [ ] Looks good at 1440x900 (the demo recording size) without scrolling for the hero, the ask box and the kill switch.
- [ ] No console errors with `npm run agent:mock`; `npm run typecheck` still passes (you did not touch `src/`).
- [ ] `git status` shows changes only in `public/` (and `docs/` if you updated the screenshot).
