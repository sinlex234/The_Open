// Surprise meter: how big a release's surprise was, and whether the market reacted more or less than that.
// Rules (tests/surprise.test.js checks each one):
// 1. Surprise = actual minus forecast, measured against how much this number usually changes from one report
//    to the next (official FRED history). Without that history, against how far off forecasts usually are for
//    this release (the site's own saved results, 4+ needed). Without either, it isn't sized: no guessing.
// 2. Reaction = the biggest swing away from the price at the release inside the first 15 minutes, measured
//    against a normal 15 minutes starting at the same time of day on earlier days (8+ days needed).
// 3. Nothing after the first 15 minutes counts. Inside the 15 minutes it says "so far".
// 4. The verdict compares the two: shock treated as a shock, shrugged off, measured, overreaction, a mild surprise
//    that moved the market more than usual (1.5-3x normal), or non-event (only when the market also moved normally).
// 5. The release price is the bar that contains the release time, or the first bar up to 5 minutes after it.
//    A bar from before a gap in the feed is never used.
"use strict";

const NY = "America/New_York";
const nyParts = (t) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: NY, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t));
  const g = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { date: `${g.year}-${g.month}-${g.day}`, mins: +g.hour * 60 + +g.minute };
};
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

// Thresholds by what the miss is compared with. A miss as big as the usual report-to-report change is a big deal;
// a miss as big as the usual forecast miss is normal, so that scale is wider.
const S_BANDS = {
  change: [[0.35, "inline"], [0.75, "small"], [1.5, "big"], [Infinity, "shock"]],
  miss: [[0.5, "inline"], [1.2, "small"], [2.2, "big"], [Infinity, "shock"]]
};
const R_BANDS = [[1.5, "normal"], [3, "moved"], [6, "big"], [Infinity, "huge"]];
const S_WORD = { inline: "In line", small: "Small surprise", big: "Big surprise", shock: "Shock" };
const R_WORD = { normal: "Normal", moved: "Moved", big: "Big move", huge: "Violent" };
const band = (x, bands) => bands.find(([lim]) => x < lim)[1];

// How much this number usually changes from one report to the next: the average size of the last 24 changes.
function usualChange(values) {
  const v = (values || []).filter((x) => typeof x === "number" && isFinite(x)).slice(-25);
  if (v.length < 7) return null;
  const d = v.slice(1).map((x, i) => Math.abs(x - v[i]));
  const u = mean(d);
  return u > 0 ? u : null;
}
// How far off forecasts usually are for this release (each past release once)
function usualMiss(past) {
  const m = (past || []).filter((p) => typeof p.actual === "number" && typeof p.forecast === "number").map((p) => Math.abs(p.actual - p.forecast));
  if (m.length < 4) return null;
  const u = mean(m);
  return u > 0 ? u : null;
}
function sizeSurprise({ actual, forecast, history, past }) {
  if (typeof actual !== "number" || typeof forecast !== "number") return null;
  const miss = actual - forecast;
  let usual = usualChange(history), base = "change", n = history ? history.length : 0;
  if (usual == null) { usual = usualMiss(past); base = "miss"; n = past ? past.length : 0; }
  if (usual == null) return { sized: false, miss };
  const z = Math.abs(miss) / usual;
  const b = Math.abs(miss) < 1e-9 ? "inline" : band(z, S_BANDS[base]);
  const top = S_BANDS[base][2][0] * 1.4;
  return { sized: true, miss, usual, base, n, z: +z.toFixed(2), band: b, word: S_WORD[b], score: Math.round(Math.min(1, z / top) * 100) };
}

