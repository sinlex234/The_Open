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
var decode = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/g, "'").replace(/&#8217;|&rsquo;/g, "\u2019").replace(/&#8216;|&lsquo;/g, "\u2018").replace(/&#8220;|&ldquo;/g, "\u201C").replace(/&#8221;|&rdquo;/g, "\u201D").replace(/&#8211;|&ndash;/g, "\u2013").replace(/&#8212;|&mdash;/g, "\u2014").replace(/&nbsp;|&#160;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\s+/g, " ").trim();
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
    bars.push({ t: ts * 1e3, o, h, l, c });
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
  { re: /non-farm employment change|non-farm payrolls/i, exclude: /adp/i, name: "Jobs report (NFP)", what: "How many jobs the US added last month.", why: "One of the biggest movers of the month. Strong jobs can mean higher rates for longer; weak jobs can spark worry about the economy. Either way, expect fast swings.", note: "The 8:30 spike often runs one direction, grabs the orders sitting past the morning\u2019s high or low, then turns. The cleaner move tends to show up after 9:30." },
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
  { re: /gdp/i, name: "Economic growth (GDP)", what: "How fast the economy grew.", why: "The first estimate moves most; later revisions rarely do.", note: "" },
  { re: /ism manufacturing pmi/i, name: "Factory survey (ISM)", what: "Purchasing managers rate how factories are doing.", why: "Above 50 means growing, below 50 shrinking. Comes out at 10:00.", note: "Out at 10:00, when the morning move often pauses. A surprise can push price back through the morning\u2019s range." },
  { re: /ism services pmi/i, name: "Services survey (ISM)", what: "How the services side of the economy is doing.", why: "Services are most of the US economy, and the prices part of this survey is watched for inflation.", note: "" },
  { re: /flash .*pmi/i, name: "Early business survey (Flash PMI)", what: "A first look at business activity this month.", why: "Usually a modest mover in the US; bigger for Europe and the UK.", note: "" },
  { re: /consumer sentiment|consumer confidence/i, name: "Consumer mood", what: "A survey of how people feel about money and the economy.", why: "The inflation-expectations part gets the most attention.", note: "" },
  { re: /crude oil inventories/i, name: "Oil stockpiles", what: "How much crude the US has in storage.", why: "Moves oil prices at 10:30 Wednesday; rarely moves stock indexes.", note: "" },
  { re: /durable goods/i, name: "Big-ticket orders", what: "Orders for long-lasting goods like machinery.", why: "Usually a small mover.", note: "" },
  { re: /empire state|philly fed/i, name: "Regional factory survey", what: "A snapshot of factories in one part of the country.", why: "Usually small; sometimes an early hint for the national numbers.", note: "" },
  { re: /home sales|housing starts|building permits/i, name: "Housing data", what: "Home building and sales.", why: "Rarely moves index futures on its own.", note: "" },
  { re: /bond auction/i, name: "Government bond sale", what: "The Treasury sells bonds to investors.", why: "Weak demand pushes yields up, which can weigh on tech stocks around 1:00 PM.", note: "" },
  { re: /main refinancing rate|ecb press conference|monetary policy statement/i, cur: "EUR", name: "European Central Bank decision", what: "The ECB sets rates for the eurozone.", why: "Moves the euro the most; can spill over into the dollar.", note: "" },
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
  { id: "rates", label: "Interest rates", re: /\bfed\b|fomc|powell|warsh|hassett|rate cut|rate hike|interest rate|central bank|treasury yield|bond yield|\byields?\b|ecb|bank of england|\bboj\b|lagarde/i, line: "Rates touch everything. The dollar, bonds and tech stocks usually react first.", markets: ["futures", "forex", "options", "crypto"] },
  { id: "inflation", label: "Inflation", re: /inflation|\bcpi\b|\bppi\b|\bpce\b|consumer prices|price pressures/i, line: "Hot inflation pushes rate cuts further out, which tends to weigh on stocks.", markets: ["futures", "forex", "options"] },
  { id: "jobs", label: "Jobs", re: /jobs report|payroll|unemployment|jobless|labor market|hiring|layoffs/i, line: "Jobs numbers shift what the Fed does next.", markets: ["futures", "forex"] },
  { id: "earnings", label: "Earnings", re: /earnings|quarterly results|revenue|guidance|profit|\beps\b|beats estimates|misses estimates|results/i, line: "Big tech results can move the whole Nasdaq, not just the stock.", markets: ["futures", "options"] },
  { id: "ai", label: "AI & chips", re: /\bai\b|artificial intelligence|nvidia|semiconductor|chipmaker|\bchips?\b|openai|data center/i, line: "AI and chip stocks are a big chunk of the Nasdaq. When they move, NQ moves.", markets: ["futures", "options"] },
  { id: "trade", label: "Trade & tariffs", re: /tariff|trade war|trade deal|export control|sanction/i, line: "Trade headlines hit fast and often get walked back. First moves can be overdone.", markets: ["futures", "forex", "crypto"] },
  { id: "world", label: "World events", re: /\bwar\b|missile|attack|strike on|iran|israel|russia|ukraine|taiwan|north korea|ceasefire|conflict/i, line: "Scary headlines usually knock prices down quickly. Unless things escalate, buyers often step back in.", markets: ["futures", "forex", "crypto"] },
  { id: "energy", label: "Oil & energy", re: /\boil\b|crude|opec|natural gas|gasoline|brent/i, line: "Oil spikes feed inflation worries and hit stocks.", markets: ["futures", "forex"] },
  { id: "gov", label: "Washington", re: /shutdown|debt ceiling|congress|white house|treasury secretary|senate|trump|election/i, line: "Policy news can shake markets, but often fades unless real money is at stake.", markets: ["futures", "forex", "crypto"] },
  { id: "dollar", label: "Currencies", re: /dollar|\beuro\b|\byen\b|sterling|\bpound\b|currency|forex|\bfx\b|yuan/i, line: "A stronger dollar usually means weaker gold, weaker euro and pound, and sometimes softer stocks.", markets: ["forex"] },
  { id: "gold", label: "Gold", re: /\bgold\b|bullion|precious metal|silver/i, line: "Gold tends to rise when people get nervous or when rates are expected to fall.", markets: ["forex", "futures"] },
  { id: "memes", label: "Memecoins", re: /memecoin|meme coin|dogecoin|\bdoge\b|shiba|\bbonk\b|\bpepe\b|pump\.fun|\bwif\b|solana meme|rug ?pull/i, line: "Memecoins move on hype and attention. Liquidity can vanish fast.", markets: ["memes", "crypto"] },
  { id: "crypto", label: "Crypto", re: /bitcoin|\bbtc\b|crypto|ether|ethereum|solana|stablecoin|\betf\b|coinbase|binance|\bxrp\b|blockchain|token/i, line: "Crypto trades 24/7 and often reacts to the same rate news as tech stocks, just bigger.", markets: ["crypto", "memes"] },
  { id: "options", label: "Volatility", re: /volatility|\bvix\b|options|hedg|0dte|expiration|opex/i, line: "Options activity can pin prices near big strike levels, especially on expiration days.", markets: ["options", "futures"] }
];
function tagHeadline(h) {
  const text = h.title + " " + (h.summary || "");
  const hits = THEMES.filter((t) => t.re.test(text));
  const primary = hits.find((t) => t.re.test(h.title)) || hits[0] || null;
  const markets = [...new Set(hits.flatMap((t) => t.markets))];
  return { ...h, theme: primary ? primary.id : null, themeLabel: primary ? primary.label : null, why: primary ? primary.line : null, markets };
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
  }).map((e) => ({ title: e.title, country: e.country, impact: e.impact, forecast: e.forecast || "", previous: e.previous || "", time: e.time, allDay: /T00:00:00/.test(e.date) && /holiday|meeting|summit|election/i.test(e.title), ...explainEvent(e) })).sort((a, b) => a.time - b.time);
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
      notes: tokenNotes(p)
    };
  }).filter(Boolean).slice(0, 18);
  const majors = (res.majors || []).map((c) => ({ name: c.name, symbol: c.symbol.toUpperCase(), image: c.image, price: c.current_price, mcap: c.market_cap, ch24: c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h, ch7: c.price_change_percentage_7d_in_currency }));
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
  raw = raw.filter((i) => i.title && (!i.time || i.time > cutoff));
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
  }).map((h) => ({ ...h, score: score(h) }));
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
  ict: "News-driven spikes often run the obvious highs or lows first and then reverse; the New York open and the minutes after big releases are when that tends to happen.",
  pa: "Watch whether the moves today break and hold beyond yesterday’s high or low, or slip back inside.",
  sd: "News spikes into well-defined zones are where reactions tend to show up first.",
  orderflow: "Expect volume to bunch up around the scheduled releases; that is when the real buying and selling shows.",
  ind: "Fast news moves can stretch indicators quickly; signals right after a release are less reliable.",
  news: "The scheduled releases below are your main events; surprises against the forecast drive the biggest moves.",
  trend: "Trends tend to resume after news shocks fade unless the news genuinely changes the outlook.",
  fundamentals: "Central-bank comments and data surprises are what shift currency trends over days and weeks.",
  carry: "Anything that changes interest-rate expectations changes the carry between currencies.",
  value: "Day-to-day headlines matter less to you than earnings and the interest-rate outlook.",
  growth: "Growth stocks are the most sensitive to bond yields; rising yields tend to weigh on them.",
  momentum: "Strong sectors today are where momentum traders are crowding.",
  earnings: "Check which big companies report this week; results can move whole sectors.",
  dividends: "Higher bond yields make dividend stocks look less attractive by comparison.",
  index: "For long-term index investors most daily headlines are noise; the big picture is rates, earnings and the economy.",
  buy: "Big scheduled events make options pricier beforehand and cheaper right after.",
  sell: "Fear rising (a higher VIX) makes premium richer but moves bigger; scheduled news is when that risk is highest.",
  spreads: "Expected moves are larger on news days; spread widths that worked last week may be too tight today.",
  zero: "Same-day options react hardest to releases and the last hour; news days can swing them fully either way.",
  hedge: "Hedges are cheapest when things are calm; costs jump once fear rises.",
  hold: "For holders, the big picture is interest rates, flows into crypto funds and regulation, not daily swings.",
  swing: "Rate news and risk mood decide whether crypto swings continue over the next few days.",
  perps: "Leverage gets punished on news spikes; funding and liquidations pile up when everyone leans one way.",
  narratives: "Money rotates fast between crypto sectors when the overall mood changes.",
  onchain: "Watch whether big holders move coins onto exchanges after major news.",
  defi: "Rate and regulation news change the appeal of on-chain yield.",
  launches: "When the wider crypto mood turns risk-off, new launches lose buyers fastest.",
  trending: "Trending coins depend on the wider mood; when Bitcoin wobbles, attention dries up quickly.",
  kols: "Calls work best in a risk-on mood; in a nervous market they fade faster.",
  wallets: "Smart wallets often de-risk before big macro events.",
  charts: "News days can blow through chart levels; give setups more room or wait for the dust to settle.",
  unsure: "Use today to watch how markets react to the news below; it is the fastest way to learn what moves them."
};
function relevantFor(h, m) {
  const secs = SECTION_OF_MARKET[m] || [];
  return h.markets && h.markets.some((x) => secs.includes(x));
}
async function build11(q = {}) {
  const prof = parseProfile(q.p);
  const level = q.lvl === "beginner" ? "beginner" : "pro";
  const detail = ["quick", "deep"].includes(q.d) ? q.d : "balanced";
  const { res } = await settle({ world: build13(), news: build8("all"), cal: build(), mv: build9() });
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
 "watch": ["2-4 short items with times: what could move markets next"]}
