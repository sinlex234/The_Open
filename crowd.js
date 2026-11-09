// Crowd vs the bot: readers call up or down before a big release; the site calls it after the number.
// Rules (tests/crowd.test.js checks each one):
// 1. Calls count only if made before the release (the database refuses anything later).
// 2. The crowd's call is the majority, and needs at least MIN_CROWD calls; a tie is no call.
// 3. Everyone is graded the same way: what the market did in the hour after the release, from the price at the
//    release. A move too small to matter is "barely moved" and counts for nobody.
// 4. The head-to-head score only counts releases where both the crowd and the site made a call on the same market.
// 5. Individual readers are graded too: the share of all reader calls that were right.
// 6. Calls older than the price history can't be graded honestly, so they're left out (not counted as waiting).
"use strict";

const MIN_CROWD = 3;

function crowdCall(t) {
  const up = (t && t.up) | 0, down = (t && t.down) | 0, n = up + down;
  if (n < MIN_CROWD) return { dir: null, n, up, down, why: "few" };
  if (up === down) return { dir: null, n, up, down, why: "tie" };
  const dir = up > down ? "up" : "down";
  return { dir, n, up, down, share: Math.round(Math.max(up, down) / n * 100) };
}

// outcome(market, releaseMs) -> the grade of an "up" call: { result: right | wrong | flat | pending, moved }
const flip = (g) => g.result === "right" ? "wrong" : g.result === "wrong" ? "right" : g.result;
const resultFor = (g, dir) => !g ? "pending" : dir === "up" ? g.result : flip(g);
const tally = () => ({ right: 0, wrong: 0, flat: 0, pending: 0 });

function duel(tallies, botCalls, outcome) {
  const bot = {};
  (botCalls || []).forEach((b) => { bot[b.event_key + "|" + b.market] = b; });
  const crowd = tally(), site = tally(), votes = tally(), both = { crowd: tally(), site: tally() };
  const rows = (tallies || []).map((t) => {
    const time = Date.parse(t.released_at);
    if (!(time <= Date.now())) return null;
    const g = outcome(t.market, time);
    if (g && g.result === "expired") return null; // older than the price history: can't be graded honestly
    const cc = crowdCall(t), b = bot[t.event_key + "|" + t.market] || null;
    const cr = cc.dir ? resultFor(g, cc.dir) : null, br = b ? resultFor(g, b.dir) : null;
    if (cr) crowd[cr]++;
    if (br) site[br]++;
    if (cr && br) { both.crowd[cr]++; both.site[br]++; }
    // every individual call, graded the same way
    const ru = resultFor(g, "up");
    if (ru === "pending") votes.pending += cc.up + cc.down;
    else if (ru === "flat") votes.flat += cc.up + cc.down;
    else { votes.right += ru === "right" ? cc.up : cc.down; votes.wrong += ru === "right" ? cc.down : cc.up; }
    return { event_key: t.event_key, title: t.title, country: t.country, market: t.market, time, crowd: cc, crowdResult: cr, bot: b ? { dir: b.dir, how: b.how } : null, botResult: br, moved: g && g.moved != null ? g.moved : null, unit: g && g.unit, result: g ? g.result : "pending" };
  }).filter(Boolean).sort((a, b) => b.time - a.time);
  return { crowd, site, votes, both, rows };
}

function myRecord(calls, outcome) {
  const t = tally();
  const rows = (calls || []).map((c) => {
    const time = Date.parse(c.released_at);
    const r = time > Date.now() ? "pending" : resultFor(outcome(c.market, time), c.dir);
    if (!(r in t)) return null;
    t[r]++;
    return { event_key: c.event_key, title: c.title, market: c.market, dir: c.dir, time, result: r };
  }).filter(Boolean).sort((a, b) => b.time - a.time);
  return { tally: t, rows };
}

module.exports = { MIN_CROWD, crowdCall, duel, myRecord, resultFor };
