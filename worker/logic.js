// The always-on watcher's rules (tests/worker.test.js checks each one).
// Mover watch
// 1. A sudden move is the change over the last 5 minutes, compared with a normal 5 minutes for that market over the
//    last day (the median size of every 5-minute change). It counts at 5x normal AND above a minimum size per market,
//    so a quiet overnight market doesn't trigger on a small wiggle.
// 2. The latest price must be fresh (under 3 minutes old): a feed that stopped is never a move.
// 3. One alert per market per 30 minutes, unless the move keeps going to twice the size already reported.
// 4. The cause is an economic release out in the last 10 minutes if there is one; otherwise a headline from the
//    20 minutes before the move that is about that market. If nothing fits, it says there's no clear news yet.
// Memecoin radar
// 5. Taking off = up 20%+ in the last hour (or 50%+ in 6 hours and still up 5%+ this hour) with real trading behind it: $50K+ traded this hour,
//    $25K+ liquidity and 40+ buys this hour. Anything smaller is noise.
// 6. Every coin on the radar carries its warning signs; none of them is hidden because the coin is going up.
// Speech scanner
// 7. A flagged line is only kept if it appears word for word in the speech or statement.
"use strict";

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// Markets watched for sudden moves: Yahoo symbol, name, smallest move that counts (%), topics that explain it
const MOVERS = {
  NQ: { sym: "NQ=F", name: "Nasdaq 100 futures", min: 0.25, dp: 2, topics: /fed|rate|inflation|cpi|ppi|jobs|payroll|yield|treasur|tariff|trade|chip|nvidia|apple|microsoft|tech|ai\b|stock|nasdaq|earnings|powell|recession|gdp|china|war|iran|israel|russia/i },
  ES: { sym: "ES=F", name: "S&P 500 futures", min: 0.2, dp: 2, topics: /fed|rate|inflation|cpi|ppi|jobs|payroll|yield|treasur|tariff|trade|stock|s&p|earnings|powell|recession|gdp|china|war|iran|israel|russia|bank/i },
  GC: { sym: "GC=F", name: "Gold", min: 0.3, dp: 1, topics: /gold|fed|rate|inflation|dollar|yield|war|iran|israel|russia|central bank|safe haven|tariff/i },
  CL: { sym: "CL=F", name: "Crude oil", min: 0.6, dp: 2, topics: /oil|crude|opec|iran|israel|saudi|russia|energy|gasoline|inventor|hormuz|pipeline|refiner|sanction|war/i },
  EURUSD: { sym: "EURUSD=X", name: "EUR/USD", min: 0.12, dp: 5, topics: /euro|ecb|lagarde|dollar|fed|rate|inflation|cpi|jobs|payroll|germany|eurozone|tariff|yield/i },
  USDJPY: { sym: "JPY=X", name: "USD/JPY", min: 0.15, dp: 3, topics: /yen|japan|boj|ueda|dollar|fed|rate|yield|intervention|treasur/i },
  BTC: { sym: "BTC-USD", name: "Bitcoin", min: 0.8, dp: 0, topics: /bitcoin|btc|crypto|etf|sec\b|binance|coinbase|stablecoin|saylor|strategy|fed|rate|hack|liquidat/i },
  ETH: { sym: "ETH-USD", name: "Ethereum", min: 1.0, dp: 0, topics: /ether|eth\b|crypto|etf|sec\b|binance|coinbase|stablecoin|hack|liquidat|fed/i }
};

// rule 1 + 2: bars [{t, c}] at 1 minute, oldest first
function detectMove(bars, cfg, now = Date.now()) {
  const b = (bars || []).filter((x) => x && isFinite(x.c) && x.c > 0);
  if (b.length < 120) return null;
  const last = b[b.length - 1];
  if (now - last.t > 3 * 6e4) return null;
  // the price 5 minutes before the last bar (allowing for missing minutes)
  let j = b.length - 1; while (j > 0 && last.t - b[j].t < 5 * 6e4) j--;
  if (last.t - b[j].t > 8 * 6e4) return null;
  const from = b[j], pct = (last.c - from.c) / from.c * 100;
  // normal 5 minutes: every 5-minute change in the window, excluding the last 15 minutes
  const ch = [];
  for (let i = 5; i < b.length; i++) { if (last.t - b[i].t < 15 * 6e4) break; if (b[i].t - b[i - 5].t <= 8 * 6e4) ch.push(Math.abs((b[i].c - b[i - 5].c) / b[i - 5].c * 100)); }
  const typ = median(ch);
  if (!(typ > 0) || ch.length < 60) return null;
  const ratio = Math.abs(pct) / typ;
  if (ratio < 5 || Math.abs(pct) < cfg.min) return null;
  return { t: last.t, from: from.c, price: last.c, pct: +pct.toFixed(3), ratio: +ratio.toFixed(1), typical: +typ.toFixed(4), way: pct > 0 ? "up" : "down" };
}
// rule 3: lastAlert = { t, pct } for this market
function shouldAlert(move, lastAlert) {
  if (!move) return false;
  if (!lastAlert || move.t - lastAlert.t >= 30 * 6e4) return true;
  return Math.sign(move.pct) === Math.sign(lastAlert.pct) && Math.abs(move.pct) >= 2 * Math.abs(lastAlert.pct);
}
// rule 4: events [{title, time, actual}], heads [{title, time, source, themeLabel}]
function findCause(move, key, events, heads) {
  const cfg = MOVERS[key];
  const rel = (events || []).filter((e) => e && e.time && e.actual != null && e.actual !== "" && move.t - e.time >= -60e3 && move.t - e.time <= 10 * 6e4 && (e.impact === "High" || e.impact === "Medium"))
    .sort((a, b) => b.time - a.time)[0];
  if (rel) return { kind: "release", text: `${rel.title} came out at ${rel.actual}${rel.forecast ? ` (forecast ${rel.forecast})` : ""}`, title: rel.title };
  const near = (heads || []).filter((h) => h && h.time && move.t - h.time >= -2 * 6e4 && move.t - h.time <= 20 * 6e4 && cfg.topics.test(h.title + " " + (h.themeLabel || "")))
    .sort((a, b) => b.time - a.time);
  if (near.length) return { kind: "headline", text: near[0].title, source: near[0].source || "", candidates: near.slice(0, 6) };
  return { kind: "none", text: "No clear news behind it yet. Moves like this can come from big orders, stop-loss runs or news that hasn't hit the wires." };
}

