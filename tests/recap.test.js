// Tests for the session recap. Each one guards a mistake that happened once (Nov 4–7, 2026) or could happen.
// The core rule: the recap replays the exact plan each strategy was given, with the plan's own levels,
// entry, invalidation and targets. It never shows "the best move of the day".
// Run with: node --test tests/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const R = require("../recap.js");

const DAY = "2026-11-04", NOW = R.nyToMs(DAY, 17 * 60); // 5 PM New York, after the 9:30-11:30 session
// 5-minute bars between two New York times following f(k) -> price
function bars(date, fromMin, toMin, f, vol = 100) {
  const out = [];
  for (let m = fromMin, k = 0; m < toMin; m += 5, k++) { const t = R.nyToMs(date, m), o = f(k), c = f(k + 1); out.push({ t, o, c, h: Math.max(o, c) + 1, l: Math.min(o, c) - 1, v: vol }); }
  return out;
}
// Background chosen so the plan's levels are clear: this week's range is ±150 around 25,000 (Monday),
// yesterday's ±80, and the pre-session drift ±20. So below price: yesterday's low ~24,920, then this week's low ~24,850;
// above: yesterday's high ~25,080, then this week's high ~25,150.
function background() {
  return [
    ...bars("2026-10-30", 0, 1440, (k) => 25000 + Math.sin(k / 20) * 40),
    ...bars("2026-11-02", 0, 1440, (k) => 25000 + Math.sin(k / 20) * 150),
    ...bars("2026-11-03", 0, 1440, (k) => 25000 + Math.sin(k / 20) * 80),
    ...bars(DAY, 0, 570, (k) => 25000 + Math.sin(k / 6) * 20)
  ];
}
// A session from explicit candles [open, high, low, close] starting 9:30, padded flat to 11:30
function session(candles, opts = {}) {
  const out = candles.map(([o, h, l, c], i) => ({ t: R.nyToMs(DAY, 570 + i * 5), o, h, l, c, v: opts.vol ? opts.vol[i] || 100 : 100 }));
  let last = out[out.length - 1].c;
  for (let i = out.length; i < 24; i++) out.push({ t: R.nyToMs(DAY, 570 + i * 5), o: last, h: last + 2, l: last - 2, c: last, v: 100 });
  const after = bars(DAY, 690, 1000, () => opts.after || last);
  return [...background(), ...out, ...after];
}
const run = (candles, o = {}) => R.analyze({ instrument: o.instrument || "NQ", bars: session(candles, o), from: 570, to: 690, now: NOW, bias: o.call ? { call: o.call, at: R.nyToMs(DAY, 560) } : null, strategies: o.strategies || ["ict"], events: o.events || [], followUps: o.fu || {} });

test("the plan's levels are rebuilt from before the session only", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  assert.ok(lv.below.length >= 2 && lv.above.length >= 2, "levels on both sides");
  assert.ok(lv.below[0].v > lv.below[1].v && lv.above[0].v < lv.above[1].v, "nearest level first");
  assert.ok(lv.below.every((x) => x.v < 25000) && lv.above.every((x) => x.v > 25000));
});

test("ICT long follows the plan: sweep below the level, displacement up, fill in the fair value gap, target the plan's level", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v, a1 = lv.above[0].v;
  const r = run([
    [b1 + 3, b1 + 4, b1 - 6, b1 - 2],        // 9:30 run below the level (sell-side liquidity)
    [b1 - 2, b1 + 40, b1 - 3, b1 + 38],      // 9:35 strong candle up (displacement)
    [b1 + 38, b1 + 60, b1 + 20, b1 + 55],    // 9:40 leaves a gap above 9:30's high: the fair value gap
    [b1 + 55, b1 + 56, b1 + 15, b1 + 25],    // 9:45 pulls back into the gap: the entry
    [b1 + 25, a1 + 10, b1 + 24, a1 + 5]      // 9:50 runs to the plan's target
  ], { call: "up" });
  const p = r.plans[0];
  assert.match(p.plan, /run below/);
  assert.match(p.text, /^Long at/);
  assert.match(p.text, /fair value gap/);
  assert.match(p.text, /plan’s target/);
  assert.equal(p.result, "win");
  assert.doesNotMatch(JSON.stringify(r), /best move/i);
});

