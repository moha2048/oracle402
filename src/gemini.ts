// Thin wrapper around Gemini's PUBLIC prediction-markets REST API (no API key needed for market data).
// Docs: https://developer.gemini.com/prediction-markets/market-data
// Prices come back as strings in [0,1] dollars, so a contract price IS the market-implied probability.

const BASE = process.env.GEMINI_BASE_URL ?? "https://api.gemini.com";
const USE_MOCK = process.env.MOCK_GEMINI === "1";

export type ContractQuote = {
  ticker: string;
  label: string;
  instrumentSymbol?: string;
  probability: number | null; // 0..1, null if the book has no price yet
  bestBid: number | null;
  bestAsk: number | null;
  lastTrade: number | null;
  basis: "midpoint" | "last_trade" | "none";
};

export type EventSummary = {
  ticker: string;
  title: string;
  status?: string;
  expiry?: string;
  contracts: { ticker: string; label: string }[];
};

export type EventForecast = {
  event: string;
  title: string;
  expiry?: string;
  contracts: ContractQuote[];
  source: "gemini-prediction-markets";
  asOf: string;
};

const num = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function toQuote(c: any): ContractQuote {
  const p = c.prices ?? {};
  const bid = num(p.bestBid);
  const ask = num(p.bestAsk);
  const last = num(p.lastTradePrice);
  let probability: number | null = null;
  let basis: ContractQuote["basis"] = "none";
  if (bid !== null && ask !== null && ask >= bid) {
    probability = (bid + ask) / 2;
    basis = "midpoint";
  } else if (last !== null) {
    probability = last;
    basis = "last_trade";
  }
  return {
    ticker: c.ticker,
    label: c.label ?? c.ticker,
    instrumentSymbol: c.instrumentSymbol,
    probability: probability === null ? null : Math.round(probability * 10000) / 10000,
    bestBid: bid,
    bestAsk: ask,
    lastTrade: last,
    basis,
  };
}

