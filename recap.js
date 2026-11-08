// The Open One — session recap: once a trading window is over, what happened and what each strategy's
// rules would actually have done. Pure functions (no network), so every rule is covered by tests/recap.test.js.
//
// Rules that keep it honest:
// 1. A bias only counts if it was saved before the session (or within its first 15 minutes), and it is
//    graded from the price when it was saved, never from earlier.
// 2. Opening beyond a level is a gap, not a liquidity grab. A sweep needs price to start on one side and run through.
// 3. Entries happen on a confirming candle's close, stops sit past the extreme plus a buffer, and the trade is
//    walked forward bar by bar (stop checked first) to a 2R target or the session end. No exact-top/bottom fills.
// 4. "Quiet" is measured against this window's own recent sessions, not a fixed percentage.
// 5. Markets that trade around the clock (forex, crypto) use the prior 24 hours, not stock-market hours.
// 6. Only bars inside the session are used for the trade; nothing after the session can change the result.
"use strict";

const NY = "America/New_York";
const nyParts = (t) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: NY, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(new Date(t));
  const g = Object.fromEntries(p.map((x) => [x.type, x.value]));
  return { date: `${g.year}-${g.month}-${g.day}`, mins: +g.hour * 60 + +g.minute, dow: g.weekday };
};
// New York wall-clock time on a date -> UTC ms (handles daylight saving)
function nyToMs(date, mins) {
  const guess = Date.parse(`${date}T${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}:00Z`);
  const p = nyParts(guess);
  const asNy = Date.parse(`${p.date}T${String(Math.floor(p.mins / 60)).padStart(2, "0")}:${String(p.mins % 60).padStart(2, "0")}:00Z`);
  return guess + (guess - asNy);
}
const addDays = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

// Instruments the recap knows. kind: fut (has stock-market hours and an overnight), fx and crypto (around the clock).
const INSTR = {
  NQ: { sym: "NQ=F", name: "NQ", dp: 2, unit: "pts", kind: "fut", bias: "NQ" },
  MNQ: { sym: "NQ=F", name: "MNQ", dp: 2, unit: "pts", kind: "fut", bias: "NQ" },
  ES: { sym: "ES=F", name: "ES", dp: 2, unit: "pts", kind: "fut" },
  MES: { sym: "ES=F", name: "MES", dp: 2, unit: "pts", kind: "fut" },
  YM: { sym: "YM=F", name: "YM", dp: 0, unit: "pts", kind: "fut" },
  RTY: { sym: "RTY=F", name: "RTY", dp: 1, unit: "pts", kind: "fut" },
  CL: { sym: "CL=F", name: "Crude oil", dp: 2, unit: "$", kind: "fut" },
  GC: { sym: "GC=F", name: "Gold", dp: 1, unit: "$", kind: "fut" },
  XAUUSD: { sym: "GC=F", name: "Gold", dp: 1, unit: "$", kind: "fut" },
  SI: { sym: "SI=F", name: "Silver", dp: 3, unit: "$", kind: "fut" },
  NG: { sym: "NG=F", name: "Natural gas", dp: 3, unit: "$", kind: "fut" },
  EURUSD: { sym: "EURUSD=X", name: "EUR/USD", dp: 5, unit: "pips", pip: 1e-4, kind: "fx", bias: "EURUSD" },
  GBPUSD: { sym: "GBPUSD=X", name: "GBP/USD", dp: 5, unit: "pips", pip: 1e-4, kind: "fx" },
  USDJPY: { sym: "USDJPY=X", name: "USD/JPY", dp: 3, unit: "pips", pip: 0.01, kind: "fx" },
  BTC: { sym: "BTC-USD", name: "Bitcoin", dp: 0, unit: "$", kind: "crypto", bias: "BTC" },
  ETH: { sym: "ETH-USD", name: "Ether", dp: 2, unit: "$", kind: "crypto" },
  SOL: { sym: "SOL-USD", name: "Solana", dp: 2, unit: "$", kind: "crypto" }
};