test("ICT: when price keeps going through the next level, the plan says step back (no trade)", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b2 = lv.below[1].v;
  const r = run([[25000, 25002, 24960, 24965], [24965, 24966, 24900, 24905], [24905, 24906, b2 - 20, b2 - 15], [b2 - 15, b2 - 10, b2 - 40, b2 - 35]], { call: "up" });
  assert.match(r.plans[0].text, /step back/);
  assert.equal(r.plans[0].result, "none");
});

test("ICT: a sweep with no displacement and fair value gap means no entry", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v;
  const r = run([[25000, 25002, b1 - 4, b1 - 1], [b1 - 1, b1 + 3, b1 - 2, b1 + 2], [b1 + 2, b1 + 4, b1, b1 + 3]], { call: "up" });
  assert.match(r.plans[0].text, /no clean displacement/);
});

test("ICT follow-ups change the entry: order block users enter at the order block", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v, a1 = lv.above[0].v;
  const c = [[b1 + 3, b1 + 4, b1 - 6, b1 - 2], [b1 - 2, b1 + 40, b1 - 3, b1 + 38], [b1 + 38, b1 + 60, b1 + 20, b1 + 55], [b1 + 55, b1 + 56, b1, b1 + 10], [b1 + 10, a1 + 10, b1 + 9, a1 + 5]];
  const r = run(c, { call: "up", fu: { ict: ["ob"] } });
  assert.match(r.plans[0].text, /order block/);
});

test("price action long: buys the pullback that holds above the plan's level", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v;
  const r = run([[25000, 25003, 24960, 24965], [24965, 24966, b1 + 1, b1 + 6], [b1 + 6, b1 + 20, b1 + 5, b1 + 18], [b1 + 18, b1 + 300, b1 + 17, b1 + 290]], { call: "up", strategies: ["pa"] });
  assert.match(r.plans[0].text, /^Long at/);
  assert.match(r.plans[0].text, /held/);
});

test("supply and demand: a third test of the zone is skipped", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v;
  const touchFail = [[b1 + 30, b1 + 31, b1 + 2, b1 + 25], [b1 + 25, b1 + 40, b1 + 24, b1 + 35]];
  // two tests that don't confirm (close below the prior close), then a third
  const r = run([[25000, 25002, b1 + 30, b1 + 32], [b1 + 32, b1 + 33, b1 + 1, b1 + 20], [b1 + 20, b1 + 21, b1 + 15, b1 + 16], [b1 + 16, b1 + 60, b1 + 15, b1 + 55], [b1 + 55, b1 + 56, b1 + 2, b1 + 30], [b1 + 30, b1 + 31, b1 + 25, b1 + 26], [b1 + 26, b1 + 70, b1 + 25, b1 + 65], [b1 + 65, b1 + 66, b1 + 3, b1 + 40], [b1 + 40, b1 + 80, b1 + 39, b1 + 75]], { call: "up", strategies: ["sd"] });
  assert.match(r.plans[0].text, /third/);
  void touchFail;
});

test("trend: no fixed target, exits on the plan's own rule or the session end", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const a1 = lv.above[0].v;
  const r = run([[25000, 25010, 24995, 25008], [25008, a1 + 15, 25007, a1 + 10], [a1 + 10, a1 + 60, a1 + 9, a1 + 55]], { call: "up", strategies: ["trend"] });
  assert.match(r.plans[0].text, /^Long at/);
  assert.match(r.plans[0].text, /session end|exit rule/);
});

test("momentum: no break of the level in the first two hours means no trade", () => {
  const r = run([[25000, 25010, 24995, 25005]], { call: "up", strategies: ["momentum"] });
  assert.match(r.plans[0].text, /momentum faded/);
});

test("news: a reaction that holds against the bias cancels the plan", () => {
  const ev = { time: R.nyToMs(DAY, 600), name: "CPI" };
  const c = Array.from({ length: 6 }, () => [25000, 25002, 24998, 25000]).concat([[25000, 25005, 24940, 24945], [24945, 24950, 24930, 24935], [24935, 24940, 24925, 24930], [24930, 24932, 24920, 24922]]);
  const r = run(c, { call: "up", strategies: ["news"], events: [ev] });
  assert.match(r.plans[0].text, /cancelled the plan/);
});

