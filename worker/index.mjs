// The Open One's always-on watcher (runs on Railway, not Vercel).
// Every minute: checks 8 markets for sudden moves and finds the news behind them.
// Every 3 minutes: scans DexScreener for memecoins taking off, with their warning signs.
// Every 2 minutes: reads new Fed and ECB speeches and statements as soon as they're posted and flags the lines
// that can move markets. Everything is saved to Supabase, and the site shows it.
// Settings (Railway > Variables): OPEN_SYNC_SECRET (required, same as Vercel), ANTHROPIC_API_KEY (for causes and
// speech flags), SITE_URL (optional, defaults to the live site).
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const L = require("./logic.js");

const SB_URL = "https://jcuimqwbhxzwrnpukgra.supabase.co";
const SB_KEY = "sb_publishable__TMrzNDk1EE7EZI0gv0xaQ_KyDcGH6r";
const SITE = (process.env.SITE_URL || "https://the-open-one.vercel.app").replace(/\/$/, "");
const SECRET = process.env.OPEN_SYNC_SECRET;
const AI_KEY = process.env.ANTHROPIC_API_KEY;
const UA = "Mozilla/5.0 (compatible; TheOpenOne/1.0; +https://the-open-one.vercel.app)";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const stats = { moves: 0, radar: 0, speeches: 0, errors: 0, started: Date.now() };

async function get(url, { json = true, timeout = 12e3, headers = {} } = {}) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA, Accept: json ? "application/json" : "*/*", ...headers } });
    if (!r.ok) throw new Error(`${r.status} ${url.slice(0, 80)}`);
    return json ? r.json() : r.text();
  } finally { clearTimeout(t); }
}
async function save(tbl, rows) {
  if (!rows.length) return 0;
  const r = await fetch(`${SB_URL}/rest/v1/rpc/open_log`, { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, tbl, rows }) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`save ${tbl}: ${r.status} ${txt.slice(0, 160)}`);
  return +txt || 0;
}
async function ask(system, user, maxTokens = 900) {
  if (!AI_KEY) return null;
  const call = (model, thinking = { type: "disabled" }) => fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": AI_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, thinking, system, messages: [{ role: "user", content: user }] }) });
  // each model wants "thinking off" said its own way: if one refuses the setting, use the way its error names
  const run = async (model) => {
    let r = await call(model), j = await r.json();
    if (r.status === 400 && /thinking/i.test(j.error && j.error.message || "")) { r = await call(model, { type: "between_tools" }); j = await r.json(); }
    return { r, j };
  };
  let { r, j } = await run(process.env.ANTHROPIC_WATCH_MODEL || "claude-sonnet-5-5");
  if (!r.ok && r.status !== 401) { log("watch model", r.status, j.error && j.error.message); ({ r, j } = await run(process.env.ANTHROPIC_MODEL || "claude-haiku-5-5")); }
  if (!r.ok) throw new Error("Claude: " + (j.error && j.error.message || r.status));
  const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  try { return m ? JSON.parse(m[0]) : null; } catch { return null; }
}
const VOICE = `You write for The Open One, a market-news site for everyday traders. Plain English, short sentences, no hype. Never tell anyone to buy or sell. Use only the text you are given; never invent numbers.`;