// Biggest swing away from the starting price within [t, t+win), as a % of that price. Bars: {t,o,h,l,c}, any spacing.
function swing(bars, t, win, now) {
  const end = Math.min(t + win, now == null ? Infinity : now);
  // the bar that contains t (bar.t <= t < bar.t + the feed's usual spacing); if the feed has a gap there, the first
  // bar starting at or after t, at most 5 minutes later. Never a bar that started before a gap (stale price).
  const gaps = bars.slice(1, 200).map((b, i) => b.t - bars[i].t).filter((g) => g > 0), step = median(gaps) || 6e4;
  let i0 = bars.findIndex((b) => b.t <= t && t < b.t + step);
  if (i0 < 0) i0 = bars.findIndex((b) => b.t >= t && b.t - t <= 5 * 6e4);
  if (i0 < 0) return null;
  const p0 = bars[i0].o;
  let hi = p0, lo = p0, last = p0, any = false;
  for (let i = i0; i < bars.length && bars[i].t < end; i++) { hi = Math.max(hi, bars[i].h); lo = Math.min(lo, bars[i].l); last = bars[i].c; any = true; }
  if (!any || !p0) return null;
  const up = (hi - p0) / p0 * 100, dn = (p0 - lo) / p0 * 100;
  return { p0, hi, lo, last, pct: Math.max(up, dn), way: up >= dn ? "up" : "down", net: (last - p0) / p0 * 100 };
}
// A normal 15 minutes at this time of day: the median swing starting at the same New York time on earlier days
function typicalSwing(bars, t, win) {
  const at = nyParts(t), out = [];
  const seen = new Set();
  const gaps = bars.slice(1, 200).map((b, i) => b.t - bars[i].t).filter((g) => g > 0);
  const stepM = Math.max(1, Math.round((median(gaps) || 6e4) / 6e4));
  for (const b of bars) {
    if (b.t >= t - 6 * 36e5) break;
    const p = nyParts(b.t);
    // the bar that covers the release's clock time on that day
    if (at.mins < p.mins || at.mins >= p.mins + stepM || seen.has(p.date)) continue;
    seen.add(p.date);
    const s = swing(bars, b.t + (at.mins - p.mins) * 6e4, win, t);
    if (s) out.push(s.pct);
  }
  return out.length >= 8 ? { pct: median(out), n: out.length } : null;
}
function sizeReaction({ bars, t, now, win = 15 * 6e4 }) {
  if (!bars || bars.length < 20 || !t || now < t) return null;
  const s = swing(bars, t, win, now), typ = typicalSwing(bars, t, win);
  if (!s || !typ || !(typ.pct > 0)) return null;
  const ratio = s.pct / typ.pct, b = band(ratio, R_BANDS);
  return { pct: +s.pct.toFixed(3), typical: +typ.pct.toFixed(3), days: typ.n, ratio: +ratio.toFixed(1), band: b, word: R_WORD[b], way: s.way, net: +s.net.toFixed(3), p0: s.p0, done: now >= t + win, score: Math.round(Math.min(1, ratio / 8) * 100) };
}

// The comparison readers care about
function verdict(S, R, mkName) {
  if (!S || !S.sized) return R ? { kind: "unsized", head: "Can’t size this surprise yet", text: `There isn’t enough history for this release to say how unusual the miss was. ${mkName} ${R.done ? "moved" : "has moved"} ${R.ratio}× a normal 15 minutes${R.done ? "" : " so far"}.` } : null;
  if (!R) return { kind: "nomarket", head: S.word, text: "" };
  const bigS = S.band === "big" || S.band === "shock", bigR = R.band === "big" || R.band === "huge", so = R.done ? "" : " so far";
  if (bigS && bigR) return { kind: "shock", head: "Real surprise, real reaction", text: `The number was well off forecast and ${mkName} treated it that way: ${R.ratio}× a normal 15 minutes${so}.` };
  if (bigS && R.band === "normal") return { kind: "shrug", head: "Big surprise, market shrugged", text: `The miss was large, but ${mkName} barely moved${so}. Traders may not believe it, other parts of the report may cancel it out, or it was already priced in. Shrugged-off surprises sometimes get a second, slower move.` };
  if (bigS) return { kind: "measured", head: "Big surprise, measured reaction", text: `${mkName} moved more than usual (${R.ratio}× a normal 15 minutes${so}), but less than a miss this size can cause.` };
  if (bigR) return { kind: "over", head: "Small surprise, big reaction", text: `The headline number was close to forecast, yet ${mkName} moved ${R.ratio}× a normal 15 minutes${so}. Something else drove it: revisions to past months, the details inside the report, or traders positioned the wrong way.` };
  if (R.band === "moved") return { kind: "mild", head: "Small surprise, bigger move", text: `Close to forecast, but ${mkName} moved more than usual (${R.ratio}× a normal 15 minutes${so}). Something beyond the headline number may be in play.` };
  return { kind: "quiet", head: "Non-event", text: `Close to what was expected, and ${mkName} treated it that way${so}.` };
}

module.exports = { sizeSurprise, sizeReaction, verdict, usualChange, usualMiss, swing, typicalSwing, S_BANDS, R_BANDS };