test("order flow without volume says it can't be judged instead of guessing", () => {
  const r = run([[25000, 25002, 24998, 25000]], { call: "up", strategies: ["orderflow"], vol: Array(24).fill(0) });
  const zeroVol = session([[25000, 25002, 24998, 25000]]).map((b) => ({ ...b, v: 0 }));
  const r2 = R.analyze({ instrument: "NQ", bars: zeroVol, from: 570, to: 690, now: NOW, bias: { call: "up", at: R.nyToMs(DAY, 560) }, strategies: ["orderflow"] });
  assert.match(r2.plans[0].text, /no volume/);
  void r;
});

test("every strategy in the setup questions has a replay, and none ever shows the best move", () => {
  const me = fs.readFileSync(path.join(__dirname, "../me.js"), "utf8");
  const block = me.slice(me.indexOf("const STRATS = {"), me.indexOf("const STRAT_SHORT"));
  const ids = [...new Set([...block.matchAll(/opt\('([a-z0-9]+)'/g)].map((m) => m[1]))];
  assert.ok(ids.length > 30, "found the setup strategies");
  ids.forEach((id) => assert.ok(R.STRATS[id], `strategy "${id}" from the setup questions has no recap replay`));
  const c = [[25000, 25004, 24900, 24910], [24910, 25060, 24905, 25050], [25050, 25200, 25040, 25190]];
  ids.forEach((id) => ["up", "down", null].forEach((call) => {
    const r = run(c, { call, strategies: [id] });
    assert.equal(r.plans.length, 1, id);
    assert.ok(r.plans[0].text && r.plans[0].text.length > 20, `${id} (${call}) explains itself`);
    assert.doesNotMatch(r.plans[0].text, /best move|from the low of .* up to|from the high of .* down to/i, id);
  }));
});

test("session window: today's finished session, not one still running; overnight sessions work", () => {
  const b = session([[25000, 25005, 24995, 25000]]);
  assert.equal(R.pickSession(b, 570, 690, NOW).date, DAY);
  assert.equal(R.pickSession(b, 570, 690, R.nyToMs(DAY, 600)).date, "2026-11-03");
  const s = R.pickSession(background(), 1140, 60, NOW);
  assert.ok(s && s.end - s.start === 6 * 36e5);
});

test("bias saved after the session started is not used (London session with a 9:30 bias)", () => {
  const r = R.analyze({ instrument: "NQ", bars: session([[25000, 25005, 24995, 25000]]), from: 180, to: 480, now: NOW, bias: { call: "up", at: R.nyToMs(DAY, 571) }, strategies: ["ict"] });
  assert.equal(r.call, null);
  assert.match(r.verdict, /no saved bias/i);
});

test("bias is graded from the price when it was saved, not the session open", () => {
  const c = [[25000, 25034, 24999, 25033], [25033, 25067, 25032, 25066], [25066, 25100, 25065, 25099], [25099, 25101, 25098, 25100]];
  const r = R.analyze({ instrument: "NQ", bars: session(c), from: 570, to: 690, now: NOW, bias: { call: "up", at: R.nyToMs(DAY, 584) }, strategies: ["ict"] });
  assert.equal(r.result, "flat");
});

test("ES never borrows NQ's bias", () => {
  const r = R.analyze({ instrument: "ES", bars: session([[25000, 25005, 24995, 25000]]), from: 570, to: 690, now: NOW, bias: null, strategies: ["ict"] });
  assert.equal(r.call, null);
});

test("a stop and a target in the same candle counts as the stop", () => {
  const w = R.walk([{ t: 0, o: 100, h: 101, l: 99, c: 100 }, { t: 1, o: 100, h: 120, l: 80, c: 100 }], 0, "long", 100, 95, null);
  assert.equal(w.exit, "stop");
});

test("nothing after the session can change the result", () => {
  const c = [[25000, 25004, 24900, 24910], [24910, 25060, 24905, 25050], [25050, 25200, 25040, 25190]];
  const a = run(c, { call: "up", strategies: ["ict", "pa", "trend"], after: 30000 }), z = run(c, { call: "up", strategies: ["ict", "pa", "trend"], after: 20000 });
  assert.deepEqual(a.plans, z.plans);
});

test("forex and crypto levels roll at their own day start", () => {
  const lv = R.planLevels(session([[1.16, 1.161, 1.159, 1.16]]).map((b) => ({ ...b, o: b.o / 21000, h: b.h / 21000, l: b.l / 21000, c: b.c / 21000 })), R.nyToMs(DAY, 570), "fx");
  assert.ok(lv.above.length && lv.below.length);
});

test("on a weekend, the recap is Friday's session", () => {
  const b = ["2026-11-04", "2026-11-05", "2026-11-06"].flatMap((d) => bars(d, 0, 1440, (k) => 25000 + Math.sin(k / 6) * 20));
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: R.nyToMs("2026-11-07", 960), strategies: ["ict"] });
  assert.equal(r.date, "2026-11-06");
});

