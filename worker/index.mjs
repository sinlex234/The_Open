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
const AL = require("./alerts.js");

const SB_URL = "https://jcuimqwbhxzwrnpukgra.supabase.co";
const SB_KEY = "sb_publishable__TMrzNDk1EE7EZI0gv0xaQ_KyDcGH6r";
const SITE = (process.env.SITE_URL || "https://the-open-one.vercel.app").replace(/\/$/, "");
const SECRET = process.env.OPEN_SYNC_SECRET;
const AI_KEY = process.env.ANTHROPIC_API_KEY;
const UA = "Mozilla/5.0 (compatible; TheOpenOne/1.0; +https://the-open-one.vercel.app)";
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const stats = { moves: 0, radar: 0, speeches: 0, errors: 0, started: Date.now(), last: [] };
// the last few problems, saved with the heartbeat so they can be read without the Railway logs
const oops = (where, e) => { stats.errors++; stats.last.unshift(new Date().toISOString().slice(5, 16) + " " + where + ": " + String(e && e.message || e).slice(0, 160)); stats.last.length = Math.min(stats.last.length, 8); };

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
    } catch (e) { oops("bars " + key, e); log("bars", key, e.message); }
  }
  if (!found.length) return;
  const [res, wire] = await Promise.all([get(`${SITE}/api/data?fn=results`).catch(() => null), get(`${SITE}/api/data?fn=wire`).catch(() => null)]);
  const rows = [];
  for (const [key, cfg, mv] of found) {
    const cause = L.findCause(mv, key, res && res.events, wire && wire.items);
    let why = "";
    // with several possible headlines, the AI picks the one that fits (or none) and says why in one sentence
    if ((cause.kind === "headline" || cause.kind === "maybe") && cause.candidates.length && AI_KEY) {
      const pick = await ask(VOICE + `\nA market just made a sudden move. Pick the headline that most likely caused it ONLY if it is clearly about this market or something that directly moves it right now (a rate decision, an intervention, a hack). A general headline that happened to come out at the same time is not a cause: then pick -1.\nReturn JSON only: {"pick": index of the headline that most likely caused the move, or -1 if none fits, "why": "one short sentence linking it to the move"}`,
        JSON.stringify({ market: cfg.name, move: `${mv.pct > 0 ? "+" : ""}${mv.pct}% in 5 minutes`, headlines: cause.candidates.map((h, i) => ({ i, headline: h.title, source: h.source })) }), 200).catch((e) => { oops("cause AI", e); return null; });
      if (pick && Number.isInteger(pick.pick)) {
        if (pick.pick < 0) { cause.kind = "none"; cause.text = "No clear news behind it yet. Moves like this can come from big orders, stop-loss runs or news that hasn't hit the wires."; }
        else if (cause.candidates[pick.pick]) { cause.kind = "headline"; cause.text = cause.candidates[pick.pick].title; cause.source = cause.candidates[pick.pick].source || ""; why = String(pick.why || "").slice(0, 240); }
      }
    }
    lastAlert[key] = { t: mv.t, pct: mv.pct };
    rows.push({ id: `${key}:${Math.floor(mv.t / 6e4)}`, t: new Date(mv.t).toISOString(), mkt: key, name: cfg.name, pct: mv.pct, ratio: mv.ratio, price: +mv.price.toFixed(cfg.dp), price_from: +mv.from.toFixed(cfg.dp),
      cause_kind: cause.kind, cause: cause.text.slice(0, 300), cause_source: cause.source || null, why: why || null });
    log("MOVE", key, mv.pct + "%", mv.ratio + "x", cause.kind, cause.text.slice(0, 60));
  }
  stats.moves += await save("open_moves", rows);
  rows.forEach((r) => alertMove(r).catch((e) => oops("alert move", e)));
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
  rows.filter((r) => r.score >= 80 && !(r.flags || []).some((f) => /RugCheck rates it high risk/.test(f.text))).slice(0, 1).forEach((r) => alertMeme(r).catch((e) => oops("alert meme", e)));
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
    try { items = L.parseFeed(await get(url, { json: false })); } catch (e) { oops("feed " + bank, e); log("feed", bank, e.message); continue; }
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
        `${bank} ${kind}: ${it.title}\n\n${text}`, 1400).catch((e) => { oops("speech AI", e); log("speech AI", e.message); return null; });
      if (!out) continue;
      const lines = L.keepQuotes(out.lines, text).slice(0, 4).map((l) => ({ quote: l.quote.slice(0, 400), means: String(l.means || "").slice(0, 240), markets: (Array.isArray(l.markets) ? l.markets : []).slice(0, 4), dir: /hawk/i.test(l.dir) ? "hawkish" : /dov/i.test(l.dir) ? "dovish" : "neutral" }));
      const tone = /hawk/i.test(out.tone) ? "hawkish" : /dov/i.test(out.tone) ? "dovish" : "neutral";
      const sp = { id: it.link, t: new Date(it.t).toISOString(), bank, kind, title: it.title.slice(0, 240), speaker: String(out.speaker || "").slice(0, 120), url: it.link, summary: String(out.summary || "").slice(0, 500), tone, lines };
      const n = await save("open_speech", [sp]); stats.speeches += n;
      if (n) alertSpeech(sp).catch((e) => oops("alert speech", e));
      log("SPEECH", bank, tone, lines.length, "lines:", it.title.slice(0, 60));
    }
  }
}