// rule 5 + 6: a DexScreener pair
function radarScore(p) {
  const pc = p.priceChange || {}, vol = p.volume || {}, tx = (p.txns && p.txns.h1) || {}, liq = p.liquidity && p.liquidity.usd;
  const h1 = pc.h1, h6 = pc.h6, v1 = vol.h1 || 0, buys = tx.buys || 0;
  // a 6-hour run only counts while it is still going up this hour
  const rising = (h1 != null && h1 >= 20) || (h6 != null && h6 >= 50 && h1 != null && h1 >= 5);
  if (!rising || v1 < 5e4 || !(liq >= 2.5e4) || buys < 40) return null;
  const s = Math.log10(1 + Math.max(h1 || 0, (h6 || 0) / 3)) * 30 + Math.log10(v1 / 5e4 + 1) * 25 + Math.log10(buys / 40 + 1) * 15;
  return Math.round(Math.min(100, s));
}
function radarFlags(p, extra = {}) {
  const f = [], liq = p.liquidity && p.liquidity.usd, mc = p.marketCap || p.fdv, ageH = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 36e5 : null;
  const pc = p.priceChange || {}, tx = (p.txns && p.txns.h1) || {}, v1 = (p.volume && p.volume.h1) || 0;
  if (ageH != null && ageH < 24) f.push({ tone: "warn", text: `Brand new: trading for ${ageH < 1 ? "under an hour" : Math.round(ageH) + "h"}` });
  if (liq != null && liq < 5e4) f.push({ tone: "warn", text: "Thin liquidity: selling even a small amount can drop the price a lot" });
  if (liq && mc && liq / mc < 0.03) f.push({ tone: "warn", text: "Liquidity is tiny next to its market value, so the price is fragile" });
  if ((tx.sells || 0) > (tx.buys || 0)) f.push({ tone: "warn", text: "More sellers than buyers this hour" });
  if (liq && v1 / liq > 5) f.push({ tone: "info", text: "Frenzy: this hour's trading is over 5x its liquidity" });
  if (pc.h24 > 300) f.push({ tone: "warn", text: "Up more than 4x in a day: late buyers often get caught" });
  if (pc.h24 > 100 && pc.h1 != null && pc.h1 < -15) f.push({ tone: "warn", text: "Big run today, now dropping this hour" });
  if (extra.boosted) f.push({ tone: "info", text: "Someone paid to promote it on DexScreener" });
  if (extra.rug) {
    if (extra.rug.score >= 50) f.push({ tone: "warn", text: `RugCheck rates it high risk (${extra.rug.score}/100)` });
    (extra.rug.risks || []).slice(0, 3).forEach((r) => f.push({ tone: "warn", text: "RugCheck: " + r }));
  }
  return f;
}

// rule 7
const squash = (t) => String(t || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
function keepQuotes(lines, text) {
  const T = squash(text);
  return (Array.isArray(lines) ? lines : []).filter((l) => l && typeof l.quote === "string" && l.quote.length >= 20 && T.includes(squash(l.quote).replace(/^"|"$/g, "")));
}
// RSS/Atom items: [{title, link, t}]
function parseFeed(xml) {
  const items = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi; let m;
  const tag = (s, n) => { const x = s.match(new RegExp(`<${n}\\b[^>]*>([\\s\\S]*?)<\\/${n}>`, "i")); return x ? x[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : ""; };
  while ((m = re.exec(xml))) {
    const s = m[0];
    let link = tag(s, "link"); if (!link) { const h = s.match(/<link[^>]*href="([^"]+)"/i); link = h ? h[1] : ""; }
    const t = Date.parse(tag(s, "pubDate") || tag(s, "updated") || tag(s, "published") || tag(s, "dc:date"));
    const title = tag(s, "title").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
    if (title && /^https?:\/\//.test(link)) items.push({ title, link, t: isFinite(t) ? t : null });
  }
  return items;
}
function htmlText(html) {
  return String(html || "").replace(/<(script|style|nav|header|footer)\b[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/li>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”").replace(/&#8212;|&mdash;/g, "—").replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n\n").trim();
}

module.exports = { MOVERS, detectMove, shouldAlert, findCause, radarScore, radarFlags, keepQuotes, parseFeed, htmlText, median };
