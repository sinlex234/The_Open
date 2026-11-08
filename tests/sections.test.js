// Section pages show their own news only (Nov 7, 2026: the memecoin page showed Bitcoin analysis).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { ON_TOPIC } = require("../sections.js");

const memes = ON_TOPIC.memes, crypto = ON_TOPIC.crypto;
test("memecoin page: memecoin stories in", () => {
  ["Pump.fun launches a new token standard", "Dogecoin jumps 12% as Musk posts meme", "Bonk and Pepe lead a memecoin rally", "Traders lose millions in latest rug pull on Solana", "Dogwifhat (WIF) slides after whale sells"].forEach((t) => assert.ok(memes({ title: t, theme: "crypto" }), t));
});
test("memecoin page: Bitcoin, gold and macro stories out", () => {
  ["Bitcoin analysis after the US midterms: Bulls are back, but $82,000 could change everything", "Gold hits a two-week high as dollar, Treasury yields ease after U.S. midterm elections", "Bitcoin holds above $80,000 as Zcash jumps 12%", "Ether ETF inflows hit a record", "Fed's Powell says rate cuts still likely"].forEach((t) => assert.ok(!memes({ title: t, theme: /gold|Fed/.test(t) ? "rates" : "crypto" }), t));
});
test("crypto page: no gold or Fed-only stories", () => {
  assert.ok(crypto({ title: "Bitcoin holds above $80,000", theme: "crypto" }));
  assert.ok(!crypto({ title: "Gold hits a two-week high as dollar eases", theme: "gold" }));
  assert.ok(!crypto({ title: "Fed's Powell says rate cuts still likely", theme: "rates" }));
});
