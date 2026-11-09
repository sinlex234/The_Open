"use strict";
// The Open One — which stories belong on each section page.
// Rule: a section page shows that section's news only (no Bitcoin analysis on the memecoin page).
// Words are matched whole, so "whether"/"together" aren't ether and "deficit"/"define" aren't DeFi.
// "Meme stocks" are stocks, not memecoins. DOGE alone is usually the US government department, so it only
// counts as crypto with "dogecoin" or a crypto word nearby (coin, crypto, token, price, rally, ...).
const DOGE_CTX = "coins?|crypto\\w*|tokens?|prices?|rall(?:y|ies)|whales?|etfs?|memecoins?|altcoins?|bitcoin|btc";
const DOGE_COIN = `dogecoin|\\bdoge\\b(?=.*\\b(?:${DOGE_CTX})\\b)|\\b(?:${DOGE_CTX})\\b.*\\bdoge\\b`;
const MEME_RE = new RegExp(String.raw`memecoin|meme coin|meme token|\bmemes?\b(?!\s+stocks?\b)|shiba|\bshib\b|\bbonk\b|\bpepe\b|pump\.?fun|\bwif\b|dogwifhat|fartcoin|\bfloki\b|\$trump\b|trump (meme)?coin|rug ?pull|letsbonk|dexscreener|token launch|` + DOGE_COIN, "i");
const CRYPTO_RE = new RegExp(String.raw`bitcoin|\bbtc\b|crypto|\bether(eum)?\b|\beth\b|solana|\bsol\b|stablecoin|\bxrp\b|binance|coinbase|blockchain|\bdefi\b|\btoken|altcoin|memecoin|` + DOGE_COIN, "i");
const ON_TOPIC = {
  memes: (h) => h.theme === "memes" || MEME_RE.test(h.title || ""),
  crypto: (h) => h.theme === "crypto" || h.theme === "memes" || CRYPTO_RE.test(h.title || "")
};
module.exports = { ON_TOPIC, MEME_RE, CRYPTO_RE };
