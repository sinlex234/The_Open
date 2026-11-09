// The Open One — session recap: once a trading window is over, what happened and what each strategy's
// rules would actually have done. Pure functions (no network), so every rule is covered by tests/recap.test.js.
//
// Rules that keep it honest:
// 1. A bias only counts if it was saved on the session's own New York trading day, before the session (or within
//    its first 15 minutes); if several, the latest. It is graded from the price when it was saved, never from earlier.
// 2. Opening beyond a level is a gap, not a liquidity grab. A sweep needs price to start on one side and run through;
//    after a gap, price must first close back on the starting side, and only a later run through the level counts.
// 3. Entries happen where the plan says (a candle close or a limit at the plan's zone), stops sit past the extreme plus
//    a buffer, and the trade is walked forward candle by candle (stop checked first) to the plan's target, its exit
//    rule, or the session end. No exact-top/bottom fills.
// 4. "Quiet" is measured against this window's own recent sessions (the same New York clock window on the last 5
//    earlier dates that have data), not a fixed percentage.
// 5. Each strategy is replayed with the exact steps and levels its day plan gave (see replay()), never "the best move".
// 6. Only bars inside the session are used for the trade; nothing after the session can change the result.
// 7. No look-ahead: "normal" candle size, body and volume come from bars before the session, so a later candle
//    can't change an earlier decision. Buffers use the instrument's real tick size. Bars with a price <= 0 are ignored.
"use strict";

const NY = "America/New_York";
const nyParts = (t) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: NY, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(new Date(t));
  const g = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { date: `${g.year}-${g.month}-${g.day}`, mins: +g.hour * 60 + +g.minute, dow: g.weekday };
};
// New York wall-clock time on a date -> UTC ms (handles daylight saving).
// The offset is read twice: first at a guess, then at the result, so times a few hours after a
// daylight-saving switch (e.g. 3 AM on the Sunday it changes) land on the right hour.
function nyToMs(date, mins) {
  const wall = Date.parse(`${date}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00Z`);
  const offset = (t) => { const p = nyParts(t); return Date.parse(`${p.date}T${String(Math.floor(p.mins / 60)).padStart(2, "0")}:${String(p.mins % 60).padStart(2, "0")}:00Z`) - t; };
  const first = wall - offset(wall);
  return wall - offset(first);
}
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

// Instruments the recap knows. tick: the smallest price step (used for stop buffers). kind: fut (has stock-market hours and an overnight), fx and crypto (around the clock).
const INSTR = {
  NQ: { sym: "NQ=F", name: "NQ", dp: 2, tick: 0.25, unit: "pts", kind: "fut", bias: "NQ" },
  MNQ: { sym: "NQ=F", name: "MNQ", dp: 2, tick: 0.25, unit: "pts", kind: "fut", bias: "NQ" },
  ES: { sym: "ES=F", name: "ES", dp: 2, tick: 0.25, unit: "pts", kind: "fut" },
  MES: { sym: "ES=F", name: "MES", dp: 2, tick: 0.25, unit: "pts", kind: "fut" },
  YM: { sym: "YM=F", name: "YM", dp: 0, tick: 1, unit: "pts", kind: "fut" },
  RTY: { sym: "RTY=F", name: "RTY", dp: 1, tick: 0.1, unit: "pts", kind: "fut" },
  CL: { sym: "CL=F", name: "Crude oil", dp: 2, tick: 0.01, unit: "$", kind: "fut" },
  GC: { sym: "GC=F", name: "Gold", dp: 1, tick: 0.1, unit: "$", kind: "fut" },
  XAUUSD: { sym: "GC=F", name: "Gold", dp: 1, tick: 0.01, unit: "$", kind: "fut" },
  SI: { sym: "SI=F", name: "Silver", dp: 3, tick: 0.005, unit: "$", kind: "fut" },
  NG: { sym: "NG=F", name: "Natural gas", dp: 3, tick: 0.001, unit: "$", kind: "fut" },
  EURUSD: { sym: "EURUSD=X", name: "EUR/USD", dp: 5, tick: 0.00001, unit: "pips", pip: 1e-4, kind: "fx", bias: "EURUSD" },
  GBPUSD: { sym: "GBPUSD=X", name: "GBP/USD", dp: 5, tick: 0.00001, unit: "pips", pip: 1e-4, kind: "fx" },
  USDJPY: { sym: "USDJPY=X", name: "USD/JPY", dp: 3, tick: 0.001, unit: "pips", pip: 0.01, kind: "fx" },
  BTC: { sym: "BTC-USD", name: "Bitcoin", dp: 0, tick: 1, unit: "$", kind: "crypto", bias: "BTC" },
  ETH: { sym: "ETH-USD", name: "Ether", dp: 2, tick: 0.01, unit: "$", kind: "crypto" },
  SOL: { sym: "SOL-USD", name: "Solana", dp: 2, tick: 0.01, unit: "$", kind: "crypto" }
};

