// Oracle402 BUYER AGENT.
// Decision loop: [LLM decides] -> search_markets (free) -> buy_forecast (paid, gated by Policy) -> answer.
// Every step is written to `state.trace`, which the dashboard renders live. This IS the documented decision loop.
import Anthropic from "@anthropic-ai/sdk";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { Policy, priceToMicro, microToUsdc, usdcToMicro } from "./policy.js";

export const SELLER_URL = process.env.SELLER_URL ?? "http://localhost:3000";
export const MOCK_PAY = process.env.MOCK_PAY === "1"; // dev fallback ONLY: skips Circle. Ledger rows are flagged mock.
const MODEL = process.env.AGENT_MODEL ?? "claude-sonnet-5-5";
export const LLM_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);

const budget = usdcToMicro(Number(process.env.AGENT_BUDGET_USDC ?? "0.01"));
export const policy = new Policy(
  budget,
  Math.round(budget * Number(process.env.APPROVE_AFTER_FRACTION ?? "0.5")),
  usdcToMicro(Number(process.env.MAX_PER_CALL_USDC ?? "0.005")),
  new Set([new URL(SELLER_URL).host]),
);

export type LedgerRow = {
  at: string; question: string; ticker: string; amountUsdc: number; payer?: string;
  network?: string; transaction?: string; mock: boolean; approvedByHuman: boolean;
};
export type TraceRow = { t: string; kind: "user" | "think" | "tool" | "policy" | "payment" | "result" | "answer" | "error"; msg: string };
export type Pending = { id: string; ticker: string; priceUsdc: number; reason: string; resolve: (ok: boolean) => void };

export const state = {
  ledger: [] as LedgerRow[],
  trace: [] as TraceRow[],
  pending: null as Pending | null,
  running: false,
  lastAnswer: "" as string,
};

const log = (kind: TraceRow["kind"], msg: string) => {
  state.trace.push({ t: new Date().toISOString(), kind, msg });
  if (state.trace.length > 400) state.trace.shift();
  console.log(`[${kind}] ${msg}`);
};

const gateway = MOCK_PAY
  ? null
  : new GatewayClient({ chain: "arcTestnet", privateKey: process.env.BUYER_PRIVATE_KEY as `0x${string}` });

export async function gatewayBalance(): Promise<string | null> {
  if (!gateway) return null;
  try {
    const b: any = await gateway.getBalances();
    const v = b?.gateway?.available;
    return v === undefined ? null : (Number(v) / 1_000_000).toFixed(6);
  } catch {
    return null;
  }
}

async function askHuman(ticker: string, priceMicro: number, reason: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => { state.pending = null; resolve(false); }, 90_000);
    state.pending = {
      id: Math.random().toString(36).slice(2), ticker, priceUsdc: microToUsdc(priceMicro), reason,
      resolve: (ok) => { clearTimeout(timer); state.pending = null; resolve(ok); },
    };
  });
}

// ---------------- tools ----------------
async function toolSearch(query: string) {
  log("tool", `search_markets("${query}") [free]`);
  const r = await fetch(`${SELLER_URL}/markets?q=${encodeURIComponent(query)}`);
  const j: any = await r.json();
  log("result", `${j.markets?.length ?? 0} market(s): ${(j.markets ?? []).map((m: any) => m.ticker).join(", ") || "none"}`);
  return j;
}

async function toolBuy(question: string, ticker: string): Promise<{ ok: boolean; data: unknown }> {
  const url = `${SELLER_URL}/forecast/${encodeURIComponent(ticker)}`;
  log("tool", `buy_forecast("${ticker}") [paid]`);

  const pricing: any = await (await fetch(`${SELLER_URL}/pricing`)).json(); // free, so the agent knows the price BEFORE paying
  const priceMicro = priceToMicro(pricing.forecast);

  const d = policy.check(url, priceMicro);
  let approved = false;
  if (d.allow === false) {
    log("policy", `DENIED: ${d.reason}`);
    return { ok: false, data: { error: "payment_denied_by_policy", reason: d.reason } };
  }
  if (d.allow === "approval") {
    log("policy", `APPROVAL NEEDED: ${d.reason}`);
    approved = await askHuman(ticker, priceMicro, d.reason);
    if (!approved) {
      log("policy", "Human denied (or timed out). Payment NOT made.");
      return { ok: false, data: { error: "payment_denied_by_human" } };
    }
    log("policy", "Human approved.");
  } else {
    log("policy", `allowed (${microToUsdc(priceMicro)} USDC; ${microToUsdc(policy.remainingMicro - priceMicro)} USDC would remain)`);
  }

  try {
    let body: any;
    if (MOCK_PAY) {
      body = await (await fetch(url)).json(); // seller runs with MOCK_PAY=1 (no paywall)
    } else {
      const { data, status } = await gateway!.pay(url);
      if (status >= 400) throw new Error(`seller returned ${status}`);
      body = data;
    }
    policy.record(priceMicro);
    const paid = body?.paid ?? {};
    state.ledger.push({
      at: new Date().toISOString(), question, ticker, amountUsdc: microToUsdc(priceMicro),
      payer: paid.payer, network: paid.network, transaction: paid.transaction, mock: MOCK_PAY, approvedByHuman: approved,
    });
    log("payment", `paid ${microToUsdc(priceMicro)} USDC${paid.transaction ? ` tx ${paid.transaction}` : ""}${MOCK_PAY ? " (MOCK)" : ""}; spent ${microToUsdc(policy.spentMicro)} / ${microToUsdc(policy.budgetMicro)} USDC`);
    return { ok: true, data: body };
  } catch (e: any) {
    log("error", `payment failed: ${e.message}`);
    return { ok: false, data: { error: "payment_failed", detail: e.message } };
  }
}