// ---------- story explainers: look up the top 3 developing stories ahead of time so AI reads are instant ----------
async function explainTick() {
  const d = await get(`${SITE}/api/data?fn=threads`).catch(() => null);
  for (const t of (d && d.threads || []).slice(0, 3)) {
    await get(`${SITE}/api/data?fn=bg&kind=story&id=${encodeURIComponent(t.id)}`, { timeout: 50e3 }).then((x) => log("explainer", t.title, x && x.text ? "ready" : "empty")).catch((e) => log("explainer", t.title, e.message));
  }
}
// ---------- Smart alerts on Telegram ----------
const TG = process.env.TELEGRAM_BOT_TOKEN;
const MK_NAME = { NQ: "NQ", ES: "ES", GC: "Gold", CL: "Oil", EURUSD: "EUR/USD", USDJPY: "USD/JPY", BTC: "Bitcoin", ETH: "Ethereum", MEME: "memecoins" };
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${TG}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description || r.status}`);
  return j.result;
}
async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ secret: SECRET, ...args }) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0, 120)}`);
  return t ? JSON.parse(t) : null;
}
let targets = [], targetsAt = 0;
async function loadTargets(force) {
  if (!force && Date.now() - targetsAt < 20e3) return targets;
  targets = (await rpc("open_alert_targets", {})) || []; targetsAt = Date.now();
  return targets;
}
const kb = (rows) => ({ inline_keyboard: rows });
const openBtn = (path = "/") => ({ text: "Open on The Open One", url: SITE + path });
const muteBtn = (m) => ({ text: `Mute ${MK_NAME[m] || m} today`, callback_data: "mute:" + m });
// send one event to everyone it fits; the saved row (unique per reader + event) stops repeats, even after a restart
async function dispatch(ev, html, buttons) {
  if (!TG) return 0;
  let n = 0;
  for (const u of await loadTargets()) {
    if (AL.decide(ev, u, Date.now()) !== "send") continue;
    const fresh = await save("open_alert_sent", [{ id: (u.user + ":" + ev.key).slice(0, 200), user_id: u.user, kind: ev.kind, title: ev.title.slice(0, 200) }]).catch((e) => { oops("alert log", e); return 0; });
    if (!fresh) continue;
    try { await tg("sendMessage", { chat_id: u.chat, text: html, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: kb(buttons(u)) }); u.sent24 = (u.sent24 || 0) + 1; n++; }
    catch (e) { oops("alert send", e); if (/blocked|chat not found|deactivated/i.test(e.message)) rpc("open_alert_chat", { chat: u.chat, action: "unlink" }).catch(() => {}); }
  }
  if (n) log("ALERT", ev.key, "sent to", n);
  stats.alerts = (stats.alerts || 0) + n;
  return n;
}
const E = AL.tgEsc;
async function alertMove(m) {
  const cfg = L.MOVERS[m.mkt]; if (!cfg) return;
  const big = m.ratio >= 8 || Math.abs(m.pct) >= 2 * cfg.min;
  const cause = m.cause_kind === "release" || m.cause_kind === "headline" ? `<b>Behind it:</b> ${E(m.cause)}${m.why ? `\n${E(m.why)}` : ""}`
    : m.cause_kind === "maybe" ? `<b>Possibly linked:</b> ${E(m.cause)}` : E(m.cause);
  const html = `${m.pct > 0 ? "🟢" : "🔻"} <b>${E(m.name)} ${m.pct > 0 ? "jumped" : "dropped"} ${Math.abs(m.pct).toFixed(2)}% in 5 minutes</b> (${m.ratio}× a normal move)\n${cause}`;
  await dispatch({ key: "move:" + m.id, kind: "moves", level: big ? "big" : "normal", markets: [m.mkt], title: `${m.name} ${m.pct}%` }, html, () => [[openBtn("/"), muteBtn(m.mkt)]]);
}
async function alertSpeech(sp) {
  const statement = /statement|decision|fomc/i.test(sp.title);
  const lean = sp.tone === "hawkish" ? "leans to higher rates" : sp.tone === "dovish" ? "leans to rate cuts" : "no clear lean on rates";
  const lines = (sp.lines || []).slice(0, 2).map((l) => `“${E(l.quote)}”\n${E(l.means)}`).join("\n\n");
  const html = `🏛 <b>${E(sp.speaker || sp.bank)}: ${E(lean)}</b>\n${E(sp.summary)}${lines ? "\n\n" + lines : ""}`;
  await dispatch({ key: "speech:" + sp.id, kind: "speeches", level: statement ? "big" : sp.tone === "neutral" || !(sp.lines || []).length ? "minor" : "normal", markets: AL.BANK_MKTS[sp.bank] || [], title: sp.title },
    html, () => [[{ text: "Read it", url: sp.url }, openBtn("/news")]]);
}
async function alertMeme(r) {
  const warn = (r.flags || []).slice(0, 3).map((f) => "⚠️ " + E(f.text)).join("\n");
  const html = `🚀 <b>${E(r.symbol)} is taking off</b> (${E(r.name)} on ${E(r.chain)})\nUp ${Math.round(r.chg_h1)}% in the last hour, $${Math.round((r.vol_h1 || 0) / 1e3)}K traded this hour.\n${warn || "No major warning signs found, but most runs like this reverse."}\n<i>High risk. Not advice.</i>`;
  await dispatch({ key: "meme:" + r.chain + ":" + r.address + ":" + new Date().toISOString().slice(0, 10), kind: "memes", level: "normal", markets: [], title: r.symbol },
    html, () => [[{ text: "Chart on DexScreener", url: r.url }, openBtn("/memecoins")]]);
}
// economic releases: a heads-up about 10 minutes before, then the result
async function releaseTick() {
  if (!TG) return;
  const d = await get(`${SITE}/api/data?fn=results`).catch(() => null);
  const now = Date.now();
  for (const e of (d && d.events) || []) {
    if (e.impact !== "High" || !AL.BY_CUR[e.country]) continue;
    const huge = /cpi|consumer price|nonfarm|non-farm|payroll|fomc|interest rate|fed funds|gdp|pce/i.test(e.title);
    const mk = AL.BY_CUR[e.country];
    const when = new Date(e.time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
    if (!e.released && e.time - now > 8 * 6e4 && e.time - now <= 11 * 6e4) {
      const html = `📅 <b>${E(e.title)} in 10 minutes</b> (${when} ET)${e.forecast ? `\nForecast ${E(e.forecast)}${e.previous ? `, last time ${E(e.previous)}` : ""}.` : ""}${e.text ? `\n${E(String(e.text).split(/(?<=\.)\s/)[0])}` : ""}`;
      await dispatch({ key: "pre:" + e.key, kind: "pre", level: huge ? "big" : "normal", markets: mk, title: e.title }, html, () => [[openBtn("/calendar")]]);
    }
    if (e.released && e.actual && now - e.time < 20 * 6e4) {
      const v = e.meter && e.meter.v;
      const html = `📊 <b>${E(e.title)} came out at ${E(e.actual)}</b>${e.forecast ? ` (forecast ${E(e.forecast)}${e.previous ? `, last ${E(e.previous)}` : ""})` : ""}${e.label ? `\n<b>${E(e.label)}</b>` : ""}${e.text ? `\n${E(e.text)}` : ""}${v ? `\n<i>${E(v.head)}${v.text ? ": " + E(v.text) : ""}</i>` : ""}`;
      await dispatch({ key: "rel:" + e.key, kind: "releases", level: huge || (v && /shock|big/i.test(v.kind || v.head)) ? "big" : "normal", markets: mk, title: e.title }, html, () => [[openBtn("/calendar")]]);
    }
  }
}
// morning summary at 8 AM in each reader's time zone on weekdays (doesn't count toward the daily limit)
async function summaryTick() {
  if (!TG) return;
  const due = (await loadTargets()).filter((u) => { const p = u.prefs || {}, lp = AL.localParts(Date.now(), p.tz); return p.summary && lp.mins >= 480 && lp.mins < 495 && lp.wd !== "Sat" && lp.wd !== "Sun"; });
  if (!due.length) return;
  const [res, th] = await Promise.all([get(`${SITE}/api/data?fn=results`).catch(() => null), get(`${SITE}/api/data?fn=threads`).catch(() => null)]);
  const evs = ((res && res.events) || []).filter((e) => e.impact === "High" && !e.released).slice(0, 5)
    .map((e) => `• ${new Date(e.time).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET: ${E(e.title)}${e.forecast ? ` (forecast ${E(e.forecast)})` : ""}`);
  const stories = ((th && th.threads) || []).slice(0, 3).map((t) => `• ${E(t.title)}${t.latest ? `: ${E(t.latest.title || t.latest)}` : ""}`);
  const html = `☀️ <b>Good morning. Here's today.</b>\n\n<b>Big events</b>\n${evs.join("\n") || "No big releases today."}\n\n<b>Stories moving markets</b>\n${stories.join("\n") || "Quiet so far."}`;
  for (const u of due) {
    const lp = AL.localParts(Date.now(), u.prefs.tz);
    const fresh = await save("open_alert_sent", [{ id: u.user + ":summary:" + lp.date, user_id: u.user, kind: "summary", title: "Morning summary" }]).catch(() => 0);
    if (fresh) await tg("sendMessage", { chat_id: u.chat, text: html, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: kb([[openBtn("/")]]) }).catch((e) => oops("summary", e));
  }
}
// "Send me a test alert" on the site
async function testTick() {
  if (!TG) return;
  for (const u of await loadTargets(true)) {
    const t = u.prefs && u.prefs.test_at && Date.parse(u.prefs.test_at);
    if (!t || Date.now() - t > 10 * 6e4) continue;
    await tg("sendMessage", { chat_id: u.chat, parse_mode: "HTML", disable_web_page_preview: true, text: `✅ <b>Test alert</b>\nThis is what alerts look like. You'll get them for: ${(u.prefs.markets || []).map((m) => MK_NAME[m] || m).join(", ")}.\nChange anything on the Alerts page. Send /stop to turn alerts off.`, reply_markup: kb([[openBtn("/alerts")]]) }).catch((e) => oops("test", e));
    await rpc("open_alert_chat", { chat: u.chat, action: "tested" }).catch((e) => oops("test done", e));
  }
}
// the bot itself: /start <code> links the chat, /stop unlinks it, "Mute" buttons
let tgOffset = 0;
async function botLoop() {
  if (!TG) { log("Telegram alerts off: add TELEGRAM_BOT_TOKEN in Railway > Variables."); return; }
  try { const me = await tg("getMe", {}); log("Telegram bot @" + me.username + " ready"); stats.bot = me.username; } catch (e) { oops("bot", e); }
  for (;;) {
    try {
      const ups = await tg("getUpdates", { offset: tgOffset, timeout: 25, allowed_updates: ["message", "callback_query"] });
      for (const up of ups) {
        tgOffset = up.update_id + 1;
        await handleUpdate(up).catch((e) => oops("bot update", e));
      }
    } catch (e) { oops("bot poll", e); await new Promise((r) => setTimeout(r, 5e3)); }
  }
}
async function handleUpdate(up) {
  if (up.callback_query) {
    const q = up.callback_query, m = /^mute:([A-Z]{2,8})$/.exec(q.data || "");
    if (!m) return tg("answerCallbackQuery", { callback_query_id: q.id });
    const u = (await loadTargets()).find((x) => String(x.chat) === String(q.message && q.message.chat.id));
    const until = new Date(AL.endOfDay(Date.now(), (u && u.prefs && u.prefs.tz) || "America/New_York")).toISOString();
    await rpc("open_alert_chat", { chat: q.message.chat.id, action: "mute", mkt: m[1], until });
    targetsAt = 0;
    return tg("answerCallbackQuery", { callback_query_id: q.id, text: `Muted ${MK_NAME[m[1]] || m[1]} until tomorrow` });
  }
  const msg = up.message; if (!msg || !msg.text || msg.chat.type !== "private") return;
  const chat = msg.chat.id, text = msg.text.trim();
  const start = /^\/start(?:\s+([a-f0-9]{16,64}))?$/i.exec(text);
  if (start && start[1]) {
    const ok = await rpc("open_alert_link", { code: start[1].toLowerCase(), chat, name: msg.from.username ? "@" + msg.from.username : (msg.from.first_name || "you") });
    targetsAt = 0;
    return tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: ok
      ? "✅ <b>Connected!</b> You'll get alerts for your markets here, with what happened and why.\nChange what you get any time on the Alerts page. Send /stop to turn alerts off."
      : "That link has expired. Go back to the Alerts page on The Open One and tap <b>Connect Telegram</b> again.", reply_markup: kb([[openBtn("/alerts")]]) });
  }
  if (start) return tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: "👋 This is the alerts bot for <b>The Open One</b>.\nTo get alerts, sign in on the site, open the Alerts page and tap <b>Connect Telegram</b>.", reply_markup: kb([[openBtn("/alerts")]]) });
  if (/^\/stop\b/i.test(text)) {
    await rpc("open_alert_chat", { chat, action: "unlink" }); targetsAt = 0;
    return tg("sendMessage", { chat_id: chat, text: "Alerts are off and this chat is disconnected. You can reconnect any time from the Alerts page." });
  }
  return tg("sendMessage", { chat_id: chat, parse_mode: "HTML", text: "I only send alerts. Change them on the Alerts page, or send /stop to turn them off.", reply_markup: kb([[openBtn("/alerts")]]) });
}