// Every strategy the setup questions offer, and how its session is replayed. Each replay follows the exact
// steps the day plan gave that strategy (stratPlan in data.js), using the same levels the plan named.
const STRATS = {
  // futures, forex, crypto, stocks
  ict: { name: "ICT", replay: "ict" }, pa: { name: "Price action", replay: "pa" }, ta: { name: "Chart analysis", replay: "pa" },
  sd: { name: "Supply and demand", replay: "sd" }, orderflow: { name: "Order flow", replay: "orderflow" },
  ind: { name: "Indicators", replay: "trend" }, trend: { name: "Trend following and breakouts", replay: "trend" },
  momentum: { name: "Momentum and breakouts", replay: "momentum" }, news: { name: "Trading the news", replay: "news" },
  algo: { name: "Automated", replay: "daytype" }, unsure: { name: "Still finding my strategy", replay: "lean" },
  swing: { name: "Swing trading", replay: "lean" }, perps: { name: "Leverage and perps", replay: "momentum" },
  // options
  buy: { name: "Buying calls and puts", replay: "momentum" }, zero: { name: "Same-day options (0DTE)", replay: "momentum" },
  sell: { name: "Selling premium", replay: "range" }, spreads: { name: "Spreads", replay: "range" },
  earnings: { name: "Earnings", replay: "none" }, hedge: { name: "Hedging", replay: "none" },
  // not about one session
  index: { name: "Index funds", replay: "none" }, value: { name: "Value investing", replay: "none" }, growth: { name: "Growth investing", replay: "none" },
  dividends: { name: "Dividends", replay: "none" }, fundamentals: { name: "Fundamentals and central banks", replay: "none" }, carry: { name: "Carry trades", replay: "none" },
  hold: { name: "Buy and hold", replay: "none" }, narratives: { name: "Sector rotation", replay: "none" }, onchain: { name: "On-chain data", replay: "none" }, defi: { name: "DeFi and yield", replay: "none" },
  launches: { name: "New launches", replay: "none" }, trending: { name: "Trending coins", replay: "none" }, kols: { name: "Influencer calls", replay: "none" }, wallets: { name: "Copy-trading wallets", replay: "none" }, charts: { name: "Chart setups", replay: "pa" }
};
const RECIPE = Object.fromEntries(Object.entries(STRATS).map(([k, v]) => [k, v.replay]));
const NOT_SESSION = {
  index: "Index-fund investing is about years, not one session. Nothing to enter or exit here.",
  value: "Value investing is about buying good companies cheap over months. One session doesn’t change that.",
  growth: "Growth investing plays out over quarters and years, so there’s no session entry to review.",
  dividends: "Dividend investing is about the income over years. One session doesn’t matter.",
  fundamentals: "Fundamentals and central-bank trades play out over days and weeks, so one session isn’t the test. What matters is whether the policy story changed.",
  carry: "Carry trades earn the interest-rate difference over weeks. A single session only matters if it moved hard against the position.",
  hold: "Buying and holding is about the long run, so there’s nothing to enter or exit in one session.",
  narratives: "Sector rotation plays out over days and weeks, not one session.",
  onchain: "On-chain signals work on a days-to-weeks timescale, so one session isn’t the test.",
  defi: "DeFi and yield are about earning over time, not one session’s price.",
  earnings: "Earnings trades depend on one company’s report, not the session’s index move.",
  hedge: "Hedges protect a portfolio; the session only matters if it tested your protection.",
  launches: "New-launch trading runs on token data, not one market’s session.", trending: "Trending-coin trades run on token data, not one market’s session.",
  kols: "Influencer-call trades run on token data, not one market’s session.", wallets: "Copy-trading runs on wallet activity, not one market’s session."
};

// Which session to review: the latest one that has fully finished and has enough bars.
// Works for sessions that cross midnight (e.g. Asia 7 PM to 1 AM).
function pickSession(bars, from, to, now) {
  const len = ((to - from + 1440) % 1440 || 1440) * 6e4;
  const today = nyParts(now).date;
  // expected bar count from the feed's own spacing (5-minute normally; coarser if the feed falls back)
  const gaps = bars.slice(1, 400).map((b, i) => b.t - bars[i].t).filter((g) => g > 0).sort((a, b) => a - b);
  const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 3e5;
  for (let i = 0; i < 8; i++) {
    const d = addDays(today, -i), start = nyToMs(d, from), end = start + len;
    if (end > now) continue;
    const sess = bars.filter((b) => b.t >= start && b.t < end);
    if (sess.length >= Math.max(3, Math.floor(len / step) * 0.5)) return { date: nyParts(start).date, start, end, sess };
  }
  return null;
}

