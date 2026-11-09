// Story thread rules. Each test is one rule from the top of threads.js.
const test = require("node:test");
const assert = require("node:assert");
const T = require("../threads.js");

let id = 0;
const H = (title, words, hoursAgo = 1, theme = "politics") => ({ id: "h" + (++id), title, words, t: Date.now() - hoursAgo * 36e5, theme, label: theme });

test("rule 1: a topic that often mentions the election isn't merged into the election story", () => {
  const pool = [];
  // 14 election headlines, 4 of which also mention Iran (so half of all Iran headlines mention the election)
  const EW = ["house", "senate", "voters", "majority", "jeffries", "healthcare", "turnout", "governors", "recount", "speaker"];
  for (let i = 0; i < 10; i++) pool.push(H("Democrats midterms " + EW[i] + " " + EW[(i + 3) % 10], ["election", "democrats"], i));
  pool.push(H("Iran war cost Trump the midterms", ["election", "iran"], 3), H("Iran mediators pause after US election", ["election", "iran"], 4),
    H("House Democrats aim to end the Iran war", ["election", "iran"], 7), H("Iran dilemma after the midterms", ["election", "iran"], 8));
  // 3 Iran/oil headlines that don't mention the election
  pool.push(H("Oil extends weekly drop with focus on Iran", ["iran", "oil"], 1, "energy"), H("Iran talks stall", ["iran", "talks"], 2, "energy"), H("Oil sinks on Iran peace hopes", ["iran", "oil"], 5, "energy"));
  pool.push(H("Iran strikes tanker", ["iran", "tanker"], 6, "energy"));
  // the rest of the day's news, unrelated
  for (let i = 0; i < 25; i++) pool.push(H("Other news " + i, ["other" + i], i, "macro"));
  const th = T.findThreads(pool, new Set());
  const election = th.find((t) => t.keys[0] === "election");
  assert.ok(election, "election story exists");
  assert.ok(!election.keys.includes("iran"), "iran is not merged into the election story: " + election.keys);
  assert.ok(!election.members.some((h) => /Oil extends/.test(h.title)), "oil headline not in the election story");
});

test("rule 1: words that really travel together still become one story", () => {
  const pool = [];
  const BW = ["withdrawals", "regulators", "refunds", "outflows", "probe", "resumes"];
  for (let i = 0; i < 6; i++) pool.push(H("Binance hack " + BW[i], ["binance", "hack"], i, "crypto"));
  const th = T.findThreads(pool, new Set());
  assert.equal(th.length, 1);
  assert.deepEqual(th[0].keys.sort(), ["binance", "hack"]);
});

test("rule 2: the same headline repeated shows once, at its newest time", () => {
  const list = [
    { title: "Wall Street’s Script Gets Flipped by Post-Election Rout", t: 5 },
    { title: "Treasury Yields Down Following Democrats Midterm Win", t: 4 },
    { title: "Wall Street's Script Gets Flipped by Post-Election Rout", t: 3 },
    { title: "Treasury yields down following Democrats' midterm win", t: 2 },
    { title: "Treasury yields climb after hot jobs report", t: 1 }
  ];
  const out = T.dedupe(list);
  assert.equal(out.length, 3);
  assert.equal(out[0].t, 5);
});

test("rule 3: no grade when the market was closed right after the headline", () => {
  const fri = Date.parse("2026-11-06T21:00:00Z"); // Friday 4 PM New York, futures close an hour later
  const bars = []; for (let t = fri - 36e5 * 5; t <= fri + 36e5; t += 15 * 6e4) bars.push({ t, c: 1 });
  const sun = Date.parse("2026-11-08T23:00:00Z"); for (let t = sun; t < sun + 36e5 * 3; t += 15 * 6e4) bars.push({ t, c: 1 });
  assert.equal(T.openAt(bars, fri - 36e5), true);
  assert.equal(T.openAt(bars, Date.parse("2026-11-07T15:00:00Z")), false, "Saturday headline");
  assert.equal(T.openAt(bars, sun - 10 * 6e4), true, "just before the Sunday open");
});

test("rule 4: the price line marks where the market was closed", () => {
  const bars = []; const a = Date.parse("2026-11-06T15:00:00Z"); for (let i = 0; i < 20; i++) bars.push({ t: a + i * 9e5, c: 100 + i });
  const b = Date.parse("2026-11-08T23:00:00Z"); for (let i = 0; i < 20; i++) bars.push({ t: b + i * 9e5, c: 120 + i });
  const s = T.tradingSeries(bars);
  assert.deepEqual(s.breaks, [b]);
  assert.equal(s.pts.length, 40);
});