// Which recipe each strategy gets. Strategies that aren't about one session get a plain description.
const RECIPE = {
  ict: "sweep", pa: "level", sd: "level", orderflow: "level", ind: "vwap", news: "news", trend: "breakout", momentum: "breakout",
  swing: "breakout", perps: "breakout", zero: "breakout", buy: "breakout", unsure: "breakout", ta: "level", charts: "breakout",
  sell: "range", spreads: "range", earnings: "none", hedge: "none", hold: "none", index: "none", value: "none", growth: "none",
  dividends: "none", onchain: "none", defi: "none", narratives: "none", launches: "none", trending: "none", kols: "none", wallets: "none",
  carry: "none", fundamentals: "none", algo: "breakout"
};
const STRAT_NAME = { ict: "ICT", pa: "Price action", sd: "Supply and demand", orderflow: "Order flow", ind: "Indicators (VWAP)", news: "Trading the news", trend: "Trend and breakouts", momentum: "Momentum and breakouts", swing: "Swing trading", perps: "Leverage and perps", zero: "Same-day options", buy: "Buying calls and puts", unsure: "Opening-range breakout", ta: "Chart analysis", charts: "Chart setups", sell: "Selling premium", spreads: "Spreads", algo: "Automated" };

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

function refLevels(bars, start, kind) {
  const before = bars.filter((b) => b.t < start);
  const hi = (a) => Math.max(...a.map((b) => b.h)), lo = (a) => Math.min(...a.map((b) => b.l));
  const refs = [];
  if (kind === "fut") {
    const p = nyParts(start);
    // the last regular stock-market session (9:30 AM to 4 PM) that finished before this one started
    let prev = null;
    for (let i = 0; i < 6 && !prev; i++) {
      const d = addDays(p.date, -i), a = nyToMs(d, 570), z = nyToMs(d, 960);
      if (z > start) continue;
      const r = before.filter((b) => b.t >= a && b.t < z);
      if (r.length >= 20) prev = { a, z, r };
    }
    if (prev) refs.push({ name: "yesterday’s high", side: "high", v: hi(prev.r) }, { name: "yesterday’s low", side: "low", v: lo(prev.r) });
    const on = before.filter((b) => b.t >= (prev ? prev.z : start - 16 * 36e5) && b.t < start);
    if (on.length >= 6) refs.push({ name: "the overnight high", side: "high", v: hi(on) }, { name: "the overnight low", side: "low", v: lo(on) });
  } else {
    const day = before.filter((b) => b.t >= start - 864e5);
    if (day.length >= 20) refs.push({ name: "the prior 24-hour high", side: "high", v: hi(day) }, { name: "the prior 24-hour low", side: "low", v: lo(day) });
  }
  return refs;
}

// Walk a trade forward through the session, stop checked before target in every bar (the cautious assumption)
function walk(sess, i0, side, entry, stop, target) {
  const risk = Math.abs(entry - stop);
  if (!(risk > 0)) return null;
  // the plan's own target when it gives one (the opposite liquidity), else 2R
  const tgt = target != null && (side === "long" ? target - entry : entry - target) >= risk ? target : side === "long" ? entry + 2 * risk : entry - 2 * risk;
  const tR = Math.abs(tgt - entry) / risk;
  let best = 0;
  for (let i = i0 + 1; i < sess.length; i++) {
    const b = sess[i];
    const adverse = side === "long" ? b.l <= stop : b.h >= stop;
    if (adverse) return { exit: "stop", r: -1, at: b.t, best: +best.toFixed(2), risk, target: tgt };
    const fav = side === "long" ? (b.h - entry) / risk : (entry - b.l) / risk;
    best = Math.max(best, fav);
    if ((side === "long" ? b.h >= tgt : b.l <= tgt)) return { exit: "target", r: +tR.toFixed(1), at: b.t, best: +tR.toFixed(1), risk, target: tgt };
  }
  const last = sess[sess.length - 1].c;
  const r = (side === "long" ? last - entry : entry - last) / risk;
  return { exit: "end", r: +r.toFixed(2), at: sess[sess.length - 1].t, best: +best.toFixed(2), risk, target: tgt };
}

