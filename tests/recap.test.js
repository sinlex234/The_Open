// Tests for the session recap. Each one guards a mistake that happened once (Nov 4, 2026) or could happen.
// Run with: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../recap.js");

// 5-minute bars between two New York times on a date, following a price path function f(minuteIndex) -> price
function bars(date, fromMin, toMin, f, vol = 100) {
  const out = [];
  for (let m = fromMin, k = 0; m < toMin; m += 5, k++) {
    const t = R.nyToMs(date, m), o = f(k), c = f(k + 1);
    out.push({ t, o, c, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, v: vol });
  }
  return out;
}
// A quiet background day around a level, so there are levels and a typical range to compare against
const flatDay = (date, base) => bars(date, 0, 1440, (k) => base + Math.sin(k / 6) * 20);
const NOW = R.nyToMs("2026-11-04", 17 * 60); // 5 PM New York, after the 9:30-11:30 session

function session(path, opts = {}) {
  const days = ["2026-10-30", "2026-11-02", "2026-11-03"].flatMap((d) => flatDay(d, 25000));
  const pre = bars("2026-11-04", 0, 570, (k) => 25000 + Math.sin(k / 6) * 20);
  const sess = bars("2026-11-04", 570, 690, path);
  const post = bars("2026-11-04", 690, 1000, () => opts.after || 25000);
  return [...days, ...pre, ...sess, ...post];
}

test("session window: picks today's finished session, not a future one", () => {
  const b = session(() => 25000);
  const s = R.pickSession(b, 570, 690, NOW);
  assert.equal(s.date, "2026-11-04");
  const early = R.pickSession(b, 570, 690, R.nyToMs("2026-11-04", 600));
  assert.equal(early.date, "2026-11-03", "while the session is still running, review the previous one");
});

test("session window: works for a session that crosses midnight (Asia 7 PM to 1 AM)", () => {
  const b = [...flatDay("2026-11-02", 25000), ...flatDay("2026-11-03", 25000), ...flatDay("2026-11-04", 25000)];
  const s = R.pickSession(b, 1140, 60, NOW);
  assert.ok(s, "found a session");
  assert.equal(s.end - s.start, 6 * 36e5, "six hours long");
  assert.ok(s.end <= NOW);
});

test("bias saved after the session started is not used (London session graded with a 9:30 bias)", () => {
  const b = session(() => 25000);
  const london = R.analyze({ instrument: "NQ", bars: b, from: 180, to: 480, now: NOW, bias: { call: "up", conf: "high", at: R.nyToMs("2026-11-04", 571) }, strategies: ["ict"] });
  assert.equal(london.call, null);
  assert.equal(london.result, null);
  assert.match(london.verdict, /no saved bias/i);
});

test("bias is graded from the price when it was saved, not from the session open", () => {
  // up 100 pts in the first 15 minutes, then flat: a bias saved at 9:45 caught none of that move
  const b = session((k) => k <= 3 ? 25000 + k * 33 : 25100);
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, bias: { call: "up", at: R.nyToMs("2026-11-04", 585) }, strategies: ["ict"] });
  assert.equal(r.call, "up");
  assert.equal(r.result, "flat");
});

test("ES never borrows NQ's bias", () => {
  const b = session(() => 25000);
  const r = R.analyze({ instrument: "ES", bars: b, from: 570, to: 690, now: NOW, bias: null, strategies: ["ict"] });
  assert.equal(r.call, null);
});

test("opening beyond a level is a gap, not a liquidity grab", () => {
  // opens 200 pts above yesterday's and the overnight high, then drifts down
  const b = session((k) => 25300 - k * 3);
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, bias: { call: "down", at: R.nyToMs("2026-11-04", 560) }, strategies: ["ict"] });
  assert.ok(r.summary.some((x) => /gap rather than a liquidity grab/.test(x)));
  assert.match(r.plans[0].text, /no valid entry/i, "no ICT entry from a gap");
});

