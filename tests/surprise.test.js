// Surprise meter rules. Each test is one rule from the top of surprise.js.
const test = require("node:test");
const assert = require("node:assert");
const S = require("../surprise.js");

// 5-minute bars over 20 weekdays, flat-ish with a small wiggle; release day at the end
const DAY = 864e5, M5 = 5 * 6e4;
const t830 = (d) => Date.parse(`${d}T13:30:00Z`); // 8:30 New York in November (EST)
function days(n, end = "2026-11-06") { const out = []; let t = Date.parse(end + "T12:00:00Z"); while (out.length < n) { const w = new Date(t).getUTCDay(); if (w && w < 6) out.unshift(new Date(t).toISOString().slice(0, 10)); t -= DAY; } return out; }
function bars(dayList, { relDay, relMove = 0, normal = 0.05 } = {}) {
  const out = [];
  dayList.forEach((d) => {
    let p = 20000;
    const start = t830(d) - 60 * 6e4;
    for (let i = 0; i < 36; i++) {
      const t = start + i * M5, inRel = d === relDay && t >= t830(d) && t < t830(d) + 15 * 6e4;
      const step = inRel ? relMove / 3 : (i % 2 ? 1 : -1) * normal / 100 * p;
      const o = p, c = p + step;
      out.push({ t, o, h: Math.max(o, c), l: Math.min(o, c), c });
      p = c;
    }
  });
  return out;
}

test("rule 1: surprise is measured against how much the number usually changes", () => {
  const history = [0.2, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2, 0.3, 0.2]; // usually changes 0.1 between reports
  const tiny = S.sizeSurprise({ actual: 0.3, forecast: 0.3, history });
  assert.equal(tiny.band, "inline");
  assert.equal(S.sizeSurprise({ actual: 0.35, forecast: 0.3, history }).band, "small");
  assert.equal(S.sizeSurprise({ actual: 0.4, forecast: 0.3, history }).band, "big");
  const shock = S.sizeSurprise({ actual: 0.5, forecast: 0.3, history });
  assert.equal(shock.band, "shock");
  assert.equal(shock.base, "change");
  assert.ok(shock.score > S.sizeSurprise({ actual: 0.4, forecast: 0.3, history }).score);
});

test("rule 1: the same miss is bigger news for a number that barely moves", () => {
  const calm = [4.1, 4.1, 4.2, 4.1, 4.1, 4.2, 4.1, 4.1, 4.2];
  const wild = [100, 250, 50, 300, 80, 220, 40, 260, 90];
  assert.equal(S.sizeSurprise({ actual: 4.3, forecast: 4.1, history: calm }).band, "shock");
  assert.equal(S.sizeSurprise({ actual: 180, forecast: 150, history: wild }).band, "inline");
});

test("rule 1: without official history it uses past forecast misses, and needs 4", () => {
  const past = [{ actual: 1.1, forecast: 1.0 }, { actual: 0.9, forecast: 1.0 }, { actual: 1.0, forecast: 1.1 }, { actual: 1.2, forecast: 1.1 }];
  const s = S.sizeSurprise({ actual: 1.5, forecast: 1.1, history: null, past });
  assert.equal(s.base, "miss");
  assert.equal(s.band, "shock");
  assert.equal(S.sizeSurprise({ actual: 1.15, forecast: 1.1, past }).band, "inline");
  const none = S.sizeSurprise({ actual: 1.5, forecast: 1.1, past: past.slice(0, 3) });
  assert.equal(none.sized, false);
});

test("rule 2: reaction is the biggest swing in 15 minutes against a normal 15 minutes at that time", () => {
  const d = days(15), rel = d[d.length - 1];
  const b = bars(d, { relDay: rel, relMove: 120 }); // 120 points on ~20000, normal swing ~10 points
  const r = S.sizeReaction({ bars: b, t: t830(rel), now: t830(rel) + 3 * 3600e3 });
  assert.ok(r, "sized");
  assert.equal(r.way, "up");
  assert.ok(r.ratio >= 6, "violent: " + r.ratio);
  assert.equal(r.band, "huge");
  assert.equal(r.done, true);
  assert.ok(r.days >= 8);
});

