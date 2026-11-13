// Smart alerts: who gets which alert (tests/alerts.test.js checks each rule).
// 1. Only alert types the reader switched on, and only for their markets (speeches and releases name the markets
//    they move; a memecoin alert needs Pro).
// 2. How often: "big" = only big alerts, "normal" = big and normal, "all" = everything (minor ones too).
// 3. Quiet hours in the reader's own time zone. On weekends only crypto alerts are sent if they chose that.
// 4. Daily limit by plan (Free 3, Plus 20, Pro 60 as a safety cap) over the last 24 hours. A test alert never counts.
// 5. "Mute today" silences that market until the end of the reader's day.
// 6. Never the same alert twice (the event's key is saved per reader).
"use strict";

const LIMIT = { free: 3, plus: 20, pro: 60 };
const CRYPTO = new Set(["BTC", "ETH", "MEME"]);
const ALL_MKTS = ["NQ", "ES", "GC", "CL", "EURUSD", "USDJPY", "BTC", "ETH"];
// which markets an economic release or a central bank speech moves, by currency
const BY_CUR = { USD: ["NQ", "ES", "GC", "CL", "EURUSD", "USDJPY", "BTC", "ETH"], EUR: ["EURUSD"], JPY: ["USDJPY"] };
const BANK_MKTS = { "Federal Reserve": BY_CUR.USD, "European Central Bank": ["EURUSD", "GC"] };

function localParts(t, tz) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", weekday: "short", hour: "2-digit", minute: "2-digit", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return { mins: +p.hour * 60 + +p.minute, wd: p.weekday, date: `${p.year}-${p.month}-${p.day}` };
  } catch { return localParts(t, "America/New_York"); }
}
// rule 3
function inQuiet(t, prefs) {
  const { mins } = localParts(t, prefs.tz), a = prefs.quiet_from, b = prefs.quiet_to;
  if (a === b) return false;
  return a < b ? mins >= a && mins < b : mins >= a || mins < b;
}
// end of the reader's day, for "Mute today"
function endOfDay(t, tz) {
  const { mins } = localParts(t, tz);
  return t + (1440 - mins) * 6e4;
}
// event: { key, kind: "moves"|"releases"|"speeches"|"memes"|"pre", level: "big"|"normal", markets: [...] }
// user: { user, chat, tier, prefs, muted, sent24 }
function decide(ev, u, now = Date.now(), already = new Set()) {
  const p = u.prefs || {}, types = p.types || {};
  const type = ev.kind === "pre" ? "releases" : ev.kind;
  if (!types[type]) return "off";
  if (ev.kind === "pre" && !(p.release_opts && p.release_opts.pre)) return "off";
  if (ev.kind === "releases" && !(p.release_opts && p.release_opts.result)) return "off";
  if (ev.kind === "memes" && u.tier !== "pro") return "plan";
  const mine = new Set(p.markets && p.markets.length ? p.markets : ["NQ", "ES"]);
  const hit = ev.kind === "memes" ? ["MEME"] : (ev.markets || []).filter((m) => mine.has(m));
  if (!hit.length) return "market";
  const freq = p.freq || "normal";
  if (freq === "big" && ev.level !== "big") return "freq";
  if (freq === "normal" && ev.level === "minor") return "freq";
  if (inQuiet(now, p)) return "quiet";
  const { wd } = localParts(now, p.tz);
  if (p.weekend_crypto && (wd === "Sat" || wd === "Sun") && !hit.some((m) => CRYPTO.has(m))) return "weekend";
  const muted = u.muted || {};
  if (hit.every((m) => muted[m] && Date.parse(muted[m]) > now)) return "muted";
  if ((u.sent24 || 0) >= (LIMIT[u.tier] || LIMIT.free)) return "limit";
  if (already.has(u.user + ":" + ev.key)) return "sent";
  return "send";
}

// Telegram HTML: only <b>, <i>, <a>; everything else escaped
const tgEsc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = { decide, inQuiet, endOfDay, localParts, tgEsc, LIMIT, BY_CUR, BANK_MKTS, ALL_MKTS };
