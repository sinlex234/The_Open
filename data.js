// The Open One — all market data in one file. vercel.json runs this at /api/data.
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api/_lib/router.js
var router_exports = {};
__export(router_exports, {
  default: () => handler
});
module.exports = __toCommonJS(router_exports);

// api/_lib/util.js
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
async function getText(url, { headers = {}, timeout = 9e3 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "*/*", ...headers }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
async function getJSON(url, opts) {
  return JSON.parse(await getText(url, opts));
}
async function settle(obj) {
  const keys = Object.keys(obj);
  const out = await Promise.allSettled(keys.map((k) => obj[k]));
  const res = {}, errors = {};
  out.forEach((o, i) => {
    if (o.status === "fulfilled") res[keys[i]] = o.value;
    else {
      res[keys[i]] = null;
      errors[keys[i]] = String(o.reason && o.reason.message || o.reason);
    }
  });
  return { res, errors };
}
function send(res, data, maxAge = 300) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`);
  res.status(200).send(JSON.stringify(data));
}
function fail(res, err) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(502).send(JSON.stringify({ error: String(err && err.message || err) }));
}
var nyFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
function ny(ms) {
  const p = Object.fromEntries(nyFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, dow: p.weekday, date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute };
}
function addDays(dateStr, n) {
  const d = /* @__PURE__ */ new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
var NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", eacute: "é", euro: "€", pound: "£" };
var decode = (s) => {
  let t = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ");
  for (let i = 0; i < 3; i++) t = t.replace(/&amp;/g, "&");
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ""; } })
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(+n); } catch { return ""; } })
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
  return t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
};
function parseRSS(xml, source) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  for (const b of blocks) {
    const tag = (n) => {
      const m = b.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`));
      return m ? decode(m[1]) : "";
    };
    let link = tag("link");
    if (!link) {
      const m = b.match(/<link[^>]*href="([^"]+)"/);
      link = m ? m[1] : "";
    }
    const title = tag("title");
    if (!title) continue;
    const date = tag("pubDate") || tag("published") || tag("updated") || tag("dc:date");
    const t = Date.parse(date);
    items.push({ title, link, summary: tag("description").slice(0, 300) || tag("summary").slice(0, 300), time: isNaN(t) ? null : t, source });
  }
  return items;
}
var _memo = /* @__PURE__ */ new Map();
function memo(key, ttlMs, fn) {
  const hit = _memo.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.p;
  const p = fn();
  _memo.set(key, { t: Date.now(), p });
  p.catch(() => _memo.delete(key));
  return p;
}
function yahooChart(symbol, opts = {}) {
  const { interval = "15m", range = "10d" } = opts;
  return memo(`yc:${symbol}:${interval}:${range}`, 6e4, () => yahooChartRaw(symbol, { interval, range }));
}
async function yahooChartRaw(symbol, { interval = "15m", range = "10d" } = {}) {
  const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&includePrePost=true`;
  let j;
  try {
    j = await getJSON("https://query1.finance.yahoo.com" + path);
  } catch (e) {
    j = await getJSON("https://query2.finance.yahoo.com" + path);
  }
  const r = j && j.chart && j.chart.result && j.chart.result[0];
  if (!r) throw new Error("No data for " + symbol);
  const q = r.indicators && r.indicators.quote && r.indicators.quote[0] || {};
  const bars = [];
  (r.timestamp || []).forEach((ts, i) => {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if ([o, h, l, c].some((v) => v == null || isNaN(v))) return;
    bars.push({ t: ts * 1e3, o, h, l, c, v: q.volume ? q.volume[i] || 0 : 0 });
  });
  return { meta: r.meta || {}, bars };
}
function tradingDays(bars, dayStart) {
  const days = [];
  let cur = null;
  for (const b of bars) {
    const n = ny(b.t);
    const key = dayStart > 0 && n.h >= dayStart ? addDays(n.date, 1) : n.date;
    if (!cur || cur.key !== key) {
      cur = { key, bars: [] };
      days.push(cur);
    }
    cur.bars.push({ ...b, n });
  }
  return days.filter((d) => d.bars.length > 2 || d === days[days.length - 1]);
}
var hi = (bs) => Math.max(...bs.map((b) => b.h));
var lo = (bs) => Math.min(...bs.map((b) => b.l));
function rangeOf(bs) {
  return bs.length ? { high: hi(bs), low: lo(bs) } : null;
}
function computeLevels(chart, dayStart) {
  const days = tradingDays(chart.bars, dayStart);
  if (days.length < 2) return null;
  const today = days[days.length - 1], prev = days[days.length - 2];
  const tb = today.bars;
  const last = tb[tb.length - 1];
  const price = chart.meta.regularMarketPrice ?? last.c;
  const prevClose = prev.bars[prev.bars.length - 1].c;
  const inWin = (from, to) => tb.filter((b) => from <= to ? b.n.mins >= from && b.n.mins < to : b.n.mins >= from || b.n.mins < to);
  const firstAt = (mins) => {
    const b = tb.find((b2) => b2.n.mins >= mins && b2.n.mins < mins + 30);
    return b ? b.o : null;
  };
  const midnight = tb.find((b) => b.n.h === 0 && b.n.mi < 30);
  const asia = dayStart > 0 ? rangeOf(tb.filter((b) => b.n.h >= 20)) : rangeOf(prev.bars.filter((b) => b.n.h >= 20));
  const london = rangeOf(inWin(120, 300));
  const adrDays = days.slice(-6, -1);
  const adr = adrDays.length ? adrDays.reduce((s, d) => s + (hi(d.bars) - lo(d.bars)), 0) / adrDays.length : null;
  const weekKey = (d) => {
    const x = /* @__PURE__ */ new Date(d + "T12:00:00Z");
    const day = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - day);
    return x.toISOString().slice(0, 10);
  };
  const thisWeek = days.filter((d) => weekKey(d.key) === weekKey(today.key));
  const lastWeek = days.filter((d) => weekKey(d.key) !== weekKey(today.key)).slice(-5);
  const weekOpen = thisWeek.length ? thisWeek[0].bars[0].o : null;
  const lastWeekClose = lastWeek.length && thisWeek.length ? lastWeek[lastWeek.length - 1].bars.slice(-1)[0].c : null;
  const pRange = { high: hi(prev.bars), low: lo(prev.bars) };
  return {
    price,
    prevClose,
    change: price - prevClose,
    changePct: (price - prevClose) / prevClose * 100,
    today: { high: hi(tb), low: lo(tb), open: tb[0].o },
    prevDay: { ...pRange, close: prevClose, mid: (pRange.high + pRange.low) / 2 },
    midnightOpen: midnight ? midnight.o : null,
    open830: dayStart === 18 ? firstAt(510) : null,
    open930: firstAt(570),
    asia,
    london,
    adr,
    week: thisWeek.length ? { open: weekOpen, high: Math.max(...thisWeek.map((d) => hi(d.bars))), low: Math.min(...thisWeek.map((d) => lo(d.bars))) } : null,
    lastWeek: lastWeek.length ? { high: Math.max(...lastWeek.map((d) => hi(d.bars))), low: Math.min(...lastWeek.map((d) => lo(d.bars))) } : null,
    weekendGap: weekOpen != null && lastWeekClose != null ? { from: lastWeekClose, to: weekOpen } : null,
    asOf: last.t,
    spark: tb.map((b) => +b.c.toFixed(6)).filter((_, i, a) => a.length < 80 || i % Math.ceil(a.length / 80) === 0)
  };
}
function quoteFromMeta(meta, bars) {
  const price = meta.regularMarketPrice ?? (bars.length ? bars[bars.length - 1].c : null);
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  return { price, prevClose: prev, change: price != null && prev ? price - prev : null, changePct: price != null && prev ? (price - prev) / prev * 100 : null };
}

// api/_lib/words.js
var FAKEOUT = "The first jump after a big number is often a head-fake. Plenty of traders let the first few minutes play out and wait to see which side gives up.";
var QUIET_BEFORE = "Price usually goes quiet and drifts sideways into the release, and those tight little ranges leave stop orders stacked just above and below.";
var EVENTS = [
  { re: /^core cpi|^cpi/i, name: "Inflation report (CPI)", what: "How fast everyday prices rose last month.", why: "Hotter than expected means rate cuts look further away, which usually hits stocks (especially tech) and lifts the dollar. Cooler is the opposite.", note: FAKEOUT },
  { re: /core pce|pce price/i, name: "The Fed\u2019s favorite inflation gauge (PCE)", what: "Another read on price rises, the one the Fed watches most.", why: "Usually less of a surprise than CPI because much of it can be worked out in advance, but a miss still moves rates and tech.", note: QUIET_BEFORE },
  { re: /^core ppi|^ppi/i, name: "Wholesale prices (PPI)", what: "Price changes for businesses before they reach shoppers.", why: "An early hint about where consumer inflation is heading.", note: FAKEOUT },
  { re: /non-farm employment change|non-farm payrolls/i, exclude: /adp/i, name: "Jobs report (NFP)", what: "How many jobs the US added last month.", why: "One of the biggest movers of the month. Strong jobs can mean higher rates for longer. Weak jobs can spark worry about the economy. Either way, expect fast swings.", note: "The 8:30 spike often runs one direction, grabs the orders sitting past the morning\u2019s high or low, then turns. The cleaner move tends to show up after 9:30." },
  { re: /adp non-farm/i, name: "Private jobs (ADP)", what: "A private estimate of job growth, out two days before the main jobs report.", why: "A preview, not the main event. Moves are usually smaller.", note: "" },
  { re: /unemployment rate/i, name: "Unemployment rate", what: "Share of people looking for work who can\u2019t find it.", why: "Released with the jobs report. A jump can shift the mood quickly toward rate cuts.", note: "" },
  { re: /average hourly earnings/i, name: "Wage growth", what: "How fast paychecks are growing.", why: "Fast wage growth can keep inflation sticky.", note: "" },
  { re: /unemployment claims|jobless claims/i, name: "Weekly jobless claims", what: "New filings for unemployment benefits last week.", why: "Usually a small mover unless the number is way off, or it lands on the same morning as something bigger.", note: "" },
  { re: /jolts/i, name: "Job openings (JOLTS)", what: "How many jobs businesses are trying to fill.", why: "Lands at 10:00, often right when the morning move is settling, so it can restart things.", note: "A 10:00 release can be the push that sends price back through the morning\u2019s range." },
  { re: /federal funds rate|fomc statement/i, name: "Fed rate decision (FOMC)", what: "The Federal Reserve sets interest rates at 2:00 PM.", why: "The biggest scheduled event there is. The decision itself is usually expected, so the real move comes from the wording and the press conference.", note: "Price tends to stall into 2:00, jerk one way on the headline, then often swing the other way once the press conference starts at 2:30. Many traders sit this one out." },
  { re: /fomc press conference/i, name: "Fed press conference", what: "The Fed Chair explains the decision and takes questions.", why: "A single sentence can reverse the 2:00 move.", note: "" },
  { re: /fomc meeting minutes|fomc minutes/i, name: "Fed meeting notes", what: "Detailed notes from the last Fed meeting.", why: "Can move markets if they show the Fed leaning a new way. Out at 2:00 PM.", note: "" },
  { re: /fed chair .* speaks|powell speaks/i, name: "Fed Chair speaking", what: "The head of the Fed speaks in public.", why: "Any hint about future rate moves can swing stocks, bonds and the dollar at once.", note: "Moves on speeches are often sharp and short. Watch whether price holds after the first reaction." },
  { re: /fomc member .* speaks|fed .* speaks/i, name: "Fed official speaking", what: "A Fed official gives a speech or interview.", why: "Usually small, unless they say something new about rates.", note: "" },
  { re: /core retail sales|retail sales/i, name: "Retail sales", what: "How much people spent in stores and online.", why: "Shows whether shoppers are still spending. A big miss can move stocks and the dollar.", note: FAKEOUT },
  { re: /gdp/i, name: "Economic growth (GDP)", what: "How fast the economy grew.", why: "The first estimate moves most. Later revisions rarely do.", note: "" },
  { re: /ism manufacturing pmi/i, name: "Factory survey (ISM)", what: "Purchasing managers rate how factories are doing.", why: "Above 50 means growing, below 50 shrinking. Comes out at 10:00.", note: "Out at 10:00, when the morning move often pauses. A surprise can push price back through the morning\u2019s range." },
  { re: /ism services pmi/i, name: "Services survey (ISM)", what: "How the services side of the economy is doing.", why: "Services are most of the US economy, and the prices part of this survey is watched for inflation.", note: "" },
  { re: /flash .*pmi/i, name: "Early business survey (Flash PMI)", what: "A first look at business activity this month.", why: "Usually a modest mover in the US. Bigger for Europe and the UK.", note: "" },
  { re: /consumer sentiment|consumer confidence/i, name: "Consumer mood", what: "A survey of how people feel about money and the economy.", why: "The inflation-expectations part gets the most attention.", note: "" },
  { re: /crude oil inventories/i, name: "Oil stockpiles", what: "How much crude the US has in storage.", why: "Moves oil prices at 10:30 Wednesday. Rarely moves stock indexes.", note: "" },
  { re: /durable goods/i, name: "Big-ticket orders", what: "Orders for long-lasting goods like machinery.", why: "Usually a small mover.", note: "" },
  { re: /empire state|philly fed/i, name: "Regional factory survey", what: "A snapshot of factories in one part of the country.", why: "Usually small. Sometimes an early hint for the national numbers.", note: "" },
  { re: /home sales|housing starts|building permits/i, name: "Housing data", what: "Home building and sales.", why: "Rarely moves index futures on its own.", note: "" },
  { re: /bond auction/i, name: "Government bond sale", what: "The Treasury sells bonds to investors.", why: "Weak demand pushes yields up, which can weigh on tech stocks around 1:00 PM.", note: "" },
  { re: /main refinancing rate|ecb press conference|monetary policy statement/i, cur: "EUR", name: "European Central Bank decision", what: "The ECB sets rates for the eurozone.", why: "Moves the euro the most. Can spill over into the dollar.", note: "" },
  { re: /official bank rate|boe|mpc/i, cur: "GBP", name: "Bank of England decision", what: "The UK\u2019s central bank sets rates.", why: "Moves the pound.", note: "" },
  { re: /boj|policy rate/i, cur: "JPY", name: "Bank of Japan decision", what: "Japan\u2019s central bank sets rates.", why: "Big for the yen, and sometimes for global markets when it surprises.", note: "" },
  { re: /bank holiday/i, name: "Bank holiday", what: "Banks are closed in this country.", why: "Thin trading. Moves can be slow, or jumpy with nobody around.", note: "" }
];
function explainEvent(ev) {
  const m = EVENTS.find((e) => e.re.test(ev.title) && !(e.exclude && e.exclude.test(ev.title)) && (!e.cur || e.cur === ev.country));
  if (m) return { name: m.name, what: m.what, why: m.why, note: m.note };
  const imp = ev.impact;
  return { name: ev.title, what: "", why: imp === "High" ? "Marked as a big one. Expect a fast reaction when it comes out." : imp === "Medium" ? "Can nudge prices, usually not for long." : "Rarely moves anything.", note: "" };
}
var THEMES = [
  { id: "memes", label: "Memecoins", re: /memecoin|meme coin|meme token|dogecoin|\bdoge\b|shiba inu|\bbonk\b|\bpepe\b|pump\.fun|\bwif\b|dogwifhat|fartcoin|rug ?pull/i, line: "Memecoins run on hype and attention, and buyers can disappear fast.", markets: ["memes", "crypto"] },
  { id: "crypto", label: "Crypto", re: /bitcoin|\bbtc\b|\bcrypto(currency|currencies)?\b|\bether(eum)?\b|\bsolana\b|stablecoin|coinbase|binance|\bxrp\b|blockchain|\btokens?\b|defi\b/i, line: "Crypto trades around the clock and reacts to interest-rate news the way tech stocks do, only bigger.", markets: ["crypto", "memes"] },
  { id: "gold", label: "Gold", re: /\bgold\b|bullion|precious metals?|\bsilver\b/i, line: "Gold tends to rise when people get nervous or expect lower interest rates.", markets: ["forex", "futures"] },
  { id: "rates", label: "Interest rates", re: /\bfed\b|fomc|powell|mortgage rates?|rate cuts?|rate hikes?|interest rates?|central bank|treasury yields?|bond yields?|\byields?\b|\becb\b|bank of england|bank of japan|\bboj\b|lagarde/i, line: "Interest-rate news moves almost everything. The dollar, bonds and tech stocks usually react first.", markets: ["futures", "forex", "options", "crypto"] },
  { id: "dollar", label: "Currencies", re: /\bdollar\b|\beuro\b|\byen\b|sterling|\bpound\b|\bcurrenc(y|ies)\b|\bforex\b|\bfx\b|\byuan\b|\brupiah\b|\brupee\b|\bfranc\b|\bpeso\b|\bwon\b/i, line: "Currency moves change what trade and foreign assets are worth. A stronger dollar usually weighs on gold and other currencies.", markets: ["forex"] },
  { id: "energy", label: "Oil and energy", re: /\boil\b|crude|opec|natural gas|gasoline|\bbrent\b|\blng\b|fuel prices/i, line: "Higher oil feeds inflation worries, which tends to weigh on stocks.", markets: ["futures", "forex"] },
  { id: "inflation", label: "Inflation", re: /inflation|\bcpi\b|\bppi\b|\bpce\b|consumer prices|price pressures/i, line: "Higher inflation means rate cuts take longer, which usually weighs on stocks.", markets: ["futures", "forex", "options"] },
  { id: "jobs", label: "Jobs", re: /jobs report|payrolls?\b|unemployment|jobless|labor market|labour market|hiring|layoffs/i, line: "Job numbers shape what the Fed does next.", markets: ["futures", "forex"] },
  { id: "earnings", label: "Earnings", re: /\bearnings\b|quarterly (results|profit|revenue|sales)|\bguidance\b|\brevenue\b|profit warning|\beps\b|beats? (estimates|expectations|forecasts)|miss(es|ed)? (estimates|expectations|forecasts)|\bq[1-4] (results|earnings|sales)/i, line: "Results from big companies can move their whole sector, and sometimes the index.", markets: ["futures", "options"] },
  { id: "ai", label: "AI and chips", re: /\bai\b|artificial intelligence|nvidia|semiconductor|chipmakers?|\bchips?\b|openai|data centers?/i, line: "AI and chip stocks are a big part of the Nasdaq. When they move, the index moves.", markets: ["futures", "options"] },
  { id: "trade", label: "Trade and tariffs", re: /tariffs?|trade war|trade deal|trade talks|export controls?|export curbs|sanctions?|\bcurbs\b/i, line: "Trade headlines hit fast and often get walked back, so first moves can be overdone.", markets: ["futures", "forex", "crypto"] },
  { id: "world", label: "World events", re: /\bwar\b|missile|attacks?\b|strikes? on|\biran\b|israel|russia|ukraine|taiwan|north korea|ceasefire|conflict|houthi|middle east/i, line: "Conflict headlines usually knock prices down fast. If things don't escalate, buyers often return.", markets: ["futures", "forex", "crypto"] },
  { id: "growth", label: "Economy", re: /\beconom(y|ies|ic growth)\b|\bgdp\b|recession|consumer spending|retail sales|factory (output|activity)|\bpmi\b/i, line: "Growth news shapes what investors expect for company profits and for interest rates.", markets: ["futures", "forex", "stocks"] },
  { id: "gov", label: "Washington", re: /shutdown|debt ceiling|congress|white house|treasury secretary|senate|\btrump\b|election|midterms/i, line: "Policy news can shake markets, but it often fades unless real money is involved.", markets: ["futures", "forex", "crypto"] },
  { id: "options", label: "Volatility", re: /volatility|\bvix\b|options market|0dte|options expir|\bopex\b/i, line: "Options activity can pin prices near popular strike levels, especially on expiration days.", markets: ["options", "futures"] }
];
function tagHeadline(h) {
  const text = h.title + " " + (h.summary || "");
  const hits = THEMES.filter((t) => t.re.test(text));
  const primary = hits.find((t) => t.re.test(h.title)) || hits[0] || null;
  const markets = [...new Set(hits.flatMap((t) => t.markets))];
  const inTitle = primary && primary.re.test(h.title);
  return { ...h, theme: primary ? primary.id : null, themeLabel: primary ? primary.label : null, why: inTitle ? primary.line : null, markets };
}
var pct = (a, b) => (a - b) / b * 100;
function levelNotes(L, name, fmt) {
  if (!L) return [];
  const out = [];
  const p = L.price;
  if (L.midnightOpen != null) {
    out.push(p >= L.midnightOpen ? `${name} is above where it started at midnight (${fmt(L.midnightOpen)}). Buyers have had the upper hand overnight.` : `${name} is below where it started at midnight (${fmt(L.midnightOpen)}). Sellers have had the upper hand overnight.`);
  }
  const pd = L.prevDay;
  if (pd) {
    const tookHigh = L.today.high > pd.high, tookLow = L.today.low < pd.low;
    if (tookHigh && tookLow) out.push(`Price has already broken both yesterday\u2019s high and low. That\u2019s a wide, messy day, and both sides have been shaken out.`);
    else if (tookHigh) out.push(p > pd.high ? `Price pushed through yesterday\u2019s high (${fmt(pd.high)}) and is holding above it, a sign buyers mean it.` : `Price poked above yesterday\u2019s high (${fmt(pd.high)}) and slipped back under. Breaks that don\u2019t hold often turn into moves the other way.`);
    else if (tookLow) out.push(p < pd.low ? `Price broke under yesterday\u2019s low (${fmt(pd.low)}) and is staying there. Sellers are in control for now.` : `Price dipped under yesterday\u2019s low (${fmt(pd.low)}) and bounced back. Quick dips like that often clear out nervous sellers before a move higher.`);
    else out.push(`Still inside yesterday\u2019s range (${fmt(pd.low)} \u2013 ${fmt(pd.high)}). The first clean break of either end is the one to watch: lots of orders sit just past both.`);
    if (p > pd.mid) out.push(`It\u2019s trading in the upper half of yesterday\u2019s range, the pricier side, where buyers tend to get pickier.`);
    else out.push(`It\u2019s trading in the lower half of yesterday\u2019s range, the cheaper side, where buyers tend to show up.`);
  }
  if (L.asia && L.london) {
    const lh = L.london.high > L.asia.high, ll = L.london.low < L.asia.low;
    if (lh && !ll) out.push(`London ran above the overnight Asia high (${fmt(L.asia.high)}) early. Moves that grab the overnight high first sometimes reverse once New York opens.`);
    else if (ll && !lh) out.push(`London dipped under the overnight Asia low (${fmt(L.asia.low)}) early. Moves that grab the overnight low first sometimes reverse once New York opens.`);
    else if (!lh && !ll) out.push(`London stayed inside the Asia range. The overnight high (${fmt(L.asia.high)}) and low (${fmt(L.asia.low)}) are still untouched.`);
  }
  if (L.adr) {
    const used = (L.today.high - L.today.low) / L.adr * 100;
    if (used >= 85) out.push(`Today has already moved about ${Math.round(used)}% of a normal day. A lot of the day\u2019s move may already be in.`);
    else if (used <= 40) out.push(`Only about ${Math.round(used)}% of a normal day\u2019s move so far. There\u2019s room for a bigger swing.`);
  }
  if (L.weekendGap && Math.abs(pct(L.weekendGap.to, L.weekendGap.from)) > 0.05) {
    const a = Math.min(L.weekendGap.from, L.weekendGap.to), b = Math.max(L.weekendGap.from, L.weekendGap.to);
    const filled = L.week && L.week.low <= a && L.week.high >= b;
    out.push(filled ? `The weekend gap (${fmt(a)} \u2013 ${fmt(b)}) has already been filled this week.` : `There\u2019s still an unfilled weekend gap between ${fmt(a)} and ${fmt(b)}. Price often comes back to gaps like that.`);
  }
  return out;
}
function levelTable(L) {
  if (!L) return [];
  const rows = [];
  const add = (label, v, hint) => {
    if (v != null && isFinite(v)) rows.push({ label, value: v, hint });
  };
  add("Yesterday\u2019s high", L.prevDay && L.prevDay.high, "Stop orders tend to pile up just above");
  add("Yesterday\u2019s low", L.prevDay && L.prevDay.low, "Stop orders tend to pile up just below");
  add("Middle of yesterday", L.prevDay && L.prevDay.mid, "Above = pricey side, below = cheap side");
  add("Midnight open", L.midnightOpen, "Where the New York day started");
  add("8:30 open", L.open830, "Price when the morning news hits");
  add("Overnight high", L.asia && L.asia.high, "Asia session top");
  add("Overnight low", L.asia && L.asia.low, "Asia session bottom");
  add("London high", L.london && L.london.high, "2\u20135 AM New York time");
  add("London low", L.london && L.london.low, "2\u20135 AM New York time");
  add("Week open", L.week && L.week.open, "Where this week started");
  add("Last week\u2019s high", L.lastWeek && L.lastWeek.high, "Bigger target above");
  add("Last week\u2019s low", L.lastWeek && L.lastWeek.low, "Bigger target below");
  return rows.sort((a, b) => b.value - a.value);
}

// api/calendar.js
var FEEDS = {
  thisWeek: "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  nextWeek: "https://nfs.faireconomy.media/ff_calendar_nextweek.json"
};
async function build() {
  const { res, errors } = await settle({ thisWeek: getJSON(FEEDS.thisWeek), nextWeek: getJSON(FEEDS.nextWeek) });
  if (!res.thisWeek && !res.nextWeek) throw new Error("Calendar unavailable: " + Object.values(errors).join("; "));
  const seen = /* @__PURE__ */ new Set();
  const events = [...res.thisWeek || [], ...res.nextWeek || []].map((e) => ({ ...e, time: Date.parse(e.date) })).filter((e) => !isNaN(e.time)).filter((e) => {
    const k = e.title + e.country + e.time;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((e) => ({ title: e.title, country: e.country, impact: e.impact, forecast: decode(e.forecast || "").replace(/\u00a0/g, " ").trim(), previous: decode(e.previous || "").replace(/\u00a0/g, " ").trim(), time: e.time, allDay: /T00:00:00/.test(e.date) && /holiday|meeting|summit|election/i.test(e.title), ...explainEvent(e) })).sort((a, b) => a.time - b.time);
  if (errors.nextWeek && /404/.test(errors.nextWeek)) delete errors.nextWeek;
  return { events, errors, updated: Date.now() };
}

// api/markets.js
var SETS = {
  futures: {
    levels: [["NQ=F", "Nasdaq 100 futures", "NQ", 2, 18], ["ES=F", "S&P 500 futures", "ES", 2, 18]],
    quotes: [["YM=F", "Dow futures", "YM", 0], ["RTY=F", "Russell 2000 futures", "RTY", 1], ["^NDX", "Nasdaq 100 index", "NDX", 2], ["^GSPC", "S&P 500 index", "SPX", 2], ["^DJI", "Dow Jones index", "Dow", 0], ["^RUT", "Russell 2000 index", "RUT", 2], ["CL=F", "Crude oil", "Oil", 2], ["GC=F", "Gold", "Gold", 1], ["^VIX", "Fear gauge (VIX)", "VIX", 2], ["^TNX", "10-year yield", "10Y", 3], ["DX-Y.NYB", "US dollar index", "DXY", 2]]
  },
  forex: {
    levels: [["EURUSD=X", "Euro / US dollar", "EUR/USD", 5, 17], ["GBPUSD=X", "Pound / US dollar", "GBP/USD", 5, 17], ["USDJPY=X", "US dollar / Yen", "USD/JPY", 3, 17], ["GC=F", "Gold", "Gold", 1, 18]],
    quotes: [["AUDUSD=X", "Aussie / US dollar", "AUD/USD", 5], ["USDCAD=X", "US dollar / Loonie", "USD/CAD", 5], ["USDCHF=X", "US dollar / Franc", "USD/CHF", 5], ["NZDUSD=X", "Kiwi / US dollar", "NZD/USD", 5], ["EURGBP=X", "Euro / Pound", "EUR/GBP", 5], ["DX-Y.NYB", "US dollar index", "DXY", 2], ["^TNX", "10-year yield", "10Y", 3]]
  },
  options: {
    levels: [],
    quotes: [["^VIX", "S&P fear gauge (VIX)", "VIX", 2], ["^VIX9D", "9-day VIX", "VIX9D", 2], ["^VIX3M", "3-month VIX", "VIX3M", 2], ["^VXN", "Nasdaq fear gauge (VXN)", "VXN", 2], ["^GSPC", "S&P 500 index", "SPX", 2], ["^NDX", "Nasdaq 100 index", "NDX", 2], ["SPY", "S&P 500 ETF", "SPY", 2], ["QQQ", "Nasdaq 100 ETF", "QQQ", 2]]
  }
};
async function quote([sym, name, short, dp]) {
  const c = await yahooChart(sym, { interval: "15m", range: "1d" });
  const q = quoteFromMeta(c.meta, c.bars);
  return { symbol: sym, name, short, dp, ...q, spark: c.bars.map((b) => b.c).filter((_, i, a) => a.length < 60 || i % Math.ceil(a.length / 60) === 0) };
}
async function withLevels([sym, name, short, dp, dayStart]) {
  const c = await yahooChart(sym, { interval: "15m", range: "10d" });
  const L = computeLevels(c, dayStart);
  if (!L) throw new Error("Not enough data for " + sym);
  const fmt = (v) => v == null ? "\u2014" : Number(v).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return { symbol: sym, name, short, dp, price: L.price, prevClose: L.prevClose, change: L.change, changePct: L.changePct, spark: L.spark, levels: L, table: levelTable(L), notes: levelNotes(L, short, fmt) };
}
function vixWords(v) {
  if (v == null) return null;
  if (v < 14) return "very calm. Moves tend to be slow and grind-y";
  if (v < 18) return "calm to normal";
  if (v < 24) return "a bit nervous. Expect bigger swings than usual";
  if (v < 32) return "nervous. Big intraday swings are likely";
  return "fearful. Expect violent moves both ways";
}
function macroLines(byShort) {
  const lines = [];
  const vix = byShort.VIX, tnx = byShort["10Y"], dxy = byShort.DXY;
  if (vix && vix.price != null) lines.push(`The fear gauge (VIX) is at ${vix.price.toFixed(1)}, which reads as ${vixWords(vix.price)}.`);
  if (tnx && tnx.change != null && Math.abs(tnx.change) >= 0.02) lines.push(tnx.change > 0 ? `Bond yields are rising (10-year at ${tnx.price.toFixed(2)}%). That usually weighs on tech stocks.` : `Bond yields are falling (10-year at ${tnx.price.toFixed(2)}%). That tends to help tech stocks.`);
  if (dxy && dxy.changePct != null && Math.abs(dxy.changePct) >= 0.15) lines.push(dxy.changePct > 0 ? `The dollar is firmer today. That can lean on gold, the euro and stocks.` : `The dollar is softer today. That tends to help gold, the euro and stocks.`);
  return lines;
}
function thirdFriday(y, m) {
  const d = new Date(Date.UTC(y, m, 1));
  const off = (5 - d.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(y, m, 1 + off + 14)).toISOString().slice(0, 10);
}
function opexInfo() {
  const n = ny(Date.now());
  let list = [];
  for (let k = 0; k < 4; k++) {
    const y = n.y + Math.floor((n.mo - 1 + k) / 12), m = (n.mo - 1 + k) % 12;
    list.push({ date: thirdFriday(y, m), quarterly: [2, 5, 8, 11].includes(m) });
  }
  list = list.filter((x) => x.date >= n.date).slice(0, 3);
  const next = list[0];
  const daysTo = Math.round((Date.parse(next.date) - Date.parse(n.date)) / 864e5);
  return { today: n.date, next, upcoming: list, daysTo, isFriday: n.dow === "Fri" };
}
async function build2(section = "futures") {
  const set = SETS[section];
  if (!set) throw new Error("Unknown section");
  const jobs = {};
  set.levels.forEach((s) => {
    jobs["L:" + s[2]] = withLevels(s);
  });
  set.quotes.forEach((s) => {
    if (!jobs["L:" + s[2]]) jobs["Q:" + s[2]] = quote(s);
  });
  const { res, errors } = await settle(jobs);
  const leaders = set.levels.map((s) => res["L:" + s[2]]).filter(Boolean);
  const quotes = set.quotes.map((s) => res["Q:" + s[2]] || res["L:" + s[2]]).filter(Boolean);
  const byShort = Object.fromEntries([...leaders, ...quotes].map((x) => [x.short, x]));
  const out = { section, leaders, quotes, macro: macroLines(byShort), errors, updated: Date.now() };
  if (section === "forex") {
    const pairs = [...leaders, ...quotes].filter((x) => /^[A-Z]{3}\/[A-Z]{3}$/.test(x.short) && x.changePct != null);
    const score2 = {}, cnt = {};
    pairs.forEach((p) => {
      const [b, q] = p.short.split("/");
      score2[b] = (score2[b] || 0) + p.changePct;
      cnt[b] = (cnt[b] || 0) + 1;
      score2[q] = (score2[q] || 0) - p.changePct;
      cnt[q] = (cnt[q] || 0) + 1;
    });
    out.strength = Object.keys(score2).map((c) => ({ ccy: c, score: score2[c] / cnt[c] })).sort((a, b) => b.score - a.score);
  }
  if (section === "options") {
    const v = byShort.VIX, v9 = byShort.VIX9D, v3 = byShort.VIX3M, vxn = byShort.VXN, spx = byShort.SPX, ndx = byShort.NDX;
    const em = (px, iv) => px && iv ? px.price * (iv.price / 100) / Math.sqrt(252) : null;
    out.expectedMove = [
      spx && v ? { name: "S&P 500", short: "SPX", price: spx.price, move: em(spx, v), dp: 0 } : null,
      ndx && vxn ? { name: "Nasdaq 100", short: "NDX", price: ndx.price, move: em(ndx, vxn), dp: 0 } : null
    ].filter(Boolean);
    const lines = [];
    if (v9 && v && v3) {
      if (v9.price > v.price && v.price > v3.price) lines.push("Short-term fear is higher than long-term fear. Traders are paying up for protection over the next few days, which usually happens right before or during a scare.");
      else if (v.price > v3.price) lines.push("Near-term fear is running above the longer-term average. Things feel jumpy right now.");
      else lines.push("Longer-dated fear is higher than short-term fear, the normal, relaxed shape. Nothing urgent is priced in.");
    }
    out.opex = opexInfo();
    out.structure = lines;
  }
  return out;
}

// api/crypto.js
var CG = "https://api.coingecko.com/api/v3";
function fearWords(v) {
  if (v == null) return null;
  if (v <= 24) return "extreme fear. People are scared, which has often been closer to a bottom than a top";
  if (v <= 44) return "fear. People are cautious";
  if (v <= 55) return "neutral";
  if (v <= 74) return "greed. People are getting confident";
  return "extreme greed. Everyone is excited, which has often been closer to a top than a bottom";
}
async function build3() {
  const { res, errors } = await settle({
    global: getJSON(`${CG}/global`),
    markets: getJSON(`${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=true&price_change_percentage=24h,7d`),
    trending: getJSON(`${CG}/search/trending`),
    fng: getJSON("https://api.alternative.me/fng/?limit=2"),
    btc: yahooChart("BTC-USD", { interval: "15m", range: "10d" })
  });
  const g = res.global && res.global.data;
  const coins = (res.markets || []).filter((c) => !/usd|^dai$|^usds$/i.test(c.symbol) && !/wrapped|staked|bridged/i.test(c.name)).map((c) => ({
    id: c.id,
    name: c.name,
    symbol: c.symbol.toUpperCase(),
    image: c.image,
    price: c.current_price,
    mcap: c.market_cap,
    ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h,
    ch7: c.price_change_percentage_7d_in_currency,
    vol: c.total_volume,
    spark: c.sparkline_in_7d ? c.sparkline_in_7d.price.filter((_, i) => i % 3 === 0) : []
  })).slice(0, 15);
  const trending = (res.trending && res.trending.coins || []).slice(0, 10).map((x) => ({ name: x.item.name, symbol: x.item.symbol, rank: x.item.market_cap_rank, image: x.item.small, ch24: x.item.data && x.item.data.price_change_percentage_24h ? x.item.data.price_change_percentage_24h.usd : null, price: x.item.data ? x.item.data.price : null }));
  const f = res.fng && res.fng.data && res.fng.data[0];
  let btc = null;
  if (res.btc) {
    const L = computeLevels(res.btc, 0);
    if (L) {
      const fmt = (v) => v == null ? "\u2014" : "$" + Math.round(v).toLocaleString("en-US");
      btc = { price: L.price, changePct: L.changePct, levels: L, table: levelTable(L), notes: levelNotes(L, "Bitcoin", fmt), spark: L.spark };
    }
  }
  const lines = [];
  if (g) {
    const mc = g.market_cap_change_percentage_24h_usd, dom = g.market_cap_percentage && g.market_cap_percentage.btc;
    if (mc != null) lines.push(`The whole crypto market is ${mc >= 0 ? "up" : "down"} ${Math.abs(mc).toFixed(1)}% over the last 24 hours.`);
    if (dom != null) lines.push(`Bitcoin makes up ${dom.toFixed(1)}% of all crypto value. ${dom > 58 ? "When that share is high, money is hiding in Bitcoin rather than chasing smaller coins." : dom < 50 ? "A lower share means money is flowing into smaller coins, a risk-on mood." : ""}`.trim());
  }
  if (f) lines.push(`The crypto mood index reads ${f.value}/100: ${fearWords(+f.value)}.`);
  const alts = coins.filter((c) => !["BTC", "ETH", "USDT", "USDC"].includes(c.symbol) && c.ch24 != null);
  if (btc && alts.length) {
    const avg = alts.reduce((s, c) => s + c.ch24, 0) / alts.length;
    const btc24 = (coins.find((c) => c.symbol === "BTC") || {}).ch24;
    if (btc24 != null) lines.push(avg > btc24 + 1 ? "Smaller coins are outrunning Bitcoin today, a sign people are taking more risk." : avg < btc24 - 1 ? "Smaller coins are lagging Bitcoin today. People are playing it safer." : "Smaller coins are moving roughly in step with Bitcoin.");
  }
  return {
    summary: g ? { mcap: g.total_market_cap.usd, vol: g.total_volume.usd, mcapChange: g.market_cap_change_percentage_24h_usd, btcDom: g.market_cap_percentage.btc, ethDom: g.market_cap_percentage.eth } : null,
    fear: f ? { value: +f.value, label: f.value_classification, words: fearWords(+f.value) } : null,
    coins,
    trending,
    btc,
    lines,
    errors,
    updated: Date.now()
  };
}

// api/memes.js
var DS = "https://api.dexscreener.com";
function tokenNotes(p) {
  const notes = [];
  const liq = p.liquidity && p.liquidity.usd, vol = p.volume && p.volume.h24, ageH = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 36e5 : null;
  if (ageH != null && ageH < 24) notes.push({ tone: "warn", text: `Brand new: trading for ${Math.max(1, Math.round(ageH))}h` });
  else if (ageH != null && ageH < 24 * 7) notes.push({ tone: "info", text: `Less than a week old` });
  if (liq != null && liq < 5e4) notes.push({ tone: "warn", text: "Thin liquidity: small orders move price a lot, and getting out can be hard" });
  else if (liq != null && liq > 1e6) notes.push({ tone: "ok", text: "Deep liquidity for a memecoin" });
  if (liq && vol && vol / liq > 8) notes.push({ tone: "info", text: "Very heavy trading for its size. Lots of attention right now" });
  const h1 = p.priceChange && p.priceChange.h1, h24 = p.priceChange && p.priceChange.h24;
  if (h24 > 100 && h1 != null && h1 < -5) notes.push({ tone: "warn", text: "Big run today, but it\u2019s cooling off this hour" });
  if (h24 < -40) notes.push({ tone: "warn", text: "Down hard today" });
  return notes;
}
function cleanDesc(d) {
  d = String(d || "").replace(/https?:\/\/\S+/g, "").replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, "").replace(/\s+/g, " ").trim();
  if (d.length > 220) d = d.slice(0, 220).replace(/\s\S*$/, "") + "…";
  return d;
}
var MEME_ABOUT = {
  DOGE: "The original memecoin, started as a joke in 2013 with the Shiba Inu dog. It moves with Bitcoin and with anything Elon Musk says about it.",
  SHIB: "A Dogecoin spin-off on Ethereum that grew its own ecosystem, including an exchange and a layer 2 network.",
  PEPE: "Named after the Pepe the Frog meme. The biggest memecoin on Ethereum, with no team roadmap and no utility.",
  BONK: "Solana’s dog coin, airdropped to the Solana community in late 2022. It tends to rise and fall with Solana itself.",
  WIF: "dogwifhat: a Shiba Inu wearing a knitted hat. One of the defining Solana memecoins of 2024.",
  TRUMP: "The official Trump memecoin, launched days before the January 2025 inauguration. It moves on Trump-related news and on token unlocks.",
  FLOKI: "Named after Elon Musk’s dog. Positions itself as a meme brand with a game and other products.",
  FARTCOIN: "A Solana memecoin born from an AI agent’s joke. Its whole story is that it is absurd, which is the point.",
  PENGU: "The token of the Pudgy Penguins NFT brand, which also sells toys and runs social media accounts.",
  SPX: "SPX6900: a parody of the S&P 500 that jokes about flipping the stock market.",
  MOG: "An internet-culture coin on Ethereum built around the slang word “mog”, meaning to outshine someone.",
  POPCAT: "A Solana coin based on the “pop cat” meme of a cat opening its mouth.",
  BRETT: "The best-known memecoin on Base, named after a character from the Boy’s Club comic, Pepe’s friend.",
  MEW: "“cat in a dogs world”: a Solana coin pitching cats against the many dog coins.",
  PNUT: "Named after Peanut the squirrel, whose story went viral in late 2024.",
  GOAT: "Goatseus Maximus: a coin promoted by an AI chatbot, which kicked off the AI-agent memecoin trend.",
  TURBO: "An Ethereum coin whose idea and design were created with ChatGPT.",
  NEIRO: "Named after the Shiba Inu adopted by the owner of the original Doge dog.",
  BOME: "Book of Meme: a Solana coin that raised money in a presale and pitched itself as an archive of memes.",
  MOODENG: "Named after Moo Deng, the viral baby pygmy hippo from a Thai zoo.",
  CHILLGUY: "Based on the “just a chill guy” dog cartoon meme.",
  GIGA: "Gigachad: built around the meme of an exaggeratedly confident, muscular man.",
  BABYDOGE: "Baby Doge Coin: a BNB Chain Dogecoin offshoot that charges a fee on transfers.",
  AI16Z: "A Solana token tied to an AI agent framework, part of the AI-agent coin trend.",
  USELESS: "A Solana coin whose pitch is that it has no use at all."
};
// ---------- memecoin thesis (written from live data; AI rewrites it when available) ----------
var MAJOR_TICKERS = { BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", BNB: "BNB", XRP: "XRP", DOGE: "Dogecoin", ADA: "Cardano", TRX: "Tron", TON: "Toncoin", USDT: "Tether", USDC: "USD Coin", XMR: "Monero", LTC: "Litecoin", SHIB: "Shiba Inu", PEPE: "Pepe" };
var NARR = [
  [/\b(gta|game|gaming|play|arcade|minecraft|roblox|fortnite)\b|gta6/i, "Gaming hype", "It borrows attention from a big gaming moment or brand. These coins live and die with the buzz around that game, and they are not connected to the game’s maker."],
  [/\b(ai|agent|gpt|bot|neural|robot|agi)\b|ai16z/i, "AI theme", "It rides the AI trend: coins named after AI agents or chatbots. Most have no working AI product. The name is the pitch."],
  [/trump|maga|biden|kamala|elon|musk|kanye|drake|taylor|melania|barron|vance/i, "Public figure", "It is named after a well-known person. Unless that person says otherwise, assume it is unofficial. These coins jump on that person’s headlines and fade fast."],
  [/\b(monero|bitcoin|ethereum|solana|xrp|cardano|litecoin)\b/i, "Spin-off of a big coin", "It is a joke spin-off of an established coin. It is not connected to that coin’s developers and does not share its technology."],
  [/\b(inu|dog|doge\w*|shib|puppy|pup|wif|bonk|corgi|shiba|doggo)\b/i, "Dog coin", "Dog coins are the oldest memecoin category, following Dogecoin and Shiba Inu. New ones try to borrow that crowd."],
  [/\b(cat|kitty|meow|gato|popcat|mew|kitten|neko)\b|cat$/i, "Cat coin", "Cat coins pitch themselves as the challenger to the dog coins. The theme comes in waves when a big cat coin is running."],
  [/\b(pepe|frog|toad|brett)\b/i, "Frog / Pepe meme", "It belongs to the Pepe the Frog family of internet memes, one of the most traded memecoin themes."],
  [/\b(penguin|pengu|hippo|moo ?deng|squirrel|pnut|goat|monkey|ape|bear|bull|fish|duck)\b/i, "Viral animal", "It is built around a viral animal or animal meme. These spike when the animal trends online, then usually fade."],
  [/\b(titty|boob|butt|fart|poop|cum|sex|degen)\b/i, "Shock-humor meme", "Its whole pitch is crude humor meant to go viral. There is nothing behind it but attention."]
];
var NARR_SHORT = { "Gaming hype": "A gaming-hype coin", "AI theme": "An AI-themed coin", "Public figure": "A coin named after a public figure", "Spin-off of a big coin": "A joke spin-off of a big coin", "Dog coin": "A dog coin", "Cat coin": "A cat coin", "Frog / Pepe meme": "A Pepe-style frog coin", "Viral animal": "A viral-animal coin", "Shock-humor meme": "A shock-humor coin", "Pure attention play": "A pure attention play" };
function narrativeOf(name, desc) {
  const d = String(desc || "").replace(/\b(on|built on|launched on|native to)\s+(solana|ethereum|base|bsc|bnb chain|sui|tron)\b/gi, "");
  const hit = NARR.find(([re]) => re.test(name)) || NARR.find(([re]) => re.test(d));
  return hit ? { label: hit[1], text: hit[2] } : { label: "Pure attention play", text: "There is no clear theme beyond the name and the community around it. Its price depends entirely on how many people keep talking about it." };
}
var fpct = (v, dp = 0) => v == null || !isFinite(v) ? "n/a" : `${v > 0 ? "+" : ""}${v.toFixed(Math.abs(v) < 10 ? 1 : dp)}%`;
var money2 = (v) => v == null ? "unknown" : v >= 1e9 ? "$" + (v / 1e9).toFixed(1) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(1) + "M" : v >= 1e3 ? "$" + Math.round(v / 1e3) + "K" : "$" + Math.round(v);
function sizeTier(m) {
  if (m == null) return "";
  if (m < 1e5) return "a micro-cap (under $100K), which is lottery-ticket territory";
  if (m < 1e6) return "tiny (under $1M), so a few buyers can double it and a few sellers can halve it";
  if (m < 1e7) return "small (under $10M) for a memecoin";
  if (m < 1e8) return "mid-sized for a memecoin";
  return "large for a memecoin";
}
function thesisFor(t, p, mood) {
  const sym = String(t.symbol || "").toUpperCase();
  const narr = narrativeOf(t.name, t.desc);
  const ageH = t.created ? (Date.now() - t.created) / 36e5 : null;
  const age = ageH == null ? "" : ageH < 1 ? "less than an hour" : ageH < 48 ? `${Math.round(ageH)} hours` : `${Math.round(ageH / 24)} days`;
  const ch1 = t.ch1, ch6 = p && p.priceChange && p.priceChange.h6, ch24 = t.ch24;
  const buys = p && p.txns && p.txns.h24 ? p.txns.h24.buys : null, sells = p && p.txns && p.txns.h24 ? p.txns.h24.sells : null;
  const liqPct = t.liq && t.mcap ? t.liq / t.mcap * 100 : null;
  const turn = t.liq && t.vol24 ? t.vol24 / t.liq : null;
  const copy = MAJOR_TICKERS[sym] && !new RegExp(MAJOR_TICKERS[sym], "i").test(t.name) ? MAJOR_TICKERS[sym] : null;
  const socials = (t.links || []).map((l) => (l.type || "").toLowerCase());
  const hasX = socials.some((x) => /twitter|^x$/.test(x)), hasTg = socials.includes("telegram"), hasWeb = socials.includes("website");

  let stage, stageTxt;
  if (ch24 != null && ch24 <= -80) { stage = "Collapsed"; stageTxt = `It has collapsed, ${fpct(ch24)} in 24 hours. A drop this size usually means the creator or early holders sold everything (often called a rug pull). Coins rarely recover from this.`; }
  else if (ch24 != null && ch24 <= -40) { stage = "Falling hard"; stageTxt = `It is falling hard, ${fpct(ch24)} in 24 hours. Early buyers are taking profits or leaving, and new buyers are not stepping in.`; }
  else if (ch24 != null && ch24 >= 100 && ch1 != null && ch1 < -5) { stage = "Cooling after a run"; stageTxt = `It ran ${fpct(ch24)} in 24 hours but is ${fpct(ch1)} in the last hour, a sign the first wave of buyers is cashing out.`; }
  else if (ch24 != null && ch24 >= 100) { stage = "Pumping"; stageTxt = `It is in a strong run, ${fpct(ch24)} in 24 hours${ch1 != null ? ` and ${fpct(ch1)} in the last hour` : ""}. Runs like this attract late buyers, which is also when they tend to end.`; }
  else if (ch24 != null && ch24 >= 15) { stage = "Climbing"; stageTxt = `It is climbing, ${fpct(ch24)} in 24 hours${ch6 != null ? ` (${fpct(ch6)} over 6 hours)` : ""}.`; }
  else if (ch24 != null && ch24 <= -15) { stage = "Sliding"; stageTxt = `It is sliding, ${fpct(ch24)} in 24 hours${ch6 != null ? ` (${fpct(ch6)} over 6 hours)` : ""}.`; }
  else { stage = "Flat"; stageTxt = `It is roughly flat, ${fpct(ch24)} in 24 hours. Attention has not picked a direction yet.`; }

  const doing = [stageTxt];
  if (t.mcap) doing.push(`At ${money2(t.mcap)} it is ${sizeTier(t.mcap)}.`);
  if (liqPct != null) doing.push(liqPct < 5 ? `Only ${money2(t.liq)} sits in its trading pool (${liqPct.toFixed(1)}% of its value). Selling even a modest amount would push the price down sharply.` : liqPct > 20 ? `Its trading pool holds ${money2(t.liq)}, a healthy ${liqPct.toFixed(0)}% of its value, so you can buy and sell without moving the price too much.` : `Its trading pool holds ${money2(t.liq)} (${liqPct.toFixed(0)}% of its value). That is workable, but large orders will still move the price.`);
  if (turn != null) doing.push(turn > 10 ? `It traded ${money2(t.vol24)} today, ${turn.toFixed(0)} times its pool. That is frenzy-level activity, often bots and fast flippers.` : turn > 2 ? `It traded ${money2(t.vol24)} today, which shows real attention.` : `Trading is quiet at ${money2(t.vol24)} today.`);
  if (buys != null && sells != null && buys + sells > 50) doing.push(buys > sells * 1.3 ? `Buyers outnumber sellers (${buys.toLocaleString()} buys vs ${sells.toLocaleString()} sells today).` : sells > buys * 1.3 ? `Sellers outnumber buyers (${sells.toLocaleString()} sells vs ${buys.toLocaleString()} buys today).` : `Buys and sells are roughly even (${buys.toLocaleString()} vs ${sells.toLocaleString()}).`);

  const what = [`${t.name} (${sym}) is a memecoin on ${t.chain ? t.chain[0].toUpperCase() + t.chain.slice(1) : "an unknown chain"}${age ? `, trading for ${age}` : ""}.`];
  if (t.about) what.push(t.about);
  else if (t.desc) what.push(`Its creators describe it as: “${t.desc}”`);
  else what.push("Its creators have not published a description.");
  if (copy) what.push(`Warning: it uses the ticker ${sym}, which belongs to ${copy}. It has nothing to do with ${copy}. Copycat tickers are a common way to catch careless buyers.`);

  const bull = [], bear = [];
  if (ch24 > 15 && stage !== "Cooling after a run") bull.push("Momentum is on its side right now, and memecoins often keep running while attention grows.");
  if (turn > 2) bull.push("Heavy trading means people are watching it, and attention is the fuel for any memecoin.");
  if (liqPct != null && liqPct > 15) bull.push("A deep pool for its size makes it easier for bigger buyers to get in.");
  if (hasX || hasTg) bull.push(`It has ${[hasX && "an X account", hasTg && "a Telegram group", hasWeb && "a website"].filter(Boolean).join(", ")}, so there is a community that can keep promoting it.`);
  if (t.boosts) bull.push("Someone is paying to promote it on DexScreener, which puts it in front of more buyers.");
  if (mood && mood.word && ["hot", "warm"].includes(mood.word)) bull.push("The wider memecoin market is in a good mood today.");
  if (!bull.length) bull.push("A new wave of attention, such as a viral post or a big account mentioning it, could revive it.");
  if (ageH != null && ageH < 72) bear.push("It is only days old or less. Most tokens this new go to zero within weeks.");
  if (liqPct != null && liqPct < 5) bear.push("The thin pool means you may not be able to sell near the price you see.");
  if (ch24 <= -40) bear.push("The sharp drop suggests insiders or early buyers have already left.");
  if (stage === "Cooling after a run" || ch24 > 200) bear.push("After a run this big, late buyers are usually the ones left holding when it reverses.");
  if (!t.desc && !t.about) bear.push("No stated purpose or team, so nothing holds the price up except hype.");
  if (copy) bear.push(`The borrowed ${sym} ticker is a red flag.`);
  if (mood && mood.word && ["cold", "cool"].includes(mood.word)) bear.push("The wider memecoin market is weak today, which makes it harder for any single coin to hold gains.");
  if (!hasX && !hasTg && !hasWeb) bear.push("No social links, which makes it hard to tell who is behind it.");
  bear.push("Memecoins have no earnings or product to fall back on. If attention moves on, the price usually goes with it.");

  let risk = "High";
  if (stage === "Collapsed" || (liqPct != null && liqPct < 3) || (ageH != null && ageH < 24) || copy || (t.mcap != null && t.mcap < 1e5)) risk = "Extreme";
  else if ((ageH != null && ageH < 24 * 14) || (t.mcap != null && t.mcap < 1e7)) risk = "Very high";

  const watch = stage === "Collapsed" ? "Whether trading dries up completely. If volume disappears, the coin is effectively dead."
    : stage === "Pumping" || stage === "Cooling after a run" ? "Whether the price holds above where the run started its last leg. A fast give-back of half the gains usually means the run is over."
    : liqPct != null && liqPct < 5 ? "Whether the pool grows. Rising liquidity would mean more serious money is coming in."
    : "Whether volume rises with the price. Price moves without volume rarely last.";

  const chainN = t.chain ? t.chain[0].toUpperCase() + t.chain.slice(1) : "an unknown chain";
  const headline = `${NARR_SHORT[narr.label] || "A memecoin"} on ${chainN}${ageH != null && ageH < 72 ? `, ${age} old` : ""}, ${stage === "Cooling after a run" ? "cooling after a big run" : stage.toLowerCase()}`;
  return { headline, what: what.join(" "), narrative: narr.label + ". " + narr.text, doing: doing.join(" "), bull, bear: [...new Set(bear)].slice(0, 5), watch, risk, stage, source: "data" };
}
function thesisMajor(c, mood) {
  const narr = narrativeOf(c.name, "");
  const doing = [`${c.name} is ${fpct(c.ch24)} today and ${fpct(c.ch7)} over the past week, worth about ${money2(c.mcap)}.`];
  doing.push(c.ch7 > 15 ? "It is in a strong week, which usually means money is rotating into memecoins." : c.ch7 < -15 ? "It has had a rough week, a sign money is leaving memecoins." : "Its weekly move is modest. It is following the wider market rather than leading it.");
  if (mood && mood.text) doing.push("Across memecoins: " + mood.text.split(". ").slice(-1)[0]);
  return {
    headline: `${narr.label === "Pure attention play" ? "One of the biggest memecoins" : (NARR_SHORT[narr.label] || "A memecoin").replace(/^An? /, "An established ").replace("An established coin named", "An established coin named")}, ${c.ch7 > 5 ? "rising" : c.ch7 < -5 ? "falling" : "steady"} this week`,
    what: c.about || `${c.name} (${c.symbol}) is one of the largest memecoins by value.`,
    narrative: narr.label + ". " + narr.text,
    doing: doing.join(" "),
    bull: ["It is large and widely listed, so it is easy to buy and sell.", "Big memecoins usually lead when money flows back into the sector.", ...(c.ch7 > 5 ? ["It has momentum this week."] : [])],
    bear: ["It has no earnings or product. Its value depends on attention and the wider crypto mood.", "It usually falls harder than Bitcoin when crypto sells off.", ...(c.ch7 < -5 ? ["It is losing ground this week."] : [])],
    watch: "Bitcoin and the memecoin mood. Large memecoins rarely move against both.",
    risk: "High", stage: c.ch24 > 5 ? "Climbing" : c.ch24 < -5 ? "Sliding" : "Flat", source: "data"
  };
}
async function build4() {
  const { res, errors } = await settle({
    boosts: getJSON(`${DS}/token-boosts/top/v1`),
    profiles: getJSON(`${DS}/token-profiles/latest/v1`),
    majors: getJSON("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=meme-token&order=market_cap_desc&per_page=12&page=1&price_change_percentage=24h,7d")
  });
  const boosted = (res.boosts || []).slice(0, 30);
  const byChain = {};
  boosted.forEach((b) => {
    (byChain[b.chainId] = byChain[b.chainId] || []).push(b.tokenAddress);
  });
  const pairLists = await Promise.allSettled(Object.entries(byChain).map(([chain, addrs]) => getJSON(`${DS}/tokens/v1/${chain}/${addrs.slice(0, 30).join(",")}`)));
  const best = {};
  pairLists.forEach((r) => {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) return;
    r.value.forEach((p) => {
      const k = p.chainId + ":" + p.baseToken.address.toLowerCase();
      if (!best[k] || (p.liquidity && p.liquidity.usd || 0) > (best[k].liquidity && best[k].liquidity.usd || 0)) best[k] = p;
    });
  });
  const hot = boosted.map((b) => {
    const p = best[b.chainId + ":" + String(b.tokenAddress).toLowerCase()];
    if (!p) return null;
    return {
      name: p.baseToken.name,
      symbol: p.baseToken.symbol,
      chain: p.chainId,
      dex: p.dexId,
      url: p.url || b.url,
      icon: p.info && p.info.imageUrl || b.icon || null,
      price: +p.priceUsd || null,
      ch1: p.priceChange && p.priceChange.h1,
      ch24: p.priceChange && p.priceChange.h24,
      vol24: p.volume && p.volume.h24,
      liq: p.liquidity && p.liquidity.usd,
      mcap: p.marketCap || p.fdv || null,
      created: p.pairCreatedAt || null,
      boosts: b.totalAmount || null,
      desc: cleanDesc(b.description || p.info && p.info.description || ""),
      links: [...(b.links || []), ...(p.info && p.info.socials || []).map((x) => ({ type: x.type, url: x.url })), ...(p.info && p.info.websites || []).map((x) => ({ type: "website", url: x.url }))].filter((l) => l && l.url).slice(0, 4),
      about: MEME_ABOUT[(p.baseToken.symbol || "").toUpperCase()] || null,
      notes: tokenNotes(p),
      _p: p
    };
  }).filter(Boolean).filter((t) => (t.liq == null || t.liq >= 1500) && (t.mcap == null || t.mcap >= 1e4)).slice(0, 18);
  const majors = (res.majors || []).map((c) => ({ name: c.name, symbol: c.symbol.toUpperCase(), image: c.image, price: c.current_price, mcap: c.market_cap, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h, ch7: c.price_change_percentage_7d_in_currency, about: MEME_ABOUT[c.symbol.toUpperCase()] || null }));
  const avg0 = majors.length ? majors.reduce((a, c) => a + (c.ch24 || 0), 0) / majors.length : null;
  const mood0 = { word: avg0 == null ? "" : avg0 > 5 ? "hot" : avg0 > 1 ? "warm" : avg0 < -5 ? "cold" : avg0 < -1 ? "cool" : "flat", text: "" };
  hot.forEach((t) => { t.thesis = thesisFor(t, t._p, mood0); delete t._p; });
  majors.forEach((c) => { c.thesis = thesisMajor(c, mood0); });
  const lines = [];
  if (majors.length) {
    const up = majors.filter((c) => c.ch24 > 0).length;
    const avg = majors.reduce((s, c) => s + (c.ch24 || 0), 0) / majors.length;
    lines.push(`${up} of the ${majors.length} biggest memecoins are green today (average ${avg >= 0 ? "+" : ""}${avg.toFixed(1)}%). ${avg > 5 ? "The appetite for risk is strong." : avg < -5 ? "The appetite for risk is weak. Hype coins usually fall hardest when that happens." : "A mixed, choppy mood."}`);
  }
  const chains = {};
  hot.forEach((h) => {
    chains[h.chain] = (chains[h.chain] || 0) + 1;
  });
  const topChain = Object.entries(chains).sort((a, b) => b[1] - a[1])[0];
  if (topChain) lines.push(`Most of the attention right now is on ${topChain[0][0].toUpperCase() + topChain[0].slice(1)}: ${topChain[1]} of the ${hot.length} most-promoted tokens live there.`);
  return { hot, majors, lines, errors, updated: Date.now() };
}

// api/earnings.js
var HEAVY = ["AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "GOOG", "AVGO", "TSLA", "COST", "NFLX", "AMD", "ADBE", "PEP", "CSCO", "TMUS", "INTC", "QCOM", "TXN", "INTU", "AMAT", "MU", "PLTR", "JPM", "V", "MA", "LLY", "UNH", "WMT", "XOM", "ORCL", "CRM", "BRK.B"];
var money = (s) => {
  const n = parseFloat(String(s || "").replace(/[$,]/g, ""));
  return isNaN(n) ? null : n;
};
var when = (t) => /pre-market/i.test(t) ? "before" : /after-hours/i.test(t) ? "after" : "unknown";
async function build5() {
  const today = ny(Date.now()).date;
  const days = [];
  for (let i = 0; days.length < 5 && i < 9; i++) {
    const d = addDays(today, i);
    const w = (/* @__PURE__ */ new Date(d + "T12:00:00Z")).getUTCDay();
    if (w > 0 && w < 6) days.push(d);
  }
  const { res, errors } = await settle(Object.fromEntries(days.map((d) => [d, getJSON(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, { headers: { Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" } })])));
  const out = days.map((d) => {
    const rows = (res[d] && res[d].data && res[d].data.rows || []).map((r) => ({
      symbol: r.symbol,
      name: r.name,
      mcap: money(r.marketCap),
      when: when(r.time),
      eps: r.epsForecast || "",
      lastEps: r.lastYearEPS || "",
      heavy: HEAVY.includes(r.symbol)
    })).filter((r) => r.heavy || (r.mcap || 0) >= 2e10).sort((a, b) => b.heavy - a.heavy || (b.mcap || 0) - (a.mcap || 0));
    return { date: d, rows };
  });
  const heavyNext = out.flatMap((d) => d.rows.filter((r) => r.heavy).map((r) => ({ ...r, date: d.date })));
  const lines = heavyNext.length ? heavyNext.slice(0, 4).map((r) => `${r.name.replace(/,? (Inc|Corp|Corporation|Incorporated|Co)\.?$/i, "")} (${r.symbol}) reports ${r.date === today ? "today" : (/* @__PURE__ */ new Date(r.date + "T12:00:00Z")).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${r.when === "after" ? "after the close. The reaction shows up in futures that evening" : r.when === "before" ? "before the open, so it\u2019s part of the morning picture" : ""}.`) : ["None of the index heavyweights report in the next few days."];
  return { days: out, lines, errors, updated: Date.now() };
}

// api/news.js
var FEEDS2 = {
  "CNBC": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "CNBC Markets": "https://www.cnbc.com/id/20910258/device/rss/rss.html",
  "MarketWatch": "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  "MarketWatch Pulse": "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
  "WSJ Markets": "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
  "Federal Reserve": "https://www.federalreserve.gov/feeds/press_all.xml",
  "Investing.com Forex": "https://www.investing.com/rss/news_1.rss",
  "ECB": "https://www.ecb.europa.eu/rss/press.html",
  "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "Cointelegraph": "https://cointelegraph.com/rss",
  "Decrypt": "https://decrypt.co/feed"
};
var BY_SECTION = {
  all: Object.keys(FEEDS2),
  futures: ["CNBC", "CNBC Markets", "MarketWatch", "MarketWatch Pulse", "WSJ Markets", "Federal Reserve"],
  options: ["CNBC Markets", "MarketWatch Pulse", "WSJ Markets", "Federal Reserve", "CNBC"],
  forex: ["Investing.com Forex", "ECB", "Federal Reserve", "CNBC", "MarketWatch", "WSJ Markets"],
  crypto: ["CoinDesk", "Cointelegraph", "Decrypt"],
  memes: ["CoinDesk", "Cointelegraph", "Decrypt"]
};
async function build6(section = "all") {
  const names = BY_SECTION[section] || BY_SECTION.all;
  const { res, errors } = await settle(Object.fromEntries(names.map((n) => [n, getText(FEEDS2[n]).then((x) => parseRSS(x, n))])));
  const seen = /* @__PURE__ */ new Set();
  let items = names.flatMap((n) => res[n] || []).filter((i) => {
    const k = i.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map(tagHeadline);
  const cutoff = Date.now() - 3 * 864e5;
  items = items.filter((i) => !i.time || i.time > cutoff);
  if (section !== "all") {
    const relevant = items.filter((i) => i.markets.includes(section));
    items = relevant.length >= 8 ? relevant : [...relevant, ...items.filter((i) => !relevant.includes(i))];
  }
  items.sort((a, b) => (b.time || 0) - (a.time || 0));
  return { section, items: items.slice(0, 50), errors, updated: Date.now() };
}

// api/brief.js
var fmtTime = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
var dayName = (t) => new Date(t).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long" });
function headlineFor(todayBig, n) {
  if (n.dow === "Sat" || n.dow === "Sun" && n.h < 18) return "Markets are closed. Here\u2019s what the week ahead looks like.";
  const t = todayBig.map((e) => e.title).join(" ");
  if (/federal funds rate|fomc statement/i.test(t)) return "Fed day: a quiet morning, a loud afternoon";
  if (/non-farm/i.test(t)) return "Jobs report morning: the 8:30 number sets the tone";
  if (/cpi/i.test(t)) return "Inflation numbers at 8:30 set the tone";
  if (/pce/i.test(t)) return "The Fed\u2019s favorite inflation number lands this morning";
  if (/ppi/i.test(t)) return "Wholesale prices kick off the morning";
  if (/retail sales/i.test(t)) return "Shoppers in focus with retail sales";
  if (/speaks/i.test(t)) return "Fed talk is the main event today";
  if (todayBig.length) return `${todayBig[0].name} is the one to watch today`;
  return "A quiet calendar. Price levels do the talking today";
}
async function build7(selected = ["futures"]) {
  const want = new Set(selected);
  const now = Date.now(), n = ny(now);
  const jobs = { cal: build(), fut: build2("futures"), earn: build5(), news: build6("all") };
  if (want.has("forex")) jobs.fx = build2("forex");
  if (want.has("crypto") || want.has("memes")) jobs.crypto = build3();
  const { res } = await settle(jobs);
  const paragraphs = [];
  const facts = {};
  const events = res.cal && res.cal.events || [];
  const isToday = (e) => ny(e.time).date === n.date;
  const usdBig = events.filter((e) => e.country === "USD" && e.impact === "High");
  const todayBig = usdBig.filter(isToday);
  const later = todayBig.filter((e) => e.time > now - 15 * 6e4);
  if (todayBig.length) {
    const list = [...new Set(todayBig.map((e) => `${e.name.replace(/ \(.*\)/, "")} at ${fmtTime(e.time)}`))];
    const first = todayBig[0];
    paragraphs.push(`On the calendar: ${list.join(", ")}. ${first.why} ${first.note || ""}`.trim());
  } else {
    const med = events.filter((e) => isToday(e) && e.country === "USD" && e.impact === "Medium");
    paragraphs.push(med.length ? `No major US news today, just smaller releases (${med.slice(0, 3).map((e) => e.name.replace(/ \(.*\)/, "") + " at " + fmtTime(e.time)).join(", ")}). Without a big catalyst, price tends to respect yesterday\u2019s highs and lows and the overnight range.` : `No US news on the calendar today. Without a catalyst, price tends to respect yesterday\u2019s highs and lows and the overnight range.`);
  }
  facts.today_events = todayBig.map((e) => ({ name: e.name, time: fmtTime(e.time), forecast: e.forecast, previous: e.previous }));
  const fut = res.fut;
  if (fut && fut.leaders.length && want.has("futures")) {
    const nq = fut.leaders.find((x) => x.short === "NQ") || fut.leaders[0];
    const es = fut.leaders.find((x) => x.short === "ES");
    const dir = (v) => v >= 0 ? "up" : "down";
    const label = nq.short === "NQ" ? "Nasdaq futures are" : nq.short === "ES" ? "S&P futures are" : nq.name + " is";
    let s = `${label} ${dir(nq.changePct)} ${Math.abs(nq.changePct).toFixed(2)}% from yesterday\u2019s close`;
    if (es && es !== nq) s += `, the S&P ${dir(es.changePct)} ${Math.abs(es.changePct).toFixed(2)}%`;
    s += ". " + nq.notes.slice(1, 3).join(" ");
    paragraphs.push(s);
    if (fut.macro.length) paragraphs.push(fut.macro.join(" "));
    facts.nq = { change_pct: +nq.changePct.toFixed(2), notes: nq.notes };
    facts.macro = fut.macro;
  }
  if (res.fx && want.has("forex") && res.fx.strength && res.fx.strength.length > 2) {
    const st = res.fx.strength;
    paragraphs.push(`In currencies, the ${st[0].ccy} is the strongest today and the ${st[st.length - 1].ccy} the weakest. Pairing a strong currency against a weak one is where the cleaner moves usually are.`);
  }
  if (res.crypto && (want.has("crypto") || want.has("memes")) && res.crypto.lines.length) {
    paragraphs.push(res.crypto.lines.slice(0, 2).join(" "));
    facts.crypto = res.crypto.lines;
  }
  if (res.earn) {
    const heavy = res.earn.days.flatMap((d) => d.rows.filter((r) => r.heavy).map((r) => ({ ...r, date: d.date })));
    if (heavy.length) paragraphs.push("Earnings to know: " + res.earn.lines.slice(0, 2).join(" "));
    facts.earnings = heavy.slice(0, 5).map((r) => `${r.symbol} ${r.date} ${r.when}`);
  }
  const rest = usdBig.filter((e) => !isToday(e) && e.time > now && e.time < now + 7 * 864e5);
  if (rest.length) {
    const byDay = {};
    rest.forEach((e) => {
      const d = dayName(e.time);
      (byDay[d] = byDay[d] || []).push(e.name.replace(/ \(.*\)/, ""));
    });
    paragraphs.push("Coming up: " + Object.entries(byDay).slice(0, 4).map(([d, xs]) => `${d}: ${[...new Set(xs)].join(" and ")}`).join(". ") + ".");
    facts.week_ahead = byDay;
  }
  if (res.news && res.news.items.length) {
    const counts = {};
    res.news.items.slice(0, 30).forEach((i) => {
      if (i.themeLabel) counts[i.themeLabel] = (counts[i.themeLabel] || 0) + 1;
    });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map((x) => x[0].toLowerCase());
    if (top.length) paragraphs.push(`Most of today\u2019s headlines are about ${top.join(" and ")}.`);
    facts.headlines = res.news.items.slice(0, 12).map((i) => i.title);
  }
  let out = { headline: headlineFor(todayBig, n), paragraphs, nextEvent: later[0] ? { name: later[0].name, time: later[0].time } : null, source: "rules" };
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
          max_tokens: 700,
          system: 'You write the morning brief for a trading news site. Plain everyday English, short sentences, no jargon, no hype, no advice to buy or sell. Quietly reflect price-action thinking (stops resting above/below obvious highs and lows, first moves after news often fake out, the session times, cheap vs expensive half of a range) using everyday words, never trading jargon such as liquidity, sweep, FVG, order block, premium or discount. Use only the facts given. Return JSON: {"headline": string under 70 chars, "paragraphs": [3-5 short paragraphs]}.',
          messages: [{ role: "user", content: `Today is ${dayName(now)}, ${n.date}, ${fmtTime(now)} New York time. Markets the reader trades: ${[...want].join(", ")}.
Facts:
${JSON.stringify(facts)}
Rule-based draft:
${JSON.stringify(out)}` }]
        })
      });
      const j = await r.json();
      const text = j.content && j.content[0] && j.content[0].text || "";
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      if (parsed.headline && Array.isArray(parsed.paragraphs)) out = { ...out, headline: parsed.headline, paragraphs: parsed.paragraphs, source: "ai" };
    } catch (e) {
      out.aiError = String(e.message || e);
    }
  }
  return { ...out, updated: Date.now() };
}

// api/wire.js
var GN = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:1d&hl=en-US&gl=US&ceid=US:en`;
var FEEDS3 = {
  "CNBC": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
  "CNBC Markets": "https://www.cnbc.com/id/20910258/device/rss/rss.html",
  "MarketWatch": "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  "MarketWatch Pulse": "https://feeds.content.dowjones.io/public/rss/mw_marketpulse",
  "WSJ Markets": "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain",
  "Federal Reserve": "https://www.federalreserve.gov/feeds/press_all.xml",
  "ECB": "https://www.ecb.europa.eu/rss/press.html",
  "Investing.com Forex": "https://www.investing.com/rss/news_1.rss",
  "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "Cointelegraph": "https://cointelegraph.com/rss",
  "Decrypt": "https://decrypt.co/feed",
  // Google News topic searches pull in Reuters, Bloomberg, AP, FT and others
  "GN: stock market": GN("stock market today"),
  "GN: Nasdaq": GN("Nasdaq futures OR S&P 500 futures"),
  "GN: Fed": GN("Federal Reserve interest rates"),
  "GN: economy": GN("inflation OR jobs report OR economic data"),
  "GN: dollar": GN("dollar forex currency"),
  "GN: oil gold": GN("oil prices OR gold prices"),
  "GN: crypto": GN("bitcoin OR crypto market"),
  "GN: earnings": GN("earnings stock shares"),
  "GN: geopolitics": GN("tariffs OR sanctions OR war markets"),
  "BBC Business": "https://feeds.bbci.co.uk/news/business/rss.xml",
  "NPR Economy": "https://feeds.npr.org/1017/rss.xml",
  "GN: world economy": GN("global economy OR world economy OR recession"),
  "GN: China": GN("China economy OR yuan OR Chinese stocks"),
  "GN: Europe": GN("ECB OR eurozone economy OR European stocks"),
  "GN: Japan": GN("Bank of Japan OR yen OR Nikkei"),
  "GN: tech": GN("AI chips OR big tech stocks OR semiconductor stocks"),
  "GN: policy": GN("White House economy OR Congress budget OR tariffs"),
  "GN: energy": GN("OPEC OR natural gas prices OR energy prices"),
  "GN: memecoins": GN("memecoin OR meme coin OR pump.fun")
};
var SECTION_FEEDS = {
  all: Object.keys(FEEDS3),
  futures: ["CNBC", "CNBC Markets", "MarketWatch", "MarketWatch Pulse", "WSJ Markets", "Federal Reserve", "GN: stock market", "GN: Nasdaq", "GN: Fed", "GN: economy", "GN: earnings", "GN: geopolitics", "GN: tech", "GN: policy", "GN: world economy"],
  options: ["CNBC Markets", "MarketWatch Pulse", "WSJ Markets", "GN: stock market", "GN: Nasdaq", "GN: Fed", "GN: earnings", "GN: tech"],
  forex: ["Investing.com Forex", "ECB", "Federal Reserve", "WSJ Markets", "GN: dollar", "GN: Fed", "GN: economy", "GN: oil gold", "GN: geopolitics", "GN: China", "GN: Europe", "GN: Japan"],
  crypto: ["CoinDesk", "Cointelegraph", "Decrypt", "GN: crypto"],
  memes: ["CoinDesk", "Cointelegraph", "Decrypt", "GN: crypto", "GN: memecoins"]
};
var REACT = {
  NQ: { sym: "NQ=F", label: "NQ", dp: 2, unit: "pts" },
  ES: { sym: "ES=F", label: "ES", dp: 2, unit: "pts" },
  BTC: { sym: "BTC-USD", label: "BTC", dp: 0, unit: "$" },
  GOLD: { sym: "GC=F", label: "Gold", dp: 1, unit: "$" },
  OIL: { sym: "CL=F", label: "Oil", dp: 2, unit: "$" },
  EURUSD: { sym: "EURUSD=X", label: "EUR/USD", dp: 5, unit: "pips", pip: 1e-4 }
};
function reactKey(h) {
  const t = h.title;
  if (/bitcoin|\bbtc\b|crypto|ether(eum)?\b|solana|memecoin|stablecoin/i.test(t)) return "BTC";
  if (/\bgold\b|bullion/i.test(t)) return "GOLD";
  if (/\boil\b|crude|opec|brent/i.test(t)) return "OIL";
  if (/dollar|\beuro\b|\byen\b|sterling|\bpound\b|forex|eur\/usd|usd\/jpy|gbp\/usd|currenc/i.test(t) && !/stock|nasdaq|s&p|dow/i.test(t)) return "EURUSD";
  if (h.theme === "crypto" || h.theme === "memes") return "BTC";
  if (h.theme === "gold") return "GOLD";
  if (h.theme === "energy") return "OIL";
  if (h.theme === "dollar") return "EURUSD";
  return "NQ";
}
function priceAt(bars, t) {
  for (const b of bars) if (b.t + 5 * 6e4 > t) return b.o;
  return null;
}
function reaction(bars, t, cfg) {
  if (!bars || bars.length < 2 || !t || t < bars[0].t || Date.now() - t > 36 * 36e5) return null;
  const p0 = priceAt(bars, t), p1 = bars[bars.length - 1].c;
  if (p0 == null) return null;
  const d = p1 - p0;
  const pct2 = d / p0 * 100;
  const amount = cfg.pip ? Math.round(d / cfg.pip) : +d.toFixed(cfg.dp);
  return { label: cfg.label, from: +p0.toFixed(cfg.dp), now: +p1.toFixed(cfg.dp), change: amount, unit: cfg.unit, pct: +pct2.toFixed(2) };
}
var STRONG = /\b(surge|soar|plunge|tumble|crash|slump|record|biggest|worst|best|jump|sink|slide|rally|spike|selloff|sell-off|rout|halt|emergency|unexpected|surprise|shock|hotter|cooler|beats?|miss(es|ed)?|cuts?|hikes?)\b/i;
var THEME_W = { rates: 3, inflation: 3, jobs: 3, trade: 2.5, world: 2.5, earnings: 2, ai: 2, energy: 1.5, gov: 1.5, dollar: 1.5, gold: 1, crypto: 1.5, memes: 1, options: 1 };
function score(h) {
  let s = THEME_W[h.theme] || 0.5;
  if (STRONG.test(h.title)) s += 1.5;
  if (/\b(fed|powell|cpi|payrolls|jobs report|fomc|tariff)\b/i.test(h.title)) s += 1;
  s += Math.min(3, (h.count - 1) * 0.8);
  const ageH = h.time ? (Date.now() - h.time) / 36e5 : 12;
  s -= Math.min(2.5, ageH / 8);
  return s;
}
var norm = (t) => t.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
var STOP = /* @__PURE__ */ new Set(["with", "from", "that", "this", "after", "over", "into", "than", "what", "says", "said", "will", "more", "amid", "their", "have", "about", "stock", "stocks", "market", "markets", "today", "news"]);
function similar(a, b) {
  const A = new Set(a), B = new Set(b);
  let i = 0;
  A.forEach((w) => {
    if (B.has(w)) i++;
  });
  return i / Math.max(1, Math.min(A.size, B.size));
}
var JUNK = [
  /\((?:NYSE|NASDAQ|NYSEARCA|NYSEAMERICAN|TSX|TSXV|OM|OB|LSE|ASX|SGX|BIT|ETR|EPA|HKG|SEHK|TSE|KOSE|NSE|BSE|SWX|CPSE|STO|HLSE|XTRA|SHSE|SZSE|BOVESPA|JSE)\s*:/i,
  /\([A-Z]{1,5}\) Stock\b/, /\bstocks? to watch\b/i, /millionaire|should you buy|buy now\b|is it too late|top \d+ (stocks|cryptos?|coins)|best (stocks|cryptos?|coins) to|price prediction|prediction:/i,
  /presale|\bico\b|airdrop guide|remittix/i, /announces approval of application|press release:/i, /\b(forum|summit|conference|webinar|podcast)\b.*\b20\d\d\b/i, /^watch:|^video:|^live:/i, /horoscope|recipe|weather forecast/i
];
function cleanTitle(t) {
  return t.replace(/^(?:Global Market|Crypto Market News|Bitcoin News|Ethereum News|XRP News|On the Chain|Market Wrap|Markets?|Breaking|Exclusive|Update|Explainer|Analysis|Opinion|Stock Market Today|Forex)\s*[:|\-–]\s*/i, "")
    .replace(/^[A-Z][\w&' ]{1,25}\.\.\s*/, "").replace(/\s+\|\s+[^|]{2,30}$/, "").replace(/\.{2,}(?!\.)/g, ". ").replace(/\s+/g, " ").trim();
}
function isJunk(i) {
  const t = i.title || "";
  if (t.length < 18) return true;
  if (JUNK.some((re) => re.test(t))) return true;
  if (/^['‘"“]/.test(t) && !i.theme) return true;
  return false;
}
function sectionOf(h) {
  const t = h.title || "";
  if (h.theme === "crypto" || h.theme === "memes") return "crypto";
  if (/\b(fed|fomc|powell|ecb|lagarde|bank of (england|japan|canada)|boj|boe|central bank|rate (cut|hike|decision)s?)\b/i.test(t)) return "centralbanks";
  if (["rates", "inflation", "jobs"].includes(h.theme)) return "economy";
  if (["trade", "world", "gov"].includes(h.theme)) return "world";
  if (h.theme === "ai") return "tech";
  if (["earnings", "options"].includes(h.theme)) return "companies";
  if (["energy", "gold"].includes(h.theme)) return "commodities";
  if (h.theme === "dollar") return "currencies";
  if (/\b(china|europe|japan|uk|germany|india|russia|ukraine|israel|iran|gaza|opec|g7|g20|imf|world bank)\b/i.test(t)) return "world";
  return "markets";
}
async function build8(section = "all") {
  const names = SECTION_FEEDS[section] || SECTION_FEEDS.all;
  const { res, errors } = await settle(Object.fromEntries(names.map((n) => [n, getText(FEEDS3[n]).then((x) => parseRSS(x, n))])));
  let raw = names.flatMap((n) => (res[n] || []).map((i) => {
    if (n.startsWith("GN:")) {
      const m = i.title.match(/^(.*) - ([^-]+)$/);
      if (m) return { ...i, title: m[1].trim(), source: m[2].trim(), summary: "" };
    }
    return i;
  }));
  const cutoff = Date.now() - 2 * 864e5;
  raw = raw.map((i) => ({ ...i, title: cleanTitle(i.title || "") })).filter((i) => i.title && (!i.time || i.time > cutoff) && !JUNK.some((re) => re.test(i.title)) && i.title.length >= 18);
  raw.sort((a, b) => (b.time || 0) - (a.time || 0));
  const clusters = [];
  for (const it of raw) {
    const words = norm(it.title);
    const c = clusters.find((c2) => similar(c2.words, words) >= 0.6);
    if (c) {
      c.count++;
      if (!c.sources.includes(it.source)) c.sources.push(it.source);
      if (it.time && (!c.first || it.time < c.first)) c.first = it.time;
      continue;
    }
    clusters.push({ ...it, words, count: 1, sources: [it.source], first: it.time });
  }
  let items = clusters.map((c) => {
    const { words, ...rest } = c;
    return tagHeadline({ ...rest, time: c.first || c.time });
  }).filter((h) => !isJunk(h)).map((h) => ({ ...h, score: score(h) }));
  if (section !== "all") items = items.filter((i) => i.markets.includes(section) || i.score > 3.5);
  items.forEach((h) => {
    h.impact = h.score >= 3.8 ? "high" : h.score >= 2.2 ? "medium" : "low";
    h.breaking = h.impact === "high" && h.time && Date.now() - h.time < 45 * 6e4;
    h.id = (h.time || 0).toString(36) + "-" + norm(h.title).slice(0, 4).join("-");
    h.section = sectionOf(h);
    if (h.markets.includes("futures") && !h.markets.includes("stocks")) h.markets.push("stocks");
  });
  items.sort((a, b) => (b.time || 0) - (a.time || 0));
  items = items.slice(0, 80);
  const keys = [...new Set(items.map(reactKey))];
  const charts = await settle(Object.fromEntries(keys.map((k) => [k, yahooChart(REACT[k].sym, { interval: "5m", range: "2d" })])));
  items.forEach((h) => {
    const k = reactKey(h);
    const c = charts.res[k];
    h.reaction = c ? reaction(c.bars, h.time, REACT[k]) : null;
  });
  const failed = Object.keys(errors).length;
  return { section, items, sources: names.length - failed, errors, updated: Date.now() };
}

// api/movers.js
var GIANTS = [
  ["NVDA", "Nvidia", 9.5, /nvidia|nvda/i],
  ["MSFT", "Microsoft", 8.4, /microsoft|msft/i],
  ["AAPL", "Apple", 8, /\bapple\b|aapl/i],
  ["AMZN", "Amazon", 5.4, /amazon|amzn/i],
  ["AVGO", "Broadcom", 5.2, /broadcom|avgo/i],
  ["META", "Meta", 3.8, /\bmeta\b|facebook|instagram/i],
  ["GOOGL", "Alphabet", 5.4, /alphabet|google|googl/i],
  ["TSLA", "Tesla", 3, /tesla|tsla|musk/i],
  ["COST", "Costco", 2.3, /costco/i],
  ["NFLX", "Netflix", 1.4, /netflix/i],
  ["AMD", "AMD", 1.4, /\bamd\b|advanced micro/i],
  ["PLTR", "Palantir", 1.6, /palantir/i]
];
var SECTORS = [
  ["XLK", "Tech"],
  ["SMH", "Chips"],
  ["XLC", "Communication"],
  ["XLY", "Consumer spending"],
  ["XLF", "Banks & finance"],
  ["XLV", "Health care"],
  ["XLE", "Energy"],
  ["XLI", "Industrials"],
  ["XLP", "Everyday goods"],
  ["XLU", "Utilities"],
  ["XLRE", "Real estate"],
  ["XLB", "Materials"]
];
async function quote2(sym) {
  const c = await yahooChart(sym, { interval: "5m", range: "1d" });
  const m = c.meta || {};
  const price = m.regularMarketPrice ?? (c.bars.length ? c.bars[c.bars.length - 1].c : null);
  const prev = m.chartPreviousClose ?? m.previousClose;
  return { price, prev, pct: price != null && prev ? (price - prev) / prev * 100 : null, spark: c.bars.map((b) => b.c).filter((_, i, a) => a.length < 60 || i % Math.ceil(a.length / 60) === 0) };
}
async function build9() {
  const jobs = { nq: yahooChart("NQ=F", { interval: "5m", range: "5d" }), spy: yahooChart("SPY", { interval: "5m", range: "5d" }), news: build8("futures") };
  GIANTS.forEach(([s]) => {
    jobs["g:" + s] = quote2(s);
  });
  SECTORS.forEach(([s]) => {
    jobs["s:" + s] = quote2(s);
  });
  const { res, errors } = await settle(jobs);
  let nqPrice = null, nqPrev = null, window = null;
  if (res.nq && res.spy) {
    const reg = res.spy.bars.filter((b) => {
      const n = ny(b.t);
      return n.mins >= 570 && n.mins < 960;
    });
    const days = [...new Set(reg.map((b) => ny(b.t).date))];
    if (days.length >= 2) {
      const lastDay = days[days.length - 1], prevDay = days[days.length - 2];
      const prevLast = reg.filter((b) => ny(b.t).date === prevDay).slice(-1)[0];
      const curLast = reg.filter((b) => ny(b.t).date === lastDay).slice(-1)[0];
      const at = (t) => {
        let best = null;
        for (const b of res.nq.bars) {
          if (b.t <= t) best = b;
          else break;
        }
        return best;
      };
      const a0 = at(prevLast.t), a1 = at(curLast.t);
      if (a0 && a1) {
        nqPrev = a0.c;
        nqPrice = a1.c;
        window = { from: prevLast.t + 5 * 6e4, to: curLast.t + 5 * 6e4, day: lastDay };
      }
    }
  }
  if (nqPrice == null && res.nq) {
    nqPrice = res.nq.meta.regularMarketPrice ?? res.nq.bars.slice(-1)[0].c;
    nqPrev = res.nq.meta.chartPreviousClose ?? res.nq.meta.previousClose;
  }
  const news = res.news ? res.news.items : [];
  const giants = GIANTS.map(([sym, name, w, re]) => {
    const q = res["g:" + sym];
    if (!q || q.pct == null) return null;
    const pts = nqPrice ? w / 100 * q.pct / 100 * nqPrice : null;
    const story = news.find((n) => re.test(n.title));
    return { sym, name, weight: w, price: q.price, pct: +q.pct.toFixed(2), nqPts: pts != null ? +pts.toFixed(1) : null, spark: q.spark, story: story ? { title: story.title, link: story.link, source: story.source, time: story.time } : null };
  }).filter(Boolean).sort((a, b) => Math.abs(b.nqPts || 0) - Math.abs(a.nqPts || 0));
  const sectors = SECTORS.map(([sym, name]) => {
    const q = res["s:" + sym];
    return q && q.pct != null ? { sym, name, pct: +q.pct.toFixed(2) } : null;
  }).filter(Boolean).sort((a, b) => b.pct - a.pct);
  const nqChange = nqPrice && nqPrev ? nqPrice - nqPrev : null;
  const giantsTotal = giants.reduce((s, g) => s + (g.nqPts || 0), 0);
  const lines = [];
  if (giants.length && nqChange != null) {
    const top = giants[0];
    lines.push(`During ${window ? window.day === ny(Date.now()).date ? "today\u2019s" : "the last" : "today\u2019s"} stock-market session NQ ${window && window.to < Date.now() - 10 * 6e4 ? "moved" : "is"} ${nqChange >= 0 ? "up" : "down"} ${Math.abs(nqChange).toFixed(0)} point${Math.abs(nqChange).toFixed(0) === "1" ? "" : "s"}. Between them, the ${giants.length} biggest Nasdaq stocks ${giantsTotal >= 0 ? "added" : "took off"} about ${Math.abs(giantsTotal).toFixed(0)} points.`);
    lines.push(`${top.name} is the biggest single driver, ${top.nqPts >= 0 ? "adding" : "taking off"} roughly ${Math.abs(top.nqPts).toFixed(0)} points (${top.pct >= 0 ? "+" : ""}${top.pct}%).`);
    const share = Math.abs(nqChange) > 1 ? giantsTotal / nqChange : null;
    if (share != null) lines.push(share > 0.7 ? "This move is mostly about a handful of giant stocks, not the whole market." : share < 0.3 ? "The move is broad: it\u2019s coming from across the market, not just the giants." : "Both the giants and the rest of the market are contributing.");
  }
  if (sectors.length > 2) {
    const best = sectors[0], worst = sectors[sectors.length - 1];
    lines.push(`Strongest corner of the market: ${best.name.toLowerCase()} (${best.pct >= 0 ? "+" : ""}${best.pct}%). Weakest: ${worst.name.toLowerCase()} (${worst.pct >= 0 ? "+" : ""}${worst.pct}%).`);
    const defensive = ["XLU", "XLP", "XLV"].map((s) => sectors.find((x) => x.sym === s)).filter(Boolean);
    const growth = ["XLK", "SMH", "XLY"].map((s) => sectors.find((x) => x.sym === s)).filter(Boolean);
    if (defensive.length && growth.length) {
      const d = defensive.reduce((s, x) => s + x.pct, 0) / defensive.length, g = growth.reduce((s, x) => s + x.pct, 0) / growth.length;
      if (d - g > 0.5) lines.push("Money is moving into safer, slower stocks: a cautious mood.");
      else if (g - d > 0.5) lines.push("Money is moving into growth and tech: a confident mood.");
    }
  }
  return { nq: nqPrice ? { price: nqPrice, change: nqChange, window } : null, giants, sectors, lines, giantsTotal: +giantsTotal.toFixed(1), errors, updated: Date.now() };
}

// api/recap.js
var INST = {
  NQ: { sym: "NQ=F", name: "Nasdaq futures (NQ)", dp: 2, unit: "points", start: 18 },
  ES: { sym: "ES=F", name: "S&P futures (ES)", dp: 2, unit: "points", start: 18 },
  EURUSD: { sym: "EURUSD=X", name: "EUR/USD", dp: 5, unit: "pips", pip: 1e-4, start: 17 },
  GBPUSD: { sym: "GBPUSD=X", name: "GBP/USD", dp: 5, unit: "pips", pip: 1e-4, start: 17 },
  USDJPY: { sym: "USDJPY=X", name: "USD/JPY", dp: 3, unit: "pips", pip: 0.01, start: 17 },
  GOLD: { sym: "GC=F", name: "Gold", dp: 1, unit: "dollars", start: 18 },
  BTC: { sym: "BTC-USD", name: "Bitcoin", dp: 0, unit: "dollars", start: 0 }
};
var SESS = [
  { id: "asia", label: "Asia", from: -240, to: 0 },
  // 8 PM – midnight (the evening before)
  { id: "london", label: "London", from: 120, to: 300 },
  // 2 – 5 AM
  { id: "nyam", label: "New York morning", from: 420, to: 660 },
  // 7 – 11 AM
  { id: "nypm", label: "New York afternoon", from: 810, to: 960 }
  // 1:30 – 4 PM
];
function nyToMs(date, mins) {
  const want = Date.parse(date + "T00:00:00Z") + mins * 6e4;
  let g = want + 4 * 36e5;
  const n = ny(g);
  const got = Date.parse(n.date + "T00:00:00Z") + n.mins * 6e4;
  return g + (want - got);
}
var fmtT = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
async function build10(key = "NQ") {
  const I = INST[key] || INST.NQ;
  const { res, errors } = await settle({ c5: yahooChart(I.sym, { interval: "5m", range: "5d" }), cal: build(), news: build8("all") });
  if (!res.c5 || res.c5.bars.length < 20) throw new Error("No intraday data for " + I.name);
  const bars = res.c5.bars.map((b) => ({ ...b, n: ny(b.t) }));
  const now = Date.now(), nn = ny(now);
  const day = nn.h >= 18 ? addDays(nn.date, 1) : nn.date;
  const minsOf = (b) => b.n.date === day ? b.n.mins : b.n.date === addDays(day, -1) ? b.n.mins - 1440 : b.n.date === addDays(day, -2) ? b.n.mins - 2880 : null;
  const dayBars = bars.filter((b) => {
    const m = minsOf(b);
    return m != null && m >= -360;
  });
  const fmt = (v) => v == null ? "\u2014" : Number(v).toLocaleString("en-US", { minimumFractionDigits: I.dp, maximumFractionDigits: I.dp });
  const size = (d) => I.pip ? `${Math.round(Math.abs(d) / I.pip)} pips` : I.unit === "dollars" ? `$${Math.abs(d).toLocaleString("en-US", { maximumFractionDigits: I.dp })}` : `${Math.abs(d).toFixed(I.dp > 2 ? 2 : 1)} points`;
  const prevDayBars = bars.filter((b) => {
    const m = minsOf(b);
    return m != null && m < -360 && m >= -1440 - 360;
  });
  const prevHigh = prevDayBars.length ? Math.max(...prevDayBars.map((b) => b.h)) : null;
  const prevLow = prevDayBars.length ? Math.min(...prevDayBars.map((b) => b.l)) : null;
  const ranges15 = [];
  for (let i = 3; i < bars.length; i += 3) ranges15.push(Math.abs(bars[i].c - bars[i - 3].c));
  const typical15 = ranges15.length ? ranges15.sort((a, b) => a - b)[Math.floor(ranges15.length * 0.5)] : null;
  const sessions = [];
  let prevRef = { label: "yesterday", high: prevHigh, low: prevLow };
  const refs = [];
  for (const s of SESS) {
    const bs = dayBars.filter((b) => {
      const m = minsOf(b);
      return m >= s.from && m < s.to;
    });
    const mNow = nn.h >= 18 ? nn.mins - 1440 : nn.mins;
    const status = mNow < s.from ? "upcoming" : mNow < s.to ? "live" : "done";
    if (!bs.length) {
      sessions.push({ id: s.id, label: s.label, status: status === "done" ? "no data" : status, text: status === "upcoming" ? `Starts at ${fmtT(Date.now() + (s.from - mNow) * 6e4)}.` : "No trading data for this session." });
      continue;
    }
    const o = bs[0].o, c = bs[bs.length - 1].c, h = Math.max(...bs.map((b) => b.h)), l = Math.min(...bs.map((b) => b.l));
    const took = [];
    for (const r of [...refs, prevRef]) {
      if (r.high != null && h > r.high && !took.some((t) => t.side === "high")) took.push({ side: "high", label: `${r.label}\u2019s high`, level: r.high, held: c > r.high });
      if (r.low != null && l < r.low && !took.some((t) => t.side === "low")) took.push({ side: "low", label: `${r.label}\u2019s low`, level: r.low, held: c < r.low });
    }
    const pos = h > l ? (c - l) / (h - l) : 0.5;
    const dir = c > o ? "up" : c < o ? "down" : "flat";
    let text = `${s.label} ${status === "live" ? "is" : "was"} ${dir === "flat" ? "flat" : dir} ${size(c - o)}, in a ${size(h - l)} range (${fmt(l)} \u2013 ${fmt(h)}).`;
    took.forEach((t) => {
      text += t.held ? ` It broke ${t.label} (${fmt(t.level)}) and held beyond it.` : ` It poked through ${t.label} (${fmt(t.level)}) but slipped back, a classic fake-out.`;
    });
    if (!took.length && refs.length) text += " It stayed inside the earlier ranges, so those highs and lows are still untouched.";
    text += pos > 0.75 ? " It finished near its high." : pos < 0.25 ? " It finished near its low." : " It finished mid-range.";
    sessions.push({ id: s.id, label: s.label, status, open: o, close: c, high: h, low: l, change: c - o, took, text });
    refs.unshift({ label: s.label, high: h, low: l });
  }
  const moves = [];
  if (typical15) {
    const thr = Math.max(typical15 * 3, 0);
    let i = 3;
    while (i < dayBars.length) {
      const d = dayBars[i].c - dayBars[i - 3].o;
      if (Math.abs(d) >= thr) {
        let j = i;
        while (j + 1 < dayBars.length && Math.sign(dayBars[j + 1].c - dayBars[j].c) === Math.sign(d) && j - i < 6) j++;
        const start = dayBars[i - 3], end = dayBars[j];
        moves.push({ t: start.t, end: end.t, from: start.o, to: end.c, change: end.c - start.o });
        i = j + 4;
      } else i++;
    }
  }
  const events = (res.cal && res.cal.events || []).filter((e) => ny(e.time).date === day && e.impact !== "Low" && (e.country === "USD" || e.impact === "High"));
  const news = (res.news && res.news.items || []).filter((h) => h.time && h.impact !== "low");
  const timeline = [];
  moves.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 8).forEach((m) => {
    const ev = events.filter((e) => e.time >= m.t - 15 * 6e4 && e.time <= m.t + 10 * 6e4);
    const hd = news.filter((h) => h.time >= m.t - 60 * 6e4 && h.time <= m.end + 10 * 6e4).sort((a, b) => b.score - a.score).slice(0, 2);
    timeline.push({ kind: "move", t: m.t, change: m.change, from: m.from, to: m.to, text: `${I.name.split(" (")[0]} ${m.change > 0 ? "jumped" : "dropped"} ${size(m.change)} in about ${Math.max(15, Math.round((m.end - m.t) / 6e4) + 5)} minutes (${fmt(m.from)} \u2192 ${fmt(m.to)}).`, cause: ev.length ? `Lined up with ${ev.map((e) => e.name).join(" and ")} at ${fmtT(ev[0].time)}.` : hd.length ? "Around the time of the stories below." : "No scheduled release or major headline lines up with this one.", events: ev.map((e) => ({ name: e.name, title: e.title, time: e.time, forecast: e.forecast, previous: e.previous })), news: hd.map((h) => ({ title: h.title, link: h.link, source: h.source, time: h.time })) });
  });
  events.forEach((e) => {
    if (!timeline.some((x) => x.events && x.events.some((v) => v.time === e.time && v.title === e.title))) timeline.push({ kind: "event", t: e.time, text: e.name, sub: e.title + (e.forecast ? `, expected ${e.forecast}` : "") + (e.previous ? `, last ${e.previous.split("|")[0]}` : ""), upcoming: e.time > now, impact: e.impact });
  });
  SESS.forEach((s) => {
    const t = nyToMs(s.from < 0 ? addDays(day, -1) : day, (s.from + 1440) % 1440);
    if (t <= now && t > now - 30 * 36e5) timeline.push({ kind: "session", t, text: `${s.label} session opened` });
  });
  timeline.sort((a, b) => a.t - b.t);
  return { key, name: I.name, unit: I.unit, day, price: dayBars.length ? dayBars[dayBars.length - 1].c : null, sessions, timeline, typical15, errors, updated: Date.now() };
}

// api/_lib/ai.js
var hasAI = () => !!process.env.ANTHROPIC_API_KEY;
async function askClaude({ system, user, maxTokens = 900 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25e3);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5", max_tokens: maxTokens, thinking: { type: "disabled" }, system, messages: [{ role: "user", content: user }] })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message || "Claude API " + r.status);
    const text = (j.content || []).filter((c) => c.type === "text").map((c) => c.text || "").join("");
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e <= s) throw new Error(`No JSON in reply (stop: ${j.stop_reason}, model: ${j.model}, ${text.length} chars, blocks: ${(j.content || []).map((c) => c.type).join("/")}): ${text.slice(0, 80)}`);
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch (err) {
      throw new Error(`Bad JSON in reply (stop: ${j.stop_reason}, ${text.length} chars): ${err.message}`);
    }
  } finally {
    clearTimeout(t);
  }
}
var VOICE = `You write for The Open One, a trading news site. Rules:
- Plain everyday English. Short sentences. No hype, no emojis, no "in conclusion".
- Never tell anyone to buy or sell. Describe what happened and why it matters.
- Only use the facts and numbers you are given. If a cause isn't supported by the headlines given, say the move has no clear news behind it.
- Write prices and points exactly as given.
- Quietly reflect price-action thinking in everyday words: stop orders resting above obvious highs and below obvious lows, first moves after news often faking out, the session times (Asia, London, New York), the pricey vs cheap half of a range, gaps price tends to revisit. Do NOT use jargon such as liquidity sweep, FVG, order block, premium/discount, BOS, CHoCH, killzone.`;
var LENS = {
  ict: "The reader trades ICT / smart-money style: emphasise which obvious highs and lows have been run or are still sitting there, session timing, and whether moves look like fake-outs, without using ICT jargon.",
  pa: "The reader trades price action and support/resistance: emphasise key levels, breaks that held or failed, and ranges.",
  ind: "The reader uses indicators: mention momentum and trend in plain words (stretched, fading, steady trend) based on the moves given.",
  news: "The reader trades the news: emphasise scheduled releases, surprises vs expectations, and how fast price reacted.",
  general: "The reader is still finding a style: explain cause and effect simply."
};

// api/profile.js
var MARKET_NAMES = { stocks: "stocks and ETFs", futures: "futures", forex: "forex", options: "options", crypto: "crypto", memes: "memecoins", learning: "learning the markets" };
var STRAT_NAMES = {
  ict: "ICT / smart money concepts", pa: "price action and support/resistance", orderflow: "order flow and volume", ind: "indicators", news: "trading scheduled news",
  trend: "trend following and breakouts", algo: "automated trading", sd: "supply and demand zones", carry: "carry trades", fundamentals: "fundamentals and central banks",
  value: "value investing", growth: "growth investing", momentum: "momentum and breakouts", earnings: "earnings plays", dividends: "dividend investing", ta: "chart analysis",
  index: "buy-and-hold index investing", buy: "buying calls and puts", sell: "selling option premium", spreads: "option spreads", zero: "same-day (0DTE) options", hedge: "hedging with options",
  hold: "buying and holding", swing: "swing trading", perps: "leveraged perpetual futures", narratives: "rotating between crypto sectors and narratives", onchain: "on-chain data", defi: "DeFi and yield",
  launches: "catching new token launches", trending: "riding trending coins", kols: "following influencer calls", wallets: "copy-trading wallets", charts: "chart setups", unsure: "still finding a strategy"
};
function parseProfile(p) {
  const out = [];
  String(p || "").split(";").slice(0, 7).forEach((seg) => {
    const [m, s = "", a = "", h = ""] = seg.split(":");
    if (!MARKET_NAMES[m] || out.some((x) => x.m === m)) return;
    out.push({ m, strats: s.split(".").filter((x) => STRAT_NAMES[x]).slice(0, 6), assets: a.split(".").filter((x) => /^[A-Za-z0-9]{2,10}$/.test(x)).slice(0, 8), hold: h.split(".").filter((x) => /^[a-z0-9]{2,10}$/.test(x)).slice(0, 4) });
  });
  return out;
}
var HOLD_NAMES = { scalp: "minutes", day: "within the day", swing: "days to weeks", position: "months", invest: "years", hold: "months or longer", zero: "same day", days: "a few days", weeks: "weeks", months: "months", minutes: "minutes", hours: "hours" };
function profileText(prof, level, detail) {
  let t = !prof.length ? "The reader follows the markets in general. " : "The reader trades: " + prof.map((x) => `${MARKET_NAMES[x.m]}${x.assets.length ? " (" + x.assets.join(", ") + ")" : ""}${x.strats.length ? ", using " + x.strats.map((s) => STRAT_NAMES[s]).join(", ") : ""}${x.hold.length ? ", usually holding for " + x.hold.map((h) => HOLD_NAMES[h] || h).join(" or ") : ""}`).join("; ") + ". ";
  t += level === "beginner" ? "They are fairly new: explain cause and effect simply, one idea per sentence. " : "They are experienced: be specific and brief. ";
  if (detail === "quick") t += "Keep every part short. ";
  if (detail === "deep") t += "They like fuller explanations. ";
  return t;
}
var VOICE2 = `You write for The Open One, a news site that explains what is happening in the world and how it moves financial markets, for everyday traders and investors of every kind (stocks, futures, forex, options, crypto, memecoins). Rules:
- Plain everyday English. Short sentences. If you use a market term, explain it in a few words the first time.
- Lead with the real-world cause (economy, central banks, politics, conflict, companies, technology, energy, regulation), then the market effect.
- Never tell anyone to buy or sell, and never promise what prices will do. Describe what happened, why it matters, how markets reacted and what people are watching.
- Only use the facts and numbers you are given. If a move has no supporting story, say there is no clear news behind it.
- Write prices and changes exactly as given. No hype, no emojis, no exclamation marks.`;

// api/world.js
var WORLD = [
  ["us", "US stocks", [["^GSPC", "S&P 500", 2], ["^IXIC", "Nasdaq", 2], ["^DJI", "Dow", 0], ["^RUT", "Russell 2000", 2]]],
  ["fut", "US futures", [["ES=F", "S&P 500 futures", 2], ["NQ=F", "Nasdaq 100 futures", 2], ["YM=F", "Dow futures", 0]]],
  ["eu", "Europe", [["^STOXX50E", "Euro Stoxx 50", 2], ["^GDAXI", "Germany DAX", 2], ["^FTSE", "UK FTSE 100", 2]]],
  ["asia", "Asia", [["^N225", "Japan Nikkei 225", 0], ["^HSI", "Hong Kong Hang Seng", 0], ["000001.SS", "China Shanghai", 2]]],
  ["rates", "US bond yields", [["^IRX", "3-month", 3], ["^FVX", "5-year", 3], ["^TNX", "10-year", 3], ["^TYX", "30-year", 3]]],
  ["fx", "Currencies", [["DX-Y.NYB", "US dollar index", 2], ["EURUSD=X", "EUR/USD", 4], ["USDJPY=X", "USD/JPY", 2], ["GBPUSD=X", "GBP/USD", 4], ["USDCNY=X", "USD/CNY", 4]]],
  ["cmd", "Commodities", [["CL=F", "US crude oil", 2], ["BZ=F", "Brent crude", 2], ["NG=F", "Natural gas", 3], ["GC=F", "Gold", 1], ["SI=F", "Silver", 2], ["HG=F", "Copper", 3]]],
  ["crypto", "Crypto", [["BTC-USD", "Bitcoin", 0], ["ETH-USD", "Ethereum", 2], ["SOL-USD", "Solana", 2]]],
  ["vol", "Volatility", [["^VIX", "VIX fear gauge", 2]]]
];
async function build13() {
  const jobs = {};
  WORLD.forEach(([, , list]) => list.forEach(([s]) => {
    jobs[s] = yahooChart(s, { interval: "15m", range: "1d" });
  }));
  const { res, errors } = await settle(jobs);
  const groups = WORLD.map(([id, name, list]) => ({
    id, name,
    rows: list.map(([sym, label, dp]) => {
      const c = res[sym];
      if (!c) return null;
      const q = quoteFromMeta(c.meta, c.bars);
      if (q.price == null) return null;
      return { sym, label, dp, price: q.price, change: q.change, pct: q.changePct != null ? +q.changePct.toFixed(2) : null, unit: id === "rates" ? "%" : "", spark: c.bars.map((b) => +b.c.toFixed(dp + 1)).filter((_, i, a) => a.length < 50 || i % Math.ceil(a.length / 50) === 0) };
    }).filter(Boolean)
  })).filter((g) => g.rows.length);
  return { groups, errors, updated: Date.now() };
}

// api/desk.js
var fmtT2 = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
var SECTION_OF_MARKET = { stocks: ["futures"], futures: ["futures"], forex: ["forex"], options: ["options", "futures"], crypto: ["crypto"], memes: ["memes", "crypto"], learning: [] };
var STRAT_TIP = {
  ict: "News spikes often run the obvious highs or lows first, then reverse. That usually happens at the New York open or in the minutes after a big release.",
  pa: "Watch whether the moves today break and hold beyond yesterday’s high or low, or slip back inside.",
  sd: "News spikes into well-defined zones are where reactions tend to show up first.",
  orderflow: "Expect volume to bunch up around scheduled releases. That is when the real buying and selling shows.",
  ind: "Fast news moves stretch indicators quickly, so signals right after a release are less reliable.",
  news: "The scheduled releases are your main events. Surprises against the forecast drive the biggest moves.",
  trend: "Trends tend to resume after news shocks fade unless the news genuinely changes the outlook.",
  fundamentals: "Central-bank comments and data surprises are what shift currency trends over days and weeks.",
  carry: "Anything that changes rate expectations changes the interest gap between currencies.",
  value: "Day-to-day headlines matter less to you than earnings and the interest-rate outlook.",
  growth: "Growth stocks are the most sensitive to bond yields. Rising yields tend to weigh on them.",
  momentum: "Strong sectors today are where momentum traders are crowding.",
  earnings: "Check which big companies report this week. Results can move whole sectors.",
  dividends: "Higher bond yields make dividend stocks look less attractive by comparison.",
  index: "For long-term index investors, most daily headlines are noise. The big picture is rates, earnings and the economy.",
  buy: "Big scheduled events make options pricier beforehand and cheaper right after.",
  sell: "When fear rises (a higher VIX), premium gets richer but moves get bigger. Scheduled news is when that risk is highest.",
  spreads: "Expected moves are larger on news days. Spread widths that worked last week may be too tight today.",
  zero: "Same-day options react hardest to releases and the last hour. On news days they can swing all the way either way.",
  hedge: "Hedges are cheapest when things are calm. Costs jump once fear rises.",
  hold: "For holders, the big picture is interest rates, money flowing into crypto funds and regulation, not daily swings.",
  swing: "Rate news and risk mood decide whether crypto swings continue over the next few days.",
  perps: "Leverage gets punished on news spikes. Liquidations pile up when everyone leans the same way.",
  narratives: "Money rotates fast between crypto sectors when the overall mood changes.",
  onchain: "Watch whether big holders move coins onto exchanges after major news.",
  defi: "Rate and regulation news change the appeal of on-chain yield.",
  launches: "When the wider crypto mood turns risk-off, new launches lose buyers fastest.",
  trending: "Trending coins depend on the wider mood. When Bitcoin wobbles, attention dries up quickly.",
  kols: "Influencer calls work best in an upbeat market. In a nervous market they fade faster.",
  wallets: "Smart wallets often de-risk before big macro events.",
  charts: "News days can blow through chart levels. Give setups more room, or wait for things to settle.",
  unsure: "Watch how markets react to today\u2019s news. It\u2019s the fastest way to learn what moves them."
};
var ALL_M = ["stocks", "futures", "forex", "options", "crypto", "memes"];
var SCEN = [
  { re: /\bCPI\b|consumer price|\bPCE\b|\bPPI\b|producer price/i, title: "Inflation report", markets: ALL_M,
    up: ["Hotter than forecast", "Rate cuts look further away. Bond yields and the dollar would likely rise, while stocks, gold and crypto would likely dip."],
    down: ["Cooler than forecast", "Hopes for rate cuts grow. Stocks, gold and crypto would likely rise, and the dollar would likely weaken."] },
  { re: /non-?farm|payrolls|employment change/i, title: "Jobs report", markets: ALL_M,
    up: ["More jobs than forecast", "A strong economy means fewer rate cuts. The dollar and yields would likely rise. Stocks could go either way."],
    down: ["Fewer jobs than forecast", "The Fed gets more room to cut. The dollar would likely fall and gold would likely rise. A very weak number can scare stocks too."] },
  { re: /unemployment rate/i, title: "Unemployment rate", markets: ALL_M,
    up: ["Higher unemployment than forecast", "The job market is cooling faster. Rate-cut hopes grow: the dollar would likely dip, and stocks may get a lift unless it looks like a slowdown."],
    down: ["Lower unemployment than forecast", "The job market still looks tight. Fewer rate cuts: the dollar would likely firm up and stocks may dip."] },
  { re: /unemployment claims|jobless claims/i, title: "Weekly jobless claims", markets: ["futures", "forex", "options"],
    up: ["More claims than forecast", "A sign the job market is cooling. The dollar would likely dip and bonds would likely rally."],
    down: ["Fewer claims than forecast", "The job market still looks firm. A small lift for the dollar."] },
  { re: /FOMC|federal funds|fed chair|powell/i, title: "Fed decision or speech", markets: ALL_M,
    up: ["Sounds tougher on inflation", "The dollar and yields would likely rise. Stocks and crypto would likely come under pressure."],
    down: ["Hints at more rate cuts", "Stocks, gold and crypto would likely rise, and the dollar would likely fall."] },
  { re: /central bank|\bECB\b|\bBOE\b|\bBOJ\b|\bRBA\b|\bBOC\b|\bSNB\b|\bRBNZ\b|main refinancing|official bank rate|policy rate|cash rate|overnight rate|monetary policy/i, title: "Central bank decision", markets: ["forex"], ccy: true,
    up: ["Tougher than expected", "CCY would likely strengthen."],
    down: ["Softer than expected", "CCY would likely weaken."] },
  { re: /retail sales/i, title: "Retail sales", markets: ["stocks", "futures", "forex"],
    up: ["Stronger spending", "Good for shops and consumer stocks, and a lift for the dollar. Slightly fewer rate-cut hopes."],
    down: ["Weaker spending", "Worries about the consumer grow. The dollar would likely dip and bonds would likely rally."] },
  { re: /\bGDP\b/i, title: "Economic growth (GDP)", markets: ["futures", "forex", "stocks"],
    up: ["Faster growth", "CCY would likely strengthen. Stocks usually like it unless it fuels inflation fears."],
    down: ["Slower growth", "CCY would likely weaken. Recession talk can weigh on stocks."] },
  { re: /\bPMI\b|\bISM\b/i, title: "Business survey (PMI)", markets: ["futures", "forex"],
    up: ["Stronger than forecast", "Businesses are doing better than thought. CCY would likely firm up."],
    down: ["Weaker than forecast", "Businesses are struggling more than thought. CCY would likely soften."] }
];
var CCY_NAME = { USD: "The dollar", EUR: "The euro", GBP: "The pound", JPY: "The yen", AUD: "The Australian dollar", CAD: "The Canadian dollar", CHF: "The Swiss franc", NZD: "The New Zealand dollar", CNY: "The yuan" };
var whenTxt = (t) => {
  const d = ny(t).date, today = ny(Date.now()).date;
  const tm = fmtT2(t);
  return d === today ? `Today, ${tm} ET` : new Date(t).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short" }) + `, ${tm} ET`;
};
function buildOutlook(events, nextUp, earn, mood) {
  const now = Date.now(), out = [], seen = new Set();
  [...events.filter((e) => e.time > now), ...nextUp].forEach((e) => {
    const sc = SCEN.find((x) => x.re.test(e.name)) || (e.impact === "High" ? { title: "Economic data", markets: e.country === "USD" ? ALL_M : ["forex"], up: ["Stronger than forecast", "CCY would likely strengthen."], down: ["Weaker than forecast", "CCY would likely weaken."] } : null);
    if (!sc) return;
    const key = sc.title + e.country;
    if (seen.has(key) || out.length >= 4) return;
    seen.add(key);
    const cname = CCY_NAME[e.country] || e.country;
    const fill = (t) => t.replace(/CCY/g, cname);
    const prefix = /europe|euro|bank of|fed|fomc|ecb|boe|boj|japan|german|china|chinese|canad|austral|swiss|british|\buk\b|\bus\b/i.test(e.name) ? "" : e.country === "USD" ? "US " : e.country === "EUR" ? "Eurozone " : e.country === "GBP" ? "UK " : e.country === "JPY" ? "Japan " : e.country === "CNY" ? "China " : e.country === "CAD" ? "Canada " : e.country === "AUD" ? "Australia " : "";
    out.push({
      title: `${prefix}${e.name}`,
      kind: sc.title,
      when: whenTxt(e.time),
      time: e.time,
      likely: e.forecast ? `Forecast: ${e.forecast}${e.previous ? ` (last time: ${e.previous})` : ""}. If it lands close to that, markets have mostly priced it in and any move tends to fade. A surprise in either direction is what moves prices.` : `No forecast is published. Expect a quick move when it comes out, then watch whether it holds.`,
      if_up: `${sc.up[0]}: ${fill(sc.up[1])}`,
      if_down: `${sc.down[0]}: ${fill(sc.down[1])}`,
      markets: sc.ccy && e.country !== "USD" ? ["forex"] : sc.markets
    });
  });
  const heavy = (earn && earn.days || []).slice(0, 2).flatMap((d) => d.rows.filter((r) => r.heavy).map((r) => ({ ...r, date: d.date }))).slice(0, 2);
  heavy.forEach((r) => {
    if (out.length >= 5) return;
    const nm = r.name.replace(/,? (Inc|Corp|Corporation|Incorporated|Co|Ltd|plc)\.?$/i, "");
    const day = r.date === ny(now).date ? "Today" : new Date(r.date + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    out.push({
      title: `${nm} (${r.symbol}) earnings`, kind: "Earnings", when: `${day}, ${r.when === "after" ? "after the close" : r.when === "before" ? "before the open" : "time not set"}`, time: null,
      likely: `${r.eps ? `Analysts expect earnings of ${r.eps} a share. ` : ""}What the company says about the next few months usually matters more than the last quarter.`,
      if_up: `Beats and raises its outlook: the stock would likely jump, and it can lift the Nasdaq and its sector.`,
      if_down: `Misses or cuts its outlook: the stock would likely drop and can drag its sector with it.`,
      markets: ["stocks", "futures", "options"]
    });
  });
  if (!out.length) out.push({
    title: "No big scheduled news", kind: "Base case", when: "Next 24 hours", time: null,
    likely: `Nothing major is on the calendar, so prices will most likely follow headlines and the trend already in place. ${mood}`,
    if_up: "A surprise positive headline (a trade deal, a ceasefire, strong company news) would likely lift stocks and crypto.",
    if_down: "A surprise negative headline (new tariffs, an attack, a profit warning) would likely push money into the dollar, bonds and gold.",
    markets: ALL_M
  });
  return out;
}
function moodLine(pick) {
  const spx = pick("^GSPC") || pick("ES=F"), vix = pick("^VIX"), tnx = pick("^TNX");
  if (!spx) return "";
  if (spx.pct > 0.3 && (!vix || vix.pct < 0)) return "The mood is upbeat: investors are taking on risk.";
  if (spx.pct < -0.3 && (!vix || vix.pct > 0)) return "The mood is nervous: investors are pulling back from risk.";
  if (tnx && Math.abs(tnx.change) > 0.05) return `Bond yields are moving (${tnx.change > 0 ? "up" : "down"}), and that is setting the tone.`;
  return "The mood is calm. Markets are waiting for the next big piece of news.";
}
// ---------- briefing: likely effect, what to watch, how price reacted ----------
var POS_RE = /\b(rall(y|ies|ied)|surg(e|es|ed)|soar(s|ed)?|jump(s|ed)?|climb(s|ed)?|gain(s|ed)?|ris(e|es|ing)|rose|record high|beat(s)?|tops? (estimates|forecasts)|upgrade[sd]?|deal|agreement|ceasefire|truce|eas(e|es|ing)|cool(s|ing|er|ed)?|rate cuts?|cuts? rates|stimulus|inflows?|approv(e|es|ed|al)|rebound(s|ed)?|recover(s|ed|y)?|strong demand)\b/i;
var NEG_RE = /\b(fall(s|ing)?|fell|drop(s|ped)?|slump(s|ed)?|plung(e|es|ed)|tumbl(e|es|ed)|sink(s)?|sank|slid(e|es)?|sell-?off|miss(es|ed)?|warn(s|ed|ing)?|downgrade[sd]?|tariffs?|sanctions?|attack(s|ed)?|strikes? on|war\b|escalat\w*|hike[sd]?|hotter|sticky|outflows?|crash(es|ed)?|recession|layoffs?|default|probe|ban(s|ned)?|delay(s|ed)?|retreat(s|ed)?|slip(s|ped)?|weak(er|ens|ening)?|curbs?|seize[sd]?|fraud|hack(ed)?|exploit)\b/i;
var FLIP_RE = /hopes? (fade|dim|wane)|less likely|pushe?s? back|unlikely to cut|no rush to cut/i;
function riskTone(t) {
  const p = t.search(POS_RE), n = t.search(NEG_RE);
  let d = p < 0 && n < 0 ? 0 : p < 0 ? -1 : n < 0 ? 1 : p < n ? 1 : -1;
  if (FLIP_RE.test(t)) d = -1;
  return d;
}
function hawkTone(t) {
  if (FLIP_RE.test(t)) return 1;
  if (/\b(hike[sd]?|hot(ter)?|sticky|strong(er)? (jobs|payrolls|hiring)|higher for longer|tighten\w*|hawkish|unexpectedly rises|accelerat\w*)\b/i.test(t)) return 1;
  if (/\b(rate cuts?|cuts? rates|cool(s|ing|er|ed)?|eas(e|es|ing)|weak(er)? (jobs|payrolls|hiring)|slow(s|ing|ed)?|dovish|soft(er|ens)?|layoffs?|jobless claims rise)\b/i.test(t)) return -1;
  return 0;
}
var CCY_WORDS = { USD: /\b(dollar|greenback|usd)\b/i, EUR: /\b(euro|ecb|lagarde)\b/i, JPY: /\b(yen|boj|bank of japan)\b/i, GBP: /\b(pound|sterling|bank of england|boe)\b/i, CHF: /\b(franc|snb)\b/i, AUD: /\b(aussie|australian dollar|rba)\b/i, CAD: /\b(loonie|canadian dollar|bank of canada)\b/i, CNY: /\b(yuan|renminbi|pboc)\b/i };
var CCY_UP = /\b(strengthens?|gains?|rises?|jumps?|rall(y|ies)|firms?|climbs?|surges?|hike[sd]?|hawkish)\b/i;
var CCY_DOWN = /\b(weakens?|falls?|slips?|slides?|drops?|slumps?|tumbles?|cuts?|dovish|declines?|struggles?)\b/i;
function ccyTone(t, theme) {
  const out = {};
  Object.entries(CCY_WORDS).forEach(([c, re]) => {
    if (!re.test(t)) return;
    const up = CCY_UP.test(t), dn = CCY_DOWN.test(t);
    if (up && !dn) out[c] = 1; else if (dn && !up) out[c] = -1;
  });
  if (out.USD == null && ["rates", "inflation", "jobs"].includes(theme) && /\b(fed|fomc|powell|u\.?s\.?|us|american|treasury|cpi|payrolls?|jobless|wall street)\b/i.test(t)) {
    const h = hawkTone(t); if (h) out.USD = h;
  }
  return out;
}
var ASSET_LABEL = (id) => /^[A-Z]{6}$/.test(id) ? id.slice(0, 3) + "/" + id.slice(3) : id === "index" ? "Index funds" : id;
var WHY_DIR = {
  ratesUp: { risk: "Higher rates for longer usually weigh on stocks, tech the most.", crypto: "Rate worries tend to pull money out of crypto first.", fx: "Higher US rates usually lift the dollar." },
  ratesDown: { risk: "Lower rates make stocks, especially tech, more attractive.", crypto: "Rate-cut hopes tend to pull money into crypto.", fx: "Rate-cut talk usually weakens the dollar." },
  oilUp: { risk: "Pricier oil feeds inflation worries, which weighs on stocks." },
  oilDown: { risk: "Cheaper oil eases inflation worries, which helps stocks." },
  good: { risk: "Good news for risk appetite, so buyers usually step in.", crypto: "Upbeat news for crypto. Smaller coins usually move more than Bitcoin." },
  bad: { risk: "Bad news for risk appetite, so sellers usually step in first.", crypto: "Negative crypto news. Smaller coins usually fall harder than Bitcoin." }
};
function effectsFor(h, prof) {
  const t = h.title, theme = h.theme;
  const out = [];
  const tone = riskTone(t), hawk = hawkTone(t), ccy = ccyTone(t, theme);
  const oil = theme === "energy" ? (/\b(oil|crude|brent|opec)\b/i.test(t) ? riskTone(t.replace(/opec\+?/i, "")) : 0) : 0;
  prof.forEach((x) => {
    const m = x.m;
    if (m === "learning") return;
    const mine = relevantFor(h, m) || (h.markets || []).includes(m) || (m === "stocks" && (h.markets || []).includes("futures"));
    if (!mine) return;
    const labels = x.assets.length && !["memes"].includes(m) ? x.assets.filter((a) => !(/^M[A-Z]{1,3}$/.test(a) && x.assets.includes(a.slice(1)))).slice(0, 2).map(ASSET_LABEL).join(", ") : { stocks: "Stocks", futures: "Index futures", options: "Stocks", crypto: "Crypto", memes: "Memecoins", forex: "Dollar" }[m];
    if (m === "forex") {
      const pairs = x.assets.filter((a) => /^[A-Z]{6}$/.test(a));
      const list = pairs.length ? pairs : ["EURUSD"];
      list.slice(0, 2).forEach((p) => {
        const b = p.slice(0, 3), q = p.slice(3);
        const d = (ccy[b] || 0) - (ccy[q] || 0);
        const dir = d > 0 ? "up" : d < 0 ? "down" : "mixed";
        const reason = ccy.USD && (b === "USD" || q === "USD") ? (ccy.USD > 0 ? WHY_DIR.ratesUp.fx : WHY_DIR.ratesDown.fx) : dir === "mixed" ? "No clear push on this pair yet. Watch the first reaction." : `The story points to a ${d > 0 ? "stronger " + b : "stronger " + q}.`;
        out.push({ market: m, label: ASSET_LABEL(p), dir, reason });
      });
      return;
    }
    let d = 0, reason = "";
    const crypto = m === "crypto" || m === "memes";
    const foreignCB = theme === "rates" && /\b(ecb|lagarde|boj|bank of japan|boe|bank of england|snb|rba|bank of canada|pboc)\b/i.test(t) && !/\b(fed|fomc|powell)\b/i.test(t);
    if (foreignCB) {
      if (/\b(boj|bank of japan)\b/i.test(t) && hawk > 0) { d = -1; reason = "A stronger yen can force traders to unwind bets funded in yen, which has hit stocks and crypto before."; }
      else { d = 0; reason = "Mostly a currency story. Your market usually feels it only if the move is big."; }
    }
    else if (["rates", "inflation", "jobs"].includes(theme) && hawk) { d = -hawk; reason = (hawk > 0 ? WHY_DIR.ratesUp : WHY_DIR.ratesDown)[crypto ? "crypto" : "risk"]; }
    else if (theme === "energy" && oil) { d = -oil; reason = (oil > 0 ? WHY_DIR.oilUp : WHY_DIR.oilDown).risk; }
    else if (tone) { d = tone; reason = (tone > 0 ? WHY_DIR.good : WHY_DIR.bad)[crypto && ["crypto", "memes"].includes(theme) ? "crypto" : "risk"]; }
    if (m === "memes" && !["memes", "crypto"].includes(theme) && d) reason += " Memecoins usually move more than the rest of crypto.";
    out.push({ market: m, label: labels, dir: d > 0 ? "up" : d < 0 ? "down" : "mixed", reason: reason || "Direction unclear. Watch the first reaction." });
  });
  return out;
}
var WATCH_THEME = {
  rates: /fomc|fed|powell|ecb|boe|boj|rate|monetary|cpi|pce/i, inflation: /cpi|ppi|pce|inflation/i, jobs: /non-?farm|payroll|employment|claims|jobless/i,
  growth: /gdp|retail|pmi|ism|sentiment/i, energy: /crude|oil|inventor/i, dollar: /cpi|fomc|rate|non-?farm/i
};
var WATCH_DEFAULT = {
  rates: "Whether bond yields keep moving the same way over the next session.",
  inflation: "The next inflation number. One reading rarely settles the debate.",
  jobs: "The next jobs data and how Fed officials react to it.",
  growth: "Whether the next round of data confirms the trend.",
  earnings: "The next-day reaction. What the company says about the coming months often matters more than the results.",
  ai: "Whether other chip and AI stocks follow. The big names move the Nasdaq.",
  trade: "An official confirmation or walk-back. Early trade headlines often get revised.",
  world: "Whether it escalates. If the next update is calm, early drops are often bought back.",
  gov: "Whether it turns into real policy or money. Talk alone usually fades.",
  energy: "Whether oil holds the move into the US session.",
  gold: "Whether the dollar and yields keep moving the other way.",
  dollar: "The next US data release. It decides whether the dollar move sticks.",
  crypto: "Whether Bitcoin holds the move for the next few hours. Weekend and overnight moves often reverse.",
  memes: "Whether volume stays high. When attention fades, memecoins fall fast.",
  options: "The VIX. A jump means bigger swings are coming."
};
function watchFor(h, upcoming) {
  const re = WATCH_THEME[h.theme];
  const ev = re ? upcoming.find((e) => re.test(e.name) || re.test(e.title || "")) : null;
  if (ev) return `${ev.country === "USD" ? "US " : ""}${ev.name}, ${whenTxt(ev.time)}. That release can confirm or undo this move.`;
  return WATCH_DEFAULT[h.theme] || "How prices behave in the next session. A move that holds usually matters more than the first spike.";
}
function briefingFor(stories, prof, upcoming, focus) {
  const mk = prof.map((x) => x.m);
  const rel = (h) => mk.some((m) => relevantFor(h, m) || (h.markets || []).includes(m));
  let pool = stories.filter((h) => h.theme);
  if (focus) pool = pool.filter((h) => relevantFor(h, focus) || (h.markets || []).includes(focus));
  const DIRECT = { memes: ["memes", "crypto"], crypto: ["crypto", "memes"], forex: ["dollar", "rates", "gold", "inflation", "jobs"], futures: ["earnings", "ai", "rates", "inflation", "jobs"], stocks: ["earnings", "ai", "rates", "growth"], options: ["options", "earnings", "rates"] };
  const direct = (h) => (focus ? [focus] : mk).some((m) => (DIRECT[m] || []).includes(h.theme));
  const clear = (h) => effectsFor(h, prof).some((e) => e.dir !== "mixed");
  const ranked = pool.map((h) => ({ h, s: (h.score || 0) + (rel(h) ? 30 : 0) + (direct(h) ? 15 : 0) + (clear(h) ? 10 : 0) + (h.reaction && Math.abs(h.reaction.change) > 0 ? 5 : 0) })).sort((a, b) => b.s - a.s);
  const out = [], themes = {};
  for (const { h } of ranked) {
    if (out.length >= 3) break;
    if ((themes[h.theme] || 0) >= 2) continue;
    themes[h.theme] = (themes[h.theme] || 0) + 1;
    out.push({ headline: h.title, link: h.link, source: h.source, time: h.time, topic: h.themeLabel, why: h.why || "", effects: effectsFor(h, prof).slice(0, 3), watch: watchFor(h, upcoming), since: h.reaction || null });
  }
  return out;
}
// ---------- what's going to happen next + strategy playbook ----------
var MKT_LABEL = { stocks: "stocks", futures: "index futures", forex: "currencies", options: "options", crypto: "crypto", memes: "memecoins" };
function marketState(m, pick, briefing, outlook) {
  const spx = pick("ES=F") || pick("^GSPC"), nq = pick("NQ=F") || pick("^IXIC"), vix = pick("^VIX"), dxy = pick("DX-Y.NYB"), btc = pick("BTC-USD"), sol = pick("SOL-USD"), tnx = pick("^TNX");
  const key = { stocks: spx, futures: nq || spx, options: spx, forex: dxy, crypto: btc, memes: sol || btc }[m];
  const keyName = { stocks: "the S&P 500", futures: nq ? "Nasdaq futures" : "S&P futures", options: "the S&P 500", forex: "the dollar index", crypto: "Bitcoin", memes: sol ? "Solana" : "Bitcoin" }[m];
  const tp = key && key.pct != null ? key.pct : null;
  const trend = tp == null ? "flat" : tp > 0.4 * (m === "crypto" || m === "memes" ? 3 : m === "forex" ? 0.4 : 1) ? "up" : tp < -0.4 * (m === "crypto" || m === "memes" ? 3 : m === "forex" ? 0.4 : 1) ? "down" : "flat";
  let up = 0, down = 0;
  briefing.forEach((b) => (b.effects || []).forEach((e) => {
    if (e.market !== m) return;
    let d = e.dir === "up" ? 1 : e.dir === "down" ? -1 : 0;
    if (m === "forex" && /\/USD$/.test(e.label)) d = -d;
    if (d > 0) up++; if (d < 0) down++;
  }));
  const bias = up > down ? "up" : down > up ? "down" : "mixed";
  const ev = (outlook || []).find((o) => o.time && o.time > Date.now() && o.time - Date.now() < 30 * 36e5 && (o.markets || []).includes(m)) || null;
  const evSoon = ev && ev.time - Date.now() < 3 * 36e5;
  const vixLvl = vix ? vix.price : null;
  const volWord = m === "crypto" || m === "memes" ? (key && Math.abs(key.pct || 0) > 4 ? "high" : key && Math.abs(key.pct || 0) > 1.5 ? "normal" : "low") : vixLvl == null ? "normal" : vixLvl > 25 ? "high" : vixLvl < 15 ? "low" : "normal";
  return { m, key, keyName, tp, trend, bias, ev, evSoon, vix, vixLvl, volWord, tnx, dxy, btc, top: briefing.find((b) => (b.effects || []).some((e) => e.market === m)) || briefing[0] || null };
}
var dirWord = (d) => d === "up" ? "higher" : d === "down" ? "lower" : "sideways";
function nextFor(st) {
  const name = MKT_LABEL[st.m];
  const pctTxt = st.tp != null ? ` (${st.tp > 0 ? "+" : ""}${st.tp.toFixed(2)}% today)` : "";
  const agree = st.bias !== "mixed" && st.bias === st.trend;
  const conflict = st.bias !== "mixed" && st.trend !== "flat" && st.bias !== st.trend;
  let likely;
  if (st.ev && st.evSoon) likely = `${st.ev.title} lands soon (${st.ev.when}). Until then, ${name} will most likely drift and wait. After it, the surprise against the forecast decides the direction.`;
  else if (agree) likely = `Most likely ${dirWord(st.trend)}. ${st.keyName[0].toUpperCase() + st.keyName.slice(1)} is already moving ${st.trend}${pctTxt}, and today’s news points the same way. When price and news agree, moves tend to continue.`;
  else if (conflict) likely = `Most likely choppy. ${st.keyName[0].toUpperCase() + st.keyName.slice(1)} is moving ${st.trend}${pctTxt}, but today’s news leans ${st.bias}. When the two disagree, expect back-and-forth until one side wins.`;
  else if (st.bias !== "mixed") likely = `A lean ${st.bias === "up" ? "higher" : "lower"}. Price is flat${pctTxt}, but today’s news leans ${st.bias}. If the market starts to agree, a move ${st.bias === "up" ? "up" : "down"} is the more likely break.`;
  else if (st.trend !== "flat") likely = `Most likely more of the same. ${st.keyName[0].toUpperCase() + st.keyName.slice(1)} is moving ${st.trend}${pctTxt} without a strong news push either way, so the existing trend is the best guide.`;
  else likely = `Most likely quiet. No strong trend and no strong news push. Expect ${name} to stay in a range until something new happens.`;
  if (st.ev && !st.evSoon) likely += ` The next big test is ${st.ev.title} (${st.ev.when}).`;
  if (st.volWord === "high") likely += st.m === "crypto" || st.m === "memes" ? " Swings are already large today, so expect them to stay large." : ` Fear is elevated (VIX ${st.vixLvl.toFixed(1)}), so swings will be bigger than usual.`;
  const upCase = { stocks: "A good surprise (cooler inflation, strong earnings, a trade deal or ceasefire) would likely push stocks higher.", futures: "A good surprise (cooler inflation, dovish Fed talk, strong big-tech news) would likely send index futures higher.", options: "Calm news would likely push the VIX down and shrink option prices.", forex: "Strong US data or tough Fed talk would likely lift the dollar, pushing EUR/USD and GBP/USD lower and USD/JPY higher.", crypto: "Rate-cut hopes, fund inflows or friendly regulation would likely lift Bitcoin, with smaller coins moving more.", memes: "If Bitcoin and Solana push higher, memecoins usually rally two or three times as hard." }[st.m];
  const downCase = { stocks: "A bad surprise (hot inflation, new tariffs, conflict headlines) would likely push stocks lower, tech the most.", futures: "A bad surprise (hot inflation, hawkish Fed talk, tariff or war headlines) would likely send index futures lower.", options: "A shock would likely spike the VIX, making options pricier and moves bigger.", forex: "Weak US data or rate-cut talk would likely weaken the dollar, lifting EUR/USD and GBP/USD.", crypto: "Rate fears, fund outflows or hacks and regulatory action would likely push crypto lower, smaller coins hardest.", memes: "If Bitcoin slips or attention fades, memecoins usually fall fastest, newest coins first." }[st.m];
  return { title: `${name[0].toUpperCase() + name.slice(1)}: next 24 hours`, kind: "Base case", when: "Next 24 hours", time: null, likely, if_up: `If it breaks higher: ${upCase}`, if_down: `If it breaks lower: ${downCase}`, markets: [st.m] };
}
var PLAY = {
  ict: (st) => [
    st.ev ? `Mark the obvious highs and lows from the Asia and London sessions. ${st.ev.title} (${st.ev.when}) is when they are most likely to get run.` : "Mark the obvious highs and lows from the Asia and London sessions. With no big release ahead, the New York open is the main window for a run on them.",
    st.bias !== "mixed" ? `News leans ${st.bias}. A common ICT read: expect a run of the ${st.bias === "up" ? "lows" : "highs"} first, then a move ${st.bias}.` : "News has no clear lean, so let the first liquidity run show the direction instead of guessing.",
    st.evSoon ? "Don’t enter in the minutes around the release. Wait for the spike to show displacement, then look for your entry on the return." : "Wait for displacement after a run before looking for an entry. No run, no setup.",
    "If both sides get run, step aside. That is a sign the day has no clear direction."
  ],
  pa: (st) => [
    "Mark yesterday’s high and low and today’s opening range. Those are the levels that matter.",
    st.bias !== "mixed" ? `News leans ${st.bias}, so breaks ${st.bias === "up" ? "above resistance" : "below support"} are more likely to hold. Breaks the other way are more likely to fail.` : "With no clear news lean, treat the first break of a level with suspicion and wait for a close beyond it.",
    st.ev ? `Expect false breaks around ${st.ev.title} (${st.ev.when}). Let the first move settle before trusting a breakout.` : "Quiet calendars favour clean ranges. Fading the edges of the range tends to work better than chasing breaks.",
  ],
  sd: (st) => [
    "Mark the nearest fresh zones above and below price, where it left quickly last time.",
    st.bias !== "mixed" ? `News leans ${st.bias}, so ${st.bias === "up" ? "demand zones below" : "supply zones above"} are the ones more likely to hold.` : "No clear news lean, so wait for a strong reaction off a zone before acting.",
    st.ev ? `News spikes around ${st.ev.title} often stab into zones. The reaction after the spike matters more than the touch.` : "Zones tested for the second or third time are weaker. Favour fresh ones."
  ],
  orderflow: (st) => [
    st.ev ? `Expect a volume surge at ${st.ev.title} (${st.ev.when}). Watch who absorbs the first wave of orders.` : "With no big release, volume will cluster at the open and the close. Read the tape there.",
    st.bias !== "mixed" ? `News leans ${st.bias}. Aggressive ${st.bias === "up" ? "buying" : "selling"} that keeps getting absorbed would be an early sign the news is already priced in.` : "Look for one side running out of steam rather than guessing direction.",
  ],
  ind: (st) => [
    `The bigger trend in ${st.keyName} is ${st.trend === "flat" ? "flat" : st.trend}. Favour signals in that direction.`,
    st.ev ? `Signals in the 15 minutes after ${st.ev.title} are unreliable because indicators lag fast moves.` : "A quiet calendar is when indicator signals work best, because moves are steadier.",
    st.volWord === "high" ? "Volatility is high, so overbought and oversold readings can stay stretched for longer than usual." : "Normal volatility, so standard settings should behave as expected."
  ],
  ta: (st) => PLAY.pa(st), charts: (st) => PLAY.pa(st),
  news: (st) => [
    st.ev ? `Your main event: ${st.ev.title}, ${st.ev.when}. ${st.ev.likely || ""}`.trim() : "No major release is scheduled soon. Breaking headlines are your only catalyst today, so be selective.",
    st.ev ? `Plan both ways before it hits. ${st.ev.if_up || ""} ${st.ev.if_down || ""}`.trim() : "Breaking headlines often get walked back. The second move is usually more reliable than the first.",
    "Spreads widen and slippage rises right at the release. Size down or wait a minute or two."
  ],
  trend: (st) => [
    st.trend !== "flat" ? `${st.keyName[0].toUpperCase() + st.keyName.slice(1)} is trending ${st.trend}. ${st.bias === st.trend ? "Today’s news agrees, which supports staying with it." : st.bias === "mixed" ? "News isn’t pushing against it." : "But today’s news leans the other way, so trail stops tighter."}` : "No clear trend today. Trend-following usually struggles in flat markets, so patience is the edge.",
    st.ev ? `${st.ev.title} (${st.ev.when}) could start or end a trend. A strong close after it is a better signal than the first spike.` : "Without a big release, existing trends tend to continue into the close."
  ],
  momentum: (st) => PLAY.trend(st),
  fundamentals: (st) => [
    st.top ? `The main driver right now: “${st.top.headline.replace(/[.!?\s]+$/, "")}.”` : "No single fundamental story is dominating today.",
    "Ask one question: does this change what central banks will do? If yes, the move can last days or weeks. If not, it usually fades.",
    st.ev ? `${st.ev.title} (${st.ev.when}) is the next data point that can change the rate outlook.` : "No big data due soon, so speeches by central bankers are the main risk."
  ],
  carry: (st) => ["Carry trades work best in calm markets. " + (st.volWord === "high" ? "Volatility is high today, which is when carry trades get unwound." : "Volatility is normal, which suits carry."), st.ev ? `Watch ${st.ev.title}: anything that changes rate gaps between countries changes the carry.` : "Watch central-bank speakers for hints that rate gaps are about to change."],
  value: (st) => ["Daily headlines rarely change a value case. The question is whether today’s news changes earnings or interest rates for years, not days.", st.bias === "down" ? "Negative news days are when good companies sometimes get cheaper, which is the setup value investors wait for." : "Up days rarely create value opportunities. Patience matters more than activity."],
  growth: (st) => [`Growth stocks are the most sensitive to bond yields. The 10-year yield is ${st.tnx ? st.tnx.price.toFixed(2) + "%" : "worth watching"}${st.tnx && st.tnx.change ? `, ${st.tnx.change > 0 ? "up" : "down"} today` : ""}.`, st.bias === "up" ? "Today’s news leans supportive for growth names." : st.bias === "down" ? "Today’s news leans against growth names. Expect them to underperform if it holds." : "No clear push for growth names today."],
  dividends: (st) => [`Higher bond yields make dividend stocks less attractive by comparison. The 10-year yield is ${st.tnx ? st.tnx.price.toFixed(2) + "%" : "the number to watch"}.`, "Dividend investing is a long game. A single news day rarely matters unless it threatens a company’s payout."],
  index: (st) => ["For index investors, today’s news is mostly noise. The long-term drivers are earnings, interest rates and the economy.", st.volWord === "high" ? "Volatile days test discipline. Sticking to your regular schedule usually beats reacting." : "Calm markets are a good time to check your plan, not to change it."],
  earnings: (st) => [st.ev && st.ev.kind === "Earnings" ? `Next big report: ${st.ev.title}, ${st.ev.when}.` : "Check the Earnings tab for the next big reports.", "Options usually price in a big move before results. A result that only matches expectations can still drop the stock.", "What the company says about the next quarter usually moves the price more than the last quarter’s numbers."],
  buy: (st) => [st.ev ? `Options get pricier ahead of ${st.ev.title} and lose value right after it. Buying just before a big event means paying top price.` : "No big event soon, so option prices should be calmer. That favours buyers.", `VIX ${st.vixLvl != null ? st.vixLvl.toFixed(1) : "n/a"}: ${st.vixLvl > 25 ? "options are expensive, so you need a bigger move to profit." : st.vixLvl < 15 ? "options are cheap, which favours buying." : "option prices are normal."}`],
  sell: (st) => [`VIX ${st.vixLvl != null ? st.vixLvl.toFixed(1) : "n/a"}: ${st.vixLvl > 25 ? "premium is rich, but moves are big. Wider strikes or smaller size." : st.vixLvl < 15 ? "premium is thin. Selling pays less for the same risk." : "premium is normal."}`, st.ev ? `${st.ev.title} (${st.ev.when}) is the risk event. Selling premium through it means accepting a possible big move.` : "Quiet calendar, which is when premium selling tends to work best."],
  spreads: (st) => ["Expected moves are bigger on news days. Widths that worked last week may be too tight today.", st.bias !== "mixed" ? `News leans ${st.bias}, which favours ${st.bias === "up" ? "bullish" : "bearish"} spreads if price confirms.` : "No clear lean, so neutral structures fit better than directional ones."],
  zero: (st) => [st.ev ? `${st.ev.title} (${st.ev.when}) can swing same-day options from zero to many times their price, or the reverse, within minutes.` : "No big release, so same-day moves will come from the open and the last hour.", "Same-day options lose value fastest in the afternoon. Late entries need a fast move to pay off."],
  hedge: (st) => [st.vixLvl != null && st.vixLvl < 16 ? "Protection is cheap right now, which is when hedging costs the least." : "Protection is pricier right now, because fear is already elevated.", st.ev ? `If you want protection through ${st.ev.title}, it usually costs more the closer it gets.` : "No big event soon, so there is no rush."],
  hold: (st) => ["For long-term holders, daily crypto news is mostly noise. The big drivers are interest rates, money flowing into crypto funds and regulation.", st.bias === "down" ? "Negative news days are when long-term holders often add slowly, rather than all at once." : "Strong days rarely need action from a long-term holder."],
  swing: (st) => [`Over the next few days, the lean is ${st.bias === "mixed" ? "unclear" : st.bias}, and price is ${st.trend === "flat" ? "flat" : "trending " + st.trend}.`, st.ev ? `${st.ev.title} (${st.ev.when}) is the event that could flip the swing. Consider your position size going into it.` : "No big event ahead, so the trend is the main guide."],
  perps: (st) => [st.ev ? `Leverage gets punished around ${st.ev.title}. Liquidations hit both sides when price spikes.` : "News days liquidate crowded positions. Check whether everyone is leaning one way.", st.volWord === "high" ? "Swings are large today. Lower leverage gives your stop room to work." : "Swings are normal, but leverage still turns small moves into big losses.", "Know where you’d be liquidated before you enter."],
  narratives: (st) => [st.bias === "up" ? "Upbeat mood: money tends to rotate from Bitcoin into higher-risk sectors (AI coins, memecoins) next." : st.bias === "down" ? "Risk-off mood: money tends to rotate back into Bitcoin and stablecoins first." : "No clear mood, so rotations will be short-lived.", "The sector that holds up best on a red day is often the next leader."],
  onchain: () => ["Watch whether big holders move coins onto exchanges after today’s news. That often comes before selling.", "Stablecoin inflows to exchanges are a sign buyers are getting ready."],
  defi: () => ["Rate and regulation news change the appeal of on-chain yield.", "Check that the yield you see makes sense. Very high yields usually mean very high risk."],
  launches: (st) => [st.bias === "down" || st.trend === "down" ? "In a weak market, new launches lose buyers fastest. Most fail within hours." : "In a strong market, launches get more attention, but most still go to zero.", "Check liquidity, whether it is locked, and who holds the supply before anything else."],
  trending: (st) => [`Trending coins depend on the wider mood. ${st.keyName[0].toUpperCase() + st.keyName.slice(1)} is ${st.trend === "flat" ? "flat" : st.trend} today.`, "When Bitcoin wobbles, attention dries up quickly and trending coins drop first.", "Decide your exit before you enter. Memecoin trends end without warning."],
  kols: (st) => [st.bias === "up" ? "Influencer calls work best in an upbeat market like this, but late followers still get caught." : "In a nervous market, influencer calls fade faster than usual.", "Check how much a coin has already moved before the call. If it has run, the easy part is gone."],
  wallets: () => ["Smart wallets often reduce risk before big macro events. Watch whether the ones you follow are selling.", "Copying with a delay means worse prices. Size smaller than they do."],
  unsure: (st) => ["Use today to watch rather than trade. Pick one market and see how it reacts to the briefing’s top story.", st.ev ? `Watch ${st.ev.title} (${st.ev.when}) and see how price reacts in the first 15 minutes. That teaches more than any article.` : "Notice how price behaves at the New York open. It is the busiest time of day."]
};
function fitFor(strat, st) {
  const fast = ["ict", "news", "orderflow", "zero", "perps", "scalp", "trending", "launches", "kols"];
  const slow = ["value", "growth", "dividends", "index", "hold", "carry"];
  if (slow.includes(strat)) return { word: "Low impact", why: "Today’s news matters little for a long-term approach." };
  if (st.evSoon && fast.includes(strat)) return { word: "Big day for this", why: "A major release is close. This is the kind of day this strategy is built for, and also when it is riskiest." };
  if (st.volWord === "high") return { word: "Use caution", why: "Volatility is high, so moves are bigger and faster than usual." };
  if (st.bias !== "mixed" && st.bias === st.trend && ["trend", "momentum", "pa", "swing", "ind", "ta", "charts", "narratives"].includes(strat)) return { word: "Lines up well", why: "Price and news point the same way, which suits this strategy." };
  if (st.trend === "flat" && st.bias === "mixed" && ["trend", "momentum"].includes(strat)) return { word: "Poor fit today", why: "No trend and no news push. Trend strategies struggle here." };
  return { word: "Normal day", why: "Nothing unusual. Stick to your rules." };
}
function playbookFor(prof, states) {
  const out = [];
  prof.forEach((x) => {
    const st = states[x.m];
    if (!st) return;
    const strats = x.strats.length ? x.strats.filter((s2) => PLAY[s2]).slice(0, 3) : ["unsure"];
    strats.forEach((s2) => {
      const fit = fitFor(s2, st);
      out.push({ market: x.m, strategy: s2, name: STRAT_NAMES[s2] || s2, fit: fit.word, fitWhy: fit.why, steps: PLAY[s2](st).filter(Boolean) });
    });
  });
  return out;
}
function relevantFor(h, m) {
  const secs = SECTION_OF_MARKET[m] || [];
  return h.markets && h.markets.some((x) => secs.includes(x));
}
async function build11(q = {}) {
  let prof = parseProfile(q.p);
  const level = q.lvl === "beginner" ? "beginner" : "pro";
  const detail = ["quick", "deep"].includes(q.d) ? q.d : "balanced";
  const focus = ALL_M.includes(String(q.focus || "")) ? String(q.focus) : null;
  if (focus) prof = prof.filter((x) => x.m === focus).concat(prof.some((x) => x.m === focus) ? [] : [{ m: focus, strats: [], assets: [], hold: [] }]);
  if (!prof.length) prof = [{ m: "futures", strats: [], assets: [], hold: [] }, { m: "forex", strats: [], assets: [], hold: [] }, { m: "crypto", strats: [], assets: [], hold: [] }];
  const { res } = await settle({ world: build13(), news: build8("all"), cal: build(), mv: build9(), earn: build5() });
  const now = Date.now(), today = ny(now).date;
  const rows = res.world ? res.world.groups.flatMap((g) => g.rows.map((r) => ({ ...r, group: g.name, gid: g.id }))) : [];
  const pick = (sym) => rows.find((r) => r.sym === sym);
  const stories = (res.news && res.news.items || []).filter((h) => h.time && now - h.time < 14 * 36e5).sort((a, b) => b.score - a.score).slice(0, 18);
  const refs = stories.map((h, i) => ({ i: i + 1, title: h.title, link: h.link, source: h.source, time: h.time, theme: h.themeLabel, section: h.section, reaction: h.reaction }));
  const events = (res.cal && res.cal.events || []).filter((e) => ny(e.time).date === today && e.impact !== "Low" && (e.country === "USD" || e.impact === "High"));
  const seenNext = /* @__PURE__ */ new Set();
  const nextUp = (res.cal && res.cal.events || []).filter((e) => e.time > now && e.impact === "High").filter((e) => { const k = e.name + e.country + e.time; if (seenNext.has(k)) return false; seenNext.add(k); return true; }).slice(0, 5);
  const facts = {
    time_ny: fmtT2(now),
    world_markets: rows.map((r) => ({ name: r.label, group: r.group, price: r.price, change_pct: r.pct })),
    stories: refs.map((r) => ({ ref: r.i, title: r.title, source: r.source, topic: r.theme, minutes_ago: Math.round((now - r.time) / 6e4), price_since: r.reaction ? `${r.reaction.label} ${r.reaction.change > 0 ? "+" : ""}${r.reaction.change} ${r.reaction.unit}` : null })),
    us_stock_drivers: res.mv ? res.mv.lines : [],
    sectors: res.mv ? res.mv.sectors.map((s) => ({ name: s.name, pct: s.pct })) : [],
    releases_today: events.map((e) => ({ time: fmtT2(e.time), name: e.name, country: e.country, forecast: e.forecast, previous: e.previous, done: e.time < now })),
    coming_up: nextUp.map((e) => ({ when: new Date(e.time).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" }), name: e.name, country: e.country }))
  };
  const marketIds = prof.map((x) => x.m);
  const mood = moodLine(pick);
  const outlook = buildOutlook(events, nextUp, res.earn, mood);
  facts.scheduled_next = outlook.map((o) => ({ title: o.title, when: o.when, forecast_note: o.likely }));
  facts.mood = mood;
  let out = null, aiStatus = hasAI() ? "ok" : "no key";
  if (hasAI()) {
    try {
      const ai = await askClaude({
        maxTokens: 3200,
        system: VOICE2 + "\n" + profileText(prof, level, detail),
        user: `Write the front page of the site for right now. Data:
${JSON.stringify(facts)}

Return ONLY JSON:
{"headline": "under 90 characters: the main thing happening in the world and its effect on markets",
 "summary": "2-3 sentences: what is going on in the world right now and how markets are taking it",
 "stories": [{"ref": n, "headline": "short plain headline under 75 characters", "why": "1-2 sentences: why it matters for markets", "effects": [{"market": "short name such as Stocks, Tech stocks, Bonds, Dollar, Euro, Yen, Oil, Gold, Bitcoin, Memecoins", "dir": "up|down|mixed"}]}],
 "across": [{"area": "Stocks", "text": "1 sentence"}, {"area": "Bonds", "text": "..."}, {"area": "Currencies", "text": "..."}, {"area": "Commodities", "text": "..."}, {"area": "Crypto", "text": "..."}],
 "for_you": [{"market": one of ${JSON.stringify(marketIds.length ? marketIds : ["general"])}, "text": "1-3 sentences on what today's world news means for how this reader trades this market, written for their strategy"}],
 "watch": ["2-4 short items with times: what could move markets next"],
 "glance": {"happened": "1 sentence: the single most important thing that happened", "means": "1 sentence: what it means for markets in plain words", "next": "1 sentence: what is most likely to happen next and what would change that"},
 "outlook": [{"title": "copy a title from scheduled_next, or a developing story", "likely": "1-2 sentences: the most likely outcome and the likely market reaction, framed as likely, not certain", "if_up": "1 sentence: if it surprises one way, which markets would likely move and which way", "if_down": "1 sentence: the other way"}]}
Pick the 4-6 most important stories, world events first. effects should only list markets the data shows moving or that the story clearly concerns; use dir "mixed" when unclear. Cite stories only by ref numbers that exist.`
      });
      if (ai && ai.headline) {
        out = {
          headline: ai.headline, summary: ai.summary || "",
          stories: (ai.stories || []).filter((s) => refs[s.ref - 1]).slice(0, 6).map((s) => ({ ref: s.ref, headline: s.headline || refs[s.ref - 1].title, why: s.why || "", effects: (s.effects || []).slice(0, 4) })),
          across: (ai.across || []).slice(0, 5), forYou: (ai.for_you || []).slice(0, 7), watch: (ai.watch || []).slice(0, 4), source: "ai",
          glance: ai.glance && ai.glance.happened ? ai.glance : null,
          outlook: Array.isArray(ai.outlook) && ai.outlook.length ? ai.outlook.slice(0, 5).map((o) => { const base = outlook.find((x) => x.title === o.title) || {}; return { ...base, ...o, markets: base.markets || ALL_M, when: base.when || o.when || "" }; }) : null
        };
      }
    } catch (e) {
      out = null;
      aiStatus = "error: " + String(e.message || e).slice(0, 160);
    }
  }
  if (!out) out = rules2(prof, stories, refs, rows, pick, events, nextUp, res);
  if (!out.outlook) out.outlook = outlook;
  const upcoming = (res.cal && res.cal.events || []).filter((e) => e.time > now && e.impact !== "Low" && (e.country === "USD" || e.impact === "High"));
  const allStories = (res.news && res.news.items || []).filter((h) => h.time && now - h.time < 18 * 36e5);
  out.briefing = briefingFor(allStories, prof, upcoming, focus);
  if (focus) out.outlook = out.outlook.filter((o) => (o.markets || []).includes(focus)).slice(0, 3);
  const states = {};
  prof.filter((x) => x.m !== "learning").forEach((x) => { states[x.m] = marketState(x.m, pick, out.briefing, outlook); });
  out.next = (focus ? [focus] : Object.keys(states)).map((m) => nextFor(states[m] || marketState(m, pick, out.briefing, outlook)));
  out.playbook = playbookFor(prof, states);
  if (!out.glance) {
    const top = stories.find((h) => h.why) || stories[0], o = outlook[0];
    out.glance = {
      happened: top ? top.title.replace(/[.\s]+$/, "") + "." : "A quiet day for world news so far.",
      means: [top && top.why, mood].filter(Boolean).join(" ") || "No single story is driving markets right now.",
      next: o ? (o.kind === "Base case" ? o.likely : `Next up: ${o.title}, ${o.when}. A result close to the forecast probably won\u2019t move much. A surprise is what moves prices.`) : ""
    };
  }
  return { ...out, refs, profile: prof.map((x) => x.m), level, detail, aiStatus, updated: now };
}
function rules2(prof, stories, refs, rows, pick, events, nextUp, res) {
  const word = (p, up, down) => p == null ? "" : p > 0.05 ? up : p < -0.05 ? down : "little changed";
  const fmtP = (p) => p == null ? "" : ` (${p > 0 ? "+" : ""}${p.toFixed(2)}%)`;
  const spx = pick("^GSPC") || pick("ES=F"), tnx = pick("^TNX"), dxy = pick("DX-Y.NYB"), oil = pick("CL=F"), gold = pick("GC=F"), btc = pick("BTC-USD"), eu = pick("^STOXX50E"), jp = pick("^N225");
  const top = stories[0];
  const headline = top ? top.title.replace(/[.\s]+$/, "") : spx ? `US stocks ${word(spx.pct, "rise", "fall")}${fmtP(spx.pct)}` : "Markets at a glance";
  const sum = [];
  if (spx) sum.push(`US stocks are ${word(spx.pct, "higher", "lower")}${fmtP(spx.pct)}${eu ? `, Europe is ${word(eu.pct, "up", "down")}` : ""}${jp ? ` and Japan is ${word(jp.pct, "up", "down")}` : ""}.`);
  if (tnx && dxy) sum.push(`Bond yields are ${word(tnx.change, "rising", "falling")} and the dollar is ${word(dxy.pct, "stronger", "weaker")}.`);
  if (top) sum.push(`The biggest story right now: “${top.title}” (${top.source}).`);
  const seenWhy = new Set();
  const storiesOut = stories.slice(0, 5).map((h, i) => ({ ref: i + 1, headline: h.title, why: h.why && !seenWhy.has(h.why) && seenWhy.add(h.why) ? h.why : "", effects: [], since: h.reaction || null }));
  const across = [];
  if (spx) across.push({ area: "Stocks", text: `S&P 500 ${word(spx.pct, "up", "down")}${fmtP(spx.pct)}.${res.mv && res.mv.lines[3] ? " " + res.mv.lines[3] : ""}` });
  if (tnx) across.push({ area: "Bonds", text: `The 10-year yield is ${tnx.price.toFixed(2)}%, ${word(tnx.change, "up", "down")} today. Higher yields tend to weigh on stocks, especially tech.` });
  if (dxy) across.push({ area: "Currencies", text: `The dollar index is ${word(dxy.pct, "up", "down")}${fmtP(dxy.pct)}.` });
  if (oil || gold) across.push({ area: "Commodities", text: [oil ? `Oil ${word(oil.pct, "up", "down")}${fmtP(oil.pct)}` : "", gold ? `gold ${word(gold.pct, "up", "down")}${fmtP(gold.pct)}` : ""].filter(Boolean).join(", ") + "." });
  if (btc) across.push({ area: "Crypto", text: `Bitcoin ${word(btc.pct, "up", "down")}${fmtP(btc.pct)}.` });
  const forYou = prof.filter((x) => x.m !== "learning").map((x) => {
    const ix = stories.findIndex((h) => relevantFor(h, x.m));
    const tip = x.strats.map((s) => STRAT_TIP[s]).find(Boolean) || "";
    const seenEv = /* @__PURE__ */ new Set();
    const ev = events.filter((e) => e.time > Date.now() && (x.m === "forex" || e.country === "USD")).filter((e) => !seenEv.has(e.name) && seenEv.add(e.name));
    let text = ix >= 0 ? `The story most likely to matter for your ${MARKET_NAMES[x.m]}: “${stories[ix].title}” [${ix + 1}].` : `No single story stands out for ${MARKET_NAMES[x.m]} right now.`;
    if (ev.length && ["futures", "forex", "options", "stocks"].includes(x.m)) text += ` Still ahead today: ${ev.slice(0, 2).map((e) => `${e.name} at ${fmtT2(e.time)}`).join(" and ")}.`;
    if (tip) text += " " + tip;
    return { market: x.m, text };
  });
  if (prof.some((x) => x.m === "learning")) forYou.push({ market: "learning", text: top ? `A good one to follow today: “${top.title}”. Watch how stocks, the dollar and gold react to it over the next few hours.` : "Watch how stocks, the dollar and gold react to today’s headlines. That is the fastest way to learn what moves markets." });
  const watch = nextUp.map((e) => `${e.name} (${e.country}), ${new Date(e.time).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })}`);
  return { headline, summary: sum.join(" "), stories: storiesOut, across, forYou, watch, source: "rules" };
}

// api/explain.js
async function build12(q) {
  const title = String(q.title || "").slice(0, 300), summary = String(q.summary || "").slice(0, 600), source = String(q.source || "").slice(0, 80);
  const prof = parseProfile(q.p);
  const level = q.lvl === "beginner" ? "beginner" : "pro";
  const detail = ["quick", "deep"].includes(q.d) ? q.d : "balanced";
  const reaction2 = String(q.reaction || "").slice(0, 80);
  if (!title) throw new Error("No headline given");
  const tag = tagHeadline({ title, summary });
  let aiErr = null;
  if (hasAI()) {
    try {
      const ai = await askClaude({
        maxTokens: 900,
        system: VOICE2 + "\n" + profileText(prof, level, detail),
        user: `Headline: "${title}" (${source}).${summary ? `
Summary: ${summary}` : ""}${reaction2 ? `
Price since it broke: ${reaction2}` : ""}
Return ONLY JSON: {"what": "1-2 sentences: what happened, in plain English", "why": "1-2 sentences: why markets care", "reaction": "1 sentence: which markets it affects and how they reacted, using only the number given; if no number is given, say which markets to watch", "for_you": "1-2 sentences: what it means for how this reader trades, naming their market; if it barely matters for them, say so plainly"}`
      });
      if (ai && ai.what) return { ...ai, source: "ai" };
    } catch (e) {
      aiErr = String(e.message || e).slice(0, 160);
    }
  }
  const names = { futures: "stocks and index futures", forex: "currencies", crypto: "crypto", memes: "memecoins", options: "options", stocks: "stocks" };
  return {
    what: title + ".",
    why: tag.why || "It may not move the big markets much on its own.",
    reaction: reaction2 ? `Since the story broke: ${reaction2}.` : "Too early to measure a reaction.",
    for_you: tag.markets && tag.markets.length ? `It mainly touches ${[...new Set(tag.markets.map((m) => names[m] || m))].join(", ")}.` : "",
    source: "rules",
    aiStatus: hasAI() ? "error: " + (aiErr || "unknown") : "no key"
  };
}

// api/memedesk.js
var MEME_EFFECT = {
  memes: "Directly about memecoins. Expect fast moves in the coins it names, and a ripple across the rest.",
  crypto: "When Bitcoin and Solana move, memecoins usually move two or three times as much in the same direction.",
  rates: "Rate-cut hopes pull money into risky bets like memecoins. Rate fears drain them first.",
  inflation: "Hot inflation means fewer rate cuts, which usually hurts memecoins. Cool inflation helps them.",
  jobs: "Job numbers change rate-cut odds. Anything that makes cuts more likely tends to help memecoins.",
  world: "Scary headlines make people sell their riskiest bets first, and memecoins are at the top of that list.",
  trade: "Tariff shocks hit risky assets fast. Memecoins usually fall hardest, then bounce hardest if it's walked back.",
  dollar: "A stronger dollar usually drains money from crypto. A weaker one helps.",
  gov: "Crypto rules and political news can move the whole sector. Coins tied to politicians react the most.",
  ai: "AI hype often spills into AI-themed coins.",
  energy: "Oil only matters here if it changes the inflation and rate outlook.",
  earnings: "Big tech results set the risk mood. A strong Nasdaq usually helps crypto.",
  gold: "Gold rising on fear is usually bad for memecoins. Gold rising on rate-cut hopes is usually fine.",
  options: "Big swings in stock-market fear tend to spill into crypto."
};
var MEME_FOR = {
  stocks: "Memecoins don't move your stocks, but they are a live gauge of risk appetite. When they surge, speculative stocks often do too.",
  futures: "Memecoins don't move index futures. Treat a memecoin crash as a sign that risk appetite is fading, which can show up in the Nasdaq later.",
  forex: "Memecoins barely touch currencies. The shared driver is the dollar: a weaker dollar tends to help both risk currencies and crypto.",
  options: "Crypto-linked stocks such as Coinbase and MicroStrategy can swing with crypto sentiment, which affects their option prices.",
  crypto: "Memecoin frenzies often come late in a crypto rally. When they unwind, larger coins usually dip too.",
  memes: null,
  learning: "Memecoins are the riskiest corner of crypto. Watching them shows how quickly hype comes and goes."
};
async function build14(q = {}) {
  const prof = parseProfile(q.p);
  const { res } = await settle({ memes: build4(), wire: build8("memes"), world: build13() });
  const m = res.memes || { hot: [], majors: [], lines: [] };
  const items = (res.wire && res.wire.items || []).slice().sort((a, b) => b.time - a.time);
  const rows = res.world ? res.world.groups.flatMap((g) => g.rows) : [];
  const btc = rows.find((r) => r.sym === "BTC-USD"), sol = rows.find((r) => r.sym === "SOL-USD");
  const tokens = [...m.majors.map((c) => ({ symbol: c.symbol, name: c.name })), ...m.hot.map((h) => ({ symbol: h.symbol, name: h.name }))];
  const tokenNews = {};
  tokens.forEach((t) => {
    const sym = String(t.symbol || "").toUpperCase();
    if (!sym || tokenNews[sym]) return;
    const own = MAJOR_TICKERS[sym] && new RegExp(MAJOR_TICKERS[sym], "i").test(t.name || "");
    const borrowed = MAJOR_TICKERS[sym] && !own;
    const nameOk = t.name && t.name.length >= 4 && /^[\x20-\x7e]+$/.test(t.name) && !Object.values(MAJOR_TICKERS).some((n) => n.toLowerCase() === t.name.toLowerCase()) || own;
    const parts = [sym.length >= 3 && !borrowed ? "\\b\\$?" + sym.replace(/[^A-Z0-9]/g, "") + "\\b" : null, nameOk ? "\\b" + t.name.replace(/[^\w ]/g, "").trim() + "\\b" : null].filter(Boolean);
    if (!parts.length) return;
    const re = new RegExp(parts.join("|"), "i");
    const hits = items.filter((i) => re.test(i.title)).slice(0, 3).map((i) => ({ title: i.title, link: i.link, source: i.source, time: i.time }));
    if (hits.length) tokenNews[sym] = hits;
  });
  const avg = m.majors.length ? m.majors.reduce((s2, c) => s2 + (c.ch24 || 0), 0) / m.majors.length : null;
  const moodWord = avg == null ? "unknown" : avg > 5 ? "hot" : avg > 1 ? "warm" : avg < -5 ? "cold" : avg < -1 ? "cool" : "flat";
  const mood = {
    word: moodWord, avg,
    text: avg == null ? "Memecoin prices are unavailable right now." : `${avg > 0 ? "Up" : "Down"} ${Math.abs(avg).toFixed(1)}% on average across the biggest memecoins today${btc ? `, with Bitcoin ${btc.pct >= 0 ? "+" : ""}${btc.pct}%` : ""}${sol ? ` and Solana ${sol.pct >= 0 ? "+" : ""}${sol.pct}%` : ""}. ` + (avg > 5 ? "Risk appetite is strong. This is when new coins get the most attention, and also when late buyers get hurt." : avg < -5 ? "Risk appetite is weak. Thin, newer coins usually fall the most in this kind of market." : "No strong push either way. Moves are coin by coin.")
  };
  const drivers = items.filter((i) => i.theme && i.title.length > 25).slice(0, 30);
  const seenTheme = {};
  const picked = [];
  drivers.forEach((i) => {
    if (picked.length >= 6) return;
    if ((seenTheme[i.theme] || 0) >= 2) return;
    seenTheme[i.theme] = (seenTheme[i.theme] || 0) + 1;
    picked.push({ title: i.title, link: i.link, source: i.source, time: i.time, theme: i.themeLabel, effect: MEME_EFFECT[i.theme] || "" });
  });
  let ai = null, aiStatus = hasAI() ? "ok" : "no key";
  if (hasAI() && picked.length) {
    try {
      const r = await askClaude({
        maxTokens: 1400,
        system: VOICE2 + "\n" + profileText(prof, "pro", "balanced"),
        user: `Data: ${JSON.stringify({ mood: mood.text, news: picked.map((p, i) => ({ ref: i + 1, title: p.title, topic: p.theme })), trending: m.hot.slice(0, 8).map((h) => ({ symbol: h.symbol, chain: h.chain, ch24: h.ch24, about: h.about || h.desc })) })}
Return ONLY JSON: {"summary": "2 sentences: what is driving memecoins right now", "effects": [{"ref": n, "effect": "1 sentence: how this story is likely to affect memecoins"}], "for_you": [{"market": one of ${JSON.stringify(prof.map((x) => x.m).filter((x) => x !== "memes").concat(["memes"]))}, "text": "1-2 sentences: what today's memecoin and crypto news means for this market"}]}`
      });
      ai = r;
    } catch (e) {
      aiStatus = "error: " + String(e.message || e).slice(0, 160);
    }
  }
  let theses = {};
  if (hasAI() && m.hot.length) {
    try {
      const pick2 = m.hot.slice(0, 10);
      const r2 = await askClaude({
        maxTokens: 3500,
        system: VOICE2 + "\nYou write short investment-style theses on memecoins for everyday readers. Be honest about risk. Never say to buy or sell.",
        user: `For each token, rewrite the draft thesis into clear, specific plain English using only the data given. Data: ${JSON.stringify(pick2.map((h) => ({ symbol: h.symbol, name: h.name, chain: h.chain, description: h.desc || h.about, price_change_1h: h.ch1, price_change_24h: h.ch24, market_value: h.mcap, liquidity: h.liq, volume_24h: h.vol24, age_hours: h.created ? Math.round((Date.now() - h.created) / 36e5) : null, draft: h.thesis })))}
Return ONLY JSON: {"SYMBOL": {"headline": "under 80 characters", "what": "2-3 sentences: what the coin is and its story", "narrative": "1-2 sentences: the meme or trend it rides", "doing": "2-4 sentences: how it is doing right now, with the numbers", "bull": ["2-3 short points"], "bear": ["2-4 short points"], "watch": "1 sentence", "risk": "Extreme|Very high|High"}}`
      });
      if (r2 && typeof r2 === "object") Object.entries(r2).forEach(([k, v]) => { if (v && v.what) theses[k.toUpperCase()] = { ...v, source: "ai" }; });
    } catch (e) {
      aiStatus = "error: " + String(e.message || e).slice(0, 160);
    }
  }
  if (ai && Array.isArray(ai.effects)) ai.effects.forEach((e) => { if (picked[e.ref - 1] && e.effect) picked[e.ref - 1].effect = e.effect; });
  let forYou = prof.filter((x) => MEME_FOR[x.m] !== undefined).map((x) => ({ market: x.m, text: x.m === "memes" ? (avg != null && avg < -3 ? "A risk-off day. Newer coins with thin liquidity are the most likely to keep falling. Size down or wait for the mood to turn." : avg != null && avg > 3 ? "A risk-on day. Attention is flowing to new and trending coins, but runs fade fast. Know where you'd get out before you get in." : "A mixed day. Coin-specific news matters more than the overall mood right now.") : MEME_FOR[x.m] })).filter((x) => x.text);
  if (ai && Array.isArray(ai.for_you) && ai.for_you.length) forYou = ai.for_you.slice(0, 6);
  return { mood, summary: ai && ai.summary || "", drivers: picked, tokenNews, theses, forYou, aiStatus, source: ai ? "ai" : "rules", updated: Date.now() };
}

// api/ticks.js  (fast prices for the ticker: shared CDN cache of about one second)
var TICK_OK = /^[A-Za-z0-9^=.\-]{1,15}$/;
async function sparkBatch(syms) {
  const u = "/v8/finance/spark?symbols=" + syms.map(encodeURIComponent).join(",") + "&range=1d&interval=1m";
  let j;
  try { j = await getJSON("https://query1.finance.yahoo.com" + u); } catch (e) { j = await getJSON("https://query2.finance.yahoo.com" + u); }
  const out = {};
  const list = j && j.spark && Array.isArray(j.spark.result) ? j.spark.result.map((r) => ({ symbol: r.symbol, ...(r.response && r.response[0] || {}) })) : Object.entries(j || {}).map(([symbol, v]) => ({ symbol, ...(v || {}) }));
  list.forEach((r) => {
    const meta = r.meta || {};
    const closes = (r.close || r.indicators && r.indicators.quote && r.indicators.quote[0] && r.indicators.quote[0].close || []).filter((x) => x != null);
    const price = meta.regularMarketPrice ?? closes[closes.length - 1];
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? r.chartPreviousClose ?? r.previousClose;
    if (price != null && r.symbol) out[r.symbol] = { p: price, pc: prev ?? null, t: (meta.regularMarketTime || 0) * 1e3 || null };
  });
  return out;
}
async function build15(q) {
  const syms = String(q.s || "").split(",").map((x) => x.trim()).filter((x) => TICK_OK.test(x)).slice(0, 16);
  if (!syms.length) throw new Error("No symbols");
  const out = {};
  const missing = syms;
  if (missing.length) {
    const { res } = await settle(Object.fromEntries(missing.map((x) => [x, memo("tick:" + x, 2500, () => yahooChartRaw(x, { interval: "1m", range: "1d" }))])));
    missing.forEach((x) => {
      const c = res[x];
      if (!c) return;
      const m = c.meta || {};
      const last = c.bars.length ? c.bars[c.bars.length - 1].c : null;
      out[x] = { p: m.regularMarketPrice ?? last, pc: m.chartPreviousClose ?? m.previousClose ?? null, t: (m.regularMarketTime || 0) * 1e3 || null };
    });
  }
  return { q: out, at: Date.now() };
}

// api/results.js  (actual results the moment economic data comes out)
var NQ_CCY = { "United States": "USD", "Euro Zone": "EUR", "Eurozone": "EUR", "Germany": "EUR", "France": "EUR", "Italy": "EUR", "Spain": "EUR", "United Kingdom": "GBP", "Japan": "JPY", "Canada": "CAD", "Australia": "AUD", "New Zealand": "NZD", "Switzerland": "CHF", "China": "CNY" };
var EV_SYN = [[/nonfarm payrolls|non farm payrolls/g, "non-farm employment change"], [/initial jobless claims|jobless claims/g, "unemployment claims"], [/fed interest rate decision|fed funds rate|federal funds rate/g, "federal funds rate"], [/consumer price index/g, "cpi"], [/producer price index/g, "ppi"], [/gross domestic product/g, "gdp"], [/\bmom\b/g, "m/m"], [/\byoy\b/g, "y/y"], [/\bqoq\b/g, "q/q"]];
var EV_STOP = new Set(["the", "of", "and", "s", "a", "us", "index", "rate", "change", "final", "prelim", "preliminary", "flash", "sa", "nsa"]);
function evNorm(t) {
  let x = String(t || "").toLowerCase().replace(/\((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4])\)/g, " ").replace(/[()]/g, " ");
  EV_SYN.forEach(([re, to]) => { x = x.replace(re, to); });
  const period = (x.match(/\b(m\/m|y\/y|q\/q)\b/) || [])[1] || "";
  const words = new Set(x.replace(/m\/m|y\/y|q\/q/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !EV_STOP.has(w)));
  return { period, words };
}
function evScore(a, b) {
  const A = evNorm(a), B = evNorm(b);
  if (A.period && B.period && A.period !== B.period) return 0;
  const inter = [...A.words].filter((w) => B.words.has(w)).length;
  const uni = new Set([...A.words, ...B.words]).size || 1;
  return inter / uni;
}
var numOf = (v) => { const m = String(v || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
var HAWK_KIND = { "Inflation report": 1, "Jobs report": 1, "Fed decision or speech": 1, "Weekly jobless claims": -1, "Unemployment rate": -1 };
function releaseEffects(sc, ccy, d) {
  const sign = d === "up" ? 1 : d === "down" ? -1 : 0;
  if (!sign) return [];
  const kind = sc ? sc.title : "Economic data";
  const cbLike = kind === "Central bank decision";
  if (ccy !== "USD") {
    const dirC = (HAWK_KIND[kind] ?? 1) * sign;
    return [{ market: "forex", label: CCY_NAME[ccy] || ccy, ccy, dir: dirC > 0 ? "up" : "down", reason: dirC > 0 ? "A stronger reading than expected usually lifts the currency." : "A weaker reading than expected usually weighs on the currency." }];
  }
  if (HAWK_KIND[kind] != null || cbLike) {
    const h = (HAWK_KIND[kind] ?? 1) * sign;
    const stock = h > 0 ? "down" : "up";
    return [
      { market: "futures", label: "Index futures", dir: stock, reason: h > 0 ? "Fewer rate cuts ahead usually weigh on stocks, tech the most." : "More rate-cut hope usually lifts stocks." },
      { market: "stocks", label: "Stocks", dir: stock, reason: h > 0 ? "Higher rates for longer weigh on stock prices." : "Lower rate expectations support stock prices." },
      { market: "options", label: "Stocks", dir: stock, reason: "Expect a bigger move than usual right after the release." },
      { market: "forex", label: "US dollar", ccy: "USD", dir: h > 0 ? "up" : "down", reason: h > 0 ? "Higher rate expectations lift the dollar." : "Rate-cut hopes weigh on the dollar." },
      { market: "crypto", label: "Crypto", dir: stock, reason: h > 0 ? "Rate worries tend to pull money out of crypto." : "Rate-cut hopes tend to pull money into crypto." },
      { market: "memes", label: "Memecoins", dir: stock, reason: "Memecoins usually move more than the rest of crypto on rate news." }
    ];
  }
  return [
    { market: "forex", label: "US dollar", ccy: "USD", dir: sign > 0 ? "up" : "down", reason: sign > 0 ? "Stronger data usually lifts the dollar." : "Weaker data usually weighs on the dollar." },
    { market: "futures", label: "Index futures", dir: "mixed", reason: sign > 0 ? "Strong data helps earnings but can mean fewer rate cuts. Watch the first reaction." : "Weak data raises rate-cut hopes but also growth worries. Watch the first reaction." },
    { market: "stocks", label: "Stocks", dir: "mixed", reason: sign > 0 ? "Strong data helps earnings but can mean fewer rate cuts." : "Weak data can mean more rate cuts, but also weaker earnings." },
    { market: "crypto", label: "Crypto", dir: "mixed", reason: "Crypto usually follows the first move in stocks on data like this." }
  ];
}
var RES_REACT = ["NQ", "EURUSD", "GOLD", "BTC"];
async function build16(date) {
  const now = Date.now(), today0 = ny(now).date;
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) && String(date) <= today0 ? String(date) : today0, isToday = today === today0;
  const { res } = await settle({
    // Nasdaq's calendar lists each day's releases under the NEXT day's date
    nq: memo("econ:" + today, isToday ? 6e3 : 6e5, () => getJSON(`https://api.nasdaq.com/api/calendar/economicevents?date=${addDays(today, 1)}`, { headers: { Accept: "application/json, text/plain, */*", Origin: "https://www.nasdaq.com", Referer: "https://www.nasdaq.com/" } })),
    cal: memo("calendar", 6e4, () => build())
  });
  const rows = (res.nq && res.nq.data && res.nq.data.rows || []).map((r) => {
    const [hh, mm] = String(r.gmt || "").split(":").map(Number);
    return { name: decode(r.eventName || "").trim(), ccy: NQ_CCY[String(r.country || "").trim()] || null, mins: isNaN(hh) ? null : hh * 60 + (mm || 0), actual: decode(String(r.actual || "")).replace(/\u00a0/g, " ").trim(), consensus: decode(String(r.consensus || "")).replace(/\u00a0/g, " ").trim(), previous: decode(String(r.previous || "")).replace(/\u00a0/g, " ").trim() };
  });
  const evs = (res.cal && res.cal.events || []).filter((e) => ny(e.time).date === today && ["High", "Medium", "Low"].includes(e.impact) && !e.allDay);
  let charts = {};
  if (isToday && evs.some((e) => e.time <= now && e.impact !== "Low")) {
    const c = await settle(Object.fromEntries(RES_REACT.map((k) => [k, yahooChart(REACT[k].sym, { interval: "1m", range: "1d" })])));
    charts = c.res;
  }
  const out = evs.map((e) => {
    const em = ny(e.time).mins;
    const cands = rows.filter((r) => r.ccy === e.country && r.mins != null && Math.abs(r.mins - em) <= 3);
    // Same name twice (e.g. "CPI" for both m/m and y/y): prefer the one whose forecast matches ours
    const fNum = numOf(e.forecast), pNum = numOf(e.previous);
    const fit = (r) => {
      const c = numOf(r.consensus), a = numOf(r.actual), p = numOf(r.previous);
      if (r.consensus && e.forecast && r.consensus.replace(/\s/g, "") === e.forecast.replace(/\s/g, "")) return 0.5;
      if (p != null && pNum != null && Math.abs(p - pNum) < 1e-9) return 0.4;
      const ref = c ?? a, tgt = fNum ?? pNum;
      return ref != null && tgt != null ? -Math.min(0.4, Math.abs(ref - tgt) / (Math.abs(tgt) + 1)) : 0;
    };
    let best = null, bs = 0, bfit = -1;
    cands.forEach((r) => { const sc2 = evScore(e.title, r.name); if (sc2 < 0.25) return; const ft = fit(r); if (sc2 + ft > bs + bfit) { bs = sc2; bfit = ft; best = r; } });
    const actual = best && best.actual ? best.actual : "";
    const forecast = (best && best.consensus) || e.forecast || "";
    const a = numOf(actual), f = numOf(forecast);
    const released = !!actual && e.time <= now + 6e4;
    let d = null;
    if (released && a != null && f != null) d = Math.abs(a - f) < 1e-9 ? "inline" : a > f ? "up" : "down";
    const sc = SCEN.find((x) => x.re.test(e.name || "") || x.re.test(e.title)) || null;
    const lab = d === "up" ? (sc ? sc.up[0] : "Above forecast") : d === "down" ? (sc ? sc.down[0] : "Below forecast") : d === "inline" ? "In line with forecast" : released ? "Released" : null;
    const text = d === "up" && sc ? sc.up[1] : d === "down" && sc ? sc.down[1] : d === "inline" ? "Close to what markets expected, so the reaction often fades quickly." : "";
    // which way the surprise is good or bad for the event's own currency (green/red like ForexFactory)
    const flip = sc ? HAWK_KIND[sc.title] ?? 1 : /inventor|claims|unemploy|jobless|deficit|borrowing/i.test(e.title) ? -1 : 1;
    const ccyDir = d === "up" || d === "down" ? ((d === "up" ? 1 : -1) * flip > 0 ? "good" : "bad") : null;
    const since = released && e.impact !== "Low" ? RES_REACT.map((k) => charts[k] ? reaction(charts[k].bars, e.time, REACT[k]) : null).filter(Boolean) : [];
    return {
      key: `${e.country}|${e.title}|${e.time}`, title: e.title, name: e.name, country: e.country, impact: e.impact, time: e.time,
      forecast, previous: (best && best.previous) || e.previous || "", actual, released, dir: d, ccyDir, label: lab,
      text: text.replace(/CCY/g, CCY_NAME[e.country] || e.country), effects: released && e.impact !== "Low" ? releaseEffects(sc, e.country, d) : [], since
    };
  });
  return { events: out, matched: out.filter((x) => x.actual).length, updated: now };
}

// api/_lib/router.js
var ROUTES = {
  calendar: [() => build(), 900],
  markets: [(q) => build2(String(q.section || "futures")), 120],
  crypto: [() => build3(), 180],
  memes: [() => build4(), 120],
  earnings: [() => build5(), 1800],
  news: [(q) => build6(String(q.section || "all")), 300],
  brief: [(q) => build7(String(q.markets || "futures").split(",").filter(Boolean)), 600],
  wire: [(q) => build8(String(q.section || "all")), 120],
  movers: [() => build9(), 120],
  recap: [(q) => build10(String(q.sym || "NQ").toUpperCase()), 180],
  desk: [(q) => build11(q), hasAI() ? 900 : 180],
  world: [() => build13(), 120],
  ticks: [(q) => build15(q), 2],
  results: [(q) => build16(q.date), 5],
  memedesk: [(q) => build14(q), hasAI() ? 600 : 180],
  explain: [(q) => build12(q), 86400]
};
async function handler(req, res) {
  const q = req.query || {};
  const r = ROUTES[String(q.fn || "")];
  if (!r) {
    res.setHeader("Content-Type", "application/json");
    res.status(404).send('{"error":"unknown data"}');
    return;
  }
  try {
    send(res, await r[0](q), r[1]);
  } catch (e) {
    fail(res, e);
  }
}
module.exports = module.exports.default;