Pick the 4-6 most important stories, world events first. effects should only list markets the data shows moving or that the story clearly concerns; use dir "mixed" when unclear. Cite stories only by ref numbers that exist.`
      });
      if (ai && ai.headline) {
        out = {
          headline: ai.headline, summary: ai.summary || "",
          stories: (ai.stories || []).filter((s) => refs[s.ref - 1]).slice(0, 6).map((s) => ({ ref: s.ref, headline: s.headline || refs[s.ref - 1].title, why: s.why || "", effects: (s.effects || []).slice(0, 4) })),
          across: (ai.across || []).slice(0, 5), forYou: (ai.for_you || []).slice(0, 7), watch: (ai.watch || []).slice(0, 4), source: "ai"
        };
      }
    } catch (e) {
      out = null;
      aiStatus = "error: " + String(e.message || e).slice(0, 160);
    }
  }
  if (!out) out = rules2(prof, stories, refs, rows, pick, events, nextUp, res);
  return { ...out, refs, profile: prof.map((x) => x.m), level, detail, aiStatus, updated: now };
}
function rules2(prof, stories, refs, rows, pick, events, nextUp, res) {
  const word = (p, up, down) => p == null ? "" : p > 0.05 ? up : p < -0.05 ? down : "little changed";
  const fmtP = (p) => p == null ? "" : ` (${p > 0 ? "+" : ""}${p.toFixed(2)}%)`;
  const spx = pick("^GSPC") || pick("ES=F"), tnx = pick("^TNX"), dxy = pick("DX-Y.NYB"), oil = pick("CL=F"), gold = pick("GC=F"), btc = pick("BTC-USD"), eu = pick("^STOXX50E"), jp = pick("^N225");
  const top = stories[0];
  const headline = top ? top.title : spx ? `US stocks ${word(spx.pct, "rise", "fall")}${fmtP(spx.pct)}` : "Markets at a glance";
  const sum = [];
  if (spx) sum.push(`US stocks are ${word(spx.pct, "higher", "lower")}${fmtP(spx.pct)}${eu ? `, Europe is ${word(eu.pct, "up", "down")}` : ""}${jp ? ` and Japan is ${word(jp.pct, "up", "down")}` : ""}.`);
  if (tnx && dxy) sum.push(`Bond yields are ${word(tnx.change, "rising", "falling")} and the dollar is ${word(dxy.pct, "stronger", "weaker")}.`);
  if (top) sum.push(`The biggest story right now: “${top.title}” (${top.source}).`);
  const storiesOut = stories.slice(0, 5).map((h, i) => ({ ref: i + 1, headline: h.title, why: h.why || "", effects: h.reaction ? [{ market: h.reaction.label, dir: h.reaction.change > 0 ? "up" : h.reaction.change < 0 ? "down" : "mixed" }] : [] }));
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
  if (prof.some((x) => x.m === "learning")) forYou.push({ market: "learning", text: top ? `A good one to follow today: “${top.title}”. Watch how stocks, the dollar and gold react to it over the next few hours.` : "Watch how stocks, the dollar and gold react to today’s headlines; that is the fastest way to learn what moves markets." });
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