// The levels the day plan names, rebuilt exactly as the plan saw them at the session start (nothing after it).
// Same candidates as dayLevels() in data.js: yesterday, Asia, London, today so far, this week, the midnight open.
function planLevels(bars, start, kind) {
  const before = bars.filter((b) => b.t < start);
  if (before.length < 20) return { above: [], below: [], price: null };
  const roll = kind === "fut" ? 18 * 60 : kind === "fx" ? 17 * 60 : 0; // when the trading day starts, New York time
  const dayKey = (t) => { const p = nyParts(t); return roll && p.mins >= roll ? addDays(p.date, 1) : p.date; };
  const today = dayKey(start - 1), keyed = before.map((b) => ({ ...b, k: dayKey(b.t), n: nyParts(b.t) }));
  const days = [...new Set(keyed.map((b) => b.k))].sort();
  const hi = (a) => a.length ? Math.max(...a.map((b) => b.h)) : null, lo = (a) => a.length ? Math.min(...a.map((b) => b.l)) : null;
  const tb = keyed.filter((b) => b.k === today), prevKey = days.filter((d) => d < today).pop(), pb = keyed.filter((b) => b.k === prevKey);
  const asia = roll ? tb.filter((b) => b.n.mins >= 1200 || b.n.mins < 60) : pb.filter((b) => b.n.mins >= 1200);
  const london = tb.filter((b) => b.n.mins >= 120 && b.n.mins < 300);
  const wk = (d) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const week = keyed.filter((b) => wk(b.k) === wk(today));
  const mid = tb.find((b) => b.n.mins < 30);
  const c = [["Yesterday’s high", hi(pb)], ["Yesterday’s low", lo(pb)], ["Asia high", hi(asia)], ["Asia low", lo(asia)], ["London high", hi(london)], ["London low", lo(london)],
    ["Today’s high", hi(tb)], ["Today’s low", lo(tb)], ["This week’s high", hi(week)], ["This week’s low", lo(week)], ["Midnight open", mid ? mid.o : null]].filter(([, v]) => v != null && isFinite(v));
  const px = before[before.length - 1].c, gap = Math.abs(px) * 0.0004;
  const uniq = (arr) => arr.filter((x, i) => !arr.slice(0, i).some((y) => Math.abs(y.v - x.v) < gap));
  const above = uniq(c.filter(([, v]) => v > px + gap).map(([name, v]) => ({ name, v })).sort((a, b) => a.v - b.v)).slice(0, 3);
  const below = uniq(c.filter(([, v]) => v < px - gap).map(([name, v]) => ({ name, v })).sort((a, b) => b.v - a.v)).slice(0, 3);
  // like farLevels(): skip levels hugging price
  const far = (arr) => { const f = arr.filter((x) => Math.abs(x.v - px) / px > 0.0015); return f.length ? f : arr; };
  return { above: far(above), below: far(below), price: px };
}
const lvlName = (x) => x ? (/^(Asia|London)/.test(x.name) ? "the " + x.name : x.name.charAt(0).toLowerCase() + x.name.slice(1)) : "the nearest level";

// Walk a filled trade forward, stop checked before target in every candle (the cautious assumption).
// targets: the plan's targets in order; the first one at least 1R away is the exit, else 2R.
// opts.noTarget: no fixed target (trend trades); opts.exitIf: the plan's own exit rule.
function walk(sess, i0, side, entry, stop, targets, opts = {}) {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  const long = side === "long";
  const cand = (targets || []).filter((t) => t && (long ? t.v - entry : entry - t.v) >= risk);
  const tgt = opts.noTarget ? null : cand[0] ? cand[0] : { v: long ? entry + 2 * risk : entry - 2 * risk, name: null };
  let best = 0;
  for (let i = i0 + 1; i < sess.length; i++) {
    const b = sess[i];
    if (long ? b.l <= stop : b.h >= stop) return { exit: "stop", r: -1, at: b.t, best: +best.toFixed(2), risk, target: tgt };
    best = Math.max(best, long ? (b.h - entry) / risk : (entry - b.l) / risk);
    if (tgt && (long ? b.h >= tgt.v : b.l <= tgt.v)) return { exit: "target", r: +(Math.abs(tgt.v - entry) / risk).toFixed(1), at: b.t, best: +best.toFixed(2), risk, target: tgt };
    if (opts.exitIf && opts.exitIf(b)) { const r = (long ? b.c - entry : entry - b.c) / risk; return { exit: "rule", r: +r.toFixed(2), at: b.t, best: +best.toFixed(2), risk, target: tgt, price: b.c }; }
  }
  const last = sess[sess.length - 1].c, r = (long ? last - entry : entry - last) / risk;
  return { exit: "end", r: +r.toFixed(2), at: sess[sess.length - 1].t, best: +best.toFixed(2), risk, target: tgt, price: last };
}

