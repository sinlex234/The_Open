// Always-on watcher rules. Each test is one rule from the top of worker/logic.js.
const test = require("node:test");
const assert = require("node:assert");
const W = require("../worker/logic.js");

const NOW = Date.parse("2026-11-12T15:00:00Z");
// a day of 1-minute bars wiggling ~0.02% a minute, ending at NOW; `jump` adds a move over the last 5 minutes
function bars({ jump = 0, n = 600, end = NOW, stale = 0 } = {}) {
  const out = []; let p = 20000;
  for (let i = 0; i < n; i++) { const t = end - stale - (n - 1 - i) * 6e4; p *= 1 + (i % 2 ? 0.0002 : -0.0002); out.push({ t, c: p }); }
  for (let k = 1; k <= 5; k++) out[n - 1 - 5 + k].c = out[n - 1 - 5].c * (1 + jump / 100 * k / 5);
  return out;
}

test("rule 1: a big 5-minute move against a normal 5 minutes counts", () => {
  const m = W.detectMove(bars({ jump: 0.6 }), W.MOVERS.NQ, NOW);
  assert.ok(m, "detected");
  assert.equal(m.way, "up");
  assert.ok(m.ratio >= 5);
  assert.equal(W.detectMove(bars({ jump: -0.6 }), W.MOVERS.NQ, NOW).way, "down");
});

test("rule 1: an ordinary wiggle, or a move under the market's minimum, doesn't count", () => {
  assert.equal(W.detectMove(bars(), W.MOVERS.NQ, NOW), null);
  // 0.15% is many times normal here, but under NQ's 0.25% minimum
  assert.equal(W.detectMove(bars({ jump: 0.15 }), W.MOVERS.NQ, NOW), null);
});

test("rule 2: a feed that stopped is never a move", () => {
  assert.equal(W.detectMove(bars({ jump: 0.8, stale: 10 * 6e4 }), W.MOVERS.NQ, NOW), null);
});

test("rule 3: one alert per market per 30 minutes unless the move doubles", () => {
  const first = { t: NOW, pct: 0.4 };
  assert.equal(W.shouldAlert({ t: NOW + 10 * 6e4, pct: 0.5 }, first), false);
  assert.equal(W.shouldAlert({ t: NOW + 10 * 6e4, pct: 0.85 }, first), true);
  assert.equal(W.shouldAlert({ t: NOW + 10 * 6e4, pct: -0.9 }, first), false, "a reversal inside 30 minutes waits");
  assert.equal(W.shouldAlert({ t: NOW + 31 * 6e4, pct: 0.3 }, first), true);
  assert.equal(W.shouldAlert(null, first), false);
});

test("rule 4: a release out in the last 10 minutes is the cause; otherwise a recent headline about that market", () => {
  const mv = { t: NOW, pct: -0.5 };
  const ev = [{ title: "CPI m/m", time: NOW - 4 * 6e4, actual: "0.5%", forecast: "0.3%", impact: "High" }];
  const heads = [{ title: "Apple shares slide on China sales", time: NOW - 5 * 6e4, source: "Reuters" }, { title: "Recipe of the week", time: NOW - 3 * 6e4 }];
  assert.equal(W.findCause(mv, "NQ", ev, heads).kind, "release");
  assert.match(W.findCause(mv, "NQ", ev, heads).text, /CPI m\/m came out at 0\.5% \(forecast 0\.3%\)/);
  const h = W.findCause(mv, "NQ", [], heads);
  assert.equal(h.kind, "headline");
  assert.equal(h.text, "Apple shares slide on China sales");
  // an hour-old release or an oil headline doesn't explain a Nasdaq move
  assert.equal(W.findCause(mv, "NQ", [{ ...ev[0], time: NOW - 60 * 6e4 }], [{ title: "OPEC talks", time: NOW - 2 * 6e4 }]).kind, "none");
});

const pair = (o = {}) => ({ priceChange: { h1: 35, h6: 80, h24: 120 }, volume: { h1: 2e5 }, txns: { h1: { buys: 300, sells: 200 } }, liquidity: { usd: 1.5e5 }, marketCap: 2e6, pairCreatedAt: NOW - 72 * 36e5, ...o });

test("rule 5: taking off needs a real rise with real trading behind it", () => {
  assert.ok(W.radarScore(pair()) > 0);
  assert.equal(W.radarScore(pair({ priceChange: { h1: 5, h6: 10 } })), null, "not rising");
  assert.equal(W.radarScore(pair({ volume: { h1: 2e4 } })), null, "too little traded");
  assert.equal(W.radarScore(pair({ liquidity: { usd: 1e4 } })), null, "too thin");
  assert.equal(W.radarScore(pair({ txns: { h1: { buys: 10, sells: 5 } } })), null, "too few buyers");
  assert.ok(W.radarScore(pair({ priceChange: { h1: 8, h6: 60 } })) > 0, "a 6-hour run still going counts");
  assert.equal(W.radarScore(pair({ priceChange: { h1: -5, h6: 300 } })), null, "a 6-hour run that is falling this hour doesn't");
});

test("rule 6: warning signs are always shown", () => {
  const f = W.radarFlags(pair({ pairCreatedAt: Date.now() - 3 * 36e5, liquidity: { usd: 3e4 }, txns: { h1: { buys: 100, sells: 150 } }, priceChange: { h1: -20, h24: 400 } }), { boosted: true, rug: { score: 70, risks: ["Mint authority still enabled"] } }).map((x) => x.text).join(" | ");
  assert.match(f, /Brand new/);
  assert.match(f, /Thin liquidity/);
  assert.match(f, /More sellers than buyers/);
  assert.match(f, /4x in a day/);
  assert.match(f, /now dropping/);
  assert.match(f, /paid to promote/);
  assert.match(f, /high risk \(70\/100\)/);
  assert.match(f, /Mint authority/);
});

test("rule 7: a flagged line is kept only if it's word for word in the speech", () => {
  const text = "Thank you. Inflation remains   somewhat elevated, and further progress is not assured. We will act “as appropriate” to keep prices stable.";
  const out = W.keepQuotes([{ quote: "Inflation remains somewhat elevated, and further progress is not assured." }, { quote: "We are ready to cut rates in December if needed." }, { quote: 'We will act "as appropriate" to keep prices stable.' }], text);
  assert.equal(out.length, 2);
});

test("feeds and pages are read safely", () => {
  const rss = `<rss><channel><item><title>Speech by Governor Waller on the &amp; outlook</title><link>https://www.federalreserve.gov/x.htm</link><pubDate>Wed, 11 Nov 2026 18:00:00 GMT</pubDate></item><item><title>bad</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const items = W.parseFeed(rss);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "Speech by Governor Waller on the & outlook");
  assert.equal(items[0].t, Date.parse("2026-11-11T18:00:00Z"));
  assert.equal(W.htmlText("<script>x()</script><p>Rates&nbsp;will</p><p>stay</p>"), "Rates will\nstay");
});
