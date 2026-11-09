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
// Nov 9, 2026 review: words inside other words, government DOGE and meme stocks were counted as crypto
test("crypto and memecoin pages: no false matches inside words, no government DOGE, no meme stocks", () => {
  ["Fed's Powell weighs whether to cut rates", "US budget deficit widens", "Stocks and bonds sell off together", "DOGE cuts reach the Pentagon", "Meme stocks rally as GameStop jumps", "Officials define new tariff rules"].forEach((t) => {
    assert.ok(!crypto({ title: t, theme: "macro" }), "crypto: " + t);
    assert.ok(!memes({ title: t, theme: "macro" }), "memes: " + t);
  });
});
test("crypto page: real crypto words still count, and DOGE with a crypto word is the coin", () => {
  ["Ether ETF inflows hit a record", "Ethereum upgrade goes live", "DeFi lending hits a new high", "Dogecoin jumps 12%", "DOGE price jumps 10% after Musk post", "Bitcoin and DOGE rally"].forEach((t) => assert.ok(crypto({ title: t, theme: "macro" }), t));
  assert.ok(memes({ title: "DOGE price jumps 10% after Musk post", theme: "macro" }));
  assert.ok(memes({ title: "Traders dump meme coins after rally", theme: "macro" }));
});