// ---------- the replays, one per strategy, each following its plan's own steps ----------
function replay(kind, X) {
  const { sess, call, A, B, buf, fmt, tm, events, fu, avgBody, avgVol } = X;
  const up = call === "up", dn = call === "down";
  const a1 = A[0], a2 = A[1], b1 = B[0], b2 = B[1];
  const none = (plan, why) => ({ plan, entered: false, text: why });
  // rule 2: the first real sweep of a level. below = a run under it (sell-side), else a run over it (buy-side).
  // If the session opens already beyond the level, that's a gap, not a grab: price must first close back on the
  // starting side, and only a later run through the level counts. { i: -1 } when there was no sweep.
  const sweepOf = (lev, below) => {
    if (!lev) return { i: -1, gapped: false };
    const past = (b) => below ? b.l < lev.v : b.h > lev.v;
    const gapped = below ? sess[0].o < lev.v : sess[0].o > lev.v;
    if (!gapped) return { i: sess.findIndex(past), gapped };
    const back = sess.findIndex((b) => below ? b.c > lev.v : b.c < lev.v);
    return { i: back < 0 ? -1 : sess.findIndex((b, k) => k > back && past(b)), gapped };
  };
  const fill = (plan, side, i, entry, stop, targets, how, opts) => { const w = walk(sess, i, side, entry, stop, targets, opts); return w ? { plan, entered: true, side, i, entry, stop, how, w } : none(plan, "The setup had no room for a stop, so no trade."); };

  if (kind === "ict") {
    const one = (dir) => {
      const long = dir === "up", L1 = long ? b1 : a1, L2 = long ? b2 : a2, T = long ? A : B;
      if (!L1) return none("", "The plan had no level to watch on that side, so there was no setup.");
      const plan = `${long ? "Long" : "Short"} bias: expect a quick run ${long ? "below" : "above"} ${lvlName(L1)} (${fmt(L1.v)}) to grab ${long ? "sell" : "buy"}-side liquidity, then displacement ${long ? "up" : "down"} and a fair value gap to enter on the pullback.${T[0] ? ` Target ${lvlName(T[0])} (${fmt(T[0].v)})${T[1] ? `, then ${lvlName(T[1])}` : ""}.` : ""}`;
      const { i, gapped } = sweepOf(L1, long);
      if (i < 0 && gapped) return none(plan, `Price opened ${long ? "below" : "above"} ${lvlName(L1)} (${fmt(L1.v)}), so there was no liquidity grab to trade, and it never came back ${long ? "above" : "below"} it and swept it again. No trade was the right answer.`);
      if (i < 0) return none(plan, `Price never ran ${long ? "below" : "above"} ${lvlName(L1)}, so the liquidity grab the plan waited for didn’t happen. No trade was the right answer.`);
      // the plan's wrong-way line: if price keeps going and closes through the next level, step back
      const bust = L2 ? sess.findIndex((b, k) => k >= i && (long ? b.c < L2.v : b.c > L2.v)) : -1;
      // displacement: a strong candle the other way that leaves a fair value gap (candle 1 and candle 3 don't overlap)
      let k = -1;
      for (let j = Math.max(i + 1, 2); j < Math.min(sess.length, i + 14); j++) {
        const c1 = sess[j - 2], c2 = sess[j - 1], c3 = sess[j];
        const strong = Math.abs(c2.c - c2.o) >= avgBody * 1.2 && (long ? c2.c > c2.o : c2.c < c2.o);
        if (strong && (long ? c3.l > c1.h : c3.h < c1.l)) { k = j; break; }
      }
      if (bust >= 0 && (k < 0 || bust < k)) return none(plan, `The sweep came at ${tm(sess[i].t)}, but price kept going and closed ${long ? "below" : "above"} ${lvlName(L2)} (${fmt(L2.v)}) at ${tm(sess[bust].t)} instead of reversing. The plan said that means the bias is wrong: step back. No trade was the right answer.`);
      if (k < 0) return none(plan, `Price ran ${long ? "below" : "above"} ${lvlName(L1)} at ${tm(sess[i].t)}${gapped ? ` (after opening beyond it and coming back)` : ""}, but there was no clean displacement ${long ? "up" : "down"} leaving a fair value gap. Without that confirmation the plan says no entry.`);
      const c1 = sess[k - 2], c3 = sess[k];
      const ext = long ? Math.min(...sess.slice(i, k + 1).map((b) => b.l)) : Math.max(...sess.slice(i, k + 1).map((b) => b.h));
      // entry model from the reader's ICT answers: fair value gap (default), order block, or OTE
      let entry, model;
      if (fu.includes("ote") && !fu.includes("fvg")) {
        const legEnd = long ? Math.max(...sess.slice(i, k + 1).map((b) => b.h)) : Math.min(...sess.slice(i, k + 1).map((b) => b.l));
        entry = long ? legEnd - (legEnd - ext) * 0.705 : legEnd + (ext - legEnd) * 0.705; model = "the 70.5% optimal trade entry of the displacement leg";
      } else if (fu.includes("ob") && !fu.includes("fvg")) {
        const ob = [...sess.slice(i, k)].reverse().find((b) => long ? b.c < b.o : b.c > b.o) || sess[k - 2];
        entry = long ? ob.h : ob.l; model = `the order block (the last ${long ? "down" : "up"} candle before the move, at ${fmt(entry)})`;
      } else {
        entry = long ? c3.l : c3.h; model = `the fair value gap (${fmt(long ? c1.h : c3.h)}–${fmt(long ? c3.l : c1.l)})`;
      }
      const sbOnly = fu.includes("sb") && !fu.includes("fvg") && !fu.includes("ob") && !fu.includes("ote");
      const stop = long ? ext - buf : ext + buf;
      for (let j = k + 1; j < sess.length; j++) {
        const b = sess[j];
        if (long ? b.l <= stop : b.h >= stop) return none(plan, `Displacement ${long ? "up" : "down"} came at ${tm(c3.t)}, but price went back through the sweep ${long ? "low" : "high"} before pulling back to ${model}, so there was no fill.`);
        if (sbOnly) { const m = nyParts(b.t).mins; if (m < 600 || m >= 660) continue; }
        if (long ? b.l <= entry : b.h >= entry) {
          const px = long ? Math.min(entry, b.o) : Math.max(entry, b.o);
          return fill(plan, long ? "long" : "short", j, px, stop, T, `price ${gapped ? `opened beyond ${lvlName(L1)}, came back, then ` : ""}ran ${long ? "below" : "above"} ${lvlName(L1)} (${fmt(L1.v)}) at ${tm(sess[i].t)}, displaced ${long ? "up" : "down"} at ${tm(c3.t)}, and pulled back into ${model} at ${tm(b.t)}`);
        }
      }
      return none(plan, `The sweep and displacement came (${tm(sess[i].t)}, ${tm(c3.t)}), but price never pulled back to ${model}${sbOnly ? " inside the Silver Bullet hour (10–11 AM)" : ""}, so there was no fill. Chasing it would have broken the plan.`);
    };
    if (up || dn) return one(up ? "up" : "down");
    // no bias: wait for one side to be swept and trade the displacement the other way
    const plan = `No bias: both ${lvlName(a1)} and ${lvlName(b1)} in play. Wait for one side to get swept, then trade the displacement the other way. If both get swept, stand aside.`;
    const U = sweepOf(a1, false), D = sweepOf(b1, true), sU = U.i, sD = D.i;
    if (sU < 0 && sD < 0) return none(plan, U.gapped || D.gapped ? `Price opened beyond ${lvlName(U.gapped ? a1 : b1)} (${fmt((U.gapped ? a1 : b1).v)}), so there was no liquidity grab to trade, and neither side was swept after that.` : "Neither side was swept, so there was nothing to trade.");
    const r = one(sD >= 0 && (sU < 0 || sD < sU) ? "up" : "down");
    // both sides swept before the entry: the plan says stand aside
    if (r.entered && sU >= 0 && sD >= 0 && Math.max(sU, sD) <= r.i) return none(plan, `Both sides were swept (${tm(sess[Math.min(sU, sD)].t)} and ${tm(sess[Math.max(sU, sD)].t)}) before any entry, so the day had no direction. The plan says stand aside.`);
    return { ...r, plan };
  }

  if (kind === "pa" || kind === "sd" || kind === "lean") {
    const zone = kind === "sd" ? Math.max(buf * 2, avgBody * 1.5) : buf;
    const one = (long) => {
      const L = long ? b1 : a1, O = long ? a1 : b1, T = long ? A : B;
      if (!L) return none("", "The plan had no level on that side, so there was no setup.");
      const plan = kind === "sd" ? `${long ? "Demand" : "Supply"} near ${lvlName(L)} (${fmt(L.v)}) is the zone most likely to hold; favour fresh zones, a third test is weak.${T[0] ? ` Target ${lvlName(T[0])}.` : ""}`
        : kind === "lean" ? `Lean ${long ? "long while price holds above" : "short while price holds below"} ${lvlName(L)} (${fmt(L.v)}).`
        : `${long ? "Buy pullbacks that hold above" : "Sell rallies that fail under"} ${lvlName(L)} (${fmt(L.v)})${O ? `, or a clean break ${long ? "above" : "below"} ${lvlName(O)} toward ${lvlName(T[1] || T[0])}` : ""}. Don’t chase breaks the other way.`;
      let tests = 0, inZone = false;
      for (let j = 0; j < sess.length - 1; j++) {
        const b = sess[j], n = sess[j + 1];
        // the idea is dead once price closes through the level twice in a row
        if (j > 0 && (long ? b.c < L.v - zone && sess[j - 1].c < L.v - zone : b.c > L.v + zone && sess[j - 1].c > L.v + zone)) return none(plan, `Price closed ${long ? "below" : "above"} ${lvlName(L)} and stayed there from ${tm(sess[j - 1].t)}, so the level didn’t hold. The plan said not to chase that break. No trade was the right answer.`);
        const touch = long ? b.l <= L.v + zone : b.h >= L.v - zone;
        if (touch && !inZone) tests++;
        inZone = touch;
        if (touch) {
          if (kind === "sd" && tests >= 3) return none(plan, `By ${tm(b.t)} price had come back to the zone a third time. A third test is weak, so the plan says skip it.`);
          // confirmation: this candle closes back on the right side and the next candle follows through
          if (long ? b.c > L.v && n.c > b.c : b.c < L.v && n.c < b.c) {
            const ext = long ? Math.min(b.l, n.l) : Math.max(b.h, n.h);
            return fill(plan, long ? "long" : "short", j + 1, n.c, long ? Math.min(ext, L.v - zone) - buf : Math.max(ext, L.v + zone) + buf, T, `price ${kind === "sd" ? "came into the zone at" : long ? "pulled back to" : "rallied up to"} ${lvlName(L)} (${fmt(L.v)}) at ${tm(b.t)} and ${long ? "held" : "was rejected"}, with the next candle confirming`);
          }
        }
        // price action: the clean break-and-retest of the far level
        if (kind === "pa" && O && (long ? b.c > O.v + buf : b.c < O.v - buf)) {
          for (let q = j + 1; q < sess.length - 1; q++) {
            const r = sess[q];
            if (long ? r.c < O.v - buf : r.c > O.v + buf) break;
            if (long ? r.l <= O.v + buf && r.c > O.v : r.h >= O.v - buf && r.c < O.v) return fill(plan, long ? "long" : "short", q, r.c, long ? Math.min(r.l, O.v) - buf : Math.max(r.h, O.v) + buf, T.slice(1), `price broke ${long ? "above" : "below"} ${lvlName(O)} (${fmt(O.v)}) at ${tm(b.t)} and the retest held at ${tm(r.t)}`);
          }
        }
      }
      return none(plan, `Price never came back to ${lvlName(L)} for a ${kind === "sd" ? "zone test" : "pullback that held"}${kind === "pa" && O ? `, and there was no clean break-and-retest of ${lvlName(O)}` : ""}, so there was no entry. Chasing would have broken the plan.`);
    };
    if (up || dn) return one(up);
    const plan = `No bias: expect a range between ${lvlName(b1)} and ${lvlName(a1)}. Fade the edges; only trust a break that closes outside and holds on the retest.`;
    const pick = [one(true), one(false)].filter((x) => x.entered).sort((x, y) => x.i - y.i)[0];
    return pick ? { ...pick, plan } : none(plan, "Neither edge of the range gave a clean rejection, so there was no trade.");
  }

  if (kind === "orderflow") {
    const long = !dn, L = long ? b1 : a1;
    const plan = up || dn ? `Watch for ${long ? "sellers" : "buyers"} getting absorbed near ${lvlName(L)}${L ? ` (${fmt(L.v)})` : ""}: that confirms the ${long ? "up" : "down"} day.` : `Watch which side gets absorbed at ${lvlName(a1)} or ${lvlName(b1)} to pick the direction.`;
    if (!avgVol) return none(plan, "The price feed has no volume for this market, so absorption can’t be judged from here. Your footprint or DOM is the only way to review this one.");
    let best = null;
    (up ? [true] : dn ? [false] : [true, false]).forEach((lg) => {
      const lev = lg ? b1 : a1; if (!lev) return;
      const j = sess.findIndex((b, k) => k < sess.length - 1 && (lg ? b.l <= lev.v + buf : b.h >= lev.v - buf) && b.v >= avgVol * 1.5 && (lg ? (b.c - b.l) >= (b.h - b.l) * 0.6 : (b.h - b.c) >= (b.h - b.l) * 0.6) && (lg ? sess[k + 1].c > b.c : sess[k + 1].c < b.c));
      if (j >= 0 && (!best || j < best.j)) best = { j, lg, lev };
    });
    if (!best) return none(plan, `No sign of absorption: no heavy-volume candle at ${lvlName(L)} that refused to ${long ? "fall" : "rise"} and then turned. Without it the plan says no trade. (Judged from volume and price; your footprint shows it more precisely.)`);
    const b = sess[best.j], n = sess[best.j + 1];
    return fill(plan, best.lg ? "long" : "short", best.j + 1, n.c, best.lg ? b.l - buf : b.h + buf, best.lg ? A : B, `a heavy-volume candle at ${lvlName(best.lev)} (${fmt(best.lev.v)}) at ${tm(b.t)} closed near its ${best.lg ? "high" : "low"} (absorption, judged from volume and price) and the next candle followed through`);
  }

  if (kind === "trend") {
    if (!up && !dn) return none("No trend to follow today: sitting out is a valid choice.", "There was no bias, so the plan was to sit out. That’s what the rules said.");
    const long = up, L = long ? b1 : a1, O = long ? a1 : b1;
    const plan = `Only take ${long ? "longs while price holds above" : "shorts while price holds below"} ${lvlName(L)}${L ? ` (${fmt(L.v)})` : ""}; add on a break ${long ? "above" : "below"} ${lvlName(O)}${O ? ` (${fmt(O.v)})` : ""}.`;
    if (!O) return none(plan, "The plan had no break level, so there was no entry.");
    const lost = L ? sess.findIndex((b) => long ? b.c < L.v : b.c > L.v) : -1;
    const j = sess.findIndex((b) => long ? b.c > O.v : b.c < O.v);
    if (j < 0) return none(plan, `Price never broke ${long ? "above" : "below"} ${lvlName(O)}, so there was no trend entry. No trade was the right answer.`);
    if (lost >= 0 && lost < j) return none(plan, `Price closed ${long ? "below" : "above"} ${lvlName(L)} at ${tm(sess[lost].t)} before any break, so the trend condition failed. The plan said no ${long ? "longs" : "shorts"}.`);
    const sw = sess.slice(Math.max(0, j - 6), j + 1), stop = long ? Math.min(...sw.map((b) => b.l)) - buf : Math.max(...sw.map((b) => b.h)) + buf;
    return fill(plan, long ? "long" : "short", j, sess[j].c, stop, null, `price closed ${long ? "above" : "below"} ${lvlName(O)} (${fmt(O.v)}) at ${tm(sess[j].t)} while holding ${long ? "above" : "below"} ${lvlName(L)}`, { noTarget: true, exitIf: L ? (b) => long ? b.c < L.v : b.c > L.v : null });
  }

  if (kind === "momentum") {
    if (!up && !dn) {
      const j = a1 ? sess.findIndex((b) => b.c > a1.v) : -1, k = b1 ? sess.findIndex((b) => b.c < b1.v) : -1;
      return none(`Little momentum expected until one edge breaks: ${lvlName(a1)} or ${lvlName(b1)}.`, j < 0 && k < 0 ? "Neither edge broke, so there was no momentum trade." : "An edge broke, but with no bias the plan didn’t pick a side in advance, so no trade.");
    }
    const long = up, O = long ? a1 : b1, T = long ? A.slice(1) : B.slice(1);
    const plan = `The strongest move should come on a break of ${lvlName(O)}${O ? ` (${fmt(O.v)})` : ""}. If it can’t ${long ? "clear" : "break"} it by late morning, momentum is fading.`;
    if (!O) return none(plan, "The plan had no break level, so there was no entry.");
    const deadline = sess[0].t + 120 * 6e4;
    const j = sess.findIndex((b) => b.t < deadline && (long ? b.c > O.v : b.c < O.v));
    if (j < 0) return none(plan, `Price didn’t ${long ? "clear" : "break"} ${lvlName(O)} within the first two hours, so momentum faded, as the plan warned. No trade was the right answer.`);
    const b = sess[j];
    return fill(plan, long ? "long" : "short", j, b.c, long ? b.l - buf : b.h + buf, T, `price ${long ? "cleared" : "broke"} ${lvlName(O)} (${fmt(O.v)}) on a closing basis at ${tm(b.t)}`);
  }

  if (kind === "news") {
    const ev = events[0];
    if (!ev) return none("No big release today, so news comes from headlines, not the calendar.", "No big scheduled news landed in this session, so there was nothing to trade from the calendar. Sitting out was right.");
    const plan = `${ev.name} at ${tm(ev.time)} was the event. Let the first spike settle for 5 to 15 minutes, then trade the move that holds, not the spike.${up || dn ? ` A ${up ? "soft" : "hot"} number fits the ${call} call; the opposite cancels it.` : ""}`;
    const k = sess.findIndex((b) => b.t <= ev.time && b.t + 3e5 > ev.time);
    if (k < 0 || k + 3 >= sess.length) return none(plan, "The release fell at the edge of the session, so there wasn’t time to trade the reaction inside it.");
    const spike = sess.slice(k, k + 3), sh = Math.max(...spike.map((b) => b.h)), sl = Math.min(...spike.map((b) => b.l)), c15 = sess[k + 3];
    const held = c15.c > sh - (sh - sl) * 0.25 ? "up" : c15.c < sl + (sh - sl) * 0.25 ? "down" : null;
    if (!held) return none(plan, `After 15 minutes price was back in the middle of the spike range (${fmt(sl)}–${fmt(sh)}), so no move held. No trade was the right answer.`);
    if ((up || dn) && held !== call) return none(plan, `The move that held after the release was ${held}, against the ${call} call, so the number cancelled the plan. No trade was the right answer.`);
    const long = held === "up";
    return fill(plan, long ? "long" : "short", k + 3, c15.c, long ? sl - buf : sh + buf, long ? A : B, `${ev.name} came out at ${tm(ev.time)}, the spike settled, and price was still holding near the ${long ? "top" : "bottom"} of the spike range 15 minutes later`);
  }
  return none("", "");
}