function unwrapEvents(json: any): any[] {
  if (Array.isArray(json)) return json;
  return json?.data ?? json?.events ?? [];
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Gemini ${res.status} for ${path}`);
  return res.json();
}

// ---- mock data (MOCK_GEMINI=1) so the whole pipeline demos even if Gemini is unreachable ----
const MOCK_EVENTS: any[] = [
  {
    ticker: "FEDDEC26",
    title: "Fed decision in December?",
    status: "active",
    expiry: "2026-12-16T19:00:00Z",
    contracts: [
      { ticker: "FEDDEC26-DN25", label: "Fed cuts at least 25 bps", prices: { bestBid: "0.61", bestAsk: "0.65", lastTradePrice: "0.63" } },
      { ticker: "FEDDEC26-HOLD", label: "Fed holds rates", prices: { bestBid: "0.33", bestAsk: "0.37", lastTradePrice: "0.35" } },
    ],
  },
  {
    ticker: "BTC100K",
    title: "BTC price on November 30",
    status: "active",
    expiry: "2026-12-31T23:59:00Z",
    contracts: [{ ticker: "BTC100K-YES", label: "Yes", prices: { bestBid: "0.41", bestAsk: "0.45", lastTradePrice: "0.43" } }],
  },
  {
    ticker: "ETH5K",
    title: "ETH price on November 30",
    status: "active",
    expiry: "2026-12-31T23:59:00Z",
    contracts: [{ ticker: "ETH5K-YES", label: "Yes", prices: { bestBid: "0.18", bestAsk: "0.24", lastTradePrice: "0.2" } }],
  },
];

const STOP = new Set(["will","the","and","for","this","that","does","are","is","can","what","when","how","year","end","above","below","reach","trade","likely","there","odds","chance","going","with","from","have","has","get","price","where","who","which","market","markets","expecting","expect","expected","think","odds","on","in","of","at","to"]);
// Gemini titles use tickers ("BTC price on November 30", "Fed decision in December?"), so map natural words to them.
const ALIASES: Record<string, string[]> = {
  bitcoin: ["btc"], ethereum: ["eth"], ether: ["eth"], solana: ["sol"], ripple: ["xrp"], hyperliquid: ["hype"],
  crude: ["wti", "brent"], oil: ["wti", "brent"], petroleum: ["wti", "brent"], natural: ["ngas"],
  interest: ["fed"], rates: ["fed"], rate: ["fed"], fomc: ["fed"], powell: ["fed"], cut: ["fed"], cuts: ["fed"],
  weather: ["temperature"], temp: ["temperature"], silver: ["xag"], gold: ["xau"], copper: ["copper"],
};
const tokens = (q: string) => {
  const base = q.toLowerCase().split(/[^a-z0-9$]+/).filter((t) => (t.length > 2 || /^\d+$/.test(t)) && !STOP.has(t));
  const out: string[] = [];
  for (const t of base) for (const a of ALIASES[t] ?? []) if (!out.includes(a)) out.push(a); // aliases first (most specific)
  for (const t of base) if (!out.includes(t)) out.push(t);
  return out;
};

function mockSearch(q: string): any[] {
  const toks = tokens(q);
  if (!toks.length) return MOCK_EVENTS;
  return MOCK_EVENTS.filter((e) =>
    toks.some((t) => `${e.ticker} ${e.title}`.toLowerCase().includes(t)),
  );
}

// ---- public functions ----

/** FREE discovery: list matching events (no prices). Tries the full query, then aliased keywords, merging results. */
export async function searchEvents(q: string): Promise<EventSummary[]> {
  let raw: any[];
  if (USE_MOCK) {
    raw = mockSearch(q);
  } else {
    const enc = encodeURIComponent;
    const toks = tokens(q);
    const cands = [...new Set([q.trim(), ...toks.filter((t) => !/^\d+$/.test(t))])].filter(Boolean).slice(0, 6);
    if (!cands.length) cands.push("");
    // Query all candidates in parallel, merge, then rank by how many query words appear in the title,
    // so filler words ("where", "expecting") can't crowd out the relevant market.
    const results = await Promise.all(
      cands.map((c) => getJson(`/v1/prediction-markets/events?status=active&limit=25&search=${enc(c)}`).then(unwrapEvents).catch(() => [])),
    );
    const seen = new Set<string>();
    const merged: { e: any; score: number; i: number }[] = [];
    const full = q.trim().toLowerCase();
    for (const r of results) for (const e of r) {
      if (!e?.ticker || seen.has(e.ticker)) continue;
      seen.add(e.ticker);
      const words = new Set(String(e.title ?? "").toLowerCase().split(/[^a-z0-9$]+/));
      let score = toks.filter((t) => words.has(t)).length;
      if (full && String(e.title ?? "").toLowerCase().includes(full)) score += 10;
      merged.push({ e, score, i: merged.length });
    }
    merged.sort((a, b) => b.score - a.score || a.i - b.i);
    raw = merged.map((m) => m.e);
  }
  return raw.slice(0, 10).map((e) => ({
    ticker: e.ticker,
    title: e.title,
    status: e.status,
    expiry: e.expiryDate ?? e.expiry ?? e.contracts?.[0]?.expiryDate,
    contracts: (e.contracts ?? []).map((c: any) => ({ ticker: c.ticker, label: c.label ?? c.ticker })),
  }));
}

/** PAID data: market-implied probabilities for every contract of one event. Returns null if unknown. */
export async function getEventForecast(eventTicker: string): Promise<EventForecast | null> {
  let e: any | undefined;
  if (USE_MOCK) {
    e = MOCK_EVENTS.find((x) => x.ticker === eventTicker);
  } else {
    try {
      const json = await getJson(`/v1/prediction-markets/events/${encodeURIComponent(eventTicker)}`);
      e = Array.isArray(json) ? json[0] : (json?.data ?? json);
    } catch (err: any) {
      if (String(err.message).includes(" 404 ")) return null;
      throw err;
    }
  }
  if (!e || !e.ticker) return null;
  return {
    event: e.ticker,
    title: e.title,
    expiry: e.expiryDate ?? e.expiry ?? e.contracts?.[0]?.expiryDate,
    contracts: (e.contracts ?? []).map(toQuote),
    source: "gemini-prediction-markets",
    asOf: new Date().toISOString(),
  };
}
