// Agent control server + dashboard (http://localhost:3001). Human-in-the-loop controls live here.
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runAgent, policy, state, gatewayBalance, SELLER_URL, MOCK_PAY, LLM_ENABLED } from "./agent.js";
import { microToUsdc, usdcToMicro } from "./policy.js";

const PORT = Number(process.env.AGENT_PORT ?? 3001);
const app = express();
app.use(express.json());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public")));

let cachedBalance: string | null = null;
const refreshBalance = async () => { cachedBalance = await gatewayBalance(); };
refreshBalance();
setInterval(refreshBalance, 15_000);

app.get("/api/state", (_req, res) => {
  const p = state.pending;
  res.json({
    budgetUsdc: microToUsdc(policy.budgetMicro),
    spentUsdc: microToUsdc(policy.spentMicro),
    remainingUsdc: microToUsdc(policy.remainingMicro),
    approveAfterUsdc: microToUsdc(policy.approveAfterMicro),
    maxPerCallUsdc: microToUsdc(policy.maxPerCallMicro),
    allowedHosts: [...policy.allowedHosts],
    killed: policy.killed,
    running: state.running,
    pending: p ? { id: p.id, ticker: p.ticker, priceUsdc: p.priceUsdc, reason: p.reason } : null,
    ledger: state.ledger,
    trace: state.trace.slice(-120),
    lastAnswer: state.lastAnswer,
    gatewayBalanceUsdc: cachedBalance,
    mode: { llm: LLM_ENABLED, mockPay: MOCK_PAY, seller: SELLER_URL },
  });
});

app.post("/api/ask", (req, res) => {
  const q = String(req.body?.question ?? "").trim();
  if (!q) return res.status(400).json({ error: "empty question" });
  if (state.running) return res.status(409).json({ error: "agent busy" });
  runAgent(q).catch(() => {}); // outcome is visible in state.trace
  res.status(202).json({ ok: true });
});

app.post("/api/kill", (_req, res) => { policy.killed = true; state.pending?.resolve(false); res.json({ killed: true }); });
app.post("/api/resume", (_req, res) => { policy.killed = false; res.json({ killed: false }); });
app.post("/api/budget", (req, res) => {
  const usdc = Number(req.body?.budgetUsdc);
  if (!Number.isFinite(usdc) || usdc < 0) return res.status(400).json({ error: "bad budget" });
  policy.budgetMicro = usdcToMicro(usdc);
  res.json({ budgetUsdc: usdc });
});
app.post("/api/reset-spend", (_req, res) => { policy.spentMicro = 0; res.json({ ok: true }); });
app.post("/api/approve", (req, res) => {
  if (!state.pending) return res.status(404).json({ error: "nothing pending" });
  state.pending.resolve(Boolean(req.body?.approve));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Oracle402 agent dashboard on http://localhost:${PORT}  (llm: ${LLM_ENABLED}, mock pay: ${MOCK_PAY}, seller: ${SELLER_URL})`);
});
