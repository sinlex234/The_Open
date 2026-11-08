"use strict";
// The Open One — which stories belong on each section page.
// Rule: a section page shows that section's news only (no Bitcoin analysis on the memecoin page).
const MEME_RE = /memecoin|meme coin|meme token|\bmemes?\b|dogecoin|\bdoge\b|shiba|\bshib\b|\bbonk\b|\bpepe\b|pump\.?fun|\bwif\b|dogwifhat|fartcoin|\bfloki\b|\$trump\b|trump (meme)?coin|rug ?pull|letsbonk|dexscreener|token launch/i;
const CRYPTO_RE = /bitcoin|\bbtc\b|crypto|ether(eum)?\b|\beth\b|solana|\bsol\b|stablecoin|\bxrp\b|binance|coinbase|blockchain|defi|\btoken|altcoin|memecoin|\bdoge/i;
const ON_TOPIC = {
  memes: (h) => h.theme === "memes" || MEME_RE.test(h.title || ""),
  crypto: (h) => h.theme === "crypto" || h.theme === "memes" || CRYPTO_RE.test(h.title || "")
};
module.exports = { ON_TOPIC, MEME_RE, CRYPTO_RE };