// ---------- fixes from the Nov 9, 2026 review ----------
test("rule 2: a session that opens beyond the level is a gap, not a sweep (no trade, with or without a bias)", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v, a1 = lv.above[0].v;
  // opens under the level, closes back above it, displaces up with a gap, pulls back, runs. Never sweeps again.
  const c = [[b1 - 10, b1 - 8, b1 - 20, b1 - 15], [b1 - 15, b1 + 20, b1 - 16, b1 + 18], [b1 + 18, b1 + 40, b1 + 10, b1 + 35], [b1 + 35, b1 + 36, b1 + 5, b1 + 20], [b1 + 20, a1 + 10, b1 + 19, a1 + 5]];
  const r = run(c, { call: "up" });
  assert.equal(r.plans[0].result, "none");
  assert.match(r.plans[0].text, /opened below .* no liquidity grab to trade/);
  const nb = run(c.slice(0, 4), {}); // same open, without the later run to the high above
  assert.equal(nb.plans[0].result, "none");
  assert.match(nb.plans[0].text, /no liquidity grab/);
});

test("rule 2: after a gap, a later move back through the level and a real sweep still counts", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v, a1 = lv.above[0].v;
  const r = run([
    [b1 - 10, b1 - 8, b1 - 20, b1 - 15], [b1 - 15, b1 + 10, b1 - 16, b1 + 8], // gap below, then closes back above
    [b1 + 8, b1 + 9, b1 - 6, b1 - 2],                                        // the real sweep
    [b1 - 2, b1 + 40, b1 - 3, b1 + 38], [b1 + 38, b1 + 60, b1 + 20, b1 + 55], [b1 + 55, b1 + 56, b1 + 15, b1 + 25], [b1 + 25, a1 + 10, b1 + 24, a1 + 5]
  ], { call: "up" });
  assert.match(r.plans[0].text, /^Long at/);
  assert.match(r.plans[0].text, /came back, then ran below/);
});

test("rule 7: later candles in the session can't change an earlier decision (normal size comes from before the session)", () => {
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v, a1 = lv.above[0].v;
  const head = [[b1 + 3, b1 + 4, b1 - 6, b1 - 2], [b1 - 2, b1 + 40, b1 - 3, b1 + 38], [b1 + 38, b1 + 60, b1 + 20, b1 + 55], [b1 + 55, b1 + 56, b1 + 15, b1 + 25], [b1 + 25, a1 + 10, b1 + 24, a1 + 5]];
  const p = a1 + 5, flat = Array.from({ length: 13 }, () => [p, p + 2, p - 2, p]);
  const calm = flat.concat(Array.from({ length: 6 }, () => [p, p + 2, p - 2, p]));
  const wild = flat.concat(Array.from({ length: 6 }, (_, i) => i % 2 ? [p + 400, p + 401, p - 1, p] : [p, p + 401, p - 1, p + 400]));
  const a = run(head.concat(calm), { call: "up" }), z = run(head.concat(wild), { call: "up" });
  assert.equal(a.plans[0].result, "win");
  assert.deepEqual(z.plans[0], a.plans[0]);
});