function setups(kind, ctx) {
  const { sess, refs, buf, events } = ctx, out = [];
  // the plan's target: the nearest liquidity on the other side (a high for longs, a low for shorts)
  const oppTarget = (side, entry) => { const c = refs.filter((r) => side === "short" ? r.side === "low" && r.v < entry : r.side === "high" && r.v > entry).sort((a, b) => side === "short" ? b.v - a.v : a.v - b.v)[0]; return c ? { v: c.v, name: c.name } : null; };
  const O = sess[0].o;
  if (kind === "sweep") {
    refs.forEach((r) => {
      const short = r.side === "high";
      // must START on the near side: opening beyond the level is a gap, not a sweep
      if (short ? O >= r.v : O <= r.v) return;
      const i = sess.findIndex((b) => short ? b.h > r.v : b.l < r.v);
      if (i < 0) return;
      for (let j = i; j < Math.min(sess.length, i + 7); j++) {
        if (short ? sess[j].c < r.v : sess[j].c > r.v) {
          const ext = short ? Math.max(...sess.slice(i, j + 1).map((b) => b.h)) : Math.min(...sess.slice(i, j + 1).map((b) => b.l));
          out.push({ side: short ? "short" : "long", i: j, entry: sess[j].c, stop: short ? ext + buf : ext - buf, tgt: oppTarget(short ? "short" : "long", sess[j].c), why: `price ran ${short ? "above" : "below"} ${r.name} (${ctx.fmt(r.v)}) at ${ctx.tm(sess[i].t)}, then closed back ${short ? "below" : "above"} it`, level: r });
          break;
        }
      }
    });
  } else if (kind === "level") {
    refs.forEach((r) => {
      const short = r.side === "high";
      if (short ? O >= r.v : O <= r.v) return;
      const i = sess.findIndex((b) => short ? b.h >= r.v - buf * 0.5 : b.l <= r.v + buf * 0.5);
      if (i < 0) return;
      for (let j = i; j < Math.min(sess.length, i + 4); j++) {
        if (short ? sess[j].c < r.v - buf : sess[j].c > r.v + buf) {
          const ext = short ? Math.max(...sess.slice(i, j + 1).map((b) => b.h)) : Math.min(...sess.slice(i, j + 1).map((b) => b.l));
          out.push({ side: short ? "short" : "long", i: j, entry: sess[j].c, stop: short ? ext + buf : ext - buf, tgt: oppTarget(short ? "short" : "long", sess[j].c), why: `price tested ${r.name} (${ctx.fmt(r.v)}) at ${ctx.tm(sess[i].t)} and was pushed back`, level: r });
          break;
        }
      }
    });
  } else if (kind === "breakout") {
    const n = Math.min(6, Math.floor(sess.length / 3));
    if (n >= 2) {
      const orh = Math.max(...sess.slice(0, n).map((b) => b.h)), orl = Math.min(...sess.slice(0, n).map((b) => b.l)), mid = (orh + orl) / 2;
      const iu = sess.findIndex((b, k) => k >= n && b.c > orh), idn = sess.findIndex((b, k) => k >= n && b.c < orl);
      if (iu >= 0) out.push({ side: "long", i: iu, entry: sess[iu].c, stop: mid - buf, why: `price closed above the opening range high (${ctx.fmt(orh)}) at ${ctx.tm(sess[iu].t)}` });
      if (idn >= 0) out.push({ side: "short", i: idn, entry: sess[idn].c, stop: mid + buf, why: `price closed below the opening range low (${ctx.fmt(orl)}) at ${ctx.tm(sess[idn].t)}` });
    }
  } else if (kind === "vwap") {
    let pv = 0, vv = 0;
    const hasVol = sess.some((b) => b.v > 0);
    const vw = sess.map((b, k) => { const w = hasVol ? (b.v || 0) : 1; pv += (b.h + b.l + b.c) / 3 * w; vv += w; return vv ? pv / vv : b.c; });
    ctx.vwapNote = hasVol ? "" : " (this feed has no volume here, so it uses the session’s average price instead of true VWAP)";
    let upDone = false, dnDone = false;
    for (let k = 3; k < sess.length; k++) {
      const b = sess[k], w = vw[k - 1];
      if (!upDone && sess[k - 1].c > w && b.l <= w && b.c > w) { out.push({ side: "long", i: k, entry: b.c, stop: b.l - buf, why: `price pulled back to VWAP (${ctx.fmt(w)}) at ${ctx.tm(b.t)} and held above it` }); upDone = true; }
      if (!dnDone && sess[k - 1].c < w && b.h >= w && b.c < w) { out.push({ side: "short", i: k, entry: b.c, stop: b.h + buf, why: `price bounced up to VWAP (${ctx.fmt(w)}) at ${ctx.tm(b.t)} and was rejected` }); dnDone = true; }
      if (upDone && dnDone) break;
    }
  } else if (kind === "news") {
    (events || []).forEach((e) => {
      const k = sess.findIndex((b) => b.t <= e.time && b.t + 3e5 > e.time);
      if (k < 0 || k + 1 >= sess.length) return;
      const d = sess[k + 1].c - sess[k].o;
      if (!d) return;
      const side = d > 0 ? "long" : "short", seg = sess.slice(k, k + 2);
      const ext = side === "long" ? Math.min(...seg.map((b) => b.l)) : Math.max(...seg.map((b) => b.h));
      out.push({ side, i: k + 1, entry: sess[k + 1].c, stop: side === "long" ? ext - buf : ext + buf, why: `${e.name} came out at ${ctx.tm(e.time)} and the first 5 to 10 minutes went ${d > 0 ? "up" : "down"}` });
    });
  }
  return out.sort((a, b) => a.i - b.i);
}