// The whole analysis. Inputs are plain data so it can be tested without the network.
function analyze({ instrument, bars, from, to, now, bias, strategies, events, followUps }) {
  const I = INSTR[instrument] || INSTR.NQ;
  bars = (bars || []).filter((b) => b && isFinite(b.o) && isFinite(b.h) && isFinite(b.l) && isFinite(b.c) && b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0).sort((a, b) => a.t - b.t);
  const S = pickSession(bars, from, to, now);
  if (!S) return { ready: false, why: "No finished session in the price history yet." };
  const { sess, start, end, date } = S;
  const fmt = (v) => I.pip ? v.toFixed(I.pip === 0.01 ? 3 : 5) : v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: I.dp });
  const amt = (d) => I.pip ? Math.round(Math.abs(d) / I.pip) + " pips" : I.unit === "$" ? "$" + Math.abs(d).toLocaleString("en-US", { maximumFractionDigits: I.dp > 1 ? 2 : 0 }) : Math.abs(d).toFixed(Math.abs(d) >= 100 ? 0 : 1) + " pts";
  const tm = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" });
  const O = sess[0].o, C = sess[sess.length - 1].c;
  let H = sess[0], L = sess[0]; sess.forEach((b) => { if (b.h > H.h) H = b; if (b.l < L.l) L = b; });
  const range = H.h - L.l, net = C - O;
  // "normal" candle size and volume come from the bars BEFORE the session (about the last 3 sessions' worth, at
  // least 60 bars), so nothing later in the session can change an earlier decision. Too little history: the
  // session's opening bar is the only extra bar used.
  const pre = bars.filter((b) => b.t < start), base = pre.length >= 12 ? pre.slice(-Math.max(60, sess.length * 3)) : pre.concat(sess.slice(0, 1));
  const avgBar = base.reduce((x, b) => x + (b.h - b.l), 0) / base.length;
  const avgBody = base.reduce((x, b) => x + Math.abs(b.c - b.o), 0) / base.length;
  const vols = base.map((b) => b.v || 0), avgVol = vols.some((v) => v > 0) ? vols.reduce((x, y) => x + y, 0) / vols.length : 0;
  const tick = I.tick || (I.pip ? I.pip / 10 : 0.01);
  const buf = Math.max(avgBar * 0.25, tick * 4);
  // rule 4: the same New York clock window on earlier dates (so daylight-saving changes don't shift it), walking
  // back over weekends and holidays until 5 sessions with data are found (12 days at most)
  const len = end - start, ranges = [];
  for (let i = 1; i <= 12 && ranges.length < 5; i++) { const a = nyToMs(addDays(date, -i), from), r = bars.filter((b) => b.t >= a && b.t < a + len); if (r.length >= sess.length * 0.6) ranges.push(Math.max(...r.map((b) => b.h)) - Math.min(...r.map((b) => b.l))); }
  ranges.sort((a, b) => a - b);
  const typical = ranges.length >= 2 ? ranges[Math.floor(ranges.length / 2)] : null;
  const quiet = typical ? range < typical * 0.5 : false;
  const lv = planLevels(bars, start, I.kind);

  // rule 1: the saved bias counts only if it was saved during the session's own New York trading day (futures roll
  // at 6 PM, forex at 5 PM, crypto at midnight) and no later than 15 minutes into the session. If several, the latest.
  const roll = I.kind === "fut" ? 18 * 60 : I.kind === "fx" ? 17 * 60 : 0, sp = nyParts(start);
  const dayStart = !roll ? nyToMs(sp.date, 0) : sp.mins >= roll ? nyToMs(sp.date, roll) : nyToMs(addDays(sp.date, -1), roll);
  const okBias = (x) => x && typeof x.at === "number" && x.at >= dayStart && x.at <= start + 15 * 6e4 && x.at < end - 30 * 6e4;
  let call = null, conf = null, graded = null, biasLate = false;
  if (Array.isArray(bias)) { const all = bias.filter((x) => x && x.at >= dayStart && x.at < end); bias = all.filter(okBias).sort((a, b) => b.at - a.at)[0] || all[0] || null; }
  if (bias && /^(up|down)$/.test(bias.call) && okBias(bias)) {
    call = bias.call; conf = bias.conf || null;
    const b0 = sess.find((b) => b.t + 3e5 > bias.at) || sess[0];
    const p0 = b0.t < bias.at ? b0.c : b0.o, mv = C - p0, flatPct = I.kind === "crypto" ? 0.3 : I.kind === "fx" ? 0.05 : 0.1;
    graded = Math.abs(mv / p0 * 100) < flatPct ? "flat" : (mv > 0) === (call === "up") ? "right" : "wrong";
  } else if (bias && bias.call) biasLate = true;
  const verdict = call ? `The bias was ${call}${conf ? ` (${conf} confidence)` : ""}, and ${graded === "right" ? "it was right" : graded === "wrong" ? "it was wrong" : "price barely moved after it, so it gets no grade"}.`
    : `There was no saved bias for ${I.name} in this session${biasLate ? " (the site’s bias came after it started, so it isn’t used)" : ""}, so each plan is replayed the way it reads with no bias.`;
  const summary = [
    `${I.name} ${net >= 0 ? "rose" : "fell"} ${amt(net)} in the session, with a ${amt(range)} range from high to low${typical ? ` (a typical session here moves about ${amt(typical)})` : ""}.`,
    `It opened at ${fmt(O)}, ${H.t <= L.t ? `made its high of ${fmt(H.h)} at ${tm(H.t)}, then its low of ${fmt(L.l)} at ${tm(L.t)}` : `made its low of ${fmt(L.l)} at ${tm(L.t)}, then its high of ${fmt(H.h)} at ${tm(H.t)}`}, and finished at ${fmt(C)}.`
  ];
  const X = { sess, call, A: lv.above, B: lv.below, buf, fmt, tm, avgBody, avgVol, events: (events || []).filter((e) => e.time >= start && e.time < end), fu: [] };
  const strats = [...new Set((strategies && strategies.length ? strategies : ["unsure"]).filter((s) => STRATS[s]))].slice(0, 3);
  const plans = strats.map((sid) => {
    const def = STRATS[sid], name = def.name;
    if (def.replay === "none") return { strategy: sid, name, text: NOT_SESSION[sid] || "This strategy isn’t about one session, so there’s no entry to review." };
    if (def.replay === "range") {
      if (!typical) return { strategy: sid, name, text: "Not enough recent sessions to compare this one against yet." };
      const ratio = range / typical;
      return { strategy: sid, name, text: ratio < 0.8 ? `A good session for premium sellers: price stayed inside a smaller range than usual (${amt(range)} vs about ${amt(typical)}).` : ratio > 1.3 ? `A tough session for premium sellers: the range (${amt(range)}) was well past the usual ${amt(typical)}, so short options near the money were under pressure.` : `An ordinary-sized session (${amt(range)} vs about ${amt(typical)}): no special edge either way for premium sellers.` };
    }
    if (def.replay === "daytype") {
      const pos = range ? (C - L.l) / range : 0.5, trendDay = (pos > 0.8 || pos < 0.2) && (!typical || range > typical * 0.9);
      return { strategy: sid, name, text: trendDay ? `A trend session: it finished near its ${pos > 0.5 ? "high" : "low"} after a ${amt(range)} range. Trend-following bots had the edge; mean-reversion bots fought the move.` : `A two-way session: it finished in the middle of its ${amt(range)} range. Mean-reversion bots had the edge; breakout bots likely got chopped.` };
    }
    const r = replay(def.replay, { ...X, fu: (followUps && followUps[sid]) || [] });
    if (!r.entered) return { strategy: sid, name, plan: r.plan, result: "none", text: r.text + (quiet && !/quiet/i.test(r.text) ? ` It was also a quieter session than usual (${amt(range)} vs about ${amt(typical)}).` : "") };
    const w = r.w, tg = w.target;
    const tgtTxt = tg && tg.name ? `the plan’s target, ${lvlName(tg)} (${fmt(tg.v)}, ${(Math.abs(tg.v - r.entry) / w.risk).toFixed(1)}R)` : tg ? `a 2R target (${fmt(tg.v)})` : "";
    const outcome = w.exit === "target" ? `It reached ${tgtTxt} at ${tm(w.at)}.`
      : w.exit === "stop" ? `It was stopped out at ${tm(w.at)} for a 1R loss${w.best >= 0.5 ? ` (after getting as far as ${w.best.toFixed(1)}R in profit)` : ""}.`
      : w.exit === "rule" ? `The plan’s exit rule closed it at ${fmt(w.price)} at ${tm(w.at)} for ${w.r >= 0 ? "+" : ""}${w.r.toFixed(1)}R.`
      : `${tg ? `Neither the stop nor ${tgtTxt} was hit, so it` : "It"} closed at the session end for ${w.r >= 0 ? "+" : ""}${w.r.toFixed(1)}R.`;
    const text = `${r.side === "long" ? "Long" : "Short"} at ${fmt(r.entry)} after ${r.how}. Stop at ${fmt(r.stop)} (${amt(w.risk)} of risk, past the extreme plus a buffer). ${outcome}`;
    return { strategy: sid, name, plan: r.plan, result: w.r > 0 ? "win" : w.r < 0 ? "loss" : "flat", r: w.r, text };
  });
  return { ready: true, instrument, name: I.name, date, start, end, open: O, high: H.h, low: L.l, close: C, range, typical, quiet, call, conf, result: graded, verdict, summary, plans, levels: { above: lv.above, below: lv.below } };
}

module.exports = { analyze, pickSession, planLevels, walk, replay, nyToMs, nyParts, INSTR, RECIPE, STRATS };