// ---------- loop ----------
async function beat() {
  await save("open_beat", [{ id: new Date(Math.floor(Date.now() / 6e5) * 6e5).toISOString(), t: new Date().toISOString(), stats: { ...stats, ai: !!AI_KEY } }]).catch((e) => log("beat", e.message));
}
function every(ms, name, fn) {
  let busy = false;
  const run = async () => { if (busy) return; busy = true; try { await fn(); } catch (e) { oops(name, e); log(name, "failed:", e.message); } finally { busy = false; } };
  run(); setInterval(run, ms);
}
if (!SECRET) { console.error("OPEN_SYNC_SECRET is missing. Add it in Railway > Variables (the same value as in Vercel)."); process.exit(1); }
log("The Open One watcher starting.", AI_KEY ? "AI on." : "AI off: add ANTHROPIC_API_KEY for causes and speech flags.");
every(60e3, "movers", moverTick);
every(180e3, "radar", radarTick);
every(120e3, "speeches", speechTick);
every(600e3, "beat", beat);
every(20 * 60e3, "explainers", explainTick);
every(60e3, "releases", releaseTick);
every(5 * 60e3, "summary", summaryTick);
every(20e3, "tests", testTick);
botLoop();
process.on("unhandledRejection", (e) => { oops("unhandled", e); log("unhandled", e && e.message); });