// The whole analysis. Inputs are plain data so it can be tested without the network.
function analyze({ instrument, bars, from, to, now, bias, strategies, events }) {
  const I = INSTR[instrument] || INSTR.NQ;
  bars = (bars || []).filter((b) => b && isFinite(b.o) && isFinite(b.h) && isFinite(b.l) && isFinite(b.c)).sort((a, b) => a.t - b.t);
  const S = pickSession(bars, from, to, now);
  if (!S) return { ready: false, why: "No finished session in the price history yet." };
  const { sess, start, end, date } = S;
  const fmt = (v) => I.pip ? v.toFixed(I.pip === 0.01 ? 3 : 5) : v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: I.dp });
  const amt = (d) => I.pip ? Math.round(Math.abs(d) / I.pip) + " pips" : I.unit === "$" ? "$" + Math.abs(d).toLocaleString("en-US", { maximumFractionDigits: I.dp > 1 ? 2 : 0 }) : Math.abs(d).toFixed(Math.abs(d) >= 100 ? 0 : 1) + " pts";
  const tm = (t) => new Date(t).toLocaleTimeString("en-US", { timeZone: NY, hour: "numeric", minute: "2-digit" });
  const O = sess[0].o, C = sess[sess.length - 1].c;
  let H = sess[0], L = sess[0]; sess.forEach((b) => { if (b.h > H.h) H = b; if (b.l < L.l) L = b; });
  const range = H.h - L.l, net = C - O;
  // buffer past a level: a tenth of a typical 5-minute candle's size, at least a few ticks
  const avgBar = sess.reduce((x, b) => x + (b.h - b.l), 0) / sess.length;
  const tick = I.pip ? I.pip : I.dp >= 2 ? 0.25 : 1;
  const buf = Math.max(avgBar * 0.25, tick * 4);
  // typical size of this same window over the previous sessions in the data
  const len = end - start, ranges = [];
  for (let i = 1; i <= 6; i++) { const a = start - i * 864e5, r = bars.filter((b) => b.t >= a && b.t < a + len); if (r.length >= sess.length * 0.6) ranges.push(Math.max(...r.map((b) => b.h)) - Math.min(...r.map((b) => b.l))); }
  ranges.sort((a, b) => a - b);
  const typical = ranges.length >= 2 ? ranges[Math.floor(ranges.length / 2)] : null;
  const quiet = typical ? range < typical * 0.5 : false;
  const refs = refLevels(bars, start, I.kind);

  // the saved bias counts only if it existed by the session's first 15 minutes (and well before the end)
  let call = null, conf = null, biasNote = "", graded = null;
  // a list of saved biases is fine: use the one that belongs to this session
  if (Array.isArray(bias)) bias = bias.filter((x) => x && x.at >= start - 20 * 36e5 && x.at < end).sort((a, b) => a.at - b.at)[0] || null;
  if (bias && /^(up|down)$/.test(bias.call) && bias.at <= start + 15 * 6e4 && bias.at < end - 30 * 6e4 && bias.at >= start - 20 * 36e5) {
    call = bias.call; conf = bias.conf || null;
    const b0 = sess.find((b) => b.t + 3e5 > bias.at) || sess[0];
    const p0 = b0.t < bias.at ? b0.c : b0.o, mv = C - p0, flatPct = I.kind === "crypto" ? 0.3 : I.kind === "fx" ? 0.05 : 0.1;
    graded = Math.abs(mv / p0 * 100) < flatPct ? "flat" : (mv > 0) === (call === "up") ? "right" : "wrong";
  } else if (bias && bias.call) biasNote = I.bias ? "The site’s saved bias came after this session started, so it isn’t graded here." : "";
  const verdict = call ? `The bias was ${call}${conf ? ` (${conf} confidence)` : ""}, and ${graded === "right" ? "it was right" : graded === "wrong" ? "it was wrong" : "price barely moved after it, so it gets no grade"}.`
    : `There was no saved bias for ${I.name} in this session${biasNote ? ` (${biasNote.charAt(0).toLowerCase() + biasNote.slice(1, -1)})` : ""}, so this shows what the rules would have done either way.`;

  const summary = [
    `${I.name} ${net >= 0 ? "rose" : "fell"} ${amt(net)} in the session, with a ${amt(range)} range from high to low${typical ? ` (a typical session here moves about ${amt(typical)})` : ""}.`,
    `It opened at ${fmt(O)}, ${H.t <= L.t ? `made its high of ${fmt(H.h)} at ${tm(H.t)}, then its low of ${fmt(L.l)} at ${tm(L.t)}` : `made its low of ${fmt(L.l)} at ${tm(L.t)}, then its high of ${fmt(H.h)} at ${tm(H.t)}`}, and finished at ${fmt(C)}.`
  ];
  // gaps at the open, said plainly so they aren't mistaken for sweeps
  refs.forEach((r) => { if (r.side === "high" ? O > r.v : O < r.v) summary.push(`It opened ${r.side === "high" ? "above" : "below"} ${r.name} (${fmt(r.v)}), a gap rather than a liquidity grab.`); });

  const ctx = { sess, refs, buf, events: (events || []).filter((e) => e.time >= start && e.time < end), fmt, tm };
  const want = call === "up" ? "long" : call === "down" ? "short" : null;
  const strats = [...new Set((strategies && strategies.length ? strategies : ["unsure"]).filter((s) => RECIPE[s]))].slice(0, 3);
  const plans = strats.map((sid) => {
    const recipe = RECIPE[sid], name = STRAT_NAME[sid] || sid;
    if (recipe === "none") return { strategy: sid, name, text: "This strategy isn’t about one session, so there’s no entry to review. The summary above is what the session did." };
    if (recipe === "range") {
      if (!typical) return { strategy: sid, name, text: "Not enough recent sessions to compare this one against yet." };
      const ratio = range / typical;
      return { strategy: sid, name, text: ratio < 0.8 ? `A good session for premium sellers: price stayed inside a smaller range than usual (${amt(range)} vs about ${amt(typical)}).` : ratio > 1.3 ? `A tough session for premium sellers: the range (${amt(range)}) was well past the usual ${amt(typical)}, so short options near the money would have been under pressure.` : `An ordinary-sized session (${amt(range)} vs about ${amt(typical)}): no special edge either way for premium sellers.` };
    }
    if (recipe === "news" && !ctx.events.length) return { strategy: sid, name, text: "No big scheduled news landed in this session, so news traders had nothing to trade. Sitting out was right." };
    const all = setups(recipe, ctx);
    const cand = all.filter((s) => !want || s.side === want);
    const s = cand[0];
    const label = { sweep: "the ICT setup (a run past a high or low, then a close back through it)", level: "a clean test-and-reject of a key level", breakout: "a close outside the opening range (first 30 minutes)", vwap: "a pullback to VWAP that held", news: "a trade in the direction of the first reaction to the news" }[recipe];
    if (!s) {
      const against = want ? all.find((x) => x.side !== want) : null;
      return { strategy: sid, name, result: "none", text: `No valid entry: ${label} never set up${want ? ` in the bias direction` : ""}.${against ? ` The only setup went the other way (${against.why}), against the bias, so the rules said stay out.` : ""} ${quiet ? "It was also a quieter session than usual. " : ""}No trade was the right answer.`.replace(/\s+/g, " ").trim() };
    }
    const w = walk(sess, s.i, s.side, s.entry, s.stop, s.tgt ? s.tgt.v : null);
    const usedPlanTgt = w && s.tgt && Math.abs(w.target - s.tgt.v) < 1e-9;
    if (!w) return { strategy: sid, name, result: "none", text: "The setup had no room for a stop, so no trade." };
    const tgtName = usedPlanTgt ? `the plan’s target, ${s.tgt.name} (${fmt(w.target)}, ${(Math.abs(w.target - s.entry) / w.risk).toFixed(1)}R)` : `the 2R target (${fmt(w.target)})`;
    const outcome = w.exit === "target" ? `It reached ${tgtName} at ${tm(w.at)}.` : w.exit === "stop" ? `It was stopped out at ${tm(w.at)} for a 1R loss${w.best >= 0.5 ? ` (after getting as far as ${w.best.toFixed(1)}R in profit)` : ""}.` : `Neither the stop nor ${usedPlanTgt ? "the plan’s target" : "the 2R target"} was hit, so it closed at the session end for ${w.r >= 0 ? "+" : ""}${w.r.toFixed(1)}R.`;
    const text = `${s.side === "long" ? "Long" : "Short"} at ${fmt(s.entry)} after ${s.why}, with the stop at ${fmt(s.stop)} (${amt(w.risk)} of risk, past the extreme plus a buffer). ${outcome}${recipe === "vwap" ? ctx.vwapNote || "" : ""}${recipe === "level" && sid === "orderflow" ? " The footprint itself isn’t visible here; this is the level reaction an order-flow read would have confirmed or rejected." : ""}${!want ? " There was no saved bias, so this is simply the first setup either way." : ""}`;
    return { strategy: sid, name, result: w.exit === "target" || w.r > 0 ? "win" : w.r < 0 ? "loss" : "flat", r: w.r, text };
  });
  return { ready: true, instrument, name: I.name, date, start, end, open: O, high: H.h, low: L.l, close: C, range, typical, quiet, call, conf, result: graded, verdict, summary, plans, refs: refs.map((r) => ({ name: r.name, v: r.v })) };
}

module.exports = { analyze, pickSession, refLevels, walk, setups, nyToMs, nyParts, INSTR, RECIPE };