test("rule 2: a normal day reads as normal", () => {
  const d = days(15), rel = d[d.length - 1];
  const r = S.sizeReaction({ bars: bars(d), t: t830(rel), now: t830(rel) + 3600e3 });
  assert.equal(r.band, "normal");
});

test("rule 2: needs 8 earlier days at that time of day", () => {
  const d = days(6), rel = d[d.length - 1];
  assert.equal(S.sizeReaction({ bars: bars(d, { relDay: rel, relMove: 120 }), t: t830(rel), now: t830(rel) + 3600e3 }), null);
});

test("rule 3: nothing after the first 15 minutes counts; inside it says so far", () => {
  const d = days(15), rel = d[d.length - 1];
  const b = bars(d);
  // a huge move starting 20 minutes after the release must not count
  b.filter((x) => x.t >= t830(rel) + 20 * 6e4 && x.t < t830(rel) + 40 * 6e4).forEach((x) => { x.h = x.o * 1.05; });
  const r = S.sizeReaction({ bars: b, t: t830(rel), now: t830(rel) + 3600e3 });
  assert.equal(r.band, "normal");
  const early = S.sizeReaction({ bars: bars(d, { relDay: rel, relMove: 120 }), t: t830(rel), now: t830(rel) + 6 * 6e4 });
  assert.equal(early.done, false);
  assert.match(S.verdict({ sized: true, band: "shock", word: "Shock" }, early, "NQ").text, /so far/);
});

test("rule 4: the verdict compares the two", () => {
  const sBig = { sized: true, band: "shock", word: "Shock" }, sSmall = { sized: true, band: "inline", word: "In line" };
  const rBig = { band: "huge", ratio: 7, done: true }, rNone = { band: "normal", ratio: 1, done: true }, rMid = { band: "moved", ratio: 2, done: true };
  assert.equal(S.verdict(sBig, rBig, "NQ").kind, "shock");
  assert.equal(S.verdict(sBig, rNone, "NQ").kind, "shrug");
  assert.equal(S.verdict(sBig, rMid, "NQ").kind, "measured");
  assert.equal(S.verdict(sSmall, rBig, "NQ").kind, "over");
  assert.equal(S.verdict(sSmall, rNone, "NQ").kind, "quiet");
  assert.equal(S.verdict({ sized: false }, rBig, "NQ").kind, "unsized");
  assert.equal(S.verdict({ sized: false }, null, "NQ"), null);
});

test("rule 5: a gap in the feed never makes a bar from before the release the release price", () => {
  const t = t830("2026-11-06"), b = [];
  for (let x = t - 60 * 6e4; x < t - 5 * 6e4; x += M5) b.push({ t: x, o: 20000, h: 20000, l: 20000, c: 20000 });
  b[b.length - 1] = { t: t - 10 * 6e4, o: 20000, h: 20100, l: 20000, c: 20100 }; // 8:20 bar; 8:25 and 8:30 are missing
  for (let x = t + 5 * 6e4; x < t + 60 * 6e4; x += M5) b.push({ t: x, o: 20100, h: 20101, l: 20099, c: 20100 });
  const s = S.swing(b, t, 15 * 6e4, t + 36e5);
  assert.equal(s.p0, 20100, "first bar after the release, not the 8:20 bar");
  assert.ok(s.pct < 0.01);
  // a gap of more than 5 minutes after the release: no price at all
  assert.equal(S.swing(b.filter((x) => x.t < t || x.t >= t + 10 * 6e4), t, 15 * 6e4, t + 36e5), null);
});

test("rule 4: a small surprise with a bigger-than-normal move isn't called a non-event", () => {
  const sSmall = { sized: true, band: "small", word: "Small surprise" }, rMid = { band: "moved", ratio: 2.1, done: true };
  const v = S.verdict(sSmall, rMid, "NQ");
  assert.equal(v.kind, "mild");
  assert.match(v.text, /moved more than usual \(2\.1× a normal 15 minutes\)/);
  assert.doesNotMatch(v.text, /treated it that way/);
  assert.equal(S.verdict({ sized: true, band: "inline", word: "In line" }, rMid, "NQ").kind, "mild");
});