test("rule 7: stop buffers use the instrument's real tick (crude oil isn't buffered by NQ's 0.25)", () => {
  Object.entries(R.INSTR).forEach(([k, v]) => assert.ok(v.tick > 0, k + " has a tick"));
  assert.equal(R.INSTR.CL.tick, 0.01);
  const lv = R.planLevels(session([[25000, 25005, 24995, 25000]]), R.nyToMs(DAY, 570), "fut");
  const b1 = lv.below[0].v, a1 = lv.above[0].v, k = 400;
  const c = [[b1 + 3, b1 + 4, b1 - 6, b1 - 2], [b1 - 2, b1 + 40, b1 - 3, b1 + 38], [b1 + 38, b1 + 60, b1 + 20, b1 + 55], [b1 + 55, b1 + 56, b1 + 15, b1 + 25], [b1 + 25, a1 + 10, b1 + 24, a1 + 5]];
  const cl = session(c).map((b) => ({ ...b, o: b.o / k, h: b.h / k, l: b.l / k, c: b.c / k }));
  const r = R.analyze({ instrument: "CL", bars: cl, from: 570, to: 690, now: NOW, bias: { call: "up", at: R.nyToMs(DAY, 560) }, strategies: ["ict"] });
  const m = r.plans[0].text.match(/^Long at ([\d.]+) .* Stop at ([\d.]+)/);
  assert.ok(m, r.plans[0].text);
  assert.ok(+m[1] - +m[2] < 0.3, `risk ${(+m[1] - +m[2]).toFixed(2)} on a ~$62 contract`);
});

test("rule 1: only a bias from the session's own trading day counts, and the latest one before the cutoff", () => {
  const b = session([[25000, 25005, 24995, 25000]]);
  // London session today must not use yesterday's 9:20 AM bias
  const lon = R.analyze({ instrument: "NQ", bars: b, from: 180, to: 480, now: NOW, bias: [{ call: "down", at: R.nyToMs("2026-11-03", 560) }], strategies: ["ict"] });
  assert.equal(lon.call, null);
  // two biases saved before the 9:30 session: the later one is the one that counts
  const ny = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, bias: [{ call: "up", at: R.nyToMs(DAY, 480) }, { call: "down", at: R.nyToMs(DAY, 560) }], strategies: ["ict"] });
  assert.equal(ny.call, "down");
});

test("New York time -> UTC is right on daylight-saving Sundays", () => {
  assert.equal(R.nyToMs("2026-11-01", 180), Date.parse("2026-11-01T08:00:00Z")); // 3 AM EST, after fall-back
  assert.equal(R.nyToMs("2026-11-01", 360), Date.parse("2026-11-01T11:00:00Z"));
  assert.equal(R.nyToMs("2026-03-08", 240), Date.parse("2026-03-08T08:00:00Z")); // 4 AM EDT, after spring-forward
  assert.equal(R.nyToMs("2026-11-04", 570), Date.parse("2026-11-04T14:30:00Z"));
  assert.equal(R.nyToMs("2026-07-01", 570), Date.parse("2026-07-01T13:30:00Z"));
});

test("rule 4: the typical range uses the same clock window on earlier dates, across a weekend and a DST change", () => {
  const win = (d, amp) => bars(d, 570, 690, (k) => 25000 + (k % 2 ? amp : 0));
  const b = [...win("2026-10-28", 400), ...win("2026-10-29", 400), ...win("2026-10-30", 400), ...win("2026-11-02", 100), ...win("2026-11-03", 100), ...win(DAY, 50)];
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, strategies: ["ict"] });
  assert.equal(r.date, DAY);
  assert.equal(r.typical, 402, "median of 5 sessions (102, 102, 402, 402, 402)");
});

test("bars with a price of zero or below are ignored", () => {
  const b = session([[25000, 25005, 24995, 25000]]);
  const i = b.findIndex((x) => x.t === R.nyToMs(DAY, 595));
  b[i] = { ...b[i], o: 0, h: 0, l: 0, c: 0 };
  const r = R.analyze({ instrument: "NQ", bars: b, from: 570, to: 690, now: NOW, strategies: ["ict"] });
  assert.ok(r.low > 20000, "low " + r.low);
});
