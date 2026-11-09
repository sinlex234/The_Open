// Crowd vs the bot rules. Each test is one rule from the top of crowd.js.
const test = require("node:test");
const assert = require("node:assert");
const C = require("../crowd.js");

const past = (h) => new Date(Date.now() - h * 36e5).toISOString();
// market went up after release A, down after B, barely moved after C, D not graded yet
const OUT = { A: { result: "right", moved: 40, unit: "pts" }, B: { result: "wrong", moved: -30, unit: "pts" }, C: { result: "flat", moved: 1, unit: "pts" }, D: { result: "pending" } };
const byTime = {};
const T = (k, h) => { const at = past(h); byTime[Date.parse(at)] = k; return at; };
const outcome = (mk, time) => OUT[byTime[time]];

test("rule 2: the crowd's call is the majority, needs enough calls, and a tie is no call", () => {
  assert.equal(C.crowdCall({ up: 5, down: 2 }).dir, "up");
  assert.equal(C.crowdCall({ up: 5, down: 2 }).share, 71);
  assert.equal(C.crowdCall({ up: 1, down: 4 }).dir, "down");
  assert.equal(C.crowdCall({ up: 2, down: 0 }).dir, null);
  assert.equal(C.crowdCall({ up: 2, down: 0 }).why, "few");
  assert.equal(C.crowdCall({ up: 3, down: 3 }).why, "tie");
});

test("rule 3: everyone is graded on the same hour; barely moved counts for nobody", () => {
  const tallies = [
    { event_key: "A", market: "NQ", up: 6, down: 2, released_at: T("A", 5) },
    { event_key: "B", market: "NQ", up: 6, down: 2, released_at: T("B", 4) },
    { event_key: "C", market: "NQ", up: 2, down: 6, released_at: T("C", 3) }
  ];
  const bots = [{ event_key: "A", market: "NQ", dir: "down", how: "rule" }, { event_key: "B", market: "NQ", dir: "down", how: "rule" }, { event_key: "C", market: "NQ", dir: "up", how: "rule" }];
  const d = C.duel(tallies, bots, outcome);
  assert.deepEqual(d.crowd, { right: 1, wrong: 1, flat: 1, pending: 0 });
  assert.deepEqual(d.site, { right: 1, wrong: 1, flat: 1, pending: 0 });
  const a = d.rows.find((r) => r.event_key === "A");
  assert.equal(a.crowdResult, "right"); assert.equal(a.botResult, "wrong");
});

test("rule 4: head-to-head only counts releases where both made a call", () => {
  const tallies = [
    { event_key: "A", market: "NQ", up: 6, down: 2, released_at: T("A", 5) },
    { event_key: "B", market: "NQ", up: 1, down: 1, released_at: T("B", 4) }, // too few: no crowd call
    { event_key: "C", market: "BTC", up: 4, down: 1, released_at: T("C", 3) }   // no site call on BTC
  ];
  const d = C.duel(tallies, [{ event_key: "A", market: "NQ", dir: "up" }, { event_key: "B", market: "NQ", dir: "down" }], outcome);
  assert.deepEqual(d.both.crowd, { right: 1, wrong: 0, flat: 0, pending: 0 });
  assert.deepEqual(d.both.site, { right: 1, wrong: 0, flat: 0, pending: 0 });
  assert.equal(d.site.right + d.site.wrong, 2, "the site's own record still counts B");
});

test("rule 5: individual reader calls are graded too", () => {
  const d = C.duel([{ event_key: "A", market: "NQ", up: 6, down: 2, released_at: T("A", 5) }, { event_key: "B", market: "NQ", up: 1, down: 3, released_at: T("B", 4) }], [], outcome);
  // A went up: 6 right, 2 wrong. B went down: 3 right, 1 wrong.
  assert.deepEqual(d.votes, { right: 9, wrong: 3, flat: 0, pending: 0 });
});

test("rule 1 and 3: releases still to come aren't graded, and a reader's own record follows the same rules", () => {
  const future = new Date(Date.now() + 36e5).toISOString();
  const d = C.duel([{ event_key: "Z", market: "NQ", up: 9, down: 0, released_at: future }], [], outcome);
  assert.equal(d.rows.length, 0);
  const me = C.myRecord([
    { event_key: "A", market: "NQ", dir: "up", released_at: T("A", 5) },
    { event_key: "B", market: "NQ", dir: "up", released_at: T("B", 4) },
    { event_key: "D", market: "NQ", dir: "down", released_at: T("D", 0.5) },
    { event_key: "Z", market: "NQ", dir: "down", released_at: future }
  ], outcome);
  assert.deepEqual(me.tally, { right: 1, wrong: 1, flat: 0, pending: 2 });
});

test("rule 6: calls older than the price history are left out", () => {
  const old = new Date(Date.now() - 45 * 864e5).toISOString();
  const out = (mk, time) => (time < Date.now() - 40 * 864e5 ? { result: "expired" } : OUT[byTime[time]]);
  const d = C.duel([{ event_key: "O", market: "NQ", up: 9, down: 1, released_at: old }, { event_key: "A", market: "NQ", up: 6, down: 2, released_at: T("A", 5) }], [], out);
  assert.equal(d.rows.length, 1);
  assert.deepEqual(d.crowd, { right: 1, wrong: 0, flat: 0, pending: 0 });
  const me = C.myRecord([{ event_key: "O", market: "NQ", dir: "up", released_at: old }], out);
  assert.equal(me.rows.length, 0);
  assert.deepEqual(me.tally, { right: 0, wrong: 0, flat: 0, pending: 0 });
});