// ---------- mover watch ----------
const lastAlert = {};
async function bars1m(sym) {
  const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=1m&includePrePost=true`);
  const r = j.chart && j.chart.result && j.chart.result[0]; if (!r) return [];
  const c = r.indicators.quote[0].close;
  return r.timestamp.map((t, i) => ({ t: t * 1000, c: c[i] })).filter((b) => b.c != null);
}
async function moverTick() {
  const found = [];
  for (const [key, cfg] of Object.entries(L.MOVERS)) {
    try {
      const mv = L.detectMove(await bars1m(cfg.sym), cfg);
      if (L.shouldAlert(mv, lastAlert[key])) found.push([key, cfg, mv]);
    } catch (e) { stats.errors++; log("bars", key, e.message); }
  }
  if (!found.length) return;
  const [res, wire] = await Promise.all([get(`${SITE}/api/data?fn=results`).catch(() => null), get(`${SITE}/api/data?fn=wire`).catch(() => null)]);
  const rows = [];
  for (const [key, cfg, mv] of found) {
    const cause = L.findCause(mv, key, res && res.events, wire && wire.items);
    let why = "";
    // with several possible headlines, the AI picks the one that fits (or none) and says why in one sentence
    if (cause.kind === "headline" && cause.candidates.length && AI_KEY) {
      const pick = await ask(VOICE + `\nReturn JSON only: {"pick": index of the headline that most likely caused the move, or -1 if none fits, "why": "one short sentence linking it to the move"}`,
        JSON.stringify({ market: cfg.name, move: `${mv.pct > 0 ? "+" : ""}${mv.pct}% in 5 minutes`, headlines: cause.candidates.map((h, i) => ({ i, headline: h.title, source: h.source })) }), 200).catch(() => null);
      if (pick && Number.isInteger(pick.pick)) {
        if (pick.pick < 0) { cause.kind = "none"; cause.text = "No clear news behind it yet. Moves like this can come from big orders, stop-loss runs or news that hasn't hit the wires."; }
        else if (cause.candidates[pick.pick]) { cause.text = cause.candidates[pick.pick].title; cause.source = cause.candidates[pick.pick].source || ""; why = String(pick.why || "").slice(0, 240); }
      }
    }
    lastAlert[key] = { t: mv.t, pct: mv.pct };
    rows.push({ id: `${key}:${Math.floor(mv.t / 6e4)}`, t: new Date(mv.t).toISOString(), mkt: key, name: cfg.name, pct: mv.pct, ratio: mv.ratio, price: +mv.price.toFixed(cfg.dp), price_from: +mv.from.toFixed(cfg.dp),
      cause_kind: cause.kind, cause: cause.text.slice(0, 300), cause_source: cause.source || null, why: why || null });
    log("MOVE", key, mv.pct + "%", mv.ratio + "x", cause.kind, cause.text.slice(0, 60));
  }
  stats.moves += await save("open_moves", rows);
}

// ---------- memecoin radar ----------
const CHAINS = new Set(["solana", "base", "ethereum", "bsc"]);
const rugCache = new Map();
async function rugcheck(mint) {
  const c = rugCache.get(mint); if (c && Date.now() - c.t < 30 * 6e4) return c.v;
  let v = null;
  try {
    const j = await get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`, { timeout: 8e3 });
    v = { score: Math.round(j.score_normalised ?? j.score ?? 0), risks: (j.risks || []).filter((r) => r.level === "danger" || r.level === "warn").map((r) => String(r.name)).slice(0, 3) };
  } catch {}
  rugCache.set(mint, { t: Date.now(), v });
  return v;
}
async function radarTick() {
  const lists = await Promise.all(["token-boosts/latest/v1", "token-boosts/top/v1", "token-profiles/latest/v1"].map((p) => get(`https://api.dexscreener.com/${p}`).catch(() => [])));
  const boosted = new Set([...lists[0], ...lists[1]].map((x) => x.chainId + ":" + x.tokenAddress));
  const byChain = {};
  lists.flat().forEach((x) => { if (x && CHAINS.has(x.chainId) && x.tokenAddress) (byChain[x.chainId] = byChain[x.chainId] || new Set()).add(x.tokenAddress); });
  const pairs = [];
  for (const [chain, set] of Object.entries(byChain)) {
    const addrs = [...set];
    for (let i = 0; i < addrs.length; i += 30) {
      const j = await get(`https://api.dexscreener.com/tokens/v1/${chain}/${addrs.slice(i, i + 30).join(",")}`).catch(() => []);
      // best pair per token: the one with the most liquidity
      const best = {};
      (Array.isArray(j) ? j : []).forEach((p) => { const a = p.baseToken && p.baseToken.address; if (!a || !set.has(a)) return; if (!best[a] || (p.liquidity && p.liquidity.usd || 0) > (best[a].liquidity && best[a].liquidity.usd || 0)) best[a] = p; });
      pairs.push(...Object.values(best));
    }
  }
  const hour = Math.floor(Date.now() / 36e5), rows = [];
  for (const p of pairs) {
    const score = L.radarScore(p); if (score == null) continue;
    const key = p.chainId + ":" + p.baseToken.address;
    const rug = p.chainId === "solana" ? await rugcheck(p.baseToken.address) : null;
    rows.push({ id: key + ":" + hour, t: new Date().toISOString(), chain: p.chainId, address: p.baseToken.address, symbol: String(p.baseToken.symbol || "").slice(0, 20), name: String(p.baseToken.name || "").slice(0, 60),
      url: p.url, price: +p.priceUsd || null, mcap: p.marketCap || p.fdv || null, liq: p.liquidity && p.liquidity.usd || null, vol_h1: p.volume && p.volume.h1 || null,
      chg_h1: p.priceChange && p.priceChange.h1, chg_h6: p.priceChange && p.priceChange.h6, chg_h24: p.priceChange && p.priceChange.h24, buys_h1: p.txns && p.txns.h1 && p.txns.h1.buys, sells_h1: p.txns && p.txns.h1 && p.txns.h1.sells,
      age_h: p.pairCreatedAt ? +((Date.now() - p.pairCreatedAt) / 36e5).toFixed(1) : null, score, flags: L.radarFlags(p, { boosted: boosted.has(key), rug }) });
  }
  // a coin already saved this hour is skipped by the database; it gets a fresh row next hour if it's still running
  stats.radar += await save("open_radar", rows);
  if (rows.length) log("RADAR", rows.length, "taking off:", rows.map((r) => r.symbol).join(" "));
}

