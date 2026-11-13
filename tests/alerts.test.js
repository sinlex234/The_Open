// Smart alert rules. Each test is one rule from the top of worker/alerts.js.
const test = require("node:test");
const assert = require("node:assert");
const A = require("../worker/alerts.js");

// Thursday Nov 12 2026, 10:00 AM New York
const NOW = Date.parse("2026-11-12T15:00:00Z");
const prefs = (o = {}) => ({ types: { moves: true, releases: true, speeches: true, memes: false }, release_opts: { pre: true, result: true }, markets: ["NQ", "BTC"], freq: "normal", quiet_from: 1380, quiet_to: 420, tz: "America/New_York", weekend_crypto: true, ...o });
const user = (o = {}) => ({ user: "u1", chat: 1, tier: "plus", sent24: 0, muted: {}, prefs: prefs(), ...o });
const mv = (o = {}) => ({ key: "move:NQ:1", kind: "moves", level: "normal", markets: ["NQ"], ...o });

test("rule 1: only switched-on types, only the reader's markets, memecoins need Pro", () => {
  assert.equal(A.decide(mv(), user(), NOW), "send");
  assert.equal(A.decide(mv(), user({ prefs: prefs({ types: { moves: false } }) }), NOW), "off");
  assert.equal(A.decide(mv({ markets: ["CL"] }), user(), NOW), "market");
  assert.equal(A.decide({ key: "pre:cpi", kind: "pre", level: "normal", markets: A.BY_CUR.USD }, user({ prefs: prefs({ release_opts: { pre: false, result: true } }) }), NOW), "off");
  const meme = { key: "meme:x", kind: "memes", level: "normal", markets: [] };
  assert.equal(A.decide(meme, user({ prefs: prefs({ types: { memes: true } }) }), NOW), "plan");
  assert.equal(A.decide(meme, user({ tier: "pro", prefs: prefs({ types: { memes: true } }) }), NOW), "send");
});

test("rule 2: 'only the big ones' skips normal alerts", () => {
  const u = user({ prefs: prefs({ freq: "big" }) });
  assert.equal(A.decide(mv(), u, NOW), "freq");
  assert.equal(A.decide(mv({ level: "big" }), u, NOW), "send");
  assert.equal(A.decide(mv({ level: "minor" }), user(), NOW), "freq", "normal skips minor alerts");
  assert.equal(A.decide(mv({ level: "minor" }), user({ prefs: prefs({ freq: "all" }) }), NOW), "send");
});

test("rule 3: quiet hours in the reader's own time zone, and crypto-only weekends", () => {
  const night = Date.parse("2026-11-13T05:00:00Z"); // midnight New York, 9 PM Los Angeles
  assert.equal(A.decide(mv(), user(), night), "quiet");
  assert.equal(A.decide(mv(), user({ prefs: prefs({ tz: "America/Los_Angeles" }) }), night), "send");
  assert.equal(A.inQuiet(night, { quiet_from: 0, quiet_to: 0, tz: "America/New_York" }), false, "same start and end = no quiet hours");
  const sat = Date.parse("2026-11-14T16:00:00Z");
  assert.equal(A.decide(mv(), user(), sat), "weekend");
  assert.equal(A.decide(mv({ markets: ["BTC"] }), user(), sat), "send");
});

test("rule 4: daily limit by plan", () => {
  assert.equal(A.decide(mv(), user({ tier: "free", sent24: 3 }), NOW), "limit");
  assert.equal(A.decide(mv(), user({ tier: "plus", sent24: 3 }), NOW), "send");
  assert.equal(A.decide(mv(), user({ tier: "plus", sent24: 20 }), NOW), "limit");
});

test("rule 5: mute today lasts until the end of the reader's day", () => {
  const until = new Date(A.endOfDay(NOW, "America/New_York")).toISOString();
  assert.equal(until, "2026-11-13T05:00:00.000Z");
  assert.equal(A.decide(mv(), user({ muted: { NQ: until } }), NOW), "muted");
  assert.equal(A.decide(mv({ markets: ["NQ", "BTC"] }), user({ muted: { NQ: until } }), NOW), "send", "still sent for an unmuted market");
  assert.equal(A.decide(mv(), user({ muted: { NQ: until }, prefs: prefs({ quiet_from: 0, quiet_to: 0 }) }), Date.parse(until) + 1), "send", "next day it's back");
});

test("rule 6: never the same alert twice", () => {
  assert.equal(A.decide(mv(), user(), NOW, new Set(["u1:move:NQ:1"])), "sent");
});

test("alert text is safe for Telegram", () => {
  assert.equal(A.tgEsc("S&P <500>"), "S&amp;P &lt;500&gt;");
});