// ---------------- decision loop ----------------
const SYSTEM = `You are a research agent with a small, metered USDC budget. You can see the future only through prediction markets.
Rules:
- Call search_markets (free) first. Market titles use ticker symbols and short names (e.g. \"BTC price on November 30\", \"ETH price\", \"Fed decision in December?\"), so search with short keywords like \"BTC\" or \"Fed\". If a search returns nothing, retry ONCE with a different short keyword.
- Call buy_forecast (costs real USDC) ONLY for the single most relevant event, and only if its probability would change your answer.
- If a purchase is denied (budget, allowlist, kill switch, human refusal), do NOT retry. Explain that you were stopped and answer with clear caveats.
- Report probabilities as market-implied odds, never as certainties. This is not financial advice.
- Keep the final answer under 120 words.`;

const TOOLS: Anthropic.Tool[] = [
  { name: "search_markets", description: "FREE. Search prediction markets by keywords. Returns event tickers, titles and contract labels, with no probabilities.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "buy_forecast", description: "PAID (USDC, per call). Buy current market-implied probabilities for one event ticker returned by search_markets.",
    input_schema: { type: "object", properties: { ticker: { type: "string" } }, required: ["ticker"] } },
];

export async function runAgent(question: string): Promise<string> {
  if (state.running) throw new Error("agent busy");
  state.running = true;
  state.lastAnswer = "";
  log("user", question);
  try {
    const answer = LLM_ENABLED ? await llmLoop(question) : await scriptedLoop(question);
    state.lastAnswer = answer;
    log("answer", answer);
    return answer;
  } catch (e: any) {
    log("error", e.message);
    throw e;
  } finally {
    state.running = false;
  }
}

async function llmLoop(question: string): Promise<string> {
  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: question }];
  for (let step = 0; step < 6; step++) {
    const resp = await client.messages.create({ model: MODEL, max_tokens: 800, system: SYSTEM, tools: TOOLS, messages });
    for (const b of resp.content) if (b.type === "text" && b.text.trim()) log("think", b.text.trim());
    if (resp.stop_reason !== "tool_use") {
      return resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
    }
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const b of resp.content) {
      if (b.type !== "tool_use") continue;
      const input = b.input as any;
      if (b.name === "search_markets") {
        results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(await toolSearch(String(input.query))) });
      } else if (b.name === "buy_forecast") {
        const r = await toolBuy(question, String(input.ticker));
        const d: any = r.data;
        const slim = r.ok
          ? { title: d.title, expiry: d.expiry, asOf: d.asOf, contracts: (d.contracts ?? []).map((c: any) => ({ label: c.label, probability: c.probability })) }
          : d;
        results.push({ type: "tool_result", tool_use_id: b.id, is_error: !r.ok, content: JSON.stringify(slim) });
      } else {
        results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: "unknown tool" });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return "Stopped: step limit reached.";
}

// No ANTHROPIC_API_KEY: deterministic stand-in so the payment + policy flow can still be demoed/tested.
async function scriptedLoop(question: string): Promise<string> {
  log("think", "(scripted mode: no ANTHROPIC_API_KEY) searching for a relevant market");
  const { markets } = (await toolSearch(question)) as any;
  if (!markets?.length) return "No relevant prediction market found, so I did not spend anything.";
  const r = await toolBuy(question, markets[0].ticker);
  if (!r.ok) return `I was stopped before buying data: ${JSON.stringify(r.data)}. I can only give an uncalibrated guess.`;
  const f: any = r.data;
  const all = f.contracts ?? [];
  const { shown } = topContracts(all);
  const unpriced = all.filter((c: any) => c.probability === null).length;
  const morePriced = all.length - shown.length - unpriced;
  const extra = [morePriced ? `+${morePriced} more` : "", unpriced ? `${unpriced} unpriced` : ""].filter(Boolean).join(", ");
  const lines = shown.map((c) => `${c.label}: ${c.probability === null ? "n/a" : Math.round(c.probability * 100) + "%"}`);
  return `Market-implied odds for "${f.title}": ${lines.join("; ")}${extra ? ` (${extra})` : ""}. (Not financial advice.)`;
}

/** Keep answers readable: strike ladders (e.g. BTC "$X or above") can have 20+ contracts.
 *  Keeps at most `max`: the most informative ones (closest to 50%, priced), shown in the seller's original order. */
export function topContracts(contracts: any[], max = 6): { shown: any[]; hidden: number } {
  if (contracts.length <= max) return { shown: contracts, hidden: 0 };
  const idx = contracts.map((c, i) => ({ c, i }));
  const ladder = contracts.every((c) => /or (above|below)|above|below/i.test(String(c.label)));
  const keep = idx
    .filter((x) => x.c.probability !== null)
    // ladder: strikes nearest 50% show where the market centres; multi-outcome: most likely outcomes first
    .sort((a, b) => ladder ? Math.abs(a.c.probability - 0.5) - Math.abs(b.c.probability - 0.5) : b.c.probability - a.c.probability)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.c);
  return { shown: keep, hidden: contracts.length - keep.length };
}
