// Oracle402 SELLER: a pay-per-query forecast API.
//   GET /pricing            free   advertised prices (agents read this BEFORE paying)
//   GET /markets?q=...      free   discovery: which prediction markets exist (no probabilities)
//   GET /forecast/:ticker   PAID   market-implied probabilities, x402 + Circle Gateway nanopayment on Arc testnet
import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { searchEvents, getEventForecast, type EventForecast } from "./gemini.js";

const PORT = Number(process.env.SELLER_PORT ?? 3000);
export const FORECAST_PRICE = process.env.FORECAST_PRICE ?? "$0.001";
const MOCK_PAY = process.env.MOCK_PAY === "1"; // DEV ONLY: skips the paywall so the agent/policy/dashboard can be tested offline
const SELLER_ADDRESS = process.env.SELLER_ADDRESS ?? (MOCK_PAY ? "0x0000000000000000000000000000000000000001" : undefined);
if (!SELLER_ADDRESS) {
  console.error("Missing SELLER_ADDRESS. Run `npm run wallets` and copy the values into .env");
  process.exit(1);
}

const gateway = createGatewayMiddleware({
  sellerAddress: SELLER_ADDRESS,
  facilitatorUrl: process.env.GATEWAY_URL ?? "https://gateway-api-testnet.circle.com",
  networks: ["eip155:5042002"], // Arc Testnet only
});

type PaidRequest = express.Request & {
  payment?: { verified: boolean; payer: string; amount: string; network: string; transaction?: string };
};

const revenue: { at: string; ticker: string; payer: string; amountMicroUsdc: string; network: string; transaction?: string }[] = [];

const app = express();
app.use((_, res, next) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-expose-headers", "PAYMENT-REQUIRED, PAYMENT-RESPONSE");
  next();
});

app.get("/pricing", (_req, res) => {
  res.json({ network: "arc-testnet", currency: "USDC", forecast: FORECAST_PRICE, unit: "per event forecast" });
});

app.get("/markets", async (req, res) => {
  try {
    res.json({ markets: await searchEvents(String(req.query.q ?? "")) });
  } catch (e: any) {
    res.status(502).json({ error: "upstream_error", detail: e.message });
  }
});

// Validate BEFORE the paywall so an agent is never charged for a ticker that doesn't exist.
async function preflight(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const forecast = await getEventForecast(String(req.params.ticker));
    if (!forecast) return res.status(404).json({ error: "unknown_ticker", ticker: req.params.ticker });
    res.locals.forecast = forecast;
    next();
  } catch (e: any) {
    res.status(502).json({ error: "upstream_error", detail: e.message });
  }
}

const paywall: express.RequestHandler = MOCK_PAY
  ? (req, _res, next) => { (req as PaidRequest).payment = { verified: true, payer: "0xMOCK", amount: "1000", network: "mock" }; next(); }
  : gateway.require(FORECAST_PRICE);

app.get("/forecast/:ticker", preflight, paywall, (req: PaidRequest, res) => {
  const forecast = res.locals.forecast as EventForecast;
  const p = req.payment!;
  revenue.push({
    at: new Date().toISOString(),
    ticker: forecast.event,
    payer: p.payer,
    amountMicroUsdc: p.amount,
    network: p.network,
    transaction: p.transaction,
  });
  res.json({ ...forecast, paid: { payer: p.payer, amountMicroUsdc: p.amount, network: p.network, transaction: p.transaction } });
});

app.get("/api/revenue", (_req, res) => res.json({ count: revenue.length, revenue }));

app.listen(PORT, () => {
  console.log(`Oracle402 seller on http://localhost:${PORT}  (price ${FORECAST_PRICE}, mock gemini: ${process.env.MOCK_GEMINI === "1"})`);
});