// ---------- speech scanner ----------
const FEEDS = [
  ["Federal Reserve", "speech", "https://www.federalreserve.gov/feeds/speeches.xml"],
  ["Federal Reserve", "statement", "https://www.federalreserve.gov/feeds/press_monetary.xml"],
  ["European Central Bank", "statement", "https://www.ecb.europa.eu/rss/press.html"]
];
const seen = new Set();
async function speechTick() {
  if (!AI_KEY) return;
  for (const [bank, kind, url] of FEEDS) {
    let items = [];
    try { items = L.parseFeed(await get(url, { json: false })); } catch (e) { stats.errors++; log("feed", bank, e.message); continue; }
    for (const it of items.filter((x) => x.t && Date.now() - x.t < 48 * 36e5 && !seen.has(x.link)).slice(0, 3)) {
      seen.add(it.link);
      const have = await fetch(`${SB_URL}/rest/v1/open_speech?select=id&id=eq.${encodeURIComponent(it.link)}`, { headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY } }).then((r) => r.ok ? r.json() : []).catch(() => []);
      if (have.length) continue;
      let text = "";
      try { text = L.htmlText(await get(it.link, { json: false })).slice(0, 60000); } catch (e) { log("speech page", e.message); continue; }
      if (text.length < 800) continue;
      const out = await ask(VOICE + `
You read central bank speeches and statements for traders the moment they are posted.
Return JSON only:
{"speaker": "who is speaking or which body issued it", "summary": "2 short sentences: the message and what it means for rates",
 "tone": "hawkish (leaning to higher rates or holding them high), dovish (leaning to cuts), or neutral",
 "lines": [{"quote": "copy the sentence WORD FOR WORD from the text", "means": "one short sentence in plain English", "markets": ["which of: US stocks, Treasury yields, US dollar, euro, gold, Bitcoin"], "dir": "hawkish or dovish or neutral"}]}
Pick at most 4 lines that could move markets: hints about the next rate decision, inflation, jobs, the balance sheet, or financial stability. Skip greetings, history and thanks. If nothing in it matters for markets, return "lines": [].`,
        `${bank} ${kind}: ${it.title}\n\n${text}`, 1400).catch((e) => { stats.errors++; log("speech AI", e.message); return null; });
      if (!out) continue;
      const lines = L.keepQuotes(out.lines, text).slice(0, 4).map((l) => ({ quote: l.quote.slice(0, 400), means: String(l.means || "").slice(0, 240), markets: (Array.isArray(l.markets) ? l.markets : []).slice(0, 4), dir: /hawk/i.test(l.dir) ? "hawkish" : /dov/i.test(l.dir) ? "dovish" : "neutral" }));
      const tone = /hawk/i.test(out.tone) ? "hawkish" : /dov/i.test(out.tone) ? "dovish" : "neutral";
      stats.speeches += await save("open_speech", [{ id: it.link, t: new Date(it.t).toISOString(), bank, kind, title: it.title.slice(0, 240), speaker: String(out.speaker || "").slice(0, 120), url: it.link, summary: String(out.summary || "").slice(0, 500), tone, lines }]);
      log("SPEECH", bank, tone, lines.length, "lines:", it.title.slice(0, 60));
    }
  }
}

// ---------- loop ----------
async function beat() {
  await save("open_beat", [{ id: new Date(Math.floor(Date.now() / 6e5) * 6e5).toISOString(), t: new Date().toISOString(), stats: { ...stats, ai: !!AI_KEY } }]).catch((e) => log("beat", e.message));
}
function every(ms, name, fn) {
  let busy = false;
  const run = async () => { if (busy) return; busy = true; try { await fn(); } catch (e) { stats.errors++; log(name, "failed:", e.message); } finally { busy = false; } };
  run(); setInterval(run, ms);
}
if (!SECRET) { console.error("OPEN_SYNC_SECRET is missing. Add it in Railway > Variables (the same value as in Vercel)."); process.exit(1); }
log("The Open One watcher starting.", AI_KEY ? "AI on." : "AI off: add ANTHROPIC_API_KEY for causes and speech flags.");
every(60e3, "movers", moverTick);
every(180e3, "radar", radarTick);
every(120e3, "speeches", speechTick);
every(600e3, "beat", beat);
process.on("unhandledRejection", (e) => { stats.errors++; log("unhandled", e && e.message); });