test("a real sweep: entry on the close back below, stop past the high plus a buffer, walked to the target", () => {
  // starts below the 25020 highs, spikes to 25060, closes back under, then falls 150
  const path = (k) => k < 3 ? 25000 + k * 5 : k === 3 ? 25060 : k === 4 ? 25010 : 25010 - (k - 4) * 15;
  const b = session(path);
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, bias: { call: "down", at: R.nyToMs("2026-11-04", 560) }, strategies: ["ict"] });
  const p = r.plans[0];
  assert.match(p.text, /^Short at/);
  const entry = +p.text.match(/Short at ([\d,.]+)/)[1].replace(/,/g, ""), stop = +p.text.match(/stop at ([\d,.]+)/)[1].replace(/,/g, "");
  assert.ok(stop > 25061, "stop sits above the sweep high plus a buffer, never exactly at it");
  assert.ok(entry < 25020 && entry > 24900, "entry is a real candle close, not the exact top");
  assert.equal(p.result, "win");
});

test("a stop that gets hit is reported as a loss, checked before the target in the same candle", () => {
  const r = R.walk([{ t: 0, o: 100, h: 101, l: 99, c: 100 }, { t: 1, o: 100, h: 120, l: 80, c: 100 }], 0, "long", 100, 95);
  assert.equal(r.exit, "stop");
  assert.equal(r.r, -1);
});

test("quiet is measured against this window's own recent sessions", () => {
  const b = session((k) => 25000 + (k % 2) * 4);
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, strategies: ["pa"] });
  assert.ok(r.typical > 0);
  assert.equal(r.quiet, true);
});

test("forex and crypto use the prior 24 hours, not stock-market hours", () => {
  const b = session(() => 1.1600);
  const r = R.analyze({ instrument: "EURUSD", bars: b, from: 180, to: 480, now: NOW, strategies: ["pa"] });
  assert.ok(r.refs.length && r.refs.every((x) => /24-hour/.test(x.name)));
});

test("nothing after the session can change the result", () => {
  const path = (k) => k < 3 ? 25000 + k * 5 : k === 3 ? 25060 : k === 4 ? 25010 : 25010 - (k - 4) * 15;
  const a = R.analyze({ instrument: "NQ", bars: session(path, { after: 30000 }), from: 570, to: 690, now: NOW, strategies: ["ict", "trend", "ind"] });
  const z = R.analyze({ instrument: "NQ", bars: session(path, { after: 20000 }), from: 570, to: 690, now: NOW, strategies: ["ict", "trend", "ind"] });
  assert.deepEqual(a.plans, z.plans);
  assert.deepEqual(a.summary, z.summary);
});

test("every strategy the site offers gets an answer, and none claim exact tops or bottoms", () => {
  const b = session((k) => 25000 + Math.sin(k / 3) * 60 + k * 2);
  const ids = Object.keys(R.RECIPE);
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, strategies: ids.slice(0, 3) });
  r.plans.forEach((p) => assert.ok(p.text && p.text.length > 20));
  ids.forEach((id) => { const x = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, strategies: [id] }); assert.ok(x.plans.length === 1, id); assert.doesNotMatch(x.plans[0].text, /from the low of .* up to|from the high of .* down to/, id); });
});

test("news traders: no event means no trade", () => {
  const r = R.analyze({ instrument: "NQ", bars: session(() => 25000), from: 570, to: 690, now: NOW, strategies: ["news"], events: [] });
  assert.match(r.plans[0].text, /No big scheduled news/);
});

test("on a weekend, the recap is Friday's session (no weekend bars for futures)", () => {
  const b = ["2026-11-04", "2026-11-05", "2026-11-06"].flatMap((d) => flatDay(d, 25000));
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: R.nyToMs("2026-11-07", 960), strategies: ["ict"] });
  assert.equal(r.date, "2026-11-06");
});

test("the recap follows the strategy's plan: ICT long after a sell-side sweep, aiming for the opposite liquidity", () => {
  // dips under yesterday's/overnight lows at 9:35, closes back above, then rallies through the highs
  const path = (k) => k === 0 ? 24990 : k === 1 ? 24972 : k === 2 ? 24990 : 24990 + (k - 2) * 12;
  const b = session(path);
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, bias: { call: "up", at: R.nyToMs("2026-11-04", 560) }, strategies: ["ict"] });
  const t = r.plans[0].text;
  assert.match(t, /^Long at/);
  assert.match(t, /ran below/);
  assert.match(t, /plan’s target/);
  assert.doesNotMatch(t, /best move/i);
});
