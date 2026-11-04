// The Open One: front end. Plain JavaScript modules, no build step.
import {
  initMe, me, myMarkets, myAssets, isBeginner, isLearning, depth, hasStrat, levelTrader, intraday, stratsFor,
  forYouEvent, forYouHeadline, forYouStrength, relevance, greeting, windowStatus, startAlerts, openAlerts, editSetup,
  profileQuery, marketLabel, myStruggles, isProp, newsRestricted, notify,
  userTZ, plan, isPaid, authToken, rpc, loadPlan, signedIn, mySessions as mySessionsC, followUps, sbClient, setProfileLocal, hasProfile, SESSIONS as SESSIONS_C,
} from './me.js';
import { GLOSSARY } from './glossary.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const $ = s => document.querySelector(s);
const main = $('#main');
const MKT_TZ = 'America/New_York'; // market hours
let TZ = userTZ();               // what the reader sees (Settings → Time zone)
const tzAbbr = (t = Date.now()) => (new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'short' }).formatToParts(new Date(t)).find(x => x.type === 'timeZoneName') || {}).value || '';
const tzCity = () => TZ.split('/').pop().replace(/_/g, ' ');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- per-viewer conveniences ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('open:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('open:' + k, JSON.stringify(v)); } catch {} },
};
function applyTheme() { const t = store.get('theme', null); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme();
$('#themeBtn').onclick = () => { store.set('theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); applyTheme(); if (started) { mountStrip(true); route(); } };

let lastRefresh = Date.now(); // when page data last refreshed (shown in the status line)
const MS_NAME = { futures: 'Futures', stocks: 'Stocks', options: 'Options', forex: 'Forex' };
// ---------- time ----------
const nyParts = (t = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, mi: +p.minute, mins: +p.hour * 60 + +p.minute, dow: p.weekday };
};
const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtDay = (t, o = { weekday: 'long', month: 'short', day: 'numeric' }) => new Date(t).toLocaleDateString('en-US', { timeZone: TZ, ...o });
const dayLabel = ds => { const today = nyParts().date; const d = new Date(ds + 'T12:00:00Z'), tm = new Date(today + 'T12:00:00Z'); const diff = Math.round((d - tm) / 864e5); const b = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }); return diff === 0 ? 'Today, ' + b : diff === 1 ? 'Tomorrow, ' + b : b; };
const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60e3); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; };
const until = t => { const m = Math.round((t - Date.now()) / 60e3); if (m <= 0) return 'now'; if (m < 60) return `in ${m} min`; const h = Math.floor(m / 60), r = m % 60; if (h < 24) return `in ${h}h${r ? ' ' + r + 'm' : ''}`; return 'on ' + fmtDay(t, { weekday: 'long' }); };

// ---------- numbers ----------
const num = (v, dp = 2) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const usd = v => { if (v == null || !isFinite(v)) return '—'; if (v >= 1) return '$' + num(v, v >= 1000 ? 0 : 2); const d = Math.max(2, -Math.floor(Math.log10(v)) + 3); return '$' + v.toFixed(Math.min(d, 10)); };
const big = v => v == null ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + Math.round(v);
const chg = v => { if (v == null || !isFinite(v)) return '<span class="chg flat">—</span>'; const c = v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat'; return `<span class="chg ${c}">${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%</span>`; };
const priceOf = r => r.unit === '%' ? num(r.price, 2) + '%' : num(r.price, r.dp);
function spark(vals, w = 64, h = 20) {
  vals = (vals || []).filter(v => v != null && isFinite(v));
  if (vals.length < 3) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ');
  const col = vals[vals.length - 1] >= vals[0] ? 'var(--up)' : 'var(--down)';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ---------- data ----------
const cache = new Map();
function api(path, maxAgeMs = 90e3) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < maxAgeMs) return hit.p;
  const planRoute = isPaid() && /^(desk|brief|explain|memedesk)\b/.test(path);
  const p = (planRoute ? authToken() : Promise.resolve(null)).then(tok => fetch('/api/data?fn=' + path.replace('?', '&') + (tok ? '&plan=' + plan.tier : ''), tok ? { headers: { Authorization: 'Bearer ' + tok } } : undefined)).then(async r => {
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) throw new Error('the data service isn’t reachable');
    if (!r.ok || j.error) throw new Error(j.error || 'request failed, ' + r.status);
    return j;
  });
  cache.set(path, { t: Date.now(), p });
  p.catch(() => cache.delete(path));
  return p;
}
const errBox = (what, m) => `<div class="err" role="alert"><span>Couldn’t load ${esc(what)} (${esc(m)}). It will try again in two minutes.</span><button class="btn-ghost" onclick="location.reload()">Reload now</button></div>`;
const skel = (n = 4) => Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${92 - i * 13}%"></div>`).join('');
async function fill(el, what, promise, render) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  if (!el.innerHTML.trim()) el.innerHTML = skel();
  try { const d = await promise; if (el.isConnected) el.innerHTML = render(d); }
  catch (e) { if (el.isConnected) el.innerHTML = errBox(what, e.message); }
}
const stamp = d => `<p class="stamp">Updated ${fmtTime(d.updated || Date.now())}</p>`;

// ---------- masthead: date, which exchanges are open ----------
const EXCH = [
  { name: 'New York', tz: 'America/New_York', open: 570, close: 960 },
  { name: 'London', tz: 'Europe/London', open: 480, close: 990 },
  { name: 'Frankfurt', tz: 'Europe/Berlin', open: 540, close: 1050 },
  { name: 'Tokyo', tz: 'Asia/Tokyo', open: 540, close: 930 },
  { name: 'Hong Kong', tz: 'Asia/Hong_Kong', open: 570, close: 960 },
];
function exchState(x) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: x.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(y => [y.type, y.value]));
  const mins = +p.hour * 60 + +p.minute, wkend = p.weekday === 'Sat' || p.weekday === 'Sun';
  const open = !wkend && mins >= x.open && mins < x.close;
  const hm = m => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m >= 720 ? 'PM' : 'AM'}`;
  return { open, tip: open ? `${x.name} stock market is open until ${hm(x.close)} local time` : `${x.name} stock market is closed. It opens at ${hm(x.open)} local time${wkend ? ' on Monday' : ''}` };
}
function tick() {
  const now = new Date();
  $('#mastDate').innerHTML = `${now.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br><b>${now.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}</b> in ${esc(tzCity())}`;
  $('#exchanges').innerHTML = EXCH.map(x => { const s = exchState(x); return `<li class="${s.open ? 'open' : ''}" title="${esc(s.tip)}">${esc(x.name)}</li>`; }).join('');
}

// ---------- live ticker: our own, updated every second ----------
// Crypto streams from Coinbase in real time; everything else comes from /api/data?fn=ticks once a second.
const LOGO = 'https://s3-symbol-logo.tradingview.com/';
const TAPE = [
  { k: 'NQ', y: 'NQ=F', logo: 'indices/nasdaq-100.svg', dp: 2 },
  { k: 'S&P 500', y: 'ES=F', logo: 'indices/s-and-p-500.svg', dp: 2 },
  { k: 'Dow', y: 'YM=F', logo: 'indices/dow-30.svg', dp: 0 },
  { k: 'DAX', y: '^GDAXI', logo: 'indices/dax.svg', dp: 1 },
  { k: 'Nikkei', y: '^N225', logo: 'indices/nikkei-225.svg', dp: 1 },
  { k: 'EUR/USD', y: 'EURUSD=X', flags: ['EU', 'US'], dp: 5 },
  { k: 'USD/JPY', y: 'USDJPY=X', flags: ['US', 'JP'], dp: 3 },
  { k: 'GBP/USD', y: 'GBPUSD=X', flags: ['GB', 'US'], dp: 5 },
  { k: 'Gold', y: 'GC=F', logo: 'metal/gold.svg', dp: 1 },
  { k: 'Oil', y: 'CL=F', logo: 'crude-oil.svg', dp: 2 },
  { k: 'BTC', cb: 'BTC-USD', logo: 'crypto/XTVCBTC.svg', dp: 0 },
  { k: 'ETH', cb: 'ETH-USD', logo: 'crypto/XTVCETH.svg', dp: 2 },
  { k: 'SOL', cb: 'SOL-USD', logo: 'crypto/XTVCSOL.svg', dp: 2 },
];
const CB_EXTRA = { XRP: ['XRP-USD', 'crypto/XTVCXRP.svg', 4], DOGE: ['DOGE-USD', 'crypto/XTVCDOGE.svg', 5] };
const FLAG = { USD: 'US', EUR: 'EU', JPY: 'JP', GBP: 'GB', CHF: 'CH', AUD: 'AU', CAD: 'CA', NZD: 'NZ' };
function tapeItems() {
  const mine = [];
  myAssets().forEach(a => {
    const hit = TAPE.find(t => (a.ysym && t.y === a.ysym) || (t.cb && t.k === a.id));
    if (hit) { if (!mine.includes(hit)) mine.push(hit); return; }
    if (CB_EXTRA[a.id]) { const [cb, logo, dp] = CB_EXTRA[a.id]; mine.push({ k: a.id, cb, logo, dp }); return; }
    if (a.ysym && /^[A-Z]{6}=X$/.test(a.ysym)) { const b = a.ysym.slice(0, 3), q = a.ysym.slice(3, 6); mine.push({ k: b + '/' + q, y: a.ysym, flags: [FLAG[b], FLAG[q]].filter(Boolean), dp: q === 'JPY' ? 3 : 5 }); return; }
    if (a.ysym) mine.push({ k: shortName(a), y: a.ysym, dp: 2 });
  });
  return [...mine, ...TAPE.filter(t => !mine.includes(t))].slice(0, 16);
}
const tape = { items: [], key: '', q: {}, cb: {}, prev: {}, timer: null, ws: null, wsKeys: '', backoff: 1000 };
function tkLogo(t) {
  if (t.flags && t.flags.length) return `<span class="tk-logo pair">${t.flags.map(f => `<img src="${LOGO}country/${f}.svg" alt="" loading="lazy" onerror="this.remove()">`).join('')}</span>`;
  if (t.logo) return `<span class="tk-logo"><img src="${LOGO}${t.logo}" alt="" loading="lazy" onerror="this.parentNode.remove()"></span>`;
  return '';
}
function mountStrip(force = false) {
  const items = tapeItems();
  const key = items.map(t => t.k).join('|');
  const el = $('#strip');
  if (force || key !== tape.key || !el.querySelector('.tk-track')) {
    tape.key = key; tape.items = items;
    const row = items.map(t => `<span class="tk" data-k="${esc(t.k)}">${tkLogo(t)}<b>${esc(t.k)}</b><span class="tk-p">—</span><span class="tk-c"></span></span>`).join('');
    el.innerHTML = `<div class="tk-track" aria-hidden="true"><div class="tk-row">${row}</div><div class="tk-row">${row}</div></div><span class="sr-only">Live prices</span>`;
    el.style.setProperty('--tk-dur', Math.max(40, items.length * 6) + 's');
    renderTape();
  }
  startTape();
}
function renderTape() {
  tape.items.forEach(t => {
    let p, pc;
    if (t.cb) { const c = tape.cb[t.cb]; if (!c) return; p = c.p; pc = c.o; }
    else { const r = tape.q[t.y]; if (!r) return; p = r.p; pc = r.pc; }
    if (p == null) return;
    const ch = pc ? p - pc : null, pct = pc ? (p - pc) / pc * 100 : null;
    const dir = ch == null ? '' : ch > 0 ? 'up' : ch < 0 ? 'down' : '';
    const last = tape.prev[t.k];
    const flash = last != null && p !== last ? (p > last ? 'fl-up' : 'fl-down') : '';
    tape.prev[t.k] = p;
    const pTxt = num(p, t.dp);
    const cTxt = ch == null ? '' : `${ch > 0 ? '+' : ch < 0 ? '−' : ''}${num(Math.abs(ch), t.dp)} (${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(2)}%)`;
    document.querySelectorAll(`#strip .tk[data-k="${CSS.escape(t.k)}"]`).forEach(n => {
      const pe = n.querySelector('.tk-p'), ce = n.querySelector('.tk-c');
      if (pe.textContent !== pTxt) { pe.textContent = pTxt; if (flash) { pe.classList.remove('fl-up', 'fl-down'); void pe.offsetWidth; pe.classList.add(flash); } }
      ce.textContent = cTxt; ce.className = 'tk-c ' + dir;
    });
  });
}
async function pollTicks() {
  // Anything that streamed in the last 20 seconds is already fresher than the snapshot
  const ys = tape.items.filter(t => t.y && !(tape.q[t.y] && tape.q[t.y].live && Date.now() - tape.q[t.y].at < 20e3)).map(t => t.y);
  if (!ys.length) return;
  try {
    const r = await fetch('/api/data?fn=ticks&s=' + encodeURIComponent(ys.join(',')), { cache: 'no-store' });
    if (r.ok) { const j = await r.json(); Object.entries(j.q || {}).forEach(([k, v]) => { const cur = tape.q[k]; if (!(cur && cur.live && Date.now() - cur.at < 20e3)) tape.q[k] = { ...v, at: Date.now() }; }); }
  } catch {}
}
// Yahoo's own live price stream (protobuf messages). Streams currencies, indexes and stocks; US futures don't stream for free.
function pbDecode(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const dv = new DataView(u.buffer), out = {};
  let i = 0;
  const vint = () => { let r = 0, m = 1, b; do { b = u[i++]; r += (b & 127) * m; m *= 128; } while (b & 128 && i < u.length); return r; };
  while (i < u.length) {
    const tag = vint(), f = Math.floor(tag / 8), w = tag & 7;
    if (w === 0) out[f] = vint();
    else if (w === 5) { out[f] = dv.getFloat32(i, true); i += 4; }
    else if (w === 1) { out[f] = dv.getFloat64(i, true); i += 8; }
    else if (w === 2) { const n = vint(); out[f] = new TextDecoder().decode(u.subarray(i, i + n)); i += n; }
    else break;
  }
  return out;
}
function connectYahoo() {
  const syms = [...new Set(tape.items.filter(t => t.y).map(t => t.y))];
  const keyS = syms.join(',');
  if (tape.yws && tape.ywsKeys === keyS && tape.yws.readyState <= 1) return;
  if (tape.yws) { try { tape.yws.onclose = null; tape.yws.close(); } catch {} tape.yws = null; }
  tape.ywsKeys = keyS;
  if (!syms.length || !('WebSocket' in window)) return;
  let ws;
  try { ws = new WebSocket('wss://streamer.finance.yahoo.com/?version=2'); } catch { return; }
  tape.yws = ws;
  ws.onopen = () => { tape.ybackoff = 1000; ws.send(JSON.stringify({ subscribe: syms })); };
  ws.onmessage = e => {
    try {
      let raw = e.data; if (typeof raw !== 'string') return;
      if (raw[0] === '{') { const m = JSON.parse(raw); if (!m.message) return; raw = m.message; }
      const d = pbDecode(raw), id = d[1], p = d[2];
      if (!id || !(p > 0)) return;
      const ch = typeof d[12] === 'number' ? d[12] : null;
      const prevC = tape.q[id] && tape.q[id].pc;
      tape.q[id] = { p, pc: ch != null ? p - ch : prevC ?? null, live: true, at: Date.now() };
    } catch {}
  };
  ws.onclose = () => { if (tape.yws !== ws) return; tape.yws = null; const wait = tape.ybackoff || 1000; setTimeout(() => { if (document.visibilityState === 'visible') connectYahoo(); }, wait); tape.ybackoff = Math.min(wait * 2, 30000); };
}
function connectCoinbase() {
  const ids = [...new Set(tape.items.filter(t => t.cb).map(t => t.cb))];
  const keyIds = ids.join(',');
  if (tape.ws && tape.wsKeys === keyIds && tape.ws.readyState <= 1) return;
  if (tape.ws) { try { tape.ws.onclose = null; tape.ws.close(); } catch {} tape.ws = null; }
  tape.wsKeys = keyIds;
  if (!ids.length || !('WebSocket' in window)) return;
  let ws;
  try { ws = new WebSocket('wss://ws-feed.exchange.coinbase.com'); } catch { return; }
  tape.ws = ws;
  ws.onopen = () => { tape.backoff = 1000; ws.send(JSON.stringify({ type: 'subscribe', product_ids: ids, channels: ['ticker'] })); };
  ws.onmessage = e => { try { const d = JSON.parse(e.data); if (d.type === 'ticker' && d.product_id) tape.cb[d.product_id] = { p: +d.price, o: +d.open_24h }; } catch {} };
  ws.onclose = () => { if (tape.ws !== ws) return; tape.ws = null; setTimeout(() => { if (document.visibilityState === 'visible') connectCoinbase(); }, tape.backoff); tape.backoff = Math.min(tape.backoff * 2, 30000); };
}
function startTape() {
  connectCoinbase(); connectYahoo();
  if (tape.timer) return;
  let busy = false;
  const tick = async () => {
    if (document.visibilityState !== 'visible' || busy) return;
    busy = true; await pollTicks(); busy = false; renderTape();
  };
  tick();
  let n = 0;
  tape.timer = setInterval(() => { renderTape(); if (++n % 3 === 0) tick(); }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { connectCoinbase(); connectYahoo(); tick(); } });
}

// ---------- TradingView live charts and heatmaps ----------
const tvTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
// The page grows with the screen (app.css sizes everything in rem); pixel sizes set from here follow the same scale
const remScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;
function tvWidget(el, kind, cfg, height) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.innerHTML = '';
  if (!el.classList.contains('chartbox')) el.style.height = height + 'px';
  const c = document.createElement('div'); c.className = 'tradingview-widget-container'; c.style.height = '100%'; c.style.width = '100%';
  const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; w.style.height = '100%'; c.appendChild(w);
  const sc = document.createElement('script'); sc.src = `https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js`; sc.async = true; sc.innerHTML = JSON.stringify(cfg); c.appendChild(sc);
  el.appendChild(c);
  // If TradingView doesn't load (slow network, blocked script), try again once, then offer a button.
  const token = String(Math.random()); el.dataset.tvToken = token;
  const tries = +(el.dataset.tvTries || 0);
  const check = () => {
    if (el.dataset.tvToken !== token || !el.isConnected) return;
    // An iframe means TradingView answered and is drawing (it can be hidden in a closed tab, so don't judge by size)
    const f = el.querySelector('iframe');
    if (f) { el.dataset.tvTries = '0'; return; }
    if (kind === 'ticker-tape') return;
    if (tries < 1) { el.dataset.tvTries = String(tries + 1); tvWidget(el, kind, cfg, height); return; }
    el.dataset.tvTries = '0';
    el.innerHTML = `<div class="tv-fail"><p>The live chart didn’t load. This is usually a slow connection or an ad blocker blocking TradingView.</p><button type="button" class="btn-ghost">Reload chart</button></div>`;
    el.querySelector('button').onclick = () => tvWidget(el, kind, cfg, height);
  };
  sc.onerror = () => setTimeout(check, 500);
  setTimeout(check, 15000);
}
// ---------- countdown to bar close (TradingView's embed forces its own one off, so we draw it) ----------
const TFS = [['1', '1m', 1], ['5', '5m', 5], ['60', '1h', 60], ['240', '4h', 240], ['D', '1D', 1440]];
const chartTf = () => { const v = store.get('chartTf', null); return TFS.some(t => t[0] === v) ? v : (intraday() ? '5' : 'D'); };
function nyOffset(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: MKT_TZ, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(t / 60e3) * 60e3;
}
function marketKind(sym) {
  if (/^(BINANCE|COINBASE|BYBIT|KRAKEN|BITSTAMP|CRYPTO|OKX|BITGET|MEXC|GATEIO):/i.test(sym)) return 'crypto';
  if (/^(NASDAQ|NYSE|AMEX|ARCA|BATS|NYSEARCA):/i.test(sym)) return 'stock';
  return 'fx';
}
function barClose(sym, tf, t = Date.now()) {
  const kind = marketKind(sym), H = 36e5, M = 6e4;
  const mins = (TFS.find(x => x[0] === tf) || TFS[1])[2];
  if (kind === 'crypto') {
    if (mins === 1440) return { at: Math.floor(t / 864e5) * 864e5 + 864e5 };
    const P = mins * M; return { at: Math.floor(t / P) * P + P };
  }
  const off = nyOffset(t), ny = t + off, dayStart = Math.floor(ny / 864e5) * 864e5, tod = ny - dayStart;
  const dow = new Date(ny).getUTCDay();
  if (kind === 'stock') {
    const open = 9.5 * H, close = 16 * H;
    if (dow === 0 || dow === 6 || tod < open || tod >= close) return { closed: 'Market closed' };
    if (mins === 1440) return { at: dayStart + close - off };
    const P = mins * M; const k = Math.floor((tod - open) / P) * P + P + open;
    return { at: dayStart + Math.min(k, close) - off };
  }
  const anchor = 17 * H;
  if (dow === 6 || (dow === 5 && tod >= anchor) || (dow === 0 && tod < anchor)) return { closed: 'Market closed for the weekend' };
  if (mins === 1440) return { at: dayStart + (tod < anchor ? anchor : anchor + 864e5) - off };
  const P = mins * M; const k = Math.floor((ny - anchor) / P) * P + P + anchor;
  return { at: k - off };
}
// ---------- weekend: no news while the user's markets are shut ----------
// Futures, stocks and options: Fri 5 PM to Sun 6 PM ET. Forex: Fri 5 PM to Sun 5 PM ET. Crypto never closes.
const REOPEN_H = { futures: 18, stocks: 18, options: 18, forex: 17 };
function marketShut(m, t = Date.now()) {
  const h = REOPEN_H[m]; if (h == null) return null;
  const off = nyOffset(t), ny = t + off, day = Math.floor(ny / 864e5) * 864e5, tod = (ny - day) / 36e5, dow = new Date(ny).getUTCDay();
  if (!(dow === 6 || (dow === 5 && tod >= 17) || (dow === 0 && tod < h))) return null;
  const sun = day + ((7 - dow) % 7) * 864e5;
  return sun + h * 36e5 - off;
}
// null if any of these markets is open, otherwise the time the first one reopens
function allShut(markets) {
  const list = markets.filter(m => m !== 'learning');
  if (!list.length) return null;
  const r = list.map(m => marketShut(m));
  return r.some(x => x == null) ? null : Math.min(...r);
}
const SHUT_NAME = { futures: 'futures', stocks: 'stock', options: 'options', forex: 'forex' };
const showWeekendNews = () => { try { return sessionStorage.getItem('weekendNews') === '1'; } catch { return false; } };
function closedHTML(reopen, label = 'The market') {
  const left = reopen - Date.now(), h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
  const day = new Date(reopen).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
  return `<div class="closed"><p class="closed-h"><span class="closed-dot"></span>No news. ${esc(label)} is closed.</p>
    <p>Reopens ${esc(day)} at ${fmtTime(reopen)} ${tzAbbr(reopen)}, in ${h ? h + 'h ' : ''}${m}m. The briefing comes back before the open.</p>
    <button class="linkbtn" type="button" data-weekend>Show weekend headlines anyway</button></div>`;
}
function bindWeekend() { main.querySelectorAll('[data-weekend]').forEach(b => b.onclick = () => { try { sessionStorage.setItem('weekendNews', '1'); } catch {} refreshing = false; route(); }); }

const fmtLeft = ms => { const s = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0'); };
let cdTimer = null;
function tickCountdowns() {
  document.querySelectorAll('.cd[data-sym]').forEach(el => {
    if (!el.isConnected) return;
    const tf = el.dataset.tf, r = barClose(el.dataset.sym, tf), label = (TFS.find(x => x[0] === tf) || [])[1] || tf;
    el.innerHTML = r.closed ? `<span>${esc(r.closed)}</span>` : `<span>${esc(label)}<span class="cd-l"> bar closes in</span></span><b>${fmtLeft(r.at - Date.now())}</b>`;
  });
}
function ensureCdTimer() { if (!cdTimer) cdTimer = setInterval(() => { if (document.visibilityState === 'visible') tickCountdowns(); }, 1000); }
function tvChart(el, symbol) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.classList.add('chartbox');
  el.dataset.sym = symbol;
  const dark = tvTheme() === 'dark';
  const tf = chartTf();
  const shell = el.parentElement;
  let cd = shell && shell.querySelector(':scope > .cd, :scope > .tfrow > .cd');
  if (shell && !cd) { cd = document.createElement('div'); cd.className = 'cd'; cd.setAttribute('aria-live', 'off'); (shell.querySelector(':scope > .tfrow') || shell).appendChild(cd); }
  if (cd) { cd.dataset.sym = symbol; cd.dataset.tf = tf; tickCountdowns(); ensureCdTimer(); }
  tvWidget(el, 'advanced-chart', { autosize: true, symbol, interval: tf, timezone: 'America/New_York', theme: tvTheme(), style: '1', locale: 'en', allow_symbol_change: true, hide_volume: true, save_image: false, calendar: false, support_host: 'https://www.tradingview.com', backgroundColor: dark ? 'rgba(18,18,21,1)' : 'rgba(255,255,255,1)', gridColor: dark ? 'rgba(42,42,49,0.45)' : 'rgba(9,9,11,0.06)' }, 500);
}
function chartPicker(boxId, pickId, options) {
  const pick = document.getElementById(pickId); if (!pick) return;
  const seen = new Set(); const uniq = options.filter(o => o && o.tv && !seen.has(o.tv) && seen.add(o.tv)).slice(0, 7);
  if (!uniq.length) return;
  pick.innerHTML = uniq.map((o, i) => `<button class="chip" data-tv="${esc(o.tv)}" aria-pressed="${i === 0}">${esc(o.name || o.id)}</button>`).join('');
  pick.querySelectorAll('button[data-tv]').forEach(b => b.onclick = () => { pick.querySelectorAll('button[data-tv]').forEach(x => x.setAttribute('aria-pressed', x === b)); tvChart(boxId, b.dataset.tv); });
  addFullscreen(boxId, pick);
  const box = document.getElementById(boxId), shell = box && box.parentElement;
  if (shell && !shell.querySelector(':scope > .tfrow')) {
    const bar = document.createElement('div'); bar.className = 'tfbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Timeframe');
    bar.innerHTML = TFS.map(([v, l]) => `<button type="button" data-tf="${v}" aria-pressed="${v === chartTf()}">${l}</button>`).join('') + `<button type="button" class="tf-reload" title="Reload chart" aria-label="Reload chart"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg></button>`;
    bar.querySelector('.tf-reload').onclick = () => tvChart(boxId, box.dataset.sym);
    bar.querySelectorAll('button[data-tf]').forEach(b => b.onclick = () => { store.set('chartTf', b.dataset.tf); document.querySelectorAll('.tfbar button[data-tf]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tf === b.dataset.tf)); tvChart(boxId, box.dataset.sym); });
    // The bar-close countdown sits right next to the timeframe buttons
    const row = document.createElement('div'); row.className = 'tfrow'; row.appendChild(bar);
    const oldCd = shell.querySelector(':scope > .cd'); if (oldCd) row.appendChild(oldCd);
    shell.insertBefore(row, box);
  }
  tvChart(boxId, uniq[0].tv);
}
function addFullscreen(boxId, pick) {
  const box = document.getElementById(boxId); if (!box) return;
  let shell = box.parentElement;
  if (!shell.classList.contains('chart-shell')) {
    shell = document.createElement('div'); shell.className = 'chart-shell';
    box.parentNode.insertBefore(shell, box); shell.appendChild(box);
    const x = document.createElement('button'); x.className = 'fs-exit'; x.type = 'button';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>Exit full screen';
    x.onclick = () => exitFs(shell); shell.appendChild(x);
  }
  if (!pick.querySelector('.fs-btn')) {
    const b = document.createElement('button'); b.className = 'chip fs-btn'; b.type = 'button';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>Full screen';
    b.onclick = () => { shell.classList.add('fs'); document.body.classList.add('fs-open'); if (shell.requestFullscreen) shell.requestFullscreen().catch(() => {}); };
    pick.appendChild(b);
  }
}
function exitFs(shell) {
  shell = shell || document.querySelector('.chart-shell.fs'); if (!shell) return;
  shell.classList.remove('fs'); document.body.classList.remove('fs-open');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitFs(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.chart-shell.fs')) exitFs(); });

// ---------- release results: the actual number the moment data comes out ----------
const results = { map: {}, loaded: false, timer: null };
const relKey = e => `${e.country}|${e.title}|${e.time}`;
function releaseFor(e) { const r = results.map[relKey(e)]; return r && r.released && r.actual ? r : null; }
function relEffects(r) {
  const mk = myMarkets().filter(m => m !== 'learning');
  const pairs = myAssets().map(a => a.id).filter(id => /^[A-Z]{6}$/.test(id));
  const out = [];
  (r.effects || []).forEach(e => {
    if (mk.length && !mk.includes(e.market)) return;
    if (e.market === 'forex' && e.ccy) {
      const mine = pairs.filter(p => p.includes(e.ccy));
      if (mine.length) { mine.forEach(p => { const flip = p.slice(3) === e.ccy; const d = e.dir === 'mixed' ? 'mixed' : flip ? (e.dir === 'up' ? 'down' : 'up') : e.dir; out.push({ ...e, label: p.slice(0, 3) + '/' + p.slice(3), dir: d }); }); return; }
    }
    if (!out.some(x => x.label === e.label)) out.push(e);
  });
  return out.slice(0, 4);
}
// Turn a release into a plain up/down call. When the rule cuts both ways, follow the market's first real move.
const REL_REACT = { futures: ['NQ', 3, 'pts'], stocks: ['NQ', 3, 'pts'], options: ['NQ', 3, 'pts'], crypto: ['BTC', 20, '$'], memes: ['BTC', 20, '$'] };
function relResolve(e, r) {
  if (e.dir === 'up' || e.dir === 'down') return { ...e, how: 'rule' };
  let ref = REL_REACT[e.market], flip = 1;
  if (!ref && e.market === 'forex') { ref = ['EUR/USD', 2, 'pips']; if (/USD|dollar/i.test(e.label)) flip = -1; }
  const s = ref && (r.since || []).find(x => x.label === ref[0]);
  if (!s || Math.abs(s.change) < ref[1]) return { ...e, dir: 'mixed', how: 'wait' };
  return { ...e, dir: s.change * flip > 0 ? 'up' : 'down', how: 'react', move: s };
}
function relMoveTxt(m) {
  const amt = Math.abs(m.change).toLocaleString('en-US', { maximumFractionDigits: m.unit === 'pts' ? 1 : 0 });
  return `${m.label} is ${m.change < 0 ? 'down' : 'up'} ${m.unit === '$' ? '$' + amt : amt + ' ' + m.unit}`;
}
function relVerdict(r) {
  const effs = relEffects(r).map(e => relResolve(e, r));
  const main = effs[0] || null;
  const name = r.name || r.title;
  const cmp = r.dir === 'up' ? 'above' : r.dir === 'down' ? 'below' : 'right at';
  const what = r.forecast ? `${name} came in at ${r.actual}, ${cmp} the ${r.forecast} expected${r.label && r.dir !== 'inline' ? `: ${r.label.toLowerCase()}` : ''}.` : `${name} came in at ${r.actual}.`;
  let head = 'No clear call', cls = '', why = [what];
  if (r.dir === 'inline') { why.push('Close to what markets expected, so the move usually fades fast.'); return { head: 'Little reaction expected', cls, why: why.join(' '), effs, main }; }
  if (main && (main.dir === 'up' || main.dir === 'down')) {
    head = `${main.market === 'futures' ? 'NQ & ES' : main.label} ${main.dir === 'up' ? '↑ likely up' : '↓ likely down'}`; cls = main.dir;
    if (main.how === 'rule') { if (r.text) why.push(r.text); if (main.reason) why.push(main.reason); if (main.record) why.push(main.record); }
    else if (main.paused) { why.push(main.reason); why.push(`So far, ${relMoveTxt(main.move)} since the release.`); }
    else { const rs = (main.reason || '').replace(/\s*Watch the first reaction\.?/i, '').replace(/\.$/, ''); why.push(`On paper this cuts both ways: ${rs.charAt(0).toLowerCase() + rs.slice(1)}.`); why.push(`When it's a toss-up, the first real move usually decides it, and ${relMoveTxt(main.move)} since the release.`); }
  } else if (main) {
    head = `${main.market === 'futures' ? 'NQ & ES' : main.label}: waiting for the first move`;
    why.push((main.reason || '').replace(/\s*Watch the first reaction\.?/i, ''), main.paused ? 'It will call it as soon as the market picks a side, usually within a minute or two.' : 'The site will call it up or down as soon as the market picks a side, usually within a minute or two.');
  }
  return { head, cls, why: why.filter(Boolean).join(' '), effs, main };
}
const relCallPill = e => `<span class="pill ${e.paused && e.how !== 'react' ? 'paused' : e.dir === 'up' ? 'up' : e.dir === 'down' ? 'down' : ''}"><b>${esc(e.label)}</b> ${e.paused && e.how !== 'react' ? '⏸ Call paused' : e.dir === 'up' ? '↑ Likely up' : e.dir === 'down' ? '↓ Likely down' : '… Waiting for the first move'}</span>`;
function releasedHTML() {
  const now = Date.now(), gone = store.get('relDismissed', []);
  const list = Object.values(results.map).filter(r => r.released && r.actual && now - r.time < 90 * 60e3 && !gone.includes(r.key) && r.impact !== 'Low' && (r.impact === 'High' || forYouEvent(r))).sort((a, b) => b.time - a.time).slice(0, 3);
  if (!list.length) return '';
  return list.map(r => {
    const v = relVerdict(r), rest = v.effs.slice(1);
    const cls = r.ccyDir === 'good' ? 'up' : r.ccyDir === 'bad' ? 'down' : '';
    return `<article class="rel" data-key="${esc(r.key)}">
      <button class="x rel-x" aria-label="Hide this result">×</button>
      <p class="rel-top"><span class="rel-live"></span>Just released · ${fmtTime(r.time)} ${tzAbbr(r.time)} · ${esc(r.country)}</p>
      <h2 class="rel-h">${esc(r.name || r.title)}</h2>
      <p class="rel-call ${v.cls}">${esc(v.head)}</p>
      <div class="rel-nums"><div><small>Actual</small><b class="${cls}">${esc(r.actual)}</b></div>${r.forecast ? `<div><small>Forecast</small><b>${esc(r.forecast)}</b></div>` : ''}${r.previous ? `<div><small>Previous</small><b>${esc(r.previous)}</b></div>` : ''}</div>
      <p class="rel-text"><b>Why:</b> ${esc(v.why)}</p>
      ${rest.length ? `<div class="rel-effs">${rest.map(e => `<div class="beff">${relCallPill(e)}<span class="br">${esc(e.how === 'react' ? `Following the first move after the release.` : e.reason || '')}</span></div>`).join('')}</div>` : ''}
      ${(r.since || []).length ? `<p class="rel-since"><span>Since the release:</span> ${r.since.map(x => reactTxt(x).replace(' since</span>', '</span>')).join(' · ')}</p>` : ''}
    </article>`;
  }).join('');
}
function renderReleased() {
  const el = $('#released'); if (!el) return;
  const html = releasedHTML();
  el.innerHTML = html; el.hidden = !html;
  el.querySelectorAll('.rel-x').forEach(b => b.onclick = () => { const k = b.closest('.rel').dataset.key; store.set('relDismissed', [...store.get('relDismissed', []), k].slice(-40)); renderReleased(); });
}
async function pollResults() {
  clearTimeout(results.timer);
  let fast = false;
  try {
    if (document.visibilityState === 'visible' || !results.loaded) {
      const r = await fetch('/api/data?fn=results', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json(); let changed = false;
        (j.events || []).forEach(ev => {
          const prev = results.map[ev.key];
          if (ev.released && ev.actual && !(prev && prev.released && prev.actual)) {
            changed = true;
            if (results.loaded && me.alerts.results !== false && Date.now() - ev.time < 20 * 60e3 && ev.impact !== 'Low' && (ev.impact === 'High' || forYouEvent(ev))) {
              const effs = relEffects(ev).filter(e => e.dir !== 'mixed').map(e => `${e.label} likely ${e.dir}`).join(', ');
              notify('rel:' + ev.key, `${ev.name || ev.title}: ${ev.actual}${ev.forecast ? ` vs ${ev.forecast} forecast` : ''}`, [ev.label, effs].filter(Boolean).join('. ') + '.');
            }
          }
          results.map[ev.key] = ev;
        });
        const now = Date.now();
        fast = (j.events || []).some(ev => !ev.actual && ev.time - now < 60e3 && now - ev.time < 30 * 60e3);
        if (LS.room) { renderRoom(); if (!(results.map[LS.room.key] || {}).actual && LS.room.ev.time - now < 5 * 60e3) fast = 'room'; }
        results.loaded = true;
        renderReleased();
        if (changed && started && ['today', 'calendar', 'futures', 'forex'].includes(shownPage)) route(true);
      }
    }
  } catch {}
  results.timer = setTimeout(pollResults, fast === 'room' ? 2500 : fast ? 5000 : 60000);
}

// ---------- shared pieces ----------
function withRefs(text, refs) {
  return esc(text).replace(/\[(\d+)\]/g, (m, n) => { const r = refs[+n - 1]; return r ? `<a class="ref" href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(r.title)}, ${esc(r.source)}">${n}</a>` : ''; });
}
function reactTxt(r) {
  if (!r) return '';
  const sign = r.change > 0 ? '+' : r.change < 0 ? '−' : '';
  const amt = Math.abs(r.change).toLocaleString('en-US', { maximumFractionDigits: r.unit === 'pts' ? 1 : 0 });
  const val = r.unit === '$' ? `${sign}$${amt}` : `${sign}${amt} ${r.unit}`;
  return `<span class="react ${r.change > 0 ? 'up' : r.change < 0 ? 'down' : ''}" title="Price when the story broke ${r.from}, now ${r.now}">${esc(r.label)} ${val} since</span>`;
}
const SECTION_NAMES = { economy: 'Economy', centralbanks: 'Central banks', world: 'World and politics', companies: 'Companies', tech: 'Tech and AI', commodities: 'Energy and commodities', currencies: 'Currencies', crypto: 'Crypto', markets: 'Markets' };
const rankStories = items => [...items].sort((a, b) => relevance(b) - relevance(a));
// note: 'all' shows every relevant note, a number caps how many notes one list shows, 0 shows none
function storyList(items, opts = {}) {
  let left = opts.notes === 'all' ? Infinity : opts.notes ?? 3;
  const seenWhy = new Set();
  return items.map(i => { const st = forYouStrength(i); const show = st >= 1 && left > 0; if (show) left--; const dup = i.why && seenWhy.has(i.why); if (i.why) seenWhy.add(i.why); return storyItem(dup ? { ...i, why: null } : i, { ...opts, fy: show, mark: st >= (opts.markAt || 1) }); }).join('');
}
function storyItem(i, { why = true, explain = false, fy: showFy = true, mark = null } = {}) {
  const fy = showFy ? forYouHeadline(i) : null;
  const isMine = mark ?? !!fy;
  const showWhy = why && i.why && (depth() !== 'quick' || !fy);
  return `<li class="${isMine ? 'mine' : ''}" data-id="${esc(i.id)}">
    <a class="t" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
    ${showWhy ? `<div class="why">${esc(i.why)}</div>` : ''}
    ${fy ? `<div class="fy"><b>For you</b>${esc(fy)}</div>` : ''}
    <div class="meta">${i.breaking ? '<span class="brk">Breaking</span>' : ''}<span class="imp ${esc(i.impact || 'low')}">${i.impact === 'high' ? 'Big story' : i.impact === 'medium' ? 'Notable' : 'Minor'}</span><span>${esc(SECTION_NAMES[i.section] || i.themeLabel || '')}</span><span>${esc(i.source)}${(i.outlets || i.count) > 1 ? ` and ${(i.outlets || i.count) - 1} more` : i.impact === 'high' && i.confirmed === false ? ' only <span class="unconf" title="Only one outlet has this so far">not yet confirmed</span>' : ''}</span><span>${ago(i.time)}</span>${reactTxt(i.reaction)}
      ${explain ? `<button class="linkbtn wi-x" data-x="${esc(i.id)}" aria-expanded="false">Explain this</button>` : ''}${rhymeBtn(i)}</div>
    ${explain ? `<div class="wi-explain" id="x-${esc(i.id)}" hidden></div>` : ''}${rhymeBox(i)}</li>`;
}
function eventRow(e, mini = false, showFy = true) {
  const past = e.time < Date.now() - 5 * 60e3, soon = !past && e.time - Date.now() < 60 * 60e3;
  const rel = releaseFor(e);
  const fp = [rel ? `Actual ${rel.actual}` : '', e.forecast && `Expected ${e.forecast}`, e.previous && `Last ${e.previous.split('|')[0]}`].filter(Boolean).join(', ');
  const fy = showFy ? forYouEvent(e) : null;
  const deep = depth() !== 'quick';
  const body = [(isBeginner() || depth() === 'deep') && e.what ? `<p>${esc(e.what)}</p>` : '', `<p>${esc(e.why)}</p>`, e.note && deep ? `<p class="note">${esc(e.note)}</p>` : '', mini && fp ? `<p class="small">${esc(fp)}</p>` : ''].join('');
  return `<details class="ev${past ? ' past' : ''}${soon ? ' soon' : ''}${mini ? ' mini' : ''}"><summary>
      <span class="t">${e.allDay ? 'All day' : fmtTime(e.time)}</span><span class="dot ${e.impact}" title="${e.impact} impact"></span>
      ${mini ? '' : `<span class="cc">${esc(e.country)}</span>`}
      <span class="nm">${esc(e.name)}<small>${mini ? esc(e.country) + (e.name !== e.title ? ', ' + esc(e.title) : '') : (e.name !== e.title ? esc(e.title) : '')}</small></span>
      ${mini ? (rel ? `<span class="act ${rel.dir || ''}">${esc(rel.actual)}</span>` : '') : `<span class="fp">${rel ? `<b class="act ${rel.dir || ''}">${esc(rel.actual)}</b> ` : ''}${esc(fp.replace(/^Actual [^,]*, ?/, ''))}</span>`}
      ${fy ? `<span class="fy"><b>For you</b>${esc(fy)}</span>` : ''}</summary>
    <div class="body">${body}</div></details>`;
}
function qcell(r, label) { return `<div class="qcell"><span><b>${esc(label || r.label || r.short)}</b>${r.name && label ? `<small>${esc(r.name)}</small>` : ''}</span><span class="r">${r.unit === '%' ? num(r.price, 2) + '%' : num(r.price, r.dp)}<br>${chg(r.pct ?? r.changePct)}</span></div>`; }

// ---------- "This rhymes with…": the last times a headline like this showed up, and what price did next ----------
const RHYME_OF = { futures: 'NQ', stocks: 'NQ', options: 'NQ', crypto: 'BTC', memes: 'BTC', forex: 'EURUSD' };
const rhymeMks = () => { const k = [...new Set(myMarkets().map(m => RHYME_OF[m]).filter(Boolean))]; return (k.length ? k : ['NQ']).slice(0, 2); };
const rhymeOk = i => i && i.theme && (i.impact === 'high' || i.impact === 'medium') && !i.noise;
const rhymeBtn = i => rhymeOk(i) ? `<button class="linkbtn rh-x" data-rh="${esc(i.id)}" data-h="${esc(i.title)}" aria-expanded="false">What happened last time</button>` : '';
const rhymeBox = i => rhymeOk(i) ? `<div class="rh-box" id="rh-${esc(i.id)}" hidden></div>` : '';
const RH_NAME = { NQ: 'NQ', BTC: 'Bitcoin', EURUSD: 'EUR/USD' };
function rhymeMove(v, unit) { const sign = v > 0 ? '+' : v < 0 ? '−' : ''; const a = Math.abs(v); return unit === '$' ? `${sign}$${num(a, 0)}` : unit === 'pips' ? `${sign}${num(a, 0)} pips` : `${sign}${num(a, a >= 100 ? 0 : 1)} pts`; }
function rhymeHTML(d) {
  const mk = Object.entries(d.markets || {});
  const blocks = mk.map(([k, x]) => {
    if (x.n < 4) return `<div class="rh-m"><p class="rh-h">${esc(RH_NAME[k])}</p><p class="rh-thin">${x.n ? `Only ${x.n} similar headline${x.n === 1 ? '' : 's'} so far` : 'No similar headlines saved yet'}. This fills in as the site saves more history.</p></div>`;
    const lean = x.flat * 2 >= x.n ? '' : x.down >= 3 && x.down >= x.up * 2 ? 'down' : x.up >= 3 && x.up >= x.down * 2 ? 'up' : '';
    const head = x.flat * 2 >= x.n ? `${RH_NAME[k]} barely moved ${x.flat} of ${x.n} times` : lean ? `${RH_NAME[k]} ${lean === 'down' ? 'fell' : 'rose'} ${lean === 'down' ? x.down : x.up} of ${x.n} times` : `${RH_NAME[k]} went both ways: up ${x.up}, down ${x.down} of ${x.n}`;
    return `<div class="rh-m"><p class="rh-h ${lean}">${esc(head)} <span>in the next hour</span></p>
      <p class="rh-sub">Typical move ${esc(rhymeMove(x.median, x.unit))}${x.flat ? ` · ${x.flat} barely moved` : ''}</p>
      <ul class="rh-list">${x.examples.map(e => `<li><span class="rh-d">${new Date(e.time).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}</span><span class="rh-t">${esc(e.headline)} <small>${esc(e.source || '')}</small></span><span class="rh-v ${e.way === 'up' ? 'up' : e.way === 'down' ? 'down' : ''}">${esc(rhymeMove(e.move, x.unit))}</span></li>`).join('')}</ul></div>`;
  }).join('');
  return `<p class="hist-cap">This rhymes with…</p>${blocks}<p class="rh-foot">Past headlines on the same topic${d.theme ? ` (${esc(d.theme)})` : ''} read the same way, from the last ${d.days} days. What happened before, not a promise. Small samples can mislead.</p>`;
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('.rh-x'); if (!b) return;
  ev.preventDefault();
  const box = document.getElementById('rh-' + b.dataset.rh); if (!box) return;
  if (!box.hidden) { box.hidden = true; b.textContent = 'What happened last time'; b.setAttribute('aria-expanded', 'false'); return; }
  box.hidden = false; b.textContent = 'Hide'; b.setAttribute('aria-expanded', 'true');
  box.innerHTML = skel(2);
  api('rhyme?' + new URLSearchParams({ id: b.dataset.rh, h: b.dataset.h, mk: rhymeMks().join(',') }).toString(), 15 * 60e3).then(d => { box.innerHTML = rhymeHTML(d); }).catch(e => { box.innerHTML = errBox('past headlines', e.message); });
});

// Explain-this panels (written by AI when available)
const explainOpen = new Set();
function explainURL(i) {
  const r = i.reaction ? `${i.reaction.label} ${i.reaction.change > 0 ? '+' : ''}${i.reaction.change} ${i.reaction.unit} since it broke` : '';
  return 'explain?' + new URLSearchParams({ title: i.title, summary: (i.summary || '').slice(0, 400), source: i.source || '', reaction: r }).toString() + '&' + profileQuery();
}
function bindExplain(root, items) {
  root.querySelectorAll('.wi-x').forEach(b => b.onclick = () => {
    const id = b.dataset.x, item = items.find(x => x.id === id), box = root.querySelector('#x-' + CSS.escape(id));
    if (!item || !box) return;
    if (explainOpen.has(id)) { explainOpen.delete(id); box.hidden = true; b.textContent = 'Explain this'; b.setAttribute('aria-expanded', 'false'); return; }
    explainOpen.add(id); box.hidden = false; b.textContent = 'Hide explanation'; b.setAttribute('aria-expanded', 'true');
    box.innerHTML = skel(2);
    api(explainURL(item), 864e5).then(x => {
      box.innerHTML = `<dl class="xp"><dt>What happened</dt><dd>${esc(x.what)}</dd><dt>Why markets care</dt><dd>${esc(x.why)}</dd><dt>How markets reacted</dt><dd>${esc(x.reaction)}</dd>${x.for_you ? `<dt>For you</dt><dd><mark>${esc(x.for_you)}</mark></dd>` : ''}</dl><p class="aifoot">Source: ${esc(item.source || 'unknown')}${x.source === 'ai' ? ' · Summary written by AI, fact-checked against the headline' : ''} · ${reportBtn(item.title, item.link, 'news')}</p>`;
    }).catch(e => { box.innerHTML = errBox('the explanation', e.message); });
  });
}

// ---------- personal prices ----------
async function personalData() {
  const mk = myMarkets(), as = myAssets();
  const jobs = { world: api('world', 120e3), cal: api('calendar', 10 * 60e3) };
  if (as.some(a => a.lv === 'fut') || levelTrader()) jobs.fut = api('markets?section=futures');
  if (as.some(a => a.lv === 'fx' || (a.ccy && !a.ysym))) jobs.fx = api('markets?section=forex');
  if (mk.includes('crypto') || as.some(a => a.lv === 'btc')) jobs.crypto = api('crypto');
  if (as.some(a => a.em)) jobs.opt = api('markets?section=options');
  if (mk.includes('memes')) jobs.memes = api('memes');
  if (as.some(a => a.sector)) jobs.movers = api('movers', 2 * 60e3);
  const keys = Object.keys(jobs), res = await Promise.allSettled(keys.map(k => jobs[k]));
  const out = {}; keys.forEach((k, i) => { out[k] = res[i].status === 'fulfilled' ? res[i].value : null; });
  return out;
}
function assetView(a, D) {
  const rows = D.world ? D.world.groups.flatMap(g => g.rows) : [];
  const find = (arr, s) => (arr || []).find(x => x.short === s);
  if (a.lv === 'fut' && D.fut) { const L = find(D.fut.leaders, a.short); if (L) return { a, price: L.price, dp: L.dp, pct: L.changePct, L, adr: L.levels && L.levels.adr }; }
  if (a.lv === 'fx' && D.fx) { const L = find(D.fx.leaders, a.short); if (L) return { a, price: L.price, dp: L.dp, pct: L.changePct, L, adr: L.levels && L.levels.adr }; }
  if (a.lv === 'btc' && D.crypto && D.crypto.btc) { const b = D.crypto.btc; return { a, price: b.price, dp: 0, pct: b.changePct, money: true, L: { ...b, name: 'Bitcoin', dp: 0 }, adr: b.levels && b.levels.adr }; }
  if (a.em && D.opt) { const e = (D.opt.expectedMove || []).find(x => x.short === a.em); if (e) { const r = rows.find(x => x.sym === a.ysym); return { a, price: e.price, dp: 0, pct: r ? r.pct : null, note: `Options price in a move of about ±${num(e.move, 0)} points today.` }; } }
  if (a.ysym) { const r = rows.find(x => x.sym === a.ysym); if (r) return { a, price: r.price, dp: r.dp, pct: r.pct, unit: r.unit, money: /BTC|ETH|SOL/.test(a.id) }; }
  if (a.ccy && D.fx) { const q = find(D.fx.quotes, a.short); if (q) return { a, price: q.price, dp: q.dp, pct: q.changePct }; }
  if (a.sector && D.movers) { const s = D.movers.sectors.find(x => x.sym === a.sector); if (s) return { a, price: null, pct: s.pct, sectorName: s.name }; }
  if (D.crypto && a.short) { const c = D.crypto.coins.find(x => x.symbol === a.short); if (c) return { a, price: c.price, dp: c.price > 100 ? 0 : c.price > 1 ? 2 : 4, pct: c.ch24, money: true }; }
  if (a.chain !== undefined && D.memes) { const hot = D.memes.hot.filter(t => !a.chain || t.chain === a.chain); return { a, meme: true, count: hot.length, top: hot.slice(0, 2) }; }
  return null;
}
const shortName = a => a.short && !/^(NQ|ES|Oil|Gold|10Y)$/.test(a.short) ? a.short : a.id === 'index' ? 'Index funds' : a.chain !== undefined ? a.label.replace(' memecoins', '') : a.id.length <= 6 ? a.id : a.label.split(' (')[0];

// ================= pages =================
const PAGES = {};
let refreshing = false, shownPage = null, started = false;
function layout(html) { if (refreshing && main.dataset.page === shownPage && main.innerHTML) return false; main.innerHTML = html; return true; }

// ---------- Today: the front page ----------
function leadHTML(d) {
  const effects = s => s.effects && s.effects.length ? `<p class="effects"><span class="lbl">Likely to move</span>${s.effects.map(e => `<span class="eff ${esc(e.dir)}">${esc(e.market)} ${e.dir === 'up' ? '↑' : e.dir === 'down' ? '↓' : '↕'}</span>`).join('')}</p>` : '';
  const used = [...new Set([...(d.stories || []).map(s => s.ref), ...((d.summary || '') + JSON.stringify(d.forYou || [])).match(/\[(\d+)\]/g)?.map(x => +x.slice(1, -1)) || []])].filter(n => d.refs[n - 1]).sort((a, b) => a - b);
  return `<p class="kicker"><span class="live" aria-hidden="true"></span>The main story · Updated ${fmtTime(d.updated)}${d.source === 'ai' ? ' · Written by AI from live prices and news' : ''}</p>
    <h1 class="lead-h">${esc(d.headline)}</h1>
    <p class="lead-sum">${withRefs(d.summary || '', d.refs)}</p>
    <ol class="stories">${(d.stories || []).map(s => { const r = d.refs[s.ref - 1] || {}; return `<li>
      <h3><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(s.headline)}</a></h3>
      ${s.why ? `<p>${esc(s.why)}</p>` : ''}${effects(s)}
      <p class="src">${esc(r.source || '')}${r.time ? ', ' + ago(r.time) : ''}${s.since ? ' ' + reactTxt(s.since) : ''}</p></li>`; }).join('')}</ol>
    ${(d.across || []).length ? `<dl class="across">${d.across.map(a => `<div><dt>${esc(a.area)}</dt><dd>${withRefs(a.text, d.refs)}</dd></div>`).join('')}</dl>` : ''}
    ${used.length ? `<details class="sources"><summary>Sources (${used.length})</summary><ol>${used.map(n => { const r = d.refs[n - 1]; return `<li value="${n}"><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a> <span class="faint">${esc(r.source)}, ${ago(r.time)}</span></li>`; }).join('')}</ol></details>` : ''}`;
}
function guideHTML() {
  if (store.get('guideDone', false)) return '';
  return `<section class="guide" id="guide"><button class="x" id="guideX" aria-label="Hide this guide">×</button>
    <div class="guide-t"><h2>How to use The Open One</h2>
    <p>What’s happening in the world, and what it will likely do to the market you trade.</p></div>
    <ol>
      <li><b>Read the briefing</b>The 3 stories that matter most for your markets.</li>
      <li><b>Watch the chart</b>Your market, live, right next to the news.</li>
      <li><b>See what’s next</b>What’s likely to happen, and a game plan for your strategy.</li>
      <li><b>Go deeper</b>Blue-dot tabs are your markets. Stuck on a word? <a href="/glossary">Glossary</a>.</li>
    </ol></section>`;
}
// Where a story came from, and whether more than one outlet has it
function srcLine(b) {
  const list = (b.sources && b.sources.length ? b.sources : [b.source]).filter(Boolean);
  if (list.length > 1) return `<span title="${esc(list.join(', '))}">${esc(list[0])} and ${list.length - 1} more</span>`;
  return `${esc(list[0] || '')}${b.confirmed === false ? ' <span class="unconf" title="Only one outlet has this so far. Calls on it count half in the overall summary.">Reported by one outlet so far</span>' : ''}`;
}
// ---------- report a mistake ----------
function reportBtn(headline, link, page) { return `<button class="linkbtn rep" type="button" data-rep="${esc(page)}" data-h="${esc(String(headline || '').slice(0, 300))}" data-l="${esc(String(link || '').slice(0, 1000))}">Report a mistake</button>`; }
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-rep]'); if (!b) return;
  const host = b.parentElement; if (host.querySelector('.repform')) { host.querySelector('.repform').remove(); return; }
  const f = document.createElement('form'); f.className = 'repform';
  f.innerHTML = `<label class="sr" for="rp-${host.dataset.k || ''}">What’s wrong?</label><textarea rows="2" maxlength="1000" placeholder="What’s wrong? For example: the price is off, the story is old, or the call makes no sense." required></textarea><div class="repbar"><button class="btn-primary sm" type="submit">Send</button><button class="linkbtn" type="button" data-cancel>Cancel</button><span class="repmsg" aria-live="polite"></span></div>`;
  host.appendChild(f); f.querySelector('textarea').focus();
  f.querySelector('[data-cancel]').onclick = () => f.remove();
  f.onsubmit = async ev => {
    ev.preventDefault();
    const msg = f.querySelector('.repmsg'), text = f.querySelector('textarea').value.trim();
    if (text.length < 3) { msg.textContent = 'Add a few words about what’s wrong.'; return; }
    f.querySelector('[type=submit]').disabled = true; msg.textContent = 'Sending…';
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/open_reports`, { method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ headline: b.dataset.h, link: b.dataset.l, page: b.dataset.rep, problem: text }) });
      if (!r.ok) throw new Error(r.status);
      f.innerHTML = '<p class="repok">Thanks. We’ll check it and fix it.</p>'; setTimeout(() => f.remove(), 4000);
    } catch { msg.textContent = 'Couldn’t send right now. Try again in a minute.'; f.querySelector('[type=submit]').disabled = false; }
  };
});
function whenShort(t) {
  const d = new Date(t), today = d.toLocaleDateString('en-US', { timeZone: TZ }) === new Date().toLocaleDateString('en-US', { timeZone: TZ });
  return `${today ? 'Today' : d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })} ${fmtTime(t)} ${tzAbbr(t)}`;
}
function whenPill(w) {
  if (w.kind === 'now') return `Now: within ~10 min`;
  if (w.kind === 'priced') return 'Already reacted';
  return whenShort(w.time);
}
function whenWhy(w, b) {
  const slot = w.step === 60 ? 'hour' : 'half hour';
  const mkt = (w.market || '').split(' (')[0].replace('Nasdaq futures', 'NQ') || 'Price';
  const size = w.typical ? ` ${mkt} usually moves about ${unitTxt(w.typical, w.unit)} in that ${slot}${w.rank === 1 ? ', the busiest of the day' : w.rank && w.rank <= 3 ? ', one of the busiest of the day' : ''}.` : '';
  const broke = b && b.time ? ` It broke at ${fmtTime(b.time)} ${tzAbbr(b.time)}.` : '';
  if (w.kind === 'now') return `Futures are trading, so fresh news like this usually hits price within 5–15 minutes.${broke} Watch the next few candles.`;
  if (w.kind === 'priced') return `Price usually reacts within minutes of a headline, so the first move has most likely happened. Check “Already moved” below.`;
  if (w.kind === 'reopen') return `The market is closed right now, so this hits price ${w.label}, often as a gap at the open.`;
  return `Most likely to hit price at ${w.label}.${size}`;
}
function testWhen(t) {
  const d = new Date(t), same = d.toLocaleDateString('en-US', { timeZone: TZ }) === new Date().toLocaleDateString('en-US', { timeZone: TZ });
  return `${same ? 'today' : d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' })} ${fmtTime(t)} ${tzAbbr(t)}`;
}
// ---------- when price usually moves ----------
const TIMING_KEY = { futures: 'NQ', stocks: 'NQ', options: 'NQ', forex: 'EURUSD', crypto: 'BTC', memes: 'BTC' };
const TIMING_NAME = { NQ: 'NQ', ES: 'ES', EURUSD: 'EUR/USD', BTC: 'Bitcoin' };
function timingKeys() {
  const ks = [...new Set(myMarkets().map(m => TIMING_KEY[m]).filter(Boolean))];
  if (ks.includes('NQ') && myAssets().some(a => a.id === 'ES') && !myAssets().some(a => a.id === 'NQ')) ks[ks.indexOf('NQ')] = 'ES';
  return ks.length ? ks : ['NQ'];
}
function unitTxt(v, u) { return u === '$' ? '$' + num(v, 0) : num(v, 0) + (u === 'pips' ? ' pips' : ' pts'); }
function timingHTML(d) {
  const sl = d.slots.filter(x => x.typical != null);
  if (!sl.length) return '<p class="empty">Not enough price history yet.</p>';
  const mx = Math.max(...sl.map(x => x.typical)), now = Date.now();
  const span = t => `${fmtTime(t).replace(/ [AP]M$/, '')}–${fmtTime(t + d.step * 6e4)}`;
  const best = d.best.map(x => span(x.time));
  const evs = d.slots.flatMap(x => x.events.map(e => ({ ...e, slot: x })));
  const big = evs.filter(e => e.impact === 'High');
  const dayName = new Date(d.slots[0].time).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
  const lead = `<p class="tm-lead">${esc(TIMING_NAME[d.key] || d.name)} usually moves most <b>${best.slice(0, 2).join('</b> and <b>')}</b>${best[2] ? ` and <b>${best[2]}</b>` : ''} ${tzAbbr()}.${big.length ? ` ${dayName} also has <b>${big.map(e => `${esc(e.name)} at ${fmtTime(e.time)}`).join('</b> and <b>')}</b>, which can be bigger than any normal half hour.` : evs.length ? ` ${dayName}’s scheduled releases: ${evs.slice(0, 3).map(e => `${esc(e.name)} at ${fmtTime(e.time)}`).join(', ')}.` : ` No big scheduled releases ${dayName}.`}</p>`;
  const hourMark = (x, i) => new Date(x.time).getUTCMinutes() === 0 && i % (d.step === 60 ? 3 : 2) === 0;
  const bars = d.slots.map((x, i) => {
    const h = x.typical ? Math.max(6, x.typical / mx * 100) : 2, live = now >= x.time && now < x.time + d.step * 6e4, past = now >= x.time + d.step * 6e4;
    const tip = `${fmtTime(x.time)}–${fmtTime(x.time + d.step * 6e4)}: usually about ${x.typical != null ? unitTxt(x.typical, d.unit) : '—'} from high to low${x.tag ? '. ' + x.tag : ''}${x.events.length ? '. Today: ' + x.events.map(e => e.name).join(', ') : ''}`;
    return `<div class="tm-col${live ? ' now' : ''}${past ? ' past' : ''}" title="${esc(tip)}"><div class="tm-ev">${x.events.length ? `<i class="${x.events.some(e => e.impact === 'High') ? 'hi' : ''}"></i>` : ''}</div><div class="tm-bar"><span class="${x.level}" style="height:${h}%"></span></div><div class="tm-t">${hourMark(x, i) ? esc(fmtTime(x.time).replace(':00', '').replace(/ ?([AP])M/, (m, a) => a.toLowerCase())) : ''}</div></div>`;
  }).join('');
  const list = [...d.best.map(x => ({ x, why: 'One of the 3 busiest windows' })), ...evs.filter(e => !d.best.includes(e.slot)).map(e => ({ x: e.slot, why: 'Scheduled release' }))]
    .sort((a, b) => a.x.time - b.x.time)
    .map(({ x, why }) => `<li><span class="tm-when">${fmtTime(x.time)}</span><span><b>${x.events.length ? esc(x.events.map(e => e.name).join(', ')) : esc(x.tag || why)}</b> · usually ${unitTxt(x.typical || 0, d.unit)} high to low</span></li>`).join('');
  return `${lead}<div class="tm-chart" role="img" aria-label="Typical move size for each ${d.step === 60 ? 'hour' : 'half hour'} of the day">${bars}</div>
    <div class="tm-key"><span><i class="big"></i>Busiest</span><span><i class="mid"></i>Normal</span><span><i class="low"></i>Quiet</span><span><i class="ev"></i>Scheduled release</span></div>
    ${list ? `<ul class="tm-list">${list}</ul>` : ''}
    <p class="tm-note">Bar height is the typical high-to-low range in that ${d.step === 60 ? 'hour' : 'half hour'} over the last ${d.days} trading days. It shows <i>when</i> price tends to move, not which way. The direction comes from the briefing above.</p>`;
}
const DIR_TXT = { up: '↑ Likely up', down: '↓ Likely down', mixed: '↕ Unclear' };
const DIR_ARROW = { up: '↑', down: '↓', mixed: '↕' }, DIR_WORD = { up: 'Likely up', down: 'Likely down', mixed: 'Unclear' };
const dirPill = (label, dir, paused) => paused ? `<span class="pill paused"><b>${esc(label)}</b> ⏸ Call paused</span>` : `<span class="pill dir"><b>${esc(label)}</b> <i class="${dir}">${DIR_ARROW[dir] || '↕'}</i> ${DIR_WORD[dir] || 'Unclear'}</span>`;
// The trading session the briefing is for: today until the 4 PM ET close, then the next weekday
const US_HOLIDAYS = new Set(['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
function sessionDay(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: MKT_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  let d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 12));
  const ok = x => x.getUTCDay() % 6 !== 0 && !US_HOLIDAYS.has(x.toISOString().slice(0, 10));
  if (!ok(d) || +p.hour >= 16) { do d = new Date(d.getTime() + 864e5); while (!ok(d)); }
  const today = new Date(Date.UTC(+p.year, +p.month - 1, +p.day, 12));
  return { isToday: d.getTime() === today.getTime(), long: d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric' }), day: d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' }) };
}
// Overall summary: add up what the stories say for each market. The top story counts most.
// "Your day": the bias for the reader's own session, and when the move most likely comes
const DAY_SESS = { futures: { from: 570, to: 690, label: 'the New York open' }, stocks: { from: 570, to: 690, label: 'the New York open' }, options: { from: 570, to: 690, label: 'the New York open' }, crypto: { from: 570, to: 960, label: 'the US session' }, memes: { from: 570, to: 960, label: 'the US session' }, forex: { from: 480, to: 720, label: 'the London–New York overlap' } };
const minsTxt = m => { const h = Math.floor(m / 60) % 24, mm = m % 60, ap = h >= 12 ? 'PM' : 'AM'; return `${(h % 12) || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${ap}`; };
function daySession(market) {
  const mine = (mySessionsC() || []).filter(x => x.from != null && x.to != null);
  if (mine.length) return { from: mine[0].from, to: mine[0].to, label: mine[0].phrase || mine[0].label.toLowerCase() };
  return DAY_SESS[market] || DAY_SESS.futures;
}
function ictWords(t, mk) {
  const c = followUps(mk || 'futures', 'ict');
  const entry = c.includes('ote') ? 'enter on the pullback into the 62–79% OTE zone' : c.includes('ob') && !c.includes('fvg') ? 'an order block to enter on the pullback' : 'a fair value gap to enter on the pullback';
  return t.replace('and a fair value gap to enter on the pullback', c.includes('ote') ? 'then ' + entry : 'and ' + entry);
}
function dayPlanHTML(plans) {
  if (!plans || !plans.length) return '';
  const arrow = { up: '↑', down: '↓', range: '↔' };
  setTimeout(fillDayWhen, 0);
  return `<li class="dayplan">${plans.map(p => { const ss = daySession(p.market);
    return `<div class="dp ${p.call}">
    <div class="dp-top"><span class="dp-mk">${esc(p.short)} · ${esc(ss.label)}, ${minsTxt(ss.from)}–${minsTxt(ss.to)} ET</span><span class="pill ${p.call === 'up' ? 'up' : p.call === 'down' ? 'down' : ''}">${esc(p.conf)} confidence</span></div>
    <p class="dp-h"><i>${arrow[p.call]}</i>${esc(p.head)}${p.call !== 'range' ? `<span class="dp-sub">for your session</span>` : ''}</p>
    <div class="dp-when" data-tk="${esc(p.timing || 'NQ')}" data-from="${ss.from}" data-to="${ss.to}" data-call="${p.call}" data-ict="${p.plans.some(x => x.strategy === 'ict') ? 1 : 0}" data-mk="${esc(p.market)}"><span class="dp-k">Most likely move</span><span class="dp-wt">${p.event ? `${esc(p.event.time)}, when ${esc(p.event.name)} comes out` : 'Working it out…'}</span></div>
    <ul class="dp-why">${p.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    ${p.plans.map(pl => `<div class="dp-plan"><p class="dp-k">Your plan · ${esc(pl.name)}</p><ol>${pl.steps.map(x => `<li>${esc(pl.strategy === 'ict' ? ictWords(x, p.market) : x)}</li>`).join('')}</ol></div>`).join('')}
    ${p.flip ? `<p class="dp-flip">${esc(p.flip)}</p>` : ''}
    ${p.capped ? `<p class="pl-cap">${esc(p.capped)} <a href="/scorecard">Scorecard</a></p>` : ''}
  </div>`; }).join('')}<p class="dp-note">From today’s news, price and the Live read, for the session you trade. A lean, not a promise, and not financial advice.</p></li>`;
}
// The reader's whole session, half hour by half hour: how much it usually moves and what to expect in each stretch
// Wording follows the ICT concepts the trader picked in setup (no Silver Bullet talk unless they use it)
function ictPhase(ph, call, mk) {
  const c = followUps(mk || 'futures', 'ict'), dir = call === 'up' ? ' up' : call === 'down' ? ' down' : '';
  const run = call === 'up' ? 'a quick run below to grab sell-side liquidity' : call === 'down' ? 'a quick run above to grab buy-side liquidity' : 'one side’s liquidity gets taken';
  const kz = c.includes('killzones') ? 'New York AM killzone · ' : '';
  if (ph[0] === 570) return kz + (c.includes('judas') ? `Judas swing: ${run}` : c.includes('po3') ? `Manipulation: ${run}` : `Opening run: ${run}`);
  if (ph[0] === 600) return kz + (c.includes('sb') ? `Silver Bullet (10–11 AM): the real move${dir} usually comes here` : c.includes('po3') ? `Distribution: the real move${dir}` : `The real move${dir} usually develops here`);
  return ph[2];
}
const ICT_PHASE = [[570, 600, ''], [600, 660, ''], [660, 720, 'Moves slow down into lunch'], [480, 510, 'Before the data: often a fake move'], [510, 540, 'Data reaction'], [540, 570, 'Pre-open positioning'], [720, 810, 'Lunch: usually quiet'], [810, 870, 'Afternoon session starts'], [870, 960, 'Into the close'], [120, 180, 'London open: Asia’s range often gets run'], [180, 300, 'London move']];
function fillDayWhen() {
  document.querySelectorAll('.dp-when[data-tk]:not([data-done])').forEach(el => {
    el.dataset.done = '1';
    const from = +el.dataset.from, to = +el.dataset.to, call = el.dataset.call, ict = el.dataset.ict === '1';
    api('timing?m=' + el.dataset.tk, 15 * 60e3).then(t => {
      const inS = (t.slots || []).filter(x => x.start >= from && x.start < to);
      if (!inS.length) return;
      const evSlot = inS.find(x => (x.events || []).some(e => e.impact === 'High'));
      const best = evSlot || inS.filter(x => x.typical).sort((a, b) => b.typical - a.typical)[0];
      const mx = Math.max(1, ...inS.map(x => x.typical || 0));
      const unit = t.unit === '$' ? '$' : '', u2 = t.unit === '$' ? '' : ' ' + t.unit;
      const dirWord = call === 'up' ? 'the push up' : call === 'down' ? 'the drop' : 'the move';
      const ranked = inS.filter(x => x.typical).sort((a, b) => b.typical - a.typical);
      const label = x => {
        const e = (x.events || []).find(y => y.impact === 'High');
        if (e) return `${e.name} at ${fmtTime(e.time)}: expect ${dirWord} right after it`;
        let ph = ict && ICT_PHASE.find(([a, b]) => x.start >= a && x.start < b);
        if (ph) ph = [ph[0], ph[1], ictPhase(ph, call, el.dataset.mk)];
        if (x === best) return `Most likely time for ${dirWord}${ph ? ` · ${ph[2]}` : ''}`;
        if (ph) return ph[2];
        const r = ranked.indexOf(x);
        return r <= 1 ? 'Still busy: follow-through or a pullback' : x.typical >= mx * 0.6 ? 'Moving, but less than the open' : 'Usually quiet';
      };
      el.innerHTML = `<span class="dp-k">When to expect it · your session</span>
        <ol class="dp-tl">${inS.map(x => `<li class="${x === best ? 'best' : ''}"><span class="dp-tt">${minsTxt(x.start)}–${minsTxt(x.end)}</span><span class="dp-bar"><i style="width:${Math.round((x.typical || 0) / mx * 100)}%"></i></span><span class="dp-sz">${x.typical ? `~${unit}${num(x.typical, 0)}${u2}` : ''}</span><span class="dp-tx">${esc(label(x))}</span></li>`).join('')}</ol>
        <span class="dp-tfoot">Typical size of each half hour over the last month. Times are New York time.</span>`;
    }).catch(() => { const wt = el.querySelector('.dp-wt'); if (wt) wt.textContent = `The first hour of your session, ${minsTxt(from)}–${minsTxt(from + 60)} ET, is usually the most active.`; });
  });
}
function bottomLine(list, hasPlan = false) {
  const m = {};
  list.forEach((b, i) => {
    const w = ([3, 2, 1][i] || 1) * (b.confirmed === false ? 0.5 : 1), seen = new Set();
    (b.effects || []).forEach(e => {
      const k = e.label; if (!k || seen.has(k)) return; seen.add(k);
      const x = m[k] = m[k] || { label: k, score: 0, w: 0, up: 0, down: 0, mixed: 0 };
      x.w += w; x.score += e.dir === 'up' ? w : e.dir === 'down' ? -w : 0; x[e.dir === 'up' ? 'up' : e.dir === 'down' ? 'down' : 'mixed']++;
    });
  });
  const rows = Object.values(m).sort((a, b) => b.w - a.w).slice(0, 4);
  if (!rows.length) return '';
  // With the Your day call above, this box only says what the headlines alone point to (the main call uses news AND price)
  const call = x => { const r = x.score / x.w; return hasPlan ? (r >= 0.2 ? ['up', '↗ Headlines lean up'] : r <= -0.2 ? ['down', '↘ Headlines lean down'] : ['', '↕ Headlines are mixed']) : r >= 0.5 ? ['up', '↑ Most likely up'] : r >= 0.2 ? ['up', '↗ Leaning up'] : r <= -0.5 ? ['down', '↓ Most likely down'] : r <= -0.2 ? ['down', '↘ Leaning down'] : ['', '↕ No clear direction']; };
  const count = x => [x.up && `${x.up} up`, x.down && `${x.down} down`, x.mixed && `${x.mixed} unclear`].filter(Boolean).join(' · ');
  return `<li class="bsum"><p class="bsum-h">${hasPlan ? 'What the headlines say' : 'Overall summary'}</p>${rows.map(x => { const [c, t] = call(x); return `<div class="bsum-r"><span class="pill dir"><b>${esc(x.label)}</b> <i class="${c}">${t.slice(0, 1)}</i> ${t.slice(2)}</span><span class="br">${count(x)} across the ${list.length > 1 ? list.length + ' stories' : 'story'} for ${esc(sessionDay().day)}’s session</span></div>`; }).join('')}${(() => { const ws = list.map(b => b.when).filter(w => w && w.kind !== 'priced').sort((a, b) => a.time - b.time); if (!ws.length) return ''; const w = ws[0]; const txt = w.kind === 'now' ? 'Fresh news is out while futures are trading, so expect the reaction in the next few minutes.' : w.kind === 'reopen' ? `Markets are closed, so these stories hit price ${w.label}.` : `Next likely move: ${w.label}${w.typical ? `, usually about ${unitTxt(w.typical, w.unit)} in that ${w.step === 60 ? 'hour' : 'half hour'}` : ''}.`; return `<div class="bsum-r"><span class="pill when">⏱ ${esc(whenPill(w))}</span><span class="br">${esc(txt)}</span></div>`; })()}<p class="bsum-n">Weighs each story’s usual market reaction, with the top story counting most and stories only one outlet has reported counting half. A lean, not a promise.</p></li>`;
}
// Track record from the Scorecard: how calls for this market did one hour later (last 30 days)
const REC_KEY = { futures: 'NQ', stocks: 'NQ', options: 'NQ', crypto: 'BTC', memes: 'BTC', forex: 'EURUSD' };
function recLine(effs, rec) {
  if (!rec || !rec.byMarket) return '';
  const seen = new Set(), out = [];
  (effs || []).forEach(e => {
    if (e.paused || e.dir === 'mixed') return;
    const k = REC_KEY[e.market]; if (!k || seen.has(k)) return; seen.add(k);
    const t = (rec.byMarket.find(x => x.market === k) || {}).close; if (!t) return;
    const n = t.right + t.wrong; if (n < 5) return;
    out.push(`${esc(CALL_NAME[k] || k)} calls were right ${Math.round(t.right / n * 100)}% of the time by the close (${n} graded)`);
  });
  return out.length ? `<p class="brec">Track record: ${out.join('; ')}. <a href="/scorecard">Scorecard</a></p>` : '';
}
function briefingHTML(d, { empty = 'No major stories for this market right now.', rec = null, fresh = null } = {}) {
  const list = d.briefing || [];
  if (!list.length) return `<li class="empty">${esc(empty)}</li>`;
  const showWhy = isBeginner() || depth() === 'deep';
  const seenWhy = new Set();
  const group = effs => { const g = []; (effs || []).forEach(e => { const k = e.dir + '|' + e.reason + '|' + !!e.paused; const f = g.find(x => x.k === k); if (f) f.label += ' · ' + e.label; else g.push({ ...e, k }); }); return g; };
  return dayPlanHTML(d.dayplan) + bottomLine(list, !!(d.dayplan && d.dayplan.length)) + list.map((b, i) => { const dupWhy = b.why && seenWhy.has(b.why); if (b.why) seenWhy.add(b.why); const raw = b.effects; b = { ...b, why: dupWhy ? '' : b.why, effects: group(b.effects) };
    const isNew = fresh && fresh.has(b.id || b.link);
    return `<li class="bc${isNew ? ' bc-new' : ''}">
    <span class="bn">${String(i + 1).padStart(2, '0')}</span>
    <div class="bb">
      <a class="bh" href="${esc(b.link)}" target="_blank" rel="noopener">${isNew ? '<span class="newtag">New</span>' : ''}${esc(b.headline)}</a>
      <p class="bm">${srcLine(b)}${b.time ? ' · ' + ago(b.time) : ''}${b.topic ? ' · ' + esc(b.topic) : ''}${b.since ? ` · <span class="bm-moved">${reactTxt(b.since)}</span>` : ''}</p>
      ${showWhy && b.why ? `<p class="bwhy">${esc(b.why)}</p>` : ''}
      <div class="bfx" data-airh="${esc(b.headline)}">${b.effects && b.effects.length ? b.effects.map(e => `<div class="beff">${dirPill(e.label, e.dir, e.paused)}${b.when && e === b.effects[0] ? `<span class="pill when">⏱ ${esc(whenPill(b.when))}</span>` : ''}${e.by === 'ai' ? `<span class="pill by-ai" title="Read by AI because the headline alone doesn’t say">AI read${e.conf === 'high' ? ' · high confidence' : ''}</span>` : e.by === 'market' ? '<span class="pill by-mk" title="Based on how price has actually moved since the story">Market reaction</span>' : ''}<span class="br">${esc(e.reason)}</span></div>`).join('') : `<div class="beff">${b.when ? `<span class="pill when">⏱ ${esc(whenPill(b.when))}</span>` : ''}<span class="br">Little direct effect on your markets.</span></div>`}</div>
      ${airBtn(b.headline)}
      ${recLine(raw, rec)}
      <details class="bmore"><summary>Timing and what to watch</summary>
        ${b.when ? `<div class="brow"><span class="bl">When</span><div><span class="br">${esc(whenWhy(b.when, b))}</span></div></div>` : ''}
        <div class="brow"><span class="bl">Watch next</span><div><span class="br">${esc(b.watch)}</span></div></div>
        <div class="bfoot">${reportBtn(b.headline, b.link, 'briefing')}</div>
      </details>
    </div></li>`; }).join('') + `<li class="bnote">“Likely” is the usual reaction to news like this, not a promise. The grey numbers after each source show what price has done since; the <a href="/scorecard">scorecard</a> shows how past calls turned out.</li>`;
}
const FIT_CLASS = { 'Lines up well': 'up', 'Big day for this': 'acc', 'Use caution': 'warn', 'Poor fit today': 'down' };
function nextHTML(d) {
  const all = [...(d.next || []), ...(d.outlook || []).filter(o => o.kind !== 'Base case')].slice(0, 6);
  return outlookHTML({ outlook: all });
}
function playbookHTML(d) {
  const list = d.playbook || [];
  if (!list.length) return '<p class="empty">Pick your strategies in your setup to get a game plan here.</p>';
  const multi = new Set(list.map(p => p.market)).size > 1;
  return `<div class="plays">${list.map(p => `<article class="play">
      <div class="play-top"><div><h3>${esc(p.name[0].toUpperCase() + p.name.slice(1))}</h3>${multi ? `<small>${esc(marketLabel(p.market))}</small>` : ''}</div><span class="pill ${FIT_CLASS[p.fit] || ''}">${esc(p.fit)}</span></div>
      <p class="play-why">${esc(p.fitWhy)}</p>
      <ol>${p.steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    </article>`).join('')}</div><p class="disclaim">How traders using each strategy usually approach news like today’s. It’s education, not financial advice. Your own rules come first.</p>`;
}
function marketBriefing(id, focus, label) {
  const shut = !showWeekendNews() && marketShut(focus);
  const nextP = `<div class="tab-links"><a class="more" href="/calendar">Full calendar</a></div><div id="${id}Next"></div>`;
  if (shut) {
    const brief = `<section class="mbrief t-news"><div class="sec-row"><h2 class="sec">Briefing for ${esc(label)}</h2></div>${closedHTML(shut, `The ${label} market`)}</section>`;
    return { brief, next: nextP, play: '', html: brief + `<section class="mbrief"><div id="${id}Next"></div></section>`,
      load: () => { fill(id + 'Next', 'what’s next', api('desk?' + profileQuery() + '&focus=' + focus, 5 * 60e3), nextHTML); bindWeekend(); } };
  }
  const brief = `<section class="mbrief t-news"><div class="sec-row"><h2 class="sec">Briefing for ${esc(label)}</h2><a href="/news">All news</a></div><ol class="bfeed" id="${id}">${'<li>' + skel(3) + '</li>'}</ol></section>`;
  const play = `<div class="tab-links"><button class="linkbtn" type="button" data-edit>Change strategies</button></div><div id="${id}Play"></div>`;
  return { brief, next: nextP, play, html: brief,
    load: () => { const p = api('desk?' + profileQuery() + '&focus=' + focus, 5 * 60e3); fill(id, 'the briefing', Promise.all([p, api('calls', 5 * 60e3).catch(() => null)]), ([d, c]) => briefingHTML(d, { rec: c })); fill(id + 'Next', 'what’s next', p, nextHTML); fill(id + 'Play', 'your game plan', p, playbookHTML); main.querySelectorAll('[data-edit]').forEach(b => b.onclick = editSetup); } };
}
// ---------- One page frame for every section: news on the left; chart, your session and the Live read on the right; the rest in tabs ----------
function tabset(name, tabs) {
  const list = tabs.filter(t => t && t[2]);
  return `<section class="more-tabs t-more tabset" data-set="${name}">
    <div class="chips tabbar" role="tablist">${list.map(([k, l]) => `<button class="chip" role="tab" data-tab="${k}" aria-selected="false" aria-pressed="false">${esc(l)}</button>`).join('')}</div>
    ${list.map(([k, , h]) => `<div class="tabp" data-panel="${k}">${h}</div>`).join('')}
  </section>`;
}
function bindTabSets() {
  main.querySelectorAll('.tabset').forEach(set => {
    const key = 'tab:' + set.dataset.set, btns = [...set.querySelectorAll('[data-tab]')];
    if (!btns.length) return;
    const show = k => { if (!btns.some(b => b.dataset.tab === k)) k = btns[0].dataset.tab; store.set(key, k); btns.forEach(b => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', on); b.setAttribute('aria-pressed', on); }); set.querySelectorAll('.tabp').forEach(p => p.classList.toggle('on', p.dataset.panel === k)); };
    btns.forEach(b => b.onclick = () => show(b.dataset.tab));
    show(store.get(key, btns[0].dataset.tab));
  });
}
const nowHTML = (sessKey, pulseKey) => `<div class="now t-now">
    <section class="now-sec" id="sessBlock"><div class="sec-row"><h2 class="sec">${sessKey ? 'Session' : 'Your sessions'}</h2><span class="faint small">${esc(tzAbbr())}</span></div><div id="sessions" class="ssc-list"${sessKey ? ` data-keys="${sessKey}"` : ''}></div></section>
    <section class="now-sec pulse" id="pulseBlock"><div class="sec-row"><h2 class="sec">Live read</h2><span class="pl-timer" id="pulseNext" aria-live="off">…</span></div><div id="pulse"${pulseKey ? ` data-keys="${pulseKey}"` : ''}>${skel(2)}</div></section>
  </div>`;
function shellHTML({ left, chartId, sessKey, pulseKey, right = '', noChart = false }) {
  return `<div class="front3${noChart ? ' front3-news' : ''}">
    <div class="t-left">${left}</div>
    <div class="t-right">
      ${noChart ? '' : `<section class="hero-chart t-chart"><div class="chart-h"><h2 class="sec">Live chart</h2><div class="chips tight" id="${chartId}Pick"></div></div><div id="${chartId}" class="tvbox"></div></section>`}
      ${nowHTML(sessKey, pulseKey)}
      ${right}
    </div>
  </div>`;
}
function startNow() {
  loadPulse(); mountSessions();
  if (!pulseTimer) pulseTimer = setInterval(tickPulse, 1000); tickPulse();
  bindTabSets();
}
function pricesHTML(D) {
  const views = myAssets().map(a => assetView(a, D)).filter(Boolean).slice(0, 8);
  const today = nyParts().date;
  const evs = (D.cal ? D.cal.events : []).filter(e => nyParts(e.time).date === today && e.time > Date.now() && forYouEvent(e));
  const tip = isProp() && newsRestricted() && evs.some(e => e.impact === 'High') ? 'Your prop firm restricts trading around big news, and there is big news today.' : '';
  return `<h2 class="sec">Your markets</h2>
    ${views.length ? `<table class="mytable">${views.map(v => `<tr><td>${esc(shortName(v.a))}${v.sectorName ? `<small>${esc(v.sectorName)} sector</small>` : v.meme ? `<small>Top promoted token</small>` : ''}</td><td>${v.meme ? (v.top[0] ? esc(v.top[0].symbol) : '—') : v.price != null ? (v.money ? '$' : '') + (v.unit === '%' ? num(v.price, 2) + '%' : num(v.price, v.dp)) : ''}</td><td>${v.meme ? (v.top[0] ? chg(v.top[0].ch24) : '') : chg(v.pct)}</td></tr>`).join('')}</table>` : '<p class="empty">Add the assets you trade in your setup to see them here.</p>'}
    ${tip ? `<p class="tipline">${esc(tip)}</p>` : ''}
    <div class="brief-actions"><button type="button" id="briefEdit">Edit my setup</button><button type="button" id="briefAlerts">Alerts</button></div>`;
}
function glanceHTML(d) {
  const g = d.glance; if (!g) return '';
  return `<div><h2><i></i>What happened</h2><p>${esc(g.happened)}</p></div><div><h2><i></i>What it means</h2><p>${esc(g.means)}</p></div><div><h2><i></i>What’s likely next</h2><p>${esc(g.next)}</p></div>`;
}
const cap = t => t ? t[0].toUpperCase() + t.slice(1) : t;
function outlookHTML(d) {
  const mk = myMarkets();
  const list = (d.outlook || []).slice(0, 6);
  if (!list.length) return '<p class="empty">Nothing scheduled.</p>';
  return `<div class="outlook">${list.map(o => { const mine = (o.markets || []).some(m => mk.includes(m)); return `<article class="ol${mine ? ' mine' : ''}">
      <div class="ol-top"><span>${esc(o.when || '')}</span>${mine ? '<span class="pill acc">Your markets</span>' : o.kind ? `<span class="pill">${esc(o.kind)}</span>` : ''}</div>
      <h3>${esc(o.title)}</h3>
      <p>${esc(o.likely)}</p>
      <div class="sc">${o.if_up ? `<div class="a"><b>${esc((o.if_up.split(':')[0] || '').trim())}</b>${esc(cap(o.if_up.split(':').slice(1).join(':').trim() || o.if_up))}</div>` : ''}${o.if_down ? `<div class="b"><b>${esc((o.if_down.split(':')[0] || '').trim())}</b>${esc(cap(o.if_down.split(':').slice(1).join(':').trim() || o.if_down))}</div>` : ''}</div>
    </article>`; }).join('')}</div><p class="disclaim">These are the usual reactions, not promises. Markets often move before the news and can reverse after it.</p>`;
}
function todayChartOptions() {
  const mine = myAssets().filter(a => a.tv).map(a => ({ id: shortName(a), tv: a.tv }));
  return [...mine, { id: 'S&P 500', tv: 'OANDA:SPX500USD' }, { id: 'Nasdaq 100', tv: 'OANDA:NAS100USD' }, { id: 'EUR/USD', tv: 'FX:EURUSD' }, { id: 'Gold', tv: 'OANDA:XAUUSD' }, { id: 'Bitcoin', tv: 'BINANCE:BTCUSDT' }];
}
function briefHTML(desk, D) {
  const ws = windowStatus();
  const today = nyParts().date;
  const seen = new Set();
  const evs = (D.cal ? D.cal.events : []).filter(e => nyParts(e.time).date === today && e.time > Date.now() - 30 * 60e3 && forYouEvent(e)).filter(e => !seen.has(e.name) && seen.add(e.name)).slice(0, 4);
  const views = myAssets().map(a => assetView(a, D)).filter(Boolean).slice(0, 6);
  const fy = (desk && desk.forYou) || [];
  const tips = [];
  if (isProp() && newsRestricted() && evs.some(e => e.impact === 'High')) tips.push('Your prop firm restricts trading around big news, and there is big news today.');
  if (myStruggles().includes('overtrading') && !evs.length) tips.push('A quiet calendar is when overtrading creeps in. Pick your best setup and stop there.');
  if (myStruggles().includes('fomo')) tips.push('If a headline has already moved price a lot, the easy part of the move is often gone.');
  return `<h2 class="brief-h">${esc(greeting())}</h2>
    <p class="brief-sub">${isLearning() ? 'Here’s how today’s news connects to the markets you’re learning about.' : ws.text ? esc(ws.text) : 'Your briefing for today.'}</p>
    ${fy.map(f => `<div class="fy-m"><h3>${f.market === 'general' ? 'For you' : esc(marketLabel(f.market))}</h3><p>${withRefs(f.text, desk.refs)}</p></div>`).join('')}
    ${tips.length ? `<p class="small"><mark>${esc(tips[0])}</mark></p>` : ''}
    ${views.length ? `<h3>Your markets</h3><table class="mytable">${views.map(v => `<tr><td>${esc(shortName(v.a))}${v.sectorName ? `<small>${esc(v.sectorName)} sector</small>` : v.meme ? `<small>${v.count} of the most-promoted tokens</small>` : ''}</td><td>${v.meme ? (v.top[0] ? esc(v.top[0].symbol) : '—') : v.price != null ? (v.money ? '$' : '') + (v.unit === '%' ? num(v.price, 2) + '%' : num(v.price, v.dp)) : ''}</td><td>${v.meme ? (v.top[0] ? chg(v.top[0].ch24) : '') : chg(v.pct)}</td></tr>`).join('')}</table>` : ''}
    ${evs.length ? `<h3>Ahead today for you</h3><div>${evs.map(e => eventRow(e, true)).join('')}</div>` : ''}
    <div class="brief-actions"><button type="button" id="briefEdit">Edit my setup</button><button type="button" id="briefAlerts">Alerts</button>${isLearning() ? '<a href="/glossary" class="more">Learn the terms</a>' : ''}</div>`;
}
const TOPICS = [
  { id: 'econ', name: 'Economy and central banks', secs: ['economy', 'centralbanks'], mk: ['stocks', 'futures', 'forex', 'options'] },
  { id: 'world', name: 'World and politics', secs: ['world'], mk: ['forex', 'futures', 'stocks', 'crypto'] },
  { id: 'cos', name: 'Companies and tech', secs: ['companies', 'tech'], mk: ['stocks', 'options', 'futures'] },
  { id: 'cmd', name: 'Energy and commodities', secs: ['commodities'], mk: ['futures', 'forex'] },
  { id: 'fx', name: 'Currencies', secs: ['currencies'], mk: ['forex'] },
  { id: 'crypto', name: 'Crypto', secs: ['crypto'], mk: ['crypto', 'memes'] },
];
function topicsHTML(items) {
  const mk = myMarkets();
  const score = t => t.mk.filter(m => mk.includes(m)).length * 10 - TOPICS.indexOf(t);
  const used = new Set();
  return [...TOPICS].sort((a, b) => score(b) - score(a)).map(t => {
    const list = rankStories(items.filter(i => t.secs.includes(i.section) && !used.has(i.id))).slice(0, 4);
    list.forEach(i => used.add(i.id));
    if (!list.length) return '';
    return `<section class="topic${t.mk.some(m => mk.includes(m)) ? ' mine' : ''}"><h3>${esc(t.name)}</h3><ul class="slist small">${storyList(list, { why: false, notes: 0, markAt: 2 })}</ul></section>`;
  }).join('');
}
function worldHTML(d, { rowsPer = 99, sparks = true } = {}) {
  const mine = new Set(myAssets().map(a => a.ysym).filter(Boolean));
  return `<div class="wm">${d.groups.map(g => `<div class="wm-g"><h3>${esc(g.name)}</h3><table>${g.rows.slice(0, rowsPer).map(r => `<tr class="${mine.has(r.sym) ? 'mine' : ''}"><td class="n">${esc(r.label)}</td><td class="p">${priceOf(r)}</td><td class="c">${chg(r.pct)}</td>${sparks ? `<td class="s">${spark(r.spark)}</td>` : ''}</tr>`).join('')}</table></div>`).join('')}</div>`;
}


// ---------- Session countdowns: the sessions that matter for what this reader trades ----------
// Each session is defined in its own city's time, so daylight-saving changes in Tokyo, London and New York are handled.
const SESSIONS = {
  futures: { name: 'Index futures', shut: 'futures', weekdays: true, list: [
    { id: 'asia', name: 'Asia', tz: 'Asia/Tokyo', from: '09:00', to: '15:00' },
    { id: 'london', name: 'London', tz: 'Europe/London', from: '08:00', to: '16:30' },
    { id: 'ny', name: 'New York', tz: 'America/New_York', from: '09:30', to: '16:00' }] },
  forex: { name: 'Forex', shut: 'forex', weekdays: true, list: [
    { id: 'tokyo', name: 'Tokyo', tz: 'Asia/Tokyo', from: '09:00', to: '18:00' },
    { id: 'london', name: 'London', tz: 'Europe/London', from: '08:00', to: '17:00' },
    { id: 'ny', name: 'New York', tz: 'America/New_York', from: '08:00', to: '17:00' }] },
  stocks: { name: 'US stocks', weekdays: true, list: [
    { id: 'pre', name: 'Pre-market', tz: 'America/New_York', from: '04:00', to: '09:30' },
    { id: 'ny', name: 'Regular session', tz: 'America/New_York', from: '09:30', to: '16:00' },
    { id: 'after', name: 'After hours', tz: 'America/New_York', from: '16:00', to: '20:00' }] },
  crypto: { name: 'Crypto', weekdays: false, list: [
    { id: 'asia', name: 'Asia', tz: 'Asia/Tokyo', from: '09:00', to: '17:00' },
    { id: 'london', name: 'London', tz: 'Europe/London', from: '08:00', to: '16:00' },
    { id: 'us', name: 'US', tz: 'America/New_York', from: '09:30', to: '16:00' }] }
};
const SESS_OF = { futures: 'futures', stocks: 'stocks', options: 'stocks', forex: 'forex', crypto: 'crypto', memes: 'crypto' };
const sessFmt = {};
function tzOff(ms, tz) {
  const f = sessFmt[tz] || (sessFmt[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  const o = {}; f.formatToParts(new Date(ms)).forEach(x => o[x.type] = x.value);
  return Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second) - Math.floor(ms / 1e3) * 1e3;
}
function tzDate(ms, tz) { const t = ms + tzOff(ms, tz); return new Date(t).toISOString().slice(0, 10); }
function wallMs(date, hm, tz) {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - tzOff(guess, tz); t = guess - tzOff(t, tz);
  return t;
}
// Every real session window from yesterday to a week ahead, for one market
function sessWindows(key, now = Date.now()) {
  const S = SESSIONS[key], out = [];
  S.list.forEach(x => {
    const seen = new Set();
    for (let k = -1; k <= 8; k++) {
      const date = tzDate(now + k * 864e5, x.tz); if (seen.has(date)) continue; seen.add(date);
      const dow = new Date(date + 'T12:00:00Z').getUTCDay();
      if (S.weekdays && (dow === 0 || dow === 6)) continue;
      const start = wallMs(date, x.from, x.tz), end = wallMs(date, x.to, x.tz);
      if (S.shut && marketShut(S.shut, start + 6e4) != null) continue;
      out.push({ ...x, start, end });
    }
  });
  return out.sort((a, b) => a.start - b.start);
}
function cdText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1e3)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return d ? `${d}d ${h}:${pad(m)}:${pad(x)}` : h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
}
let sessTimer = null, sessState = {};
function sessionsHTML(only) {
  const keys = only ? only.split(',') : [...new Set(myMarkets().map(m => SESS_OF[m]).filter(Boolean))];
  return (keys.length ? keys : ['futures']).map(k => `<article class="ssc" data-sk="${k}">
      <p class="rel-top"><span class="ssc-dot"></span><span class="ssc-eye"></span></p>
      <div class="ssc-body"><div class="rel-nums ssc-nums"></div></div>
      <div class="ssc-bar" aria-hidden="true"><i></i></div>
      <div class="brow"><span class="bl">Sessions</span><div class="ssc-pills"></div></div>
    </article>`).join('');
}
const sessT = t => `${fmtTime(t)}${dayIn(t) !== dayIn(Date.now()) ? ' ' + new Date(t).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' }) : ''}`;
const sessR = w => `${fmtTime(w.start)}–${fmtTime(w.end)}`;
function tickSessions() {
  const cards = document.querySelectorAll('.ssc');
  if (!cards.length) { clearInterval(sessTimer); sessTimer = null; return; }
  const now = Date.now();
  cards.forEach(card => {
    const k = card.dataset.sk, S = SESSIONS[k], wins = sessWindows(k, now);
    const active = wins.filter(w => w.start <= now && now < w.end);
    const upcoming = wins.filter(w => w.start > now && !active.some(a => a.id === w.id));
    const next = upcoming[0], then = upcoming[1];
    const shutAt = S.shut ? marketShut(S.shut, now) : null;
    const key = active.map(a => a.id).join('+') || (shutAt ? 'shut' : 'gap:' + (next ? next.id : ''));
    const prev = sessState[k];
    const live = active.length > 0;
    const nowName = active.length > 1 ? `${active.map(a => a.name).join(' + ')} overlap` : live ? `${active[0].name} session` : shutAt ? 'Closed for the weekend' : 'Between sessions';
    // Eyebrow, numbers
    let nums;
    if (live) {
      const end = Math.min(...active.map(a => a.end));
      nums = [['Ends in', cdText(end - now), 'ssc-cd'], next ? [`Next · ${next.name}`, sessT(next.start)] : null, next ? ['Starts in', cdText(next.start - now)] : null];
    } else if (shutAt) {
      nums = [['Reopens in', cdText(shutAt - now), 'ssc-cd'], ['At', sessT(shutAt)], next ? [`First · ${next.name}`, sessT(next.start)] : null];
    } else {
      nums = [[next ? `${next.name} opens in` : 'Next session', next ? cdText(next.start - now) : '—', 'ssc-cd'], next ? ['At', sessT(next.start)] : null, then ? [`Then · ${then.name}`, sessT(then.start)] : null];
    }
    const numsHTML = nums.filter(Boolean).map(([l, v, c]) => `<div><small>${esc(l)}</small><b class="${c || ''}">${esc(v)}</b></div>`).join('');
    const soon = !live && next && next.start - now <= 60e3 && next.start > now;
    card.classList.toggle('ssc-live', live);
    card.classList.toggle('ssc-soon', !!soon);
    const eye = card.querySelector('.ssc-eye'), body = card.querySelector('.ssc-body'), numEl = card.querySelector('.ssc-nums');
    const justOpened = live && active.some(a => now - a.start < 60e3);
    card.classList.toggle('ssc-just', justOpened);
    const eyeText = `${S.name} · ${justOpened ? 'Just opened · ' + active.map(a => a.name).join(' + ') : nowName}`;
    if (prev !== undefined && prev !== key) {
      // The session changed: fade the old numbers out and the new ones in
      body.classList.add('out');
      setTimeout(() => { numEl.innerHTML = numsHTML; eye.textContent = eyeText; body.classList.remove('out'); }, 280);
    } else if (!body.classList.contains('out')) { numEl.innerHTML = numsHTML; eye.textContent = eyeText; }
    sessState[k] = key;
    // Progress through the current session
    const bar = card.querySelector('.ssc-bar i');
    if (live) { const a = active[0]; bar.style.width = Math.min(100, (now - a.start) / (a.end - a.start) * 100).toFixed(2) + '%'; }
    else bar.style.width = '0%';
    // One pill per session: the one happening now, or its next time
    const pills = S.list.map(x => wins.find(w => w.id === x.id && w.end > now)).filter(Boolean).sort((p, q) => p.start - q.start);
    const ph = pills.map(w => `<span class="pill${w.start <= now ? ' when' : ''}"><b>${esc(w.name)}</b> ${esc(sessR(w))}</span>`).join('');
    const pe = card.querySelector('.ssc-pills'); if (pe.dataset.h !== ph) { pe.innerHTML = ph; pe.dataset.h = ph; }
  });
}
function dayIn(t) { return new Date(t).toLocaleDateString('en-US', { timeZone: TZ }); }
function mountSessions() {
  const el = document.getElementById('sessions'); if (!el) return;
  if (!el.querySelector('.ssc')) { el.innerHTML = sessionsHTML(el.dataset.keys); sessState = {}; }
  tickSessions();
  if (!sessTimer) sessTimer = setInterval(() => { if (document.visibilityState === 'visible') tickSessions(); }, 1000);
}
// ---------- Live read + News bot: re-checked every 5 minutes ----------
const PULSE_KEY = { futures: 'NQ', stocks: 'NQ', options: 'NQ', crypto: 'BTC', memes: 'BTC', forex: 'EURUSD' };
const PULSE_DP = { NQ: 2, BTC: 0, EURUSD: 4 };
// Only the markets this reader trades (everything if they haven't picked any we cover yet)
const pulseMine = () => [...new Set(myMarkets().map(m => PULSE_KEY[m]).filter(Boolean))];
function pulseOrder(reads) {
  const only = (document.getElementById('pulse') || {}).dataset; const mine = only && only.keys ? only.keys.split(',') : pulseMine();
  return mine.length ? mine.map(k => reads.find(r => r.key === k)).filter(Boolean) : reads;
}
const unitAmt = (n, u) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${u === '$' ? '$' : ''}${num(Math.abs(n), u === 'pts' ? (Math.abs(n) >= 100 ? 0 : 1) : 0)}${u === 'pts' ? ' pts' : u === 'pips' ? ' pips' : ''}`;
function pulseCard(r) {
  const lean = r.lean === 'up' ? '<i class="up">↑</i> Leaning up' : r.lean === 'down' ? '<i class="down">↓</i> Leaning down' : r.closed ? 'Market closed' : r.gate ? 'Waiting for the release' : 'No clear lean';
  const conf = r.conf ? `<span class="pill ${r.conf === 'low' ? '' : 'acc'}"${r.capped ? ` title="${esc(r.capped)}"` : ''}>${r.conf === 'high' ? 'High' : r.conf === 'medium' ? 'Medium' : 'Low'} confidence${r.capped ? ' ⓘ' : ''}</span>` : '';
  const mv = r.move ? `<small class="${r.move.ch60 > 0 ? 'up' : r.move.ch60 < 0 ? 'down' : 'faint'}">${unitAmt(r.move.ch60, r.move.unit)} last hour</small>` : '';
  const why = r.closed && r.reopens ? `Reads restart when it reopens, ${new Date(r.reopens).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : r.why;
  return `<article class="pl-card pl-${r.lean}${r.closed ? ' pl-closed' : ''}">
    <div class="pl-top"><b>${esc(r.name)}</b><span class="pl-px">${r.price != null ? num(r.price, PULSE_DP[r.key]) : ''} ${mv}</span></div>
    <div class="pl-lean"><span>${lean}</span>${conf}</div>
    <p class="pl-why">${esc(why)}</p>
    ${r.capped ? `<p class="pl-cap">${esc(r.capped)} <a href="/scorecard">Scorecard</a></p>` : ''}
    ${r.note ? `<p class="pl-note"><span class="pl-ai">AI check</span>${esc(r.note)}</p>` : ''}
    ${(r.reasons || []).length ? `<ul class="pl-rs">${r.reasons.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </article>`;
}
// The 3 strongest briefing headlines the bot is reading for this reader's markets
function topThree(d) {
  const reads = pulseOrder(d.reads), seen = new Map();
  for (let i = 0; i < 3; i++) reads.forEach(r => {
    const st = (r.stories || [])[i]; if (!st) return;
    const k = st.link || st.headline;
    if (!seen.has(k)) seen.set(k, { ...st, reads: [] });
    const x = seen.get(k); if (!x.reads.some(y => y.market === r.name)) x.reads.push({ market: r.name, dir: st.dir, paused: st.paused });
  });
  return [...seen.values()].slice(0, 3);
}
function newsbotHTML(d) {
  const items = topThree(d);
  if (!items.length) return `<p class="faint small">The briefing has no strong headlines for your markets right now.</p>`;
  const chip = x => x.paused ? `<span class="pill paused">${esc(x.market)} paused</span>` : x.dir === 'up' ? `<span class="pill up">${esc(x.market)} ↑</span>` : x.dir === 'down' ? `<span class="pill down">${esc(x.market)} ↓</span>` : `<span class="pill">${esc(x.market)} unclear</span>`;
  return `<ol class="nb">${items.map((n, i) => `<li${Date.now() - n.time < 15 * 60e3 ? ' class="nb-new"' : ''}>
    <span class="nb-t"><b class="nb-rank">${i + 1}</b>${esc(ago(n.time))}</span>
    <span class="nb-h"><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.headline)}</a><small>${esc(n.source)}${n.outlets > 1 ? ` and ${n.outlets - 1} more` : ''}</small></span>
    <span class="nb-r">${n.reads.map(chip).join('')}</span></li>`).join('')}</ol>`;
}
function pulseHTML(d) {
  const reads = pulseOrder(d.reads);
  const tops = topThree(d);
  const ar = x => x.paused ? '⏸' : x.dir === 'up' ? '<i class="up">↑</i>' : x.dir === 'down' ? '<i class="down">↓</i>' : '<i>↕</i>';
  return `<div class="pl-grid n${reads.length}">${reads.map(pulseCard).join('')}</div>
    ${tops.length ? `<div class="pl-src"><span>Based on the ${tops.length} strongest headlines for your markets</span>${tops.map(n => `<a href="${esc(n.link)}" target="_blank" rel="noopener"><span class="pl-ar">${n.reads.map(ar).join('')}</span><span class="pl-hl">${esc(n.headline)}</span></a>`).join('')}</div>` : ''}
    <p class="pl-fine">A lean for the next hour, not a promise. Every read is graded on the <a href="/scorecard">Scorecard</a>.</p>`;
}
// Scan timer: a new read at every 5-minute bar close (:00, :05, :10…), the same moment the chart's 5m bar closes.
// The data is fetched a few seconds after the close so the finished bar is in.
const PULSE_MS = 60e3, PULSE_GRACE = 4e3;
const pulseSlot = () => Math.floor((Date.now() - PULSE_GRACE) / PULSE_MS);
let pulseShown = null, pulseTimer = null;
function loadPulse() {
  const slot = pulseSlot(); pulseShown = slot;
  pulseP = api('pulse?slot=' + slot, PULSE_MS).then(d => { pulseLast = d; return d; });
  return fill('pulse', 'the live read', pulseP, pulseHTML);
}
function tickPulse() {
  const el = document.getElementById('pulseNext');
  if (!el) { clearInterval(pulseTimer); pulseTimer = null; return; }
  const close = (pulseShown + 1) * PULSE_MS, left = close - Date.now();
  if (left <= 0) {
    el.innerHTML = `<i class="nb-live" aria-hidden="true"></i>Scanning…`;
    if (Date.now() >= close + PULSE_GRACE) loadPulse();
    return;
  }
  el.innerHTML = `Next scan <b>${fmtLeft(left)}</b>`; el.title = 'Scans when each 1-minute bar closes';
}
// "Since you last looked": new briefing stories, how far your markets moved, and calls that changed
function sinceStart(d) {
  const prev = store.get('lastSeen', null), now = Date.now();
  const ids = (d.briefing || []).map(b => b.id || b.link);
  const fresh = new Set();
  const el = document.getElementById('since');
  if (prev && now - prev.t > 10 * 60e3 && now - prev.t < 3 * 864e5) {
    ids.forEach(k => { if (!prev.ids.includes(k)) fresh.add(k); });
    const bits = [];
    if (fresh.size) bits.push(`<b>${fresh.size} new ${fresh.size === 1 ? 'story' : 'stories'}</b> in your briefing`);
    const leanNow = {}; try { (pulseLast && pulseLast.reads || []).forEach(r => leanNow[r.key] = r); } catch {}
    Object.entries(prev.px || {}).forEach(([k, p]) => { const r = leanNow[k]; if (!r || r.price == null || p == null) return; const dp = r.price - p; const u = k === 'EURUSD' ? Math.round(dp / 1e-4) + ' pips' : k === 'BTC' ? '$' + Math.round(Math.abs(dp)).toLocaleString('en-US') : Math.abs(dp).toFixed(1) + ' pts'; bits.push(`${esc(r.name)} <span class="${dp > 0 ? 'up' : dp < 0 ? 'down' : ''}">${dp > 0 ? '+' : dp < 0 ? '−' : ''}${k === 'EURUSD' ? u.replace('-', '') : u}</span>`); });
    Object.entries(prev.lean || {}).forEach(([k, l]) => { const r = leanNow[k]; if (r && r.lean !== l) bits.push(`${esc(r.name)} read went from ${LEAN_TXT[l]} to <b>${LEAN_TXT[r.lean]}</b>`); });
    if (el && bits.length) { el.innerHTML = `<span class="since-h">Since you were here at ${fmtTime(prev.t)}</span><span class="since-b">${bits.join('<i>·</i>')}</span><button class="since-x" type="button" aria-label="Dismiss">×</button>`; el.hidden = false; el.querySelector('.since-x').onclick = () => { el.hidden = true; }; }
  }
  clearTimeout(sinceSave); sinceSave = setTimeout(() => saveSeen(ids), 20e3);
  sinceIds = ids;
  return fresh;
}
const LEAN_TXT = { up: 'leaning up', down: 'leaning down', none: 'no clear lean' };
let sinceSave = null, sinceIds = [], pulseLast = null, pulseP = null;
function saveSeen(ids) {
  const px = {}, lean = {};
  (pulseLast && pulseLast.reads || []).forEach(r => { if (r.price != null) px[r.key] = r.price; lean[r.key] = r.lean; });
  store.set('lastSeen', { t: Date.now(), ids: ids || sinceIds, px, lean });
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && sinceIds.length && main.dataset.page === 'today') saveSeen(sinceIds); });
const TODAY_TABS = [['next', 'What’s next'], ['timing', 'When price moves'], ['play', 'Game plan'], ['topics', 'More news'], ['world', 'World markets']];
function bindTabs() {
  const bar = main.querySelector('.tabbar'); if (!bar) return;
  const vis = k => { const p = main.querySelector(`.tabp[data-panel="${k}"]`); return p && !p.classList.contains('wk-off'); };
  let cur = store.get('todayTab', 'next'); if (!vis(cur)) cur = 'next';
  const show = k => {
    cur = k; store.set('todayTab', k);
    bar.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === k; b.setAttribute('aria-selected', on); b.setAttribute('aria-pressed', on); b.hidden = !vis(b.dataset.tab); });
    main.querySelectorAll('.tabp').forEach(p => p.classList.toggle('on', p.dataset.panel === k));
  };
  bar.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => show(b.dataset.tab));
  show(cur);
}
PAGES.today = () => {
  const ws = windowStatus();
  if (layout(`
    ${guideHTML()}
    <div class="today-head">
      <h1 class="page-h">${esc(greeting())}</h1>
      <p class="page-intro" id="todayIntro">${isLearning() ? 'Here’s how today’s news connects to the markets you’re learning about.' : ws.text ? esc(ws.text) : 'Here’s what matters for your markets today.'}</p>
    </div>
    <div class="since" id="since" hidden></div>
    <div class="ls-soon" id="liveSoon" hidden></div>
    <div class="front3">
      <div class="t-left">
        <section class="briefing t-news"><div class="sec-row"><h2 class="sec">Briefing for ${esc(sessionDay().long)}</h2><a href="/news">All news</a></div><ol class="bfeed" id="bfeed">${'<li>' + skel(3) + '</li>'}</ol></section>
        <section class="more-tabs t-more">
          <div class="chips tabbar" role="tablist" aria-label="More for today">${TODAY_TABS.map(([k, l]) => `<button class="chip" role="tab" data-tab="${k}" aria-selected="false" aria-pressed="false">${l}</button>`).join('')}</div>
          <div class="tabp" data-panel="next"><div class="tab-links"><a class="more" href="/calendar">Full calendar</a></div><h2 class="sr-only" id="outlookH">What’s going to happen next</h2><div id="outlook"></div></div>
          <div class="tabp" data-panel="timing"><div class="tab-links"><div class="chips tight" id="tmPick"></div></div><div id="timing"></div></div>
          <div class="tabp wknd-hide" data-panel="play"><div class="tab-links"><button class="linkbtn" type="button" data-edit>Change strategies</button></div><div id="todayPlay"></div></div>
          <div class="tabp wknd-hide" data-panel="topics"><div class="tab-links"><a class="more" href="/news">All news</a></div><div class="topics" id="topics"></div></div>
          <div class="tabp" data-panel="world"><div class="tab-links"><a class="more" href="/markets">All markets</a></div><div id="worldMini"></div></div>
        </section>
      </div>
      <div class="t-right">
        <section class="hero-chart t-chart"><div class="chart-h"><h2 class="sec">Live chart</h2><div class="chips tight" id="todayChartPick"></div></div><div id="todayChart" class="tvbox"></div></section>
        <div class="now t-now">
          <section class="now-sec" id="sessBlock"><div class="sec-row"><h2 class="sec">Your sessions</h2><span class="faint small">${esc(tzAbbr())}</span></div><div id="sessions" class="ssc-list"></div></section>
          <section class="now-sec pulse" id="pulseBlock"><div class="sec-row"><h2 class="sec">Live read</h2><span class="pl-timer" id="pulseNext" aria-live="off">…</span></div><div id="pulse">${skel(2)}</div></section>
        </div>
        <section class="tn tn-today t-expect" id="todayExpect" hidden></section>
        <section class="t-prices card" id="myPrices"></section>
      </div>
    </div>
`)) {
    chartPicker('todayChart', 'todayChartPick', todayChartOptions());
    const gx = $('#guideX'); if (gx) gx.onclick = () => { store.set('guideDone', true); const g = $('#guide'); if (g) g.remove(); };
  }
  loadPulse();
  renderLiveSoon();
  if (!isLearning()) mountExpect('todayExpect');
  const deskP = api('desk?' + profileQuery(), 5 * 60e3);
  const wireP = api('wire?section=all', 60e3);
  const shut = !showWeekendNews() && allShut(myMarkets());
  main.querySelectorAll('.wknd-hide').forEach(x => x.classList.toggle('wk-off', !!shut));
  bindTabs();
  if (shut) {
    const bf = $('#bfeed'); if (bf) { bf.innerHTML = `<li class="closed-li">${closedHTML(shut, myMarkets().length > 1 ? 'Every market you trade' : `The ${SHUT_NAME[myMarkets()[0]] || ''} market`)}</li>`; bindWeekend(); }
    const oh = $('#outlookH'); if (oh) oh.textContent = 'What’s coming when it reopens';
    const ti = $('#todayIntro'); if (ti && !isLearning()) ti.textContent = 'Your markets are closed for the weekend. Here’s what’s coming when they reopen.';
  }
  else fill('bfeed', 'today’s briefing', Promise.all([deskP, api('calls', 5 * 60e3).catch(() => null), (pulseP || Promise.resolve()).catch(() => null)]), ([d, c]) => { const seen = sinceStart(d); return briefingHTML(d, { rec: c, fresh: seen }); });
  fill('outlook', 'what’s next', deskP, nextHTML);
  mountSessions();
  if (!pulseTimer) pulseTimer = setInterval(tickPulse, 1000); tickPulse();
  {
    const ks = timingKeys(); let tk = store.get('timingKey', ks[0]); if (!ks.includes(tk)) tk = ks[0];
    const draw = () => {
      const pk = $('#tmPick'); if (pk) pk.innerHTML = ks.length > 1 ? ks.map(k => `<button class="chip" data-tk="${k}" aria-pressed="${k === tk}">${TIMING_NAME[k]}</button>`).join('') : '';
      main.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => { tk = b.dataset.tk; store.set('timingKey', tk); const el = $('#timing'); if (el) el.innerHTML = ''; draw(); });
      fill('timing', 'when price usually moves', api('timing?m=' + tk, 15 * 60e3), timingHTML);
    };
    draw();
  }
  if (!shut) fill('todayPlay', 'your game plan', deskP, playbookHTML);
  main.querySelectorAll('[data-edit]').forEach(b => b.onclick = editSetup);
  fill('myPrices', 'your prices', personalData(), pricesHTML).then(() => {
    const e = $('#briefEdit'); if (e) e.onclick = editSetup; const al = $('#briefAlerts'); if (al) al.onclick = openAlerts;
  });
  if (!shut) fill('topics', 'news sections', Promise.all([wireP, deskP.catch(() => null)]), ([d, desk]) => {
    const used = new Set(desk ? (desk.briefing || []).map(b => b.link) : []);
    return topicsHTML(usefulOnly(d.items, myMarkets()).keep.filter(i => !used.has(i.link)));
  });
  fill('worldMini', 'world markets', api('world', 120e3), d => worldHTML({ groups: d.groups.filter(g => g.id !== 'fut' && g.id !== 'vol') }, { rowsPer: 3, sparks: false }));
};

// Does a story matter for markets? Big stories, anything the headline reader can give a direction for, anything price clearly moved on,
// and notable stories about your markets. Personal finance, advice, listicles, opinion and small-company results never do.
function matters(i) {
  if (i.noise) return false;
  const d = i.dirs || {}, r = i.reaction;
  const moved = r && r.from ? Math.abs((r.now - r.from) / r.from * 100) : 0;
  return i.impact === 'high' || !!(d.NQ || d.BTC || d.EURUSD) || moved >= 0.2 || (i.impact === 'medium' && forYouStrength(i) >= 1);
}
const NR_MK = { NQ: 'NQ', BTC: 'Bitcoin', EURUSD: 'EUR/USD' };
function nrMarkets() { const k = [...new Set(myMarkets().map(m => PULSE_KEY[m]).filter(Boolean))]; return k.length ? k : ['NQ', 'BTC', 'EURUSD']; }
const nrArrow = d => d > 0 ? '<i class="up">↑</i>' : d < 0 ? '<i class="down">↓</i>' : '<i>↕</i>';
const nrWord = d => d > 0 ? 'Likely up' : d < 0 ? 'Likely down' : 'Unclear';
function nrChips(i) { const d = i.dirs || {}; return nrMarkets().filter(k => d[k]).map(k => `<span class="nr-chip">${esc(NR_MK[k])} ${nrArrow(d[k])}</span>`).join(''); }
// ---------- News: a newsroom front page ----------
// Top stories first (one lead, two beside it), then everything else by time. Each row: time, headline, one quiet line.
function nrMeta(i, explain) {
  const src = `${esc(i.source)}${(i.outlets || i.count) > 1 ? ` +${(i.outlets || i.count) - 1}` : i.confirmed === false && i.impact === 'high' ? ' only' : ''}`;
  return `<p class="nr-meta">${i.breaking ? '<span class="nr-brk">Breaking</span>' : ''}${nrChips(i)}<span>${src}</span><span>${esc(SECTION_NAMES[i.section] || i.themeLabel || '')}</span>${reactTxt(i.reaction)}${explain ? `<button class="linkbtn wi-x" data-x="${esc(i.id)}" aria-expanded="false">Explain this</button>` : ''}${rhymeBtn(i)}${airBtn(i.title, true)}</p>${explain ? `<div class="wi-explain" id="x-${esc(i.id)}" hidden></div>` : ''}${rhymeBox(i)}`;
}
function newsroomHTML(items, ranked, mineFirst = true, cap = 10) {
  if (!items.length) return '<p class="empty">No stories match those filters right now.</p>';
  const mine = i => forYouStrength(i) >= 1;
  // Most influential first: how big the story is, how many outlets carry it, how far price has actually moved since, and whether it touches your markets
  const moved = i => { const r = i.reaction; return r && r.from ? Math.abs((r.now - r.from) / r.from * 100) : 0; };
  const influence = i => (i.score || 0) + 1.2 * Math.min(Math.max((i.outlets || i.count || 1) - 1, 0), 4) + 4 * Math.min(moved(i) / 0.5, 1) + (mine(i) ? 1.5 : 0) + (i.confirmed === false ? -1.5 : 0) + (now0 - i.time < 3 * 36e5 ? 1 : now0 - i.time < 12 * 36e5 ? 0.3 : 0);
  const now0 = Date.now();
  // "My markets first" on: stories that affect your markets lead (most influential of those first). Off: the biggest stories overall.
  const rank = i => influence(i) + (mineFirst ? 100 * Math.min(forYouStrength(i), 3) : 0);
  // The front cards must be stories that actually move a market: the headline reader gives a direction, two or more outlets carry it, or price moved on it
  const solid = i => { const d = i.dirs || {}; return !!(d.NQ || d.BTC || d.EURUSD) || (i.outlets || i.count || 1) >= 2 || moved(i) >= 0.2; };
  const sorted = [...items].sort((a, b) => rank(b) - rank(a)).filter(i => i.impact !== 'low' || (mineFirst && mine(i)));
  const pool = sorted.filter(solid).length >= 3 ? sorted.filter(solid) : sorted;
  // Three different stories up front: one per topic, so three oil headlines can't take every slot
  const top = [], topics = new Set();
  for (const i of (pool.length >= 3 ? pool : ranked)) { const k = i.theme || i.section || i.id; if (topics.has(k)) continue; topics.add(k); top.push(i); if (top.length === 3) break; }
  for (const i of (pool.length >= 3 ? pool : ranked)) { if (top.length >= 3) break; if (!top.includes(i)) top.push(i); }
  const topIds = new Set(top.map(i => i.id));
  const seenWhy = new Set();
  const why = i => { if (!i.why || seenWhy.has(i.why)) return ''; seenWhy.add(i.why); return esc(i.why); };
  const [lead, ...side] = top;
  const fy = lead ? forYouHeadline(lead) : null;
  const leadHTML = lead ? `<article class="nr-lead${mine(lead) ? ' mine' : ''}">
      <p class="nr-eye">${mineFirst && mine(lead) ? 'Top story for your markets' : 'Most influential right now'} · ${ago(lead.time)}</p>
      <a class="nr-h1" href="${esc(lead.link)}" target="_blank" rel="noopener">${esc(lead.title)}</a>
      ${why(lead) ? `<p class="nr-why">${esc(lead.why)}</p>` : ''}
      ${fy ? `<p class="nr-fy"><b>For you</b> ${esc(fy)}</p>` : ''}
      <div class="rel-nums nr-stats">${nrMarkets().map(k => { const d = (lead.dirs || {})[k] || 0; return `<div><small>${esc(NR_MK[k])}</small><b class="${d > 0 ? 'up' : d < 0 ? 'down' : 'flat'}">${d > 0 ? '↑' : d < 0 ? '↓' : '↕'} ${nrWord(d)}</b></div>`; }).join('')}
        <div><small>Price since</small><b class="${lead.reaction ? (lead.reaction.change > 0 ? 'up' : lead.reaction.change < 0 ? 'down' : '') : 'flat'}">${lead.reaction ? esc(`${lead.reaction.label} ${lead.reaction.change > 0 ? '+' : lead.reaction.change < 0 ? '−' : ''}${Math.abs(lead.reaction.change).toLocaleString('en-US', { maximumFractionDigits: 1 })}${lead.reaction.unit === '$' ? '' : ' ' + lead.reaction.unit}`) : '—'}</b></div>
        <div><small>Reported by</small><b>${(lead.outlets || lead.count || 1)} ${(lead.outlets || lead.count || 1) === 1 ? 'outlet' : 'outlets'}</b></div>
      </div>
      ${nrMeta({ ...lead, reaction: null, dirs: {} }, true)}
    </article>` : '';
  const sideHTML = side.map(i => `<article class="nr-side${mine(i) ? ' mine' : ''}"><p class="nr-eye">${ago(i.time)}</p><a class="nr-h2" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>${why(i) ? `<p class="nr-why sm">${esc(i.why)}</p>` : ''}${nrMeta(i, true)}</article>`).join('');
  // At most 10 stories in all: the 3 up top plus the 7 most important of the rest, shown newest first
  const restAll = items.filter(i => !topIds.has(i.id));
  const rest = (cap ? [...restAll].sort((a, b) => rank(b) - rank(a)).slice(0, Math.max(cap - top.length, 0)) : restAll).sort((a, b) => (b.time || 0) - (a.time || 0));
  const now = Date.now();
  const groups = [['Last hour', i => now - i.time < 36e5], ['Earlier today', i => now - i.time < 12 * 36e5], ['Waiting for the open', () => true]];
  const used = new Set();
  const feed = groups.map(([name, test]) => {
    const g = rest.filter(i => !used.has(i.id) && i.time && test(i)); g.forEach(i => used.add(i.id));
    if (!g.length) return '';
    return `<section class="nr-group"><h3 class="nr-gh">${name}</h3><ol class="nr-list">${g.map(i => { const w = i.impact === 'high' ? why(i) : ''; return `<li class="nr-row${mine(i) ? ' mine' : ''}" data-id="${esc(i.id)}"><time>${fmtTime(i.time)}</time><div><a class="nr-t" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>${w ? `<p class="nr-why sm">${w}</p>` : ''}${nrMeta(i, true)}</div></li>`; }).join('')}</ol></section>`;
  }).join('');
  return `<div class="nr-top">${leadHTML}<div class="nr-sides">${sideHTML}</div></div>${feed}`;
}
// ---------- Trade the news? A day-by-day read of how much news risk each trading day carries ----------
const TN_MAJOR = /\bcpi\b|consumer price|non-farm|nonfarm|payroll|federal funds|fomc|fed chair|powell|\bpce\b|core pce/i;
const TN_KIND = [
  [/\bcpi\b|consumer price|\bppi\b|producer price|\bpce\b/i, 'inflation'],
  [/non-farm|nonfarm|payroll|unemployment|jobless|jolts|adp|employment/i, 'jobs'],
  [/federal funds|fomc|fed chair|powell|fed .*speaks|fomc member/i, 'fed'],
  [/gdp|retail sales|pmi|ism|consumer (confidence|sentiment)|durable/i, 'growth'],
  [/main refinancing|ecb|lagarde|boe|official bank rate|boj|policy rate|cash rate|overnight rate|snb|rba|boc/i, 'cb'],
];
const TN_NOTREL = /election|holiday|daylight|summit|bank holiday/i;
const tnKind = t => (TN_KIND.find(([re]) => re.test(t)) || [])[1] || 'other';
// What a surprise usually does: hotter/stronger/more hawkish than expected
const TN_SURPRISE = {
  inflation: { hot: 'inflation comes in hotter than forecast', soft: 'A cooler number', NQ: 'down', BTC: 'down', EURUSD: 'down', why: 'Hot inflation pushes rate cuts further out. Yields and the dollar rise, and stocks and crypto usually fall.' },
  jobs: { hot: 'hiring comes in stronger than forecast', soft: 'A weaker number', NQ: 'mixed', BTC: 'down', EURUSD: 'down', why: 'Strong hiring means the Fed can keep rates high. The dollar usually rises. Stocks can go either way: a strong economy helps profits, but higher rates hurt.' },
  fed: { hot: 'the Fed sounds tougher than expected', soft: 'A softer tone', NQ: 'down', BTC: 'down', EURUSD: 'down', why: 'A tougher-sounding Fed means higher rates for longer. The dollar rises and stocks and crypto usually fall. Moves can flip during the press conference.' },
  growth: { hot: 'the data comes in stronger than forecast', soft: 'A weaker number', NQ: 'mixed', BTC: 'mixed', EURUSD: 'down', why: 'Strong growth data lifts the dollar. For stocks it cuts both ways: good for profits, but it can keep rates high.' },
  cb: { hot: 'the central bank sounds tougher than expected', soft: 'A softer tone', NQ: 'mixed', BTC: 'mixed', EURUSD: 'up', why: 'A tougher central bank lifts its own currency.' },
  other: { hot: 'it surprises', soft: 'The opposite surprise', NQ: 'mixed', BTC: 'mixed', EURUSD: 'mixed', why: 'Big surprises cause fast moves. The direction depends on the details.' },
};
const TN_SYM = { futures: 'NQ', stocks: 'NQ', options: 'NQ', crypto: 'BTC', memes: 'BTC', forex: 'EURUSD' };
const TN_NAME = { NQ: 'NQ', BTC: 'Bitcoin', EURUSD: 'EUR/USD' };
const TN_ARROW = { up: '↑', down: '↓', mixed: '↕' };
function tnSyms() { const s = [...new Set(myMarkets().map(m => TN_SYM[m]).filter(Boolean))]; return s.length ? s : ['NQ']; }
function tnCcys() {
  const c = new Set(['USD']);
  myAssets().forEach(a => (a.ccy || []).forEach(x => c.add(x)));
  if (tnSyms().includes('EURUSD')) c.add('EUR');
  return c;
}
function tnDays(events) {
  const today = nyParts().date, out = [];
  for (let i = 0; out.length < 5 && i < 10; i++) { const d = addDay(today, i), w = ymd(d).getUTCDay(); if (w > 0 && w < 6) out.push(d); }
  const hi = events.length ? nyParts(events[events.length - 1].time).date : today;
  return out.map(d => ({ date: d, known: d <= hi }));
}
function tnRead(date, events, earn) {
  const ccy = tnCcys(), now = Date.now();
  const evs = events.filter(e => nyParts(e.time).date === date && ccy.has(e.country));
  const holiday = evs.find(e => e.impact === 'Holiday' && e.country === 'USD' && /holiday/i.test(e.title));
  const high = evs.filter(e => e.impact === 'High' && !e.allDay && !TN_NOTREL.test(e.title));
  const med = evs.filter(e => e.impact === 'Medium' && !e.allDay && !TN_NOTREL.test(e.title));
  const major = high.filter(e => TN_MAJOR.test(e.title + ' ' + (e.name || '')));
  const reps = ((earn && earn.days || []).find(d => d.date === date) || { rows: [] }).rows.filter(r => r.weight);
  let level, word, line;
  if (holiday && !high.length) { level = 0; word = 'Holiday'; line = 'US markets are closed or thin. Moves on low volume can be misleading.'; }
  else if (major.length) { level = 3; word = 'Big news day'; line = `${major.map(e => e.name || e.title).filter((v, i, a) => a.indexOf(v) === i).slice(0, 2).join(' and ')} can swing everything. Many traders sit out the release and trade the reaction after.`; }
  else if (high.length || reps.length) { level = 2; word = 'Trade with care'; line = high.length ? `${high.length === 1 ? 'One release' : high.length + ' releases'} can move prices fast. Be flat or careful around ${high.length === 1 ? 'it' : 'them'}, then trade as normal.` : `No big data, but ${reps.map(r => coName(r.name)).slice(0, 2).join(' and ')} report${reps.length === 1 ? 's' : ''}. That can move NQ outside regular hours.`; }
  else { level = 1; word = 'Normal day'; line = med.length ? 'Only smaller releases. News probably won’t be the main driver, so price action and your levels matter more.' : 'Nothing big on the calendar. News probably won’t drive the day.'; }
  // Risk windows: 20 minutes before to 10 minutes after each big release, merged
  const wins = [];
  high.forEach(e => { const a = e.time - 20 * 60e3, b = e.time + 10 * 60e3, last = wins[wins.length - 1];
    if (last && a <= last.b) { last.b = Math.max(last.b, b); last.names.push(e.name || e.title); } else wins.push({ a, b, t: e.time, names: [e.name || e.title] }); });
  wins.forEach(w => { w.names = [...new Set(w.names)]; w.past = w.b < now; w.live = w.a <= now && now <= w.b; });
  const done = date === nyParts().date && wins.length && wins.every(w => w.past);
  // Impact per market from the biggest release that day
  const lead = (major[0] || high[0]);
  const kind = lead ? tnKind(lead.title + ' ' + (lead.name || '')) : null;
  const sx = kind ? TN_SURPRISE[kind] : null;
  const impact = tnSyms().map(sym => {
    if (!lead) return { sym, size: reps.length && sym === 'NQ' ? 'Evening' : 'Small', text: reps.length && sym === 'NQ' ? `Watch the evening session: ${reps.map(r => r.symbol).join(', ')} report.` : 'No scheduled release likely to move it much.' };
    const d = sx[sym];
    return { sym, size: level === 3 ? 'Large' : 'Medium', dir: d, text: d === 'mixed' ? `Can go either way at ${fmtTime(lead.time)}. Wait for the first reaction.` : `If ${sx.hot}, ${TN_NAME[sym]} usually ${d === 'up' ? 'rises' : 'falls'}. ${sx.soft} usually does the opposite.` };
  });
  return { date, evs, high, med, major, reps, holiday, level, word, line, wins, done, lead, kind, sx, impact };
}
function tnExplain(r) {
  const why = [];
  if (r.level === 3) why.push(`It’s rated a big news day because ${r.major.length === 1 ? (r.major[0].name || r.major[0].title) + ' is' : 'these are'} among the releases that move markets most each month.`);
  else if (r.level === 2) why.push(r.high.length ? `It’s rated “trade with care” because there ${r.high.length === 1 ? 'is a high-impact release' : `are ${r.high.length} high-impact releases`} in the currencies you trade, but none of the very biggest ones.` : 'There’s no big data, but large companies report results.');
  else if (r.level === 1) why.push(`Nothing high-impact in the currencies you trade${r.med.length ? `, only ${r.med.length} smaller release${r.med.length === 1 ? '' : 's'}` : ''}.`);
  if (r.sx) why.push(r.sx.why);
  if (r.wins.length) why.push('The risk windows run from 20 minutes before to 10 minutes after each release. Spreads widen and price can spike both ways before it picks a direction.');
  const rows = [...r.high, ...r.med].sort((a, b) => a.time - b.time).map(e => { const fy = forYouEvent(e);
    return `<li class="tn-ev"><span class="tn-et">${e.allDay ? 'All day' : fmtTime(e.time)}</span><div><p class="tn-en"><b>${esc(e.name || e.title)}</b> <span class="tn-imp ${e.impact === 'High' ? 'hi' : ''}">${e.impact === 'High' ? 'High impact' : 'Medium'}</span> <span class="faint">${esc(e.country)}</span></p>${e.what ? `<p>${esc(e.what)}</p>` : ''}${e.why ? `<p>${esc(e.why)}</p>` : ''}${e.forecast ? `<p class="faint">Forecast ${esc(e.forecast)}${e.previous ? `, last time ${esc(String(e.previous).split('|')[0])}` : ''}.</p>` : ''}${fy ? `<p class="tn-fy"><b>For you:</b> ${esc(fy)}</p>` : ''}</div></li>`; }).join('');
  const er = r.reps.map(x => `<li class="tn-ev"><span class="tn-et">${x.when === 'before' ? 'Pre-market' : x.when === 'after' ? 'After close' : 'TBA'}</span><div><p class="tn-en"><b>${esc(coName(x.name))} earnings</b> <span class="faint">${esc(x.symbol)}</span></p><p>About ${x.weight}% of the Nasdaq 100, so a big move in the stock shows up in NQ.</p></div></li>`).join('');
  return `<div class="tn-why">${why.map(w => `<p>${esc(w)}</p>`).join('')}</div>${rows || er ? `<ul class="tn-evs">${rows}${er}</ul>` : ''}<p class="tn-foot">This is context to help you plan, not financial advice.</p>`;
}
function tnHTML(cal, earn, sel) {
  const days = tnDays(cal.events);
  if (!sel || !days.some(d => d.date === sel)) sel = days[0].date;
  const reads = Object.fromEntries(days.filter(d => d.known).map(d => [d.date, tnRead(d.date, cal.events, earn)]));
  const r = reads[sel], today = nyParts().date;
  const lab = d => d === today ? 'Today' : d === addDay(today, 1) ? 'Tomorrow' : dayFmt(d, { weekday: 'short' });
  const strip = days.map(d => { const x = reads[d.date];
    return `<button type="button" class="tn-day lv${x ? x.level : 'u'}" data-tn="${d.date}" aria-pressed="${d.date === sel}"><span class="tn-dl">${esc(lab(d.date))}<small>${esc(dayFmt(d.date, { month: 'short', day: 'numeric' }))}</small></span><span class="tn-dw"><i></i>${x ? esc(x.word) : 'Not out yet'}</span>${x ? `<span class="tn-dv">${['Low', 'Low', 'Medium', 'High'][x.level]} volatility</span>` : ''}</button>`; }).join('');
  if (!r) return `<div class="tn-strip">${strip}</div><p class="tn-line">That day’s calendar isn’t out yet. It usually appears over the weekend.</p>`;
  const wins = r.wins.map(w => `<span class="tn-win${w.past ? ' past' : ''}${w.live ? ' tn-now' : ''}"><b>${fmtTime(w.a)} – ${fmtTime(w.b)}</b><small>${esc(w.names.slice(0, 2).join(', '))}</small></span>`).join('');
  return `<div class="tn-strip" role="group" aria-label="Pick a day">${strip}</div>
    <div class="tn-body lv${r.level}">
      <div class="tn-top"><p class="tn-verdict"><i></i>${esc(r.word)}<span class="tn-vol" title="Expected volatility from scheduled news"><span class="tn-vb">${[1, 2, 3].map(n => `<b class="${n <= Math.max(1, r.level) ? 'on' : ''}"></b>`).join('')}</span>${['Low', 'Low', 'Medium', 'High'][r.level]} volatility</span></p><button type="button" class="tn-x" id="tnX" aria-expanded="false">Explain</button></div>
      <p class="tn-line">${r.done ? `The big releases are done for today. The rest of the day is usually calmer, though the move can keep going.` : esc(r.line)}</p>
      ${wins ? `<div class="tn-wins"><span class="tn-k">Risk windows</span>${wins}</div>` : ''}
      <div class="tn-imps">${r.impact.map(m => `<div class="tn-imp-c"><p class="tn-k">${esc(TN_NAME[m.sym])}${m.dir ? ` <span class="tn-arr ${m.dir}">${TN_ARROW[m.dir]}</span>` : ''}</p><p class="tn-sz">${esc(m.size)} move expected</p><p>${esc(m.text)}</p></div>`).join('')}</div>
      <div class="tn-more" id="tnMore" hidden>${tnExplain(r)}</div>
    </div>`;
}
function mountTradeNews(id, opts = {}) {
  let sel = opts.sel || null, cal = null, earn = null;
  const draw = () => { const box = document.getElementById(id); if (!box || !cal) return;
    const open = !!(box.querySelector('#tnMore') && !box.querySelector('#tnMore').hidden);
    box.innerHTML = `<div class="tn-head"><h2 class="sec">Trade the news?</h2><span class="tn-sub">For ${esc(tnSyms().map(x => TN_NAME[x]).join(', '))}</span></div>` + tnHTML(cal, earn, sel);
    const on = box.querySelector('.tn-day[aria-pressed="true"]'), st = box.querySelector('.tn-strip'); if (on && st && st.scrollWidth > st.clientWidth) st.scrollLeft = on.offsetLeft - st.offsetLeft - 16;
    { const lv = ((box.querySelector('.tn-body') || {}).className || '').match(/lv\d/); box.classList.remove('lv0', 'lv1', 'lv2', 'lv3'); box.classList.add('tn-tint'); if (lv) box.classList.add(lv[0]); }
    box.querySelectorAll('[data-tn]').forEach(b => b.onclick = () => { sel = b.dataset.tn; draw(); if (opts.onPick) opts.onPick(sel); });
    const x = box.querySelector('#tnX'), more = box.querySelector('#tnMore');
    if (x && more) { const set = o => { more.hidden = !o; x.setAttribute('aria-expanded', o); x.textContent = o ? 'Hide' : 'Explain'; }; set(open); x.onclick = () => set(more.hidden); }
  };
  api('calendar', 10 * 60e3).then(d => { cal = d; draw(); api('earnings', 15 * 60e3).then(e => { earn = e; draw(); }).catch(() => {}); }).catch(() => { const box = document.getElementById(id); if (box) box.hidden = true; });
  return { setSel: d => { if (d === sel) return; sel = d; draw(); } };
}

// One line on the News page: today's (or the next trading day's) news risk, linking to the full read on the Calendar
function mountTradeSlim(id) {
  Promise.all([api('calendar', 10 * 60e3), api('earnings', 15 * 60e3).catch(() => null)]).then(([cal, earn]) => {
    const el = document.getElementById(id); if (!el) return;
    const d = tnDays(cal.events)[0]; if (!d || !d.known) return;
    const r = tnRead(d.date, cal.events, earn), today = nyParts().date;
    const when = d.date === today ? 'Today' : d.date === addDay(today, 1) ? 'Tomorrow' : dayFmt(d.date, { weekday: 'long' });
    const w = r.wins.find(x => !x.past);
    const tail = r.done ? 'Big releases are done for today' : w ? `Careful ${fmtTime(w.a)}–${fmtTime(w.b)} (${w.names[0]})` : r.reps.length ? `${r.reps.map(x => x.symbol).slice(0, 2).join(', ')} report${r.reps.length === 1 ? 's' : ''}` : 'No big releases';
    el.className = 'tn-slim lv' + r.level; el.hidden = false;
    el.innerHTML = `<i></i><span class="tn-s-w"><span class="faint">${esc(when)}:</span> <b>${esc(r.word)}</b></span><span class="tn-s-v">${['Low', 'Low', 'Medium', 'High'][r.level]} volatility</span><span class="tn-s-t">${esc(tail)}</span><span class="tn-s-go">See the week →</span>`;
    el.onclick = e => { e.preventDefault(); CAL.sel = d.date; CAL.month = monthKey(d.date); go('/calendar'); };
  }).catch(() => {});
}
// ---------- What to expect (Today page) ----------
// Releases the market has already reacted to drop off and the next big ones take their place.
const REACTED_MS = 10 * 60e3;
function tnUpcoming(events, n = 3) {
  const ccy = tnCcys(), now = Date.now();
  const list = events.filter(e => e.impact === 'High' && !e.allDay && !TN_NOTREL.test(e.title) && ccy.has(e.country) && e.time + REACTED_MS > now).sort((a, b) => a.time - b.time);
  // Releases at the same minute are one moment for the market: show them as one row, biggest first
  const groups = [];
  list.forEach(e => { const g = groups.find(x => x.time === e.time); if (g) g.all.push(e); else groups.push({ ...e, all: [e] }); });
  groups.forEach(g => { g.all.sort((a, b) => TN_MAJOR.test(b.title + ' ' + (b.name || '')) - TN_MAJOR.test(a.title + ' ' + (a.name || ''))); const lead = g.all[0]; Object.assign(g, { title: lead.title, name: lead.name, country: lead.country }); g.also = [...new Set(g.all.slice(1).map(x => x.name || x.title))].filter(n => n !== (lead.name || lead.title)); });
  return groups.slice(0, n);
}
const leftTxt = ms => { const m = Math.max(0, Math.round(ms / 6e4)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mm = m % 60; return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`; };
function expectHTML(cal, earn) {
  const now = Date.now(), today = nyParts().date, nm = nyParts().mins;
  const days = tnDays(cal.events).filter(d => d.known);
  if (!days.length) return '';
  // Today, unless its big releases are all out or the US session is over; then the next trading day
  let day = days[0];
  if (day.date === today) { const r0 = tnRead(today, cal.events, earn); if ((r0.done && r0.level >= 2) || nm >= 16 * 60 + 15) day = days[1] || day; }
  const r = tnRead(day.date, cal.events, earn);
  const when = day.date === today ? 'Today' : day.date === addDay(today, 1) ? 'Tomorrow' : dayFmt(day.date, { weekday: 'long' });
  const done = cal.events.filter(e => e.impact === 'High' && !e.allDay && tnCcys().has(e.country) && nyParts(e.time).date === today && e.time + REACTED_MS <= now);
  const up = tnUpcoming(cal.events);
  const dLab = t => { const d = nyParts(t).date; return d === today ? 'Today' : d === addDay(today, 1) ? 'Tomorrow' : dayFmt(d, { weekday: 'short' }); };
  const upRows = up.map(e => { const k = tnKind(e.title + ' ' + (e.name || '')), sx = TN_SURPRISE[k], live = e.time - 20 * 60e3 <= now;
    return `<li class="tx-ev ${TN_MAJOR.test(e.title + ' ' + (e.name || '')) ? 'lv3' : 'lv2'}${live ? ' tx-now' : ''}"><div class="tx-when"><b>${esc(dLab(e.time))} ${fmtTime(e.time)}</b><small>${e.time > now ? 'in ' + leftTxt(e.time - now) : 'Reacting now'}</small></div>
      <div class="tx-what"><p class="tx-n">${esc(e.name || e.title)}${e.also && e.also.length ? `<span class="tx-also"> + ${esc(e.also.join(', '))}</span>` : ''} <span class="faint">${esc(e.country)}</span></p>
      <p class="tx-arrs"><span class="tx-if">If ${esc(sx.hot)}:</span>${tnSyms().map(sym => `<span>${esc(TN_NAME[sym])} <b class="tn-arr ${sx[sym]}">${TN_ARROW[sx[sym]]}</b></span>`).join('')}</p></div></li>`; }).join('');
  return `<div class="tn-head"><h2 class="sec">What to expect</h2><a class="more" href="/calendar">See the week</a></div>
    <div class="tn-body lv${r.level}">
      <div class="tn-top"><p class="tn-verdict"><i></i><span class="faint tx-day">${esc(when)}</span> ${esc(r.word)}<span class="tn-vol"><span class="tn-vb">${[1, 2, 3].map(n => `<b class="${n <= Math.max(1, r.level) ? 'on' : ''}"></b>`).join('')}</span>${['Low', 'Low', 'Medium', 'High'][r.level]} volatility</span></p><button type="button" class="tn-x" id="txX" aria-expanded="false">Explain</button></div>
      <p class="tn-line">${esc(r.line)}</p>
      ${up.length ? `<p class="tn-k tx-k">Next big releases</p><ul class="tx-list">${upRows}</ul>` : `<p class="tn-line faint">No more big releases on the calendar this week.</p>`}
      ${done.length ? `<p class="tx-done"><span class="tx-check">✓</span>Already out today and priced in: ${esc([...new Set(done.map(e => `${e.name || e.title} (${fmtTime(e.time)})`))].join(', '))}. The market has reacted, so these are off the list.</p>` : ''}
      <div class="tn-more" id="txMore" hidden>${tnExplain(r)}</div>
    </div>`;
}
function mountExpect(id) {
  let cal = null, earn = null, t = null;
  const draw = () => { const box = document.getElementById(id); if (!box) { clearInterval(t); return; } if (!cal) return;
    const open = !!(box.querySelector('#txMore') && !box.querySelector('#txMore').hidden);
    const html = expectHTML(cal, earn); box.hidden = !html; box.innerHTML = html;
    const lv = (box.querySelector('.tn-body') || {}).className || ''; box.className = 'tn tn-today t-expect tn-tint ' + ((lv.match(/lv\d/) || [''])[0]);
    const x = box.querySelector('#txX'), more = box.querySelector('#txMore');
    if (x && more) { const set = o => { more.hidden = !o; x.setAttribute('aria-expanded', o); x.textContent = o ? 'Hide' : 'Explain'; }; set(open); x.onclick = () => set(more.hidden); }
  };
  api('calendar', 10 * 60e3).then(d => { cal = d; draw(); api('earnings', 15 * 60e3).then(e => { earn = e; draw(); }).catch(() => {}); }).catch(() => {});
  // Re-check every minute so releases drop off once the market has reacted
  t = setInterval(() => { if (document.visibilityState === 'visible') draw(); }, 60e3);
}

PAGES.news = () => {
  const f = store.get('newsFilter', { market: 'all', impact: 'matters', topic: '', mine: true });
  if (f.impact === 'medium' || (f.impact === 'all' && !f.v2)) { f.impact = 'matters'; f.v2 = 1; }
  const wasRefresh = refreshing;
  layout(`<h1 class="page-h">News</h1>
    <p class="page-intro">The stories moving markets right now, from <span id="srcCount">dozens of</span> sources. Stories that touch your markets have a blue line.</p>
    <div class="chips" role="group" aria-label="Market"><span class="chips-label">Market</span>${[['all', 'Everything'], ['futures', 'Stocks and futures'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['memes', 'Memecoins']].map(([k, l]) => `<button class="chip" data-mk="${k}" aria-pressed="${f.market === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Topic"><span class="chips-label">Topic</span><button class="chip" data-tp="" aria-pressed="${!f.topic}">All topics</button>${Object.entries(SECTION_NAMES).map(([k, l]) => `<button class="chip" data-tp="${k}" aria-pressed="${f.topic === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Show"><span class="chips-label">Show</span>${[['matters', 'Market-moving'], ['high', 'Big stories only'], ['all', 'Everything']].map(([k, l]) => `<button class="chip" data-im="${k}" aria-pressed="${f.impact === k}">${l}</button>`).join('')}<button class="chip" id="mineFirst" aria-pressed="${f.mine}">My markets first</button></div>
    ${shellHTML({ noChart: true, left: '<a class="tn-slim" id="tradeNews" href="/calendar" hidden></a><div class="newbar" id="newBar" hidden></div><div class="newsroom" id="wireList"></div><p class="stale-note" id="staleNote" hidden></p>' })}`);
  startNow();
  mountTradeSlim('tradeNews');
  const rer = () => { store.set('newsFilter', f); refreshing = false; PAGES.news(); };
  main.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { f.market = b.dataset.mk; rer(); });
  main.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { f.topic = b.dataset.tp; rer(); });
  main.querySelectorAll('[data-im]').forEach(b => b.onclick = () => { f.impact = b.dataset.im; rer(); });
  $('#mineFirst').onclick = () => { f.mine = !f.mine; rer(); };
  const P = api('wire?section=' + f.market, 25e3);
  P.then(d => {
    const sc = $('#srcCount'); if (sc) sc.textContent = d.sources;
    const seen = store.get('newsSeen', []);
    const fresh = d.items.filter(i => !seen.includes(i.id)).length;
    if (wasRefresh && fresh && seen.length) { const nb = $('#newBar'); if (nb) { nb.hidden = false; nb.textContent = `${fresh} new ${fresh === 1 ? 'story' : 'stories'} added`; } }
    store.set('newsSeen', d.items.map(i => i.id).slice(0, 150));
  }).catch(() => {});
  const shut = !['crypto', 'memes'].includes(f.market) && allShut(f.market === 'all' ? myMarkets() : [f.market]);
  if (shut) {
    const who = f.market === 'all' ? (myMarkets().length > 1 ? 'Your markets are' : `The ${SHUT_NAME[myMarkets()[0]] || ''} market is`) : f.market === 'futures' ? 'The stock and futures market is' : 'The forex market is';
    const day = new Date(shut).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long' });
    const nb = document.createElement('div'); nb.className = 'closed closed-note';
    nb.innerHTML = `<p class="closed-h"><span class="closed-dot"></span>${esc(who)} closed for the weekend.</p><p>Reopens ${esc(day)} at ${fmtTime(shut)} ${tzAbbr(shut)}. Prices won’t react to these stories until then, so anything big here can show up as a gap at the open.</p>`;
    const wl = $('#wireList'); if (wl && !main.querySelector('.closed-note')) wl.before(nb);
  }
  fill('wireList', 'the news', P, d => {
    const u = usefulOnly(d.items, f.market === 'all' ? myMarkets() : [f.market]), sn = $('#staleNote');
    if (sn) { sn.hidden = !u.hidden; sn.textContent = u.hidden ? `${u.hidden} older ${u.hidden === 1 ? 'story is' : 'stories are'} hidden: more than 12 hours old and your market has already traded through ${u.hidden === 1 ? 'it' : 'them'}.` : ''; }
    let items = u.keep.filter(i => f.impact === 'all' || (f.impact === 'high' ? i.impact === 'high' && !i.noise : matters(i))).filter(i => !f.topic || i.section === f.topic);
    const quiet = f.impact === 'all' ? 0 : u.keep.filter(i => !(f.impact === 'high' ? i.impact === 'high' && !i.noise : matters(i))).length;
    const staleTxt = sn ? sn.textContent : '';
    const ranked = f.mine ? rankStories(items) : [...items].sort((a, b) => (b.score || 0) - (a.score || 0));
    const capN = f.impact === 'all' ? 0 : 10;
    if (sn) {
      const bits = [];
      if (capN && items.length > capN) bits.push(`${items.length - capN} more market-moving`);
      if (quiet > 0) bits.push(`${quiet} that don’t move markets`);
      const txt = [capN && items.length > capN ? `Showing the ${capN} stories that matter most.` : '', bits.length ? `${bits.join(' and ')} are under “Everything”.` : '', staleTxt].filter(Boolean).join(' ');
      sn.hidden = !txt; sn.textContent = txt;
    }
    return newsroomHTML(items, ranked, f.mine, capN);
  }).then(() => P.then(d => bindExplain($('#wireList') || main, d.items)).catch(() => {}));
};

// ---------- Markets ----------
function giantsHTML(g, limit = 12) {
  const rows = g.slice(0, limit), mx = Math.max(1, ...rows.map(x => Math.abs(x.nqPts || 0)));
  return `<div class="gbar">${rows.map(x => { const w = Math.abs(x.nqPts || 0) / mx * 50, up = (x.nqPts || 0) >= 0; return `<div class="gb"><span><b>${esc(x.name)}</b><small>${chg(x.pct)}</small></span><span class="bar"><i class="${up ? 'up' : 'down'}" style="${up ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}"></i></span><span class="v ${up ? 'up' : 'down'}">${up ? '+' : '−'}${Math.abs(x.nqPts || 0).toFixed(1)} pts</span></div>`; }).join('')}</div>`;
}
function sectorsHTML(s) {
  const mx = Math.max(0.2, ...s.map(x => Math.abs(x.pct)));
  return `<div class="gbar">${s.map(x => { const w = Math.abs(x.pct) / mx * 50, up = x.pct >= 0; return `<div class="gb"><span>${esc(x.name)}</span><span class="bar"><i class="${up ? 'up' : 'down'}" style="${up ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}"></i></span><span class="v ${up ? 'up' : 'down'}">${up ? '+' : '−'}${Math.abs(x.pct).toFixed(2)}%</span></div>`; }).join('')}</div>`;
}
PAGES.markets = () => {
  if (!layout(`<h1 class="page-h">Markets</h1>
    <p class="page-intro">Prices across the world’s main markets, what’s driving US stocks, and heatmaps. Your markets are highlighted.</p>
    <div id="world"></div>
    <div class="grid2 block">
      <section><h2 class="sec">What’s driving US stocks</h2><p class="muted" id="mvIntro"></p><div id="giants"></div></section>
      <section><h2 class="sec">Sectors today</h2><div id="sectors"></div></section>
    </div>
    <a class="hm-link block" href="/heatmaps"><span><b>Heatmaps</b><small>See the whole S&amp;P 500, Nasdaq 100, crypto, currencies and ETFs at a glance.</small></span><span aria-hidden="true">→</span></a>`)) return;
  fill('world', 'world markets', api('world', 120e3), d => worldHTML(d) + stamp(d));
  const mv = api('movers', 2 * 60e3);
  fill('mvIntro', 'summary', mv, x => esc(x.lines.slice(0, 2).join(' ')));
  fill('giants', 'the biggest stocks', mv, x => `<p class="small faint">How many Nasdaq 100 points each of the biggest companies is adding or taking away, based on approximate index weights.</p>` + giantsHTML(x.giants));
  fill('sectors', 'sectors', mv, x => sectorsHTML(x.sectors));
};

// ---------- Heatmaps ----------
const HM_TF = [['d', 'Today'], ['w', 'Week'], ['m', 'Month'], ['y', 'This year']];
const HM_COLOR = { d: 'change', w: 'Perf.W', m: 'Perf.1M', y: 'Perf.YTD' };
const HM_BASE = { exchanges: [], locale: 'en', hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%' };
const HEATMAPS = [
  { id: 'ndx', label: 'Nasdaq 100', kind: 'stock-heatmap', cfg: tf => ({ dataSource: 'NASDAQ100', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: HM_COLOR[tf] }), about: 'The 100 biggest non-financial companies on the Nasdaq. This is what NQ and MNQ track, so the biggest boxes here move your chart the most.' },
  { id: 'spx', label: 'S&P 500', kind: 'stock-heatmap', cfg: tf => ({ dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: HM_COLOR[tf] }), about: 'The 500 biggest US companies, grouped by sector. This is what ES and MES track.' },
  { id: 'crypto', label: 'Crypto', kind: 'crypto-coins-heatmap', cfg: tf => ({ dataSource: 'Crypto', blockSize: 'market_cap_calc', blockColor: tf === 'd' ? '24h_close_change|5' : HM_COLOR[tf] }), about: 'The biggest coins sized by market value. When Bitcoin and Ethereum are the same color as almost everything else, the whole market is moving together.' },
  { id: 'fx', label: 'Currencies', kind: 'forex-heat-map', tfFixed: true, cfg: () => ({ currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'], isTransparent: true }), about: 'Each square is one currency against another for today. Read across a row: a row that is mostly green means that currency is strong against everything.' },
  { id: 'etf', label: 'ETFs', kind: 'etf-heatmap', cfg: tf => ({ dataSource: 'AllUSEtf', grouping: 'asset_class', blockSize: 'aum', blockColor: HM_COLOR[tf] }), about: 'US funds grouped by what they hold: stocks, bonds, commodities and currencies. Useful for seeing where money is going across the whole market.' },
];
function hmDefault() {
  const ids = myAssets().map(a => a.id), mk = myMarkets();
  if (ids.some(i => ['ES', 'MES', 'SPX', 'SPY'].includes(i)) && !ids.some(i => ['NQ', 'MNQ', 'NDX', 'QQQ'].includes(i))) return 'spx';
  if (mk.some(m => ['stocks', 'futures', 'options'].includes(m))) return mk.includes('stocks') && !mk.includes('futures') ? 'spx' : 'ndx';
  if (mk.includes('crypto') || mk.includes('memes')) return 'crypto';
  if (mk.includes('forex')) return 'fx';
  return 'spx';
}
PAGES.heatmaps = () => {
  const st = store.get('hm', {});
  const pickId = HEATMAPS.some(h => h.id === st.map) ? st.map : hmDefault();
  const tf = HM_COLOR[st.tf] ? st.tf : 'd';
  const h = HEATMAPS.find(x => x.id === pickId);
  const shut = h.id !== 'crypto' && marketShut(h.id === 'fx' ? 'forex' : 'stocks');
  if (!layout(`<h1 class="page-h">Heatmaps</h1>
    <p class="page-intro">The whole market on one screen. Each box is a company, coin or currency. Bigger boxes are bigger, green is up and red is down.</p>
    <div class="chips" role="group" aria-label="Market"><span class="chips-label">Map</span>${HEATMAPS.map(x => `<button class="chip" data-map="${x.id}" aria-pressed="${x.id === pickId}">${x.label}</button>`).join('')}</div>
    ${h.tfFixed ? '' : `<div class="chips" role="group" aria-label="Time frame"><span class="chips-label">Change over</span>${HM_TF.map(([k, l]) => `<button class="chip" data-tf="${k}" aria-pressed="${k === tf}">${l}</button>`).join('')}</div>`}
    <p class="hm-about">${esc(h.about)}${shut && tf === 'd' ? ' The market is closed, so this shows the last session.' : ''}</p>
    <div id="hmMap" class="tvbox hm-box"></div>
    <div class="grid2 block hm-read">
      <section><h2 class="sec">What the map is saying</h2><div id="hmSay"></div></section>
      <section><h2 class="sec">How to read it</h2><ul class="hm-tips">
        <li><b>Look at the biggest boxes first.</b> A handful of giant companies move the index more than hundreds of small ones.</li>
        <li><b>Index green, most boxes red?</b> Only a few giants are holding it up. Moves like that are fragile and can reverse.</li>
        <li><b>One sector a different color from the rest?</b> Money is rotating. Check the news for that sector.</li>
        <li><b>Everything the same color?</b> A big-picture driver like rates, the dollar or a headline is moving the whole market.</li>
      </ul></section>
    </div>`)) return;
  const save = (k, v) => { store.set('hm', { ...store.get('hm', {}), map: pickId, tf, [k]: v }); refreshing = false; PAGES.heatmaps(); };
  main.querySelectorAll('[data-map]').forEach(b => b.onclick = () => save('map', b.dataset.map));
  main.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => save('tf', b.dataset.tf));
  const tall = Math.round((innerWidth < 640 ? 460 : 640) * remScale());
  tvWidget('hmMap', h.kind, { ...HM_BASE, ...h.cfg(tf), colorTheme: tvTheme() }, h.id === 'fx' ? Math.round((innerWidth < 640 ? 360 : 460) * remScale()) : tall);
  if (h.id === 'ndx' || h.id === 'spx' || h.id === 'etf') {
    const mv = api('movers', 2 * 60e3);
    fill('hmSay', 'the summary', mv, x => {
      const sec = [...(x.sectors || [])].sort((a, b) => b.pct - a.pct);
      const lead = sec.slice(0, 2).map(z => z.name).join(' and '), lag = sec.slice(-2).reverse().map(z => z.name).join(' and ');
      const up = sec.filter(z => z.pct > 0).length;
      return `<p class="muted">${esc(x.lines.slice(0, 2).join(' '))}</p>
        ${sec.length ? `<p class="muted">${up} of ${sec.length} sectors ${shut ? 'finished up in the last session' : `are up${tf !== 'd' ? ' today' : ''}`}. Leading: ${esc(lead)}. Lagging: ${esc(lag)}.</p>` : ''}
        ${h.id === 'ndx' && x.giants ? `<p class="small faint">Points each giant ${shut ? 'added to or took off the Nasdaq 100 in the last session' : 'is adding to or taking off the Nasdaq 100 today'}:</p>${giantsHTML(x.giants, 8)}` : ''}`;
    });
  } else if (h.id === 'crypto') {
    fill('hmSay', 'the summary', api('crypto', 2 * 60e3).catch(() => null), d => {
      const list = d && (d.coins || d.top || d.list) || [];
      const ch = c => c.ch24 ?? c.change24h ?? c.price_change_percentage_24h ?? c.pct;
      const valid = list.filter(c => ch(c) != null && !/^(usdt|usdc|dai|usde|fdusd)$/i.test(c.symbol || '') && !/wrapped|staked/i.test(c.name || ''));
      if (!valid.length) return '<p class="muted">Crypto trades around the clock, so this map is always live.</p>';
      const up = valid.filter(c => ch(c) > 0).length, btc = valid.find(c => /^btc$/i.test(c.symbol || ''));
      return `<p class="muted">${up} of the ${valid.length} biggest coins are up over the last 24 hours${btc ? `, and Bitcoin is ${ch(btc) >= 0 ? 'up' : 'down'} ${Math.abs(ch(btc)).toFixed(1)}%` : ''}. ${up > valid.length * 0.7 ? 'A broad move: most coins are rising together.' : up < valid.length * 0.3 ? 'A broad sell-off: most coins are falling together.' : 'A mixed market: coins are moving on their own stories.'}</p>`;
    });
  } else {
    fill('hmSay', 'the summary', api('world', 120e3), d => {
      const fx = (d.groups || []).find(g => /currenc/i.test(g.name));
      const dxy = fx && fx.rows.find(r => /dollar index/i.test(r.label));
      return `<p class="muted">${dxy && dxy.pct != null ? `The US dollar index is ${dxy.pct >= 0 ? 'up' : 'down'} ${Math.abs(dxy.pct).toFixed(2)}% today, so look for the USD row to be mostly ${dxy.pct >= 0 ? 'green' : 'red'}. ` : ''}Find the strongest row and the weakest row: pairing those two currencies is usually where the cleanest trend of the day is.</p>`;
    });
  }
};

// ---------- levels and session recaps (shown to traders who use them) ----------
function ladder(table, price, dp, fmt = v => num(v, dp), adr = null) {
  const near = adr ? adr * 0.08 : Math.abs(price) * 0.0008;
  let placed = false, h = '';
  for (const r of table) {
    if (!placed && price >= r.value) { h += `<div class="lrow price"><span>Price now</span><span>${fmt(price)}</span></div>`; placed = true; }
    h += `<div class="lrow${Math.abs(r.value - price) <= near ? ' near' : ''}"><span>${esc(r.label)}<small>${esc(r.hint)}</small></span><span>${fmt(r.value)}</span></div>`;
  }
  if (!placed) h += `<div class="lrow price"><span>Price now</span><span>${fmt(price)}</span></div>`;
  return `<div class="ladder"><p>Levels traders are watching, highest first. Highlighted levels are close to the price.</p>${h}</div>`;
}
function leaderBlock(L, fmt) {
  return `<article class="leader"><div><div class="leader-h"><h3>${esc(L.name)}</h3><span class="big">${fmt ? fmt(L.price) : num(L.price, L.dp)}</span>${chg(L.changePct)}</div>
    <ul class="notes">${L.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>${ladder(L.table, L.price, L.dp, fmt, L.levels && L.levels.adr)}</article>`;
}
const RECAP_NAMES = { NQ: 'Nasdaq futures', ES: 'S&P futures', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', GOLD: 'Gold', BTC: 'Bitcoin' };
function recapHTML(d) {
  const cards = d.sessions.map(s => `<div class="rc ${s.status}"><h4>${esc(s.label)}<span>${s.status === 'live' ? 'Now' : s.status === 'done' ? 'Done' : s.status === 'upcoming' ? 'Later' : 'No data'}</span></h4><p>${esc(s.text)}</p></div>`).join('');
  const tl = d.timeline.filter(t => t.kind !== 'session');
  return `<div class="rc-grid">${cards}</div>${tl.length ? `<ol class="tl">${tl.map(t => `<li><span class="tt">${fmtTime(t.t)}</span><div><b>${esc(t.text)}</b>${t.sub ? `<div class="tc">${esc(t.sub)}</div>` : ''}${t.cause ? `<div class="tc">${esc(t.cause)}</div>` : ''}${(t.news || []).map(n => `<a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)} <span class="faint">${esc(n.source)}</span></a>`).join('')}</div></li>`).join('')}</ol>` : ''}${stamp(d)}`;
}
function recapSection(boxId, pickId, keys) {
  const pick = document.getElementById(pickId), box = document.getElementById(boxId); if (!pick || !box) return;
  const cur = store.get('recap:' + boxId, keys[0]), first = keys.includes(cur) ? cur : keys[0];
  pick.innerHTML = keys.length > 1 ? keys.map(k => `<button class="chip" data-k="${k}" aria-pressed="${k === first}">${esc(RECAP_NAMES[k] || k)}</button>`).join('') : '';
  const load = k => { box.innerHTML = ''; fill(box, 'the session recap', api('recap?sym=' + k, 3 * 60e3), recapHTML); };
  pick.querySelectorAll('button').forEach(b => b.onclick = () => { pick.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); store.set('recap:' + boxId, b.dataset.k); load(b.dataset.k); });
  load(first);
}
const recapBlock = (id, title = 'How today has played out') => intraday() || levelTrader() ? `<section class="block"><div class="chart-h"><h2 class="sec">${title}</h2><div class="chips tight" id="${id}Pick"></div></div><div id="${id}"></div></section>` : '';
const chartBlock = id => `<section class="block"><div class="chart-h"><h2 class="sec">Live chart</h2><div class="chips tight" id="${id}Pick"></div></div><div id="${id}" class="tvbox"></div></section>`;
const newsBlock = (id, title) => `<section class="block"><div class="sec-row"><h2 class="sec">${title}</h2><a href="/news">All news</a></div><ul class="slist" id="${id}"></ul></section>`;
// Still useful? Under 12 hours old, or the reader's market hasn't traded since it broke (weekend news still waiting for the open)
const WEEKEND_H = { futures: 49, stocks: 49, options: 49, forex: 48 };
function stillUseful(i, mkts) {
  if (!i.time || Date.now() - i.time <= 12 * 36e5) return true;
  if (Date.now() - i.time > 3 * 864e5) return false;
  return (mkts.length ? mkts : ['futures']).some(m => { const r = marketShut(m); return r != null && i.time > r - (WEEKEND_H[m] || 49) * 36e5; });
}
function usefulOnly(items, mkts) { const keep = items.filter(i => stillUseful(i, mkts)); return { keep, hidden: items.length - keep.length }; }
function marketNews(id, section, n = 8) { fill(id, 'news', api('wire?section=' + section, 60e3), d => storyList(rankStories(usefulOnly(d.items, [section]).keep).slice(0, n), { notes: 3 }) || '<li class="empty">No fresh stories right now.</li>'); }

// ---------- Stocks & futures ----------
PAGES.futures = () => {
  const lv = levelTrader();
  const mkF = myMarkets();
  const fb = marketBriefing('futBrief', !mkF.includes('futures') && mkF.includes('stocks') ? 'stocks' : 'futures', 'stocks and futures');
  if (layout(`<div class="today-head"><h1 class="page-h">Stocks and futures</h1>
    <p class="page-intro" id="futIntro"></p></div>
    ${shellHTML({ chartId: 'futChart', sessKey: 'futures', pulseKey: 'NQ', left: fb.brief + tabset('fut', [
      ['next', 'What’s next', fb.next], ['play', 'Your game plan', fb.play],
      ['prices', 'Prices', '<div id="futQuotes"></div>'],
      ['levels', 'Levels', lv || recapBlock('futRecap') ? `${lv ? '<div id="futLevels"></div>' : ''}${recapBlock('futRecap')}` : ''],
      ['movers', 'Movers and calendar', '<div class="grid2"><section><h2 class="sec">What’s driving the indexes</h2><div id="futGiants"></div></section><section><h2 class="sec">US news this week</h2><div id="futCal"></div></section></div>'],
      ['news', 'More news', '<div class="tab-links"><a class="more" href="/news">All news</a></div><ul class="slist" id="futNews"></ul>']]) })}`)) {
    const mine = myAssets().filter(a => a.tv && !a.ccy && a.chain === undefined && !/^(BTC|ETH|SOL|XRP|BNB|DOGE|alts)$/.test(a.id));
    chartPicker('futChart', 'futChartPick', [...mine.map(a => ({ id: shortName(a), tv: a.tv })), { id: 'S&P 500', tv: 'OANDA:SPX500USD' }, { id: 'Nasdaq 100', tv: 'OANDA:NAS100USD' }, { id: 'Dow', tv: 'OANDA:US30USD' }, { id: 'Russell 2000', tv: 'OANDA:US2000USD' }]);
  }
  fb.load();
  startNow();
  if (intraday() || lv) recapSection('futRecap', 'futRecapPick', ['NQ', 'ES']);
  const d = api('markets?section=futures');
  fill('futIntro', 'summary', d, x => esc(x.macro.join(' ') || 'Here’s how US stocks and index futures are trading.'));
  fill('futQuotes', 'prices', api('world', 120e3), x => worldHTML({ groups: x.groups.filter(g => ['us', 'fut', 'rates', 'vol'].includes(g.id)) }) + stamp(x));
  if (lv) fill('futLevels', 'levels', d, x => x.leaders.map(L => leaderBlock(L)).join(''));
  fill('futGiants', 'the biggest stocks', api('movers', 2 * 60e3), x => `<p class="muted">${esc(x.lines.slice(0, 2).join(' '))}</p>` + giantsHTML(x.giants, 8));
  fill('futCal', 'the calendar', api('calendar', 10 * 60e3), x => {
    const ev = x.events.filter(e => e.country === 'USD' && e.impact !== 'Low' && e.time > Date.now() - 6 * 36e5).slice(0, 10);
    return ev.length ? ev.map(e => eventRow(e, true)).join('') : '<p class="empty">Nothing major coming up.</p>';
  });
  marketNews('futNews', 'futures');
};

// ---------- Forex ----------
PAGES.forex = () => {
  const lv = levelTrader();
  const fb = marketBriefing('fxBrief', 'forex', 'forex');
  if (layout(`<div class="today-head"><h1 class="page-h">Forex</h1>
    <p class="page-intro" id="fxIntro"></p></div>
    ${shellHTML({ chartId: 'fxChart', sessKey: 'forex', pulseKey: 'EURUSD', left: fb.brief + tabset('fx', [
      ['next', 'What’s next', fb.next], ['play', 'Your game plan', fb.play],
      ['strength', 'Strongest to weakest', '<div class="grid2"><section><h2 class="sec">Strongest to weakest today</h2><div id="fxStrength"></div></section><section><h2 class="sec">Pairs</h2><div class="qgrid" id="fxQuotes"></div></section></div>'],
      ['levels', 'Levels', lv || recapBlock('fxRecap') ? `${lv ? '<div id="fxLevels"></div>' : ''}${recapBlock('fxRecap')}` : ''],
      ['cal', 'Central banks', '<div id="fxCal"></div>'],
      ['news', 'Currency stories', '<div class="tab-links"><a class="more" href="/news">All news</a></div><ul class="slist" id="fxNews"></ul>']]) })}`)) {
    const mine = myAssets().filter(a => a.ccy);
    chartPicker('fxChart', 'fxChartPick', [...mine.map(a => ({ id: a.short, tv: a.tv })), { id: 'EUR/USD', tv: 'FX:EURUSD' }, { id: 'GBP/USD', tv: 'FX:GBPUSD' }, { id: 'USD/JPY', tv: 'FX:USDJPY' }, { id: 'Gold', tv: 'OANDA:XAUUSD' }]);
  }
  fb.load();
  startNow();
  if (intraday() || lv) recapSection('fxRecap', 'fxRecapPick', ['EURUSD', 'GBPUSD', 'USDJPY', 'GOLD']);
  const d = api('markets?section=forex');
  fill('fxIntro', 'summary', d, x => esc((x.strength && x.strength.length > 1 ? `The ${x.strength[0].ccy} is the strongest currency today and the ${x.strength[x.strength.length - 1].ccy} the weakest. ` : '') + x.macro.join(' ')));
  fill('fxStrength', 'currency strength', d, x => sectorsHTML((x.strength || []).map(s => ({ name: s.ccy, pct: s.score }))) + '<p class="small faint">The average move of each currency against the others today.</p>');
  fill('fxQuotes', 'pairs', d, x => [...x.leaders, ...x.quotes].filter(q => /\//.test(q.short)).map(q => qcell({ ...q, pct: q.changePct }, q.short)).join(''));
  if (lv) fill('fxLevels', 'levels', d, x => x.leaders.map(L => leaderBlock(L)).join(''));
  fill('fxCal', 'the calendar', api('calendar', 10 * 60e3), x => {
    const ev = x.events.filter(e => e.impact === 'High' && e.time > Date.now() - 6 * 36e5).slice(0, 12);
    return ev.length ? ev.map(e => eventRow(e, true)).join('') : '<p class="empty">Nothing major coming up.</p>';
  });
  marketNews('fxNews', 'forex', 10);
};

// ---------- Crypto ----------
PAGES.crypto = () => {
  const fb = marketBriefing('cBrief', 'crypto', 'crypto');
  if (layout(`<div class="today-head"><h1 class="page-h">Crypto</h1>
    <div class="page-intro" id="cIntro"></div></div>
    ${shellHTML({ chartId: 'cChart', sessKey: 'crypto', pulseKey: 'BTC', right: '<section class="card t-prices"><h2 class="sec">Crypto mood</h2><div id="cMood"></div></section>', left: fb.brief + tabset('crypto', [
      ['next', 'What’s next', fb.next], ['play', 'Your game plan', fb.play],
      ['coins', 'Biggest coins', '<div id="cCoins"></div>'],
      ['trend', 'Trending', '<div id="cTrend"></div>'],
      ['levels', 'Bitcoin levels', levelTrader() || recapBlock('cRecap') ? `${levelTrader() ? '<div id="cBtc"></div>' : ''}${recapBlock('cRecap')}` : ''],
      ['news', 'More news', '<div class="tab-links"><a class="more" href="/news">All news</a></div><ul class="slist" id="cNews"></ul>']]) })}`)) {
    const mine = myAssets().filter(a => /^(BTC|ETH|SOL|XRP|BNB|DOGE|alts)$/.test(a.id));
    chartPicker('cChart', 'cChartPick', [...mine.map(a => ({ id: a.label, tv: a.tv })), { id: 'Bitcoin', tv: 'BINANCE:BTCUSDT' }, { id: 'Ethereum', tv: 'BINANCE:ETHUSDT' }, { id: 'Solana', tv: 'BINANCE:SOLUSDT' }]);
  }
  fb.load();
  startNow();
  if (intraday() || levelTrader()) recapSection('cRecap', 'cRecapPick', ['BTC']);
  const d = api('crypto');
  fill('cIntro', 'summary', d, x => x.lines.map(l => esc(l)).join(' ') + (x.summary ? ` All crypto together is worth ${big(x.summary.mcap)}.` : ''));
  fill('cMood', 'mood', d, x => x.fear ? `<p class="lead-h" style="margin:0">${x.fear.value}<span class="muted small"> out of 100</span></p><p class="muted">${esc(x.fear.label)}. Readings near the extremes have often come near turning points.</p>` : '<p class="empty">Not available.</p>');
  if (levelTrader()) fill('cBtc', 'Bitcoin levels', d, x => x.btc ? leaderBlock({ ...x.btc, name: 'Bitcoin', dp: 0 }, v => '$' + num(v, 0)) : '');
  fill('cCoins', 'coins', d, x => `<table class="t"><thead><tr><th>Coin</th><th>Price</th><th>24h</th><th class="hide-sm">7 days</th></tr></thead><tbody>${x.coins.map(c => `<tr><td>${c.image ? `<img class="coin" src="${esc(c.image)}" alt="" loading="lazy">` : ''}${esc(c.symbol)}<small>${esc(c.name)}</small></td><td>${usd(c.price)}</td><td>${chg(c.ch24)}</td><td class="hide-sm">${spark(c.spark, 72, 20)}</td></tr>`).join('')}</tbody></table>`);
  fill('cTrend', 'trending coins', d, x => x.trending.length ? `<table class="t"><thead><tr><th>Coin</th><th>Rank</th><th>24h</th></tr></thead><tbody>${x.trending.map(c => `<tr><td>${c.image ? `<img class="coin" src="${esc(c.image)}" alt="" loading="lazy">` : ''}${esc(c.symbol)}<small>${esc(c.name)}</small></td><td>${c.rank ? '#' + c.rank : '—'}</td><td>${chg(c.ch24)}</td></tr>`).join('')}</tbody></table><p class="small faint">The most-searched coins on CoinGecko in the last day. Attention often comes before big moves in either direction.</p>` : '<p class="empty">Not available.</p>');
  marketNews('cNews', 'crypto');
};

// ---------- Memecoins ----------
const LINK_NAMES = { twitter: 'X', telegram: 'Telegram', website: 'Website', discord: 'Discord' };
const RISK_CLASS = { Extreme: 'down', 'Very high': 'warn', High: '' };
function thesisHTML(th, news) {
  if (!th) return '';
  const list = (arr, cls) => (arr || []).length ? `<ul class="${cls}">${arr.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return `<div class="thesis">
    <div class="th-sec"><h4>What it is</h4><p>${esc(th.what)}</p></div>
    <div class="th-sec"><h4>The story it rides</h4><p>${esc(th.narrative)}</p></div>
    <div class="th-sec"><h4>How it’s doing</h4><p>${esc(th.doing)}</p></div>
    ${news && news.length ? `<div class="th-sec"><h4>Latest news</h4><ul class="tnews">${news.slice(0, 3).map(n => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><small>${esc(n.source)}, ${ago(n.time)}</small></li>`).join('')}</ul></div>` : ''}
    <div class="th-cases"><div class="th-sec bull"><h4>Bull case</h4>${list(th.bull, 'th-list')}</div><div class="th-sec bear"><h4>Bear case</h4>${list(th.bear, 'th-list')}</div></div>
    <div class="th-sec"><h4>What to watch</h4><p>${esc(th.watch)}</p></div>
  </div>`;
}
function tokenCard(t, news, mine, aiThesis) {
  const th = aiThesis || t.thesis;
  const icon = t.icon || t.image;
  const links = (t.links || []).filter(l => /^https?:/.test(l.url)).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(LINK_NAMES[l.type] || l.label || 'Link')}</a>`).join('');
  const open = store.get('thesisOpen', true);
  return `<article class="tok${mine ? ' mine' : ''}">
    <div class="nm">${icon ? `<img class="coin" src="${esc(icon)}" alt="" loading="lazy">` : `<span class="ph">${esc((t.symbol || '?').slice(0, 3))}</span>`}
      <div>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)}</a>` : `<b>${esc(t.name)}</b>`}<small>${esc(t.symbol)}${t.chain ? ' · ' + esc(t.chain) : ''}</small></div>
      <div class="r"><span class="pr">${usd(t.price)}</span>${chg(t.ch24)}</div></div>
    ${th ? `<p class="th-head">${esc(th.headline)}</p><div class="th-tags"><span class="pill ${RISK_CLASS[th.risk] || ''}">Risk: ${esc(th.risk)}</span>${th.stage ? `<span class="pill">${esc(th.stage)}</span>` : ''}${th.source === 'ai' ? '<span class="pill acc">Written by AI</span>' : ''}</div>` : ''}
    <div class="stats"><span>Value<b>${big(t.mcap)}</b></span>${t.liq != null ? `<span>Liquidity<b>${big(t.liq)}</b></span><span>Volume<b>${big(t.vol24)}</b></span>` : `<span>7 days<b>${t.ch7 != null ? (t.ch7 > 0 ? '+' : '') + t.ch7.toFixed(1) + '%' : '—'}</b></span>`}</div>
    ${th ? `<details class="th-wrap"${open ? ' open' : ''}><summary>Full thesis</summary>${thesisHTML(th, news)}</details>` : ''}
    ${t.notes && t.notes.length ? `<div class="flags">${t.notes.map(n => `<span class="flag ${n.tone}">${esc(n.text)}</span>`).join('')}</div>` : ''}
    ${links ? `<div class="links">${links}</div>` : ''}
  </article>`;
}
PAGES.memes = () => {
  const fb = marketBriefing('mBrief', 'memes', 'memecoins');
  if (layout(`<div class="today-head"><h1 class="page-h">Memecoins</h1>
    <p class="page-intro">What each coin is about, the news moving memecoins, and what it means for the market you trade. Most new tokens go to zero, so read the warnings on each card.</p></div>
    <div class="mood" id="mMood"></div>
    ${shellHTML({ chartId: 'mChart', sessKey: 'crypto', pulseKey: 'BTC', left: fb.brief + tabset('memes', [
      ['next', 'What’s next', fb.next], ['play', 'Your game plan', fb.play],
      ['for', 'What it means for you', '<ul class="fyl" id="mFor"></ul><p class="small faint" id="mIntro" style="margin-top:14px"></p>'],
      ['majors', 'Established names', '<div class="tab-links"><button class="linkbtn" id="thToggle" type="button"></button></div><div class="mgrid" id="mMajors"></div>'],
      ['hot', 'Getting attention', '<p class="small faint" style="margin:0 0 14px">“Promoted” tokens are ones someone paid to put in front of buyers on DexScreener. That’s attention, not quality.</p><div class="mgrid" id="mHot"></div>']]) })}`)) chartPicker('mChart', 'mChartPick', [{ id: 'Bitcoin', tv: 'BINANCE:BTCUSDT' }, { id: 'Solana', tv: 'BINANCE:SOLUSDT' }, { id: 'Dogecoin', tv: 'BINANCE:DOGEUSDT' }, { id: 'Pepe', tv: 'BINANCE:PEPEUSDT' }]);
  const chains = myAssets().map(a => a.chain).filter(Boolean);
  const tg = $('#thToggle'); if (tg) { tg.textContent = store.get('thesisOpen', true) ? 'Collapse all theses' : 'Expand all theses'; tg.onclick = () => { const v = !store.get('thesisOpen', true); store.set('thesisOpen', v); main.querySelectorAll('.th-wrap').forEach(x => x.open = v); tg.textContent = v ? 'Collapse all theses' : 'Expand all theses'; }; }
  const d = api('memes');
  const md = api('memedesk?' + profileQuery(), 3 * 60e3);
  fill('mMood', 'the memecoin mood', md, x => `<span class="gauge ${esc(x.mood.word)}">${esc(x.mood.word)}</span><div><p>${esc(x.mood.text)}</p>${x.summary ? `<p>${esc(x.summary)}</p>` : ''}</div>`);
  fb.load();
  startNow();
  fill('mFor', 'your notes', md, x => x.forYou.length ? x.forYou.map(f => `<li><b>${esc(marketLabel(f.market))}</b>${esc(f.text)}</li>`).join('') : '<li class="empty">Add your markets in setup to see what memecoin news means for them.</li>');
  fill('mIntro', 'summary', d, x => esc(x.lines.join(' ')));
  const both = Promise.all([d, md.catch(() => ({ tokenNews: {} }))]);
  fill('mMajors', 'memecoins', both, ([x, m]) => x.majors.map(c => tokenCard(c, m.tokenNews[c.symbol], false, (m.theses || {})[c.symbol])).join('') || '<p class="empty">Not available.</p>');
  fill('mHot', 'tokens', both, ([x, m]) => { const hot = [...x.hot.filter(t => chains.includes(t.chain)), ...x.hot.filter(t => !chains.includes(t.chain))]; return hot.length ? hot.map(t => tokenCard(t, m.tokenNews[String(t.symbol).toUpperCase()], chains.includes(t.chain), (m.theses || {})[String(t.symbol).toUpperCase()])).join('') : '<p class="empty">Nothing to show right now.</p>'; });
};

// ---------- Options ----------
PAGES.options = () => {
  const fb = marketBriefing('oBrief', 'options', 'options');
  if (layout(`<div class="today-head"><h1 class="page-h">Options</h1>
    <p class="page-intro" id="oIntro"></p></div>
    ${shellHTML({ chartId: 'oChart', sessKey: 'stocks', pulseKey: 'NQ', left: fb.brief + tabset('opt', [
      ['next', 'What’s next', fb.next], ['play', 'Your game plan', fb.play],
      ['em', 'Expected move', '<div id="oEM"></div>'],
      ['vol', 'Fear gauges', '<div class="grid2"><section><h2 class="sec">Fear gauges</h2><div class="qgrid" id="oVol"></div></section><section><h2 class="sec">Expiration dates</h2><div id="oOpex"></div></section></div>'],
      ['news', 'More news', '<div class="tab-links"><a class="more" href="/news">All news</a></div><ul class="slist" id="oNews"></ul>']]) })}`)) chartPicker('oChart', 'oChartPick', [{ id: 'S&P 500', tv: 'OANDA:SPX500USD' }, { id: 'Nasdaq 100', tv: 'OANDA:NAS100USD' }]);
  fb.load();
  startNow();
  const d = api('markets?section=options');
  fill('oIntro', 'summary', d, x => esc([...(x.structure || []), ...x.macro].join(' ')));
  fill('oEM', 'expected move', d, x => x.expectedMove.length ? `<div class="em">${x.expectedMove.map(e => `<div class="em-c"><h3 class="sec" style="border:none;padding:0;margin:0">${esc(e.name)}</h3><p class="rng">± ${num(e.move, 0)} points</p><p class="muted">About ${(e.move / e.price * 100).toFixed(2)}% either way: ${num(e.price - e.move, 0)} to ${num(e.price + e.move, 0)}.</p></div>`).join('')}</div><p class="muted small">Roughly two days in three stay inside this range. Days that break well past it are unusual, and that’s often when trends start.</p>` : '<p class="empty">Not available.</p>');
  fill('oVol', 'fear gauges', d, x => x.quotes.filter(q => /VIX|VXN/.test(q.short)).map(q => qcell({ ...q, pct: q.changePct }, q.short)).join('') + '<p class="small faint" style="grid-column:1/-1">Higher means traders are paying more for protection. Under 15 is calm, over 25 is nervous.</p>');
  fill('oOpex', 'expiration dates', d, x => { const o = x.opex; if (!o) return ''; const lab = dt => new Date(dt + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return `<p class="callout"><b>${o.daysTo === 0 ? 'Today is' : 'Next is'} monthly expiration${o.next.quarterly ? ', a big quarterly one' : ''}:</b> ${lab(o.next.date)}${o.daysTo > 0 ? `, ${o.daysTo} day${o.daysTo > 1 ? 's' : ''} away` : ''}. ${o.next.quarterly ? 'Quarterly expirations bring heavy volume at the open and close.' : 'Prices often get pulled toward big round-number strikes around expiration.'}</p>
      <table class="t">${o.upcoming.slice(1).map(u => `<tr><td>${lab(u.date)}</td><td>${u.quarterly ? 'Quarterly' : 'Monthly'}</td></tr>`).join('')}</table>`; });
  marketNews('oNews', 'options');
};

// ---------- Calendar: the whole week in one table, ForexFactory style ----------
const IMP = { High: ['red', 'High impact'], Medium: ['orange', 'Medium impact'], Low: ['yellow', 'Low impact'], Holiday: ['grey', 'Holiday or non-economic'] };
const impOf = e => IMP[e.impact] ? e.impact : 'Holiday';
const FF_CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];
const weekStart = ds => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
const addDay = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ffResults = {};
function ffDayResults(date) {
  const today = nyParts().date;
  if (date > today) return Promise.resolve([]);
  const hit = ffResults[date];
  if (hit && (date < today ? true : Date.now() - hit.at < 30e3)) return hit.p;
  const p = fetch('/api/data?fn=results&date=' + date).then(r => r.ok ? r.json() : { events: [] }).then(j => j.events || []).catch(() => []);
  ffResults[date] = { p, at: Date.now() };
  return p;
}
function ffIcon(imp) { const [c, t] = IMP[imp]; return `<span class="ffi ${c}" title="${t}" aria-label="${t}"><i></i><i></i><i></i></span>`; }
// Which day the calendar is showing, and how (kept while you move around the site)
const CAL = { sel: null, mode: 'week', month: null };
const monthKey = ds => ds.slice(0, 7);
const addMonth = (mk, n) => { const d = new Date(mk + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const ymd = ds => new Date(ds + 'T12:00:00Z');
const dayFmt = (ds, o) => ymd(ds).toLocaleDateString('en-US', { timeZone: 'UTC', ...o });
const IMP_RANK = { High: 3, Medium: 2, Low: 1, Holiday: 0 };

// ---------- history chart: the last 12 official readings, this month's forecast, and last month's revision ----------
const HIST_RE = /CPI [my]\/[my]|PPI m\/m|Retail Sales m\/m|Non-Farm Employment Change|^Unemployment Rate|Average Hourly Earnings m\/m|Unemployment Claims|GDP q\/q|PCE Price Index|JOLTS Job Openings/i;
const histSlot = (e, r) => e.country === 'USD' && HIST_RE.test(e.title) ? `<div class="hist" data-hist="${esc(e.title)}" data-fc="${esc(e.forecast || (r && r.forecast) || '')}" data-act="${esc(r && r.actual || '')}"></div>` : '';
function revisionTxt(e, r) {
  if (!r || !r.actual || !e.previous || !r.previous) return '';
  const a = String(e.previous).split('|')[0].trim(), b = String(r.previous).trim();
  const na = parseFloat(a.replace(/[^\d.-]/g, '')), nb = parseFloat(b.replace(/[^\d.-]/g, ''));
  if (isNaN(na) || isNaN(nb) || na === nb) return '';
  return `Last month was revised ${nb > na ? 'up' : 'down'} from ${a} to ${b}.`;
}
function fillHist(root = document) {
  root.querySelectorAll('.hist[data-hist]:not([data-done])').forEach(el => {
    if (!el.parentElement || !el.parentElement.offsetParent) return; // only when it's on screen (an open row or the release room)
    el.dataset.done = 1; el.innerHTML = '<p class="hist-cap faint">Loading the last 12 releases…</p>';
    api('hist?k=' + encodeURIComponent(el.dataset.hist), 3 * 3600e3).then(d => { el.innerHTML = histHTML(d, el.dataset.fc, el.dataset.act); }).catch(() => { el.innerHTML = ''; });
  });
}
function histHTML(d, fc, act) {
  const pts = (d.points || []).slice(-12);
  if (pts.length < 3) return '';
  const num = v => { const n = parseFloat(String(v || '').replace(/[^\d.-]/g, '')); return isNaN(n) ? null : n; };
  const f = num(fc), a = num(act);
  // If today's number is already out and FRED doesn't have it yet, draw it as the newest bar
  const bars = pts.map(p => ({ v: p.v, t: p.txt, lab: histLab(p.d, d.kind, d.id) }));
  if (a != null && Math.abs(bars[bars.length - 1].v - a) > 1e-9 && bars.length) bars.push({ v: a, t: act, lab: 'Now', now: true });
  const all = bars.map(b => b.v).concat(f != null ? [f] : []);
  const lo = Math.min(0, ...all), hi = Math.max(0, ...all), span = (hi - lo) || 1;
  const n = bars.length + (f != null ? 1 : 0), W = 300, H = 96, top = 14, bot = 18, gap = 3;
  const bw = (W - gap * (n - 1)) / n, y = v => top + (hi - v) / span * (H - top - bot), y0 = y(0);
  let svg = '';
  bars.forEach((b, i) => {
    const x = i * (bw + gap), yv = y(b.v), last = i === bars.length - 1;
    svg += `<rect x="${x.toFixed(1)}" y="${Math.min(yv, y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, Math.abs(y0 - yv)).toFixed(1)}" rx="1.5" class="${last ? 'hb-last' : 'hb'}${b.v < 0 ? ' neg' : ''}"><title>${esc(b.lab)}: ${esc(b.t)}</title></rect>`;
  });
  if (f != null) {
    const x = bars.length * (bw + gap), yv = y(f);
    svg += `<rect x="${(x + 0.5).toFixed(1)}" y="${Math.min(yv, y0).toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(1, Math.abs(y0 - yv)).toFixed(1)}" rx="1.5" class="hb-fc"><title>Forecast: ${esc(fc)}</title></rect>`;
  }
  svg += `<line x1="0" x2="${W}" y1="${y0.toFixed(1)}" y2="${y0.toFixed(1)}" class="h0"/>`;
  const lb = bars[bars.length - 1], lx = (bars.length - 1) * (bw + gap) + bw / 2, vy = v => (v >= 0 ? y(v) - 3 : y(v) + 9).toFixed(1);
  svg += `<text x="0" y="${H - 4}" class="hl">${esc(bars[0].lab)}</text>`;
  svg += `<text x="${lx.toFixed(1)}" y="${vy(lb.v)}" text-anchor="middle" class="hv">${esc(lb.t)}</text>`;
  if (f != null) { const fx = bars.length * (bw + gap) + bw / 2; svg += `<text x="${fx.toFixed(1)}" y="${vy(f)}" text-anchor="middle" class="hv fc">${esc(fc)}</text><text x="${W}" y="${H - 4}" text-anchor="end" class="hl">${esc(lb.lab)} · Forecast</text>`; }
  else svg += `<text x="${W}" y="${H - 4}" text-anchor="end" class="hl">${esc(lb.lab)}</text>`;
  const vals = pts.map(p => p.v), avg = vals.reduce((x, y) => x + y, 0) / vals.length, last = pts[pts.length - 1];
  const unit = /%$/.test(last.txt) ? '%' : /K$/.test(last.txt) ? 'K' : /M$/.test(last.txt) ? 'M' : '';
  const fmtV = v => (d.kind === 'jobs' || d.kind === 'claims' ? Math.round(v) : d.kind === 'jolts' ? v.toFixed(2) : v.toFixed(1)) + unit;
  let line = `Average over the last ${pts.length}: ${fmtV(avg)}. Latest official: ${last.txt} (${histLab(last.d, d.kind, d.id)}).`;
  if (f != null) line += ` The forecast of ${fc} is ${Math.abs(f - avg) < Math.abs(avg) * 0.15 + 0.05 ? 'close to' : f > avg ? 'above' : 'below'} the recent average.`;
  return `<p class="hist-cap">Last ${pts.length} releases${f != null ? ' and this one’s forecast' : ''}</p><svg viewBox="0 0 ${W} ${H}" class="hist-svg" role="img" aria-label="Bar chart of the last ${pts.length} releases">${svg}</svg><p class="hist-note">${esc(line)} <a href="${esc(d.link)}" target="_blank" rel="noopener">Official data: FRED</a></p>`;
}
function histLab(dt, kind, id) {
  const d = new Date(dt + 'T12:00:00Z');
  if (kind === 'claims') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (id === 'A191RL1Q225SBEA') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ’${String(d.getUTCFullYear()).slice(2)}`;
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace(' ', ' ’');
}
document.addEventListener('toggle', ev => { if (ev.target.matches && ev.target.matches('details.ff-row') && ev.target.open) fillHist(ev.target); }, true);
// Before the number: if it beats or misses, which way your markets likely go and why
function scenHTML(e, r) {
  const sc = e.scen; if (!sc || (r && r.actual)) return '';
  const num = /\d/.test(e.forecast || '');
  const speech = /speaks|testif|press conference|minutes|statement/i.test(e.title);
  const row = (d) => {
    const x = sc[d], effs = relEffects({ effects: x.effects }).map(f => relResolve(f, { since: [] }));
    const main = effs[0], rest = effs.slice(1).filter((f, i, a) => a.findIndex(g => g.label === f.label) === i);
    const lab = main ? (main.market === 'futures' ? 'NQ & ES' : main.label) : '';
    const call = !main ? '' : main.dir === 'up' ? `${lab} ↑ likely up` : main.dir === 'down' ? `${lab} ↓ likely down` : main.paused ? `${lab}: call paused, follow the first move` : `${lab}: either way, watch the first move`;
    const cond = speech || !num ? x.label : `${d === 'up' ? 'Above' : 'Below'} ${e.forecast}: ${x.label.toLowerCase()}`;
    return `<div class="scen-r"><p class="scen-if">If ${esc(cond.charAt(0).toLowerCase() + cond.slice(1))}</p>${call ? `<p class="scen-call ${main.dir === 'up' || main.dir === 'down' ? main.dir : ''}">${esc(call)}</p>` : ''}<p class="scen-why">${esc(x.text)}${main && main.reason ? ' ' + esc(main.reason) : ''}</p>${main && main.record ? `<p class="scen-rec">${esc(main.record)}</p>` : ''}${rest.length ? `<div class="scen-more">${rest.map(f => `<span class="pill ${f.dir === 'up' ? 'up' : f.dir === 'down' ? 'down' : ''}"><b>${esc(f.label)}</b> ${f.dir === 'up' ? '↑' : f.dir === 'down' ? '↓' : '↕'}</span>`).join('')}</div>` : ''}</div>`;
  };
  return `<div class="scen"><p class="hist-cap">How this could move your markets</p><div class="scen-g">${row('up')}${row('down')}</div>${num ? '<p class="scen-note faint">Close to the forecast usually means a small move that fades. The bigger the surprise, the bigger the move.</p>' : ''}</div>`;
}
function ffRow(e, act, today, now, nextT, showT) {
  const imp = impOf(e), r = act[`${e.country}|${e.title}|${e.time}`];
  const past = e.time < now - 60e3 && !e.allDay, isNext = e.time === nextT;
  const fy = forYouEvent(e);
  const rev = revisionTxt(e, r);
  const body = [e.what ? `<p>${esc(e.what)}</p>` : '', e.why ? `<p>${esc(e.why)}</p>` : '', e.note ? `<p class="note">${esc(e.note)}</p>` : '', r && r.text ? `<p><b>${esc(r.label || '')}.</b> ${esc(r.text)}</p>` : '', rev ? `<p class="ff-rev">${esc(rev)}</p>` : '', fy ? `<p class="ff-fy-b"><b>For you:</b> ${esc(fy)}</p>` : '', scenHTML(e, r), histSlot(e, r)].join('');
  return `<details class="ff-row${past ? ' past' : ''}${isNext ? ' next' : ''}${imp === 'High' ? ' hi' : ''}" data-k="${esc(`${e.country}|${e.title}|${e.time}`)}"><summary>
      <span class="ff-t">${showT ? (e.allDay ? 'All day' : fmtTime(e.time).replace(' ', '').toLowerCase()) : ''}</span>
      <span class="ff-c">${esc(e.country)}</span>
      <span class="ff-i">${ffIcon(imp)}</span>
      <span class="ff-e">${esc(e.title)}${e.name && e.name !== e.title ? `<small>${esc(e.name)}</small>` : ''}${fy ? '<span class="ff-fy">For you</span>' : ''}</span>
      <span class="ff-vals"><span class="ff-v ff-a ${r && r.ccyDir ? r.ccyDir : ''}" data-l="Actual">${r ? esc(r.actual) : ''}</span>
      <span class="ff-v" data-l="Forecast">${esc(e.forecast || (r && r.forecast) || '')}</span>
      <span class="ff-v" data-l="Previous">${esc((e.previous || '').split('|')[0])}</span></span>
    </summary>${body ? `<div class="ff-body">${body}</div>` : ''}</details>`;
}

// ---------- Earnings tracker (inside the Calendar, can be hidden) ----------
const coName = n => String(n || '').replace(/,? (Inc|Corp|Corporation|Incorporated|Co|Company|Ltd|plc|N\.V|S\.A)\.?$/i, '').replace(/ Platforms$/, '');
const pctTxt = (v, d = 1) => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + '%';
const upDn = v => v == null ? '' : v > 0.05 ? 'up' : v < -0.05 ? 'down' : '';
const whenTxtE = w => w === 'before' ? 'Before the open' : w === 'after' ? 'After the close' : 'Time not set';
const earnKeep = (r, all) => all || r.heavy;
function earnByDay(x, all) {
  const by = {};
  (x.days || []).forEach(d => d.rows.filter(r => earnKeep(r, all)).forEach(r => (by[d.date] = by[d.date] || []).push(r)));
  (x.reported || []).filter(r => earnKeep(r, all)).forEach(r => { by[r.date] = by[r.date] || []; if (!by[r.date].some(y => y.symbol === r.symbol)) by[r.date].push(r); });
  return by;
}
function earnRead(r) {
  if (r.eps == null) return 'The numbers aren’t in yet.';
  const s = r.surprise, m = r.move && r.move.pct;
  const res = s == null ? 'Reported' : s > 2 ? 'Beat estimates' : s < -2 ? 'Missed estimates' : 'Roughly in line';
  if (m == null) return res + '.';
  if (s != null && s > 2 && m < -1.5) return `${res}, but the stock fell. Investors often care more about the outlook than the last quarter.`;
  if (s != null && s < -2 && m > 1.5) return `${res}, yet the stock rose. The outlook or guidance likely mattered more.`;
  return `${res}, and the stock is ${m > 0.3 ? 'higher' : m < -0.3 ? 'lower' : 'little changed'} since.`;
}
function earnCard(r) {
  const day = dayFmt(r.date, { weekday: 'short' });
  return `<article class="ce-card">
    <p class="rel-top"><b class="ce-sym">${esc(r.symbol)}</b>${esc(coName(r.name))}<span class="ce-when">${esc(day)}, ${r.when === 'after' ? 'after close' : r.when === 'before' ? 'before open' : 'reported'}</span></p>
    <div class="rel-nums">
      <div><small>Per share</small><b>${r.eps != null ? esc(r.epsTxt) : '—'}</b></div>
      <div><small>Expected</small><b class="ce-dim">${r.fcTxt ? esc(r.fcTxt) : '—'}</b></div>
      <div><small>Stock</small><b class="${upDn(r.move && r.move.pct)}">${pctTxt(r.move && r.move.pct)}</b></div>
      <div><small>NQ</small><b class="${upDn(r.nq && r.nq.pct)}">${pctTxt(r.nq && r.nq.pct, 2)}</b></div>
    </div>
    <p class="ce-read">${r.surprise != null && r.eps != null ? `<span class="pill ${r.surprise > 2 ? 'up' : r.surprise < -2 ? 'down' : ''}">${r.surprise > 0 ? 'Beat' : r.surprise < 0 ? 'Missed' : 'Matched'} by ${Math.abs(r.surprise).toFixed(1)}%</span>` : ''}${esc(earnRead(r))}</p>
    ${r.weight ? `<p class="ce-w">About ${r.weight}% of the Nasdaq 100, so its move shows up in NQ.</p>` : ''}
  </article>`;
}
function earnTracker(x, all) {
  const rep = (x.reported || []).filter(r => earnKeep(r, all)).slice(0, 4);
  const up = (x.days || []).flatMap(d => d.rows.filter(r => earnKeep(r, all)).map(r => ({ ...r, date: d.date })));
  const today = nyParts().date;
  const dLab = ds => ds === today ? 'Today' : ds === addDay(today, 1) ? 'Tomorrow' : dayFmt(ds, { weekday: 'short', month: 'short', day: 'numeric' });
  return `<div class="ff-top"><h2 class="sec">Earnings</h2><button type="button" class="linkbtn" id="ceHide">Hide earnings</button></div>
    <p class="ce-intro">${esc((x.lines || []).slice(0, 2).join(' '))}</p>
    ${rep.length ? `<h3 class="ce-h">Just reported <span class="ce-hs">· price moves since the close before each report</span></h3><div class="ce-cards">${rep.map(earnCard).join('')}</div>` : ''}
    <h3 class="ce-h">Coming up</h3>
    ${up.length ? `<div class="ce-up">${up.slice(0, all ? 14 : 8).map(r => `<div class="ce-row"><span class="ce-d">${esc(dLab(r.date))}</span><span class="ce-n"><b>${esc(r.symbol)}</b> ${esc(coName(r.name))}${r.weight ? `<span class="tag-heavy">~${r.weight}% of Nasdaq 100</span>` : r.heavy ? '<span class="tag-heavy">Moves the index</span>' : ''}</span><span class="ce-t">${esc(whenTxtE(r.when))}${r.eps ? `<small>Expected ${esc(r.eps)} a share</small>` : ''}</span></div>`).join('')}</div>` : `<p class="ff-none ce-none">${all ? 'No companies worth $20 billion or more report in the next five trading days.' : 'None of the companies that move the index report in the next five trading days. Switch to “All big companies” to see the rest.'}</p>`}
    ${stamp(x)}`;
}

PAGES.calendar = () => {
  const mine = [...new Set(['USD', ...myAssets().flatMap(a => a.ccy || [])])].filter(c => FF_CCY.includes(c));
  const f = store.get('ffFilter', { imp: ['High', 'Medium', 'Low', 'Holiday'], ccy: mine.length ? mine : ['USD'] });
  const today = nyParts().date;
  if (!CAL.sel) { CAL.sel = today; CAL.month = monthKey(today); }
  const ce = { on: store.get('calEarnings', true), all: store.get('calEarnAll', false), data: null };
  layout(`<h1 class="page-h">Calendar</h1>
    <p class="page-intro">Every economic release and central-bank event, with what it is, how markets usually react and what it means for your markets. Pick a day on the calendar, or see the whole week. Times are ${esc(tzCity())} time (${esc(tzAbbr())}); change it in your account menu.</p>
    <div class="cal-grid">
      <aside class="cal-side">
        <div class="mcal" id="mcal"></div>
        <div class="cal-filters">
          <div class="chips" role="group" aria-label="Impact"><span class="chips-label">Impact</span>${['High', 'Medium', 'Low', 'Holiday'].map(k => `<button class="chip ffchip" data-fi="${k}" aria-pressed="${f.imp.includes(k)}">${ffIcon(k)}${k === 'Holiday' ? 'Other' : k}</button>`).join('')}</div>
          <div class="chips" role="group" aria-label="Currency"><span class="chips-label">Currency</span>${FF_CCY.map(c => `<button class="chip" data-fc="${c}" aria-pressed="${f.ccy.includes(c)}">${c}</button>`).join('')}</div>
          <button type="button" class="linkbtn" id="ffMine">Just my currencies</button>
        </div>
        <div class="ce-side">
          <div class="ce-sw-row"><div><b>Earnings</b><small>Big company reports and how the stock reacted</small></div>
            <button type="button" class="sw" role="switch" id="ceSw" aria-checked="${ce.on}" aria-label="Show earnings in the calendar"><i></i></button></div>
          <div class="seg ce-scope" role="group" aria-label="Which companies"${ce.on ? '' : ' hidden'}><button type="button" data-ce="movers" aria-pressed="${!ce.all}">Index movers</button><button type="button" data-ce="all" aria-pressed="${ce.all}">All big companies</button></div>
        </div>
      </aside>
      <section class="cal-main"><section class="tn tn-cal" id="calTn"><p class="loading">Checking the week’s news…</p></section><div class="ce" id="ce"${ce.on ? '' : ' hidden'}></div><div class="ff" id="ff"><p class="loading">Loading the calendar…</p></div></section>
    </div>`);
  const rer = () => { store.set('ffFilter', f); draw(); };
  main.querySelectorAll('[data-fi]').forEach(b => b.onclick = () => { const k = b.dataset.fi; f.imp = f.imp.includes(k) ? f.imp.filter(x => x !== k) : [...f.imp, k]; b.setAttribute('aria-pressed', f.imp.includes(k)); rer(); });
  main.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => { const k = b.dataset.fc; f.ccy = f.ccy.includes(k) ? f.ccy.filter(x => x !== k) : [...f.ccy, k]; b.setAttribute('aria-pressed', f.ccy.includes(k)); rer(); });
  $('#ffMine').onclick = () => { f.ccy = mine.length ? mine.slice() : ['USD']; main.querySelectorAll('[data-fc]').forEach(b => b.setAttribute('aria-pressed', f.ccy.includes(b.dataset.fc))); rer(); };

  const ceDraw = () => { const box = $('#ce'); if (!box) return; box.hidden = !ce.on; if (ce.on) box.innerHTML = ce.data ? earnTracker(ce.data, ce.all) : '<p class="loading">Loading earnings…</p>'; const h = $('#ceHide'); if (h) h.onclick = () => setCe(false); };
  const ceLoad = () => { if (ce.data || ce.loading) return; ce.loading = true; api('earnings', 15 * 60e3).then(x => { ce.data = x; ceDraw(); if (data) list(); }).catch(() => { const box = $('#ce'); if (box) box.innerHTML = '<p class="empty">Couldn’t load earnings. Try again in a minute.</p>'; }); };
  function setCe(on) {
    ce.on = on; store.set('calEarnings', on);
    const sw = $('#ceSw'); if (sw) sw.setAttribute('aria-checked', on);
    const sc = main.querySelector('.ce-scope'); if (sc) sc.hidden = !on;
    if (on) ceLoad();
    ceDraw(); if (data) list();
  }
  $('#ceSw').onclick = () => setCe(!ce.on);
  main.querySelectorAll('[data-ce]').forEach(b => b.onclick = () => { ce.all = b.dataset.ce === 'all'; store.set('calEarnAll', ce.all); main.querySelectorAll('[data-ce]').forEach(x => x.setAttribute('aria-pressed', x === b)); ceDraw(); if (data) list(); });
  if (ce.on) { ceLoad(); ceDraw(); }

  let data = null;
  const keep = e => f.imp.includes(impOf(e)) && (f.ccy.includes(e.country) || !FF_CCY.includes(e.country));
  function grid() {
    const all = data.events, have = new Set(all.map(e => nyParts(e.time).date));
    const dates = [...have].sort(), lo = dates[0], hi = dates[dates.length - 1];
    const byDay = {}; all.filter(keep).forEach(e => { const k = nyParts(e.time).date; (byDay[k] = byDay[k] || []).push(e); });
    const first = CAL.month + '-01', start = weekStart(first);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const k = addDay(start, i);
      if (i >= 35 && monthKey(k) !== CAL.month) break;
      const evs = byDay[k] || [], inMonth = monthKey(k) === CAL.month, avail = k >= lo && k <= hi;
      const lv = [...new Set(evs.map(impOf))].sort((a, b) => IMP_RANK[b] - IMP_RANK[a]).filter(x => x !== 'Holiday').slice(0, 3);
      const label = `${dayFmt(k, { weekday: 'long', month: 'long', day: 'numeric' })}${avail ? `, ${evs.length} event${evs.length === 1 ? '' : 's'}` : ', no calendar data'}`;
      cells.push(`<button type="button" class="mc-d${inMonth ? '' : ' out'}${k === today ? ' today' : ''}${k === CAL.sel ? ' sel' : ''}${avail ? '' : ' na'}${CAL.mode === 'week' && weekStart(k) === weekStart(CAL.sel) ? ' inwk' : ''}" data-day="${k}" ${avail ? '' : 'disabled'} aria-label="${esc(label)}" aria-pressed="${k === CAL.sel}">
        <span class="mc-n">${+k.slice(8)}</span><span class="mc-dots">${lv.map(x => `<i class="${IMP[x][0]}"></i>`).join('')}</span></button>`);
    }
    $('#mcal').innerHTML = `<div class="mc-top"><button type="button" class="mc-nav" data-mon="-1" aria-label="Previous month">‹</button>
      <b>${dayFmt(first, { month: 'long', year: 'numeric' })}</b>
      <button type="button" class="mc-nav" data-mon="1" aria-label="Next month">›</button></div>
      <div class="mc-wk">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<span>${x}</span>`).join('')}</div>
      <div class="mc-days">${cells.join('')}</div>
      <div class="mc-foot"><div class="seg" role="group" aria-label="Show"><button type="button" data-mode="day" aria-pressed="${CAL.mode === 'day'}">Day</button><button type="button" data-mode="week" aria-pressed="${CAL.mode === 'week'}">Week</button></div>
        <button type="button" class="linkbtn" id="mcToday">Today</button></div>
      <p class="mc-note">Calendar data covers this week${hi > addDay(weekStart(today), 6) ? ' and next week' : ''}. Next week’s events usually appear over the weekend. CPI, jobs reports and Fed decisions show further ahead from the official schedules.</p>`;
    $('#mcal').querySelectorAll('[data-day]').forEach(b => b.onclick = () => { CAL.sel = b.dataset.day; CAL.mode = 'day'; if (monthKey(CAL.sel) !== CAL.month) CAL.month = monthKey(CAL.sel); draw(); });
    $('#mcal').querySelectorAll('[data-mon]').forEach(b => b.onclick = () => { CAL.month = addMonth(CAL.month, +b.dataset.mon); grid(); });
    $('#mcal').querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { CAL.mode = b.dataset.mode; draw(); });
    $('#mcToday').onclick = () => { CAL.sel = today; CAL.month = monthKey(today); draw(); };
  }
  async function list() {
    const box = $('#ff'); if (!box) return;
    const wk = weekStart(CAL.sel);
    const days = CAL.mode === 'day' ? [CAL.sel] : Array.from({ length: 7 }, (_, i) => addDay(wk, i));
    const res = await Promise.all(days.map(ffDayResults));
    if (!$('#ff')) return;
    const act = {}; res.flat().forEach(r => { if (r.actual) act[r.key] = r; });
    const all = data.events;
    const byDay = {}; all.filter(keep).forEach(e => { const k = nyParts(e.time).date; if (days.includes(k)) (byDay[k] = byDay[k] || []).push(e); });
    const shown = CAL.mode === 'day' ? days : days.filter(k => byDay[k] || k === today || k === CAL.sel || ![0, 6].includes(ymd(k).getUTCDay()));
    const now = Date.now(), nextT = (all.filter(keep).find(e => e.time > now && !e.allDay) || {}).time;
    const head = k => `<div class="ff-day${k === today ? ' today' : ''}${k === CAL.sel && CAL.mode === 'week' ? ' sel' : ''}" id="d-${k}"><b>${dayFmt(k, { weekday: 'short' })}</b> ${dayFmt(k, { month: 'short', day: 'numeric' })}${k === today ? ' <span class="pill acc">Today</span>' : ''}</div>`;
    const er = ce.on && ce.data ? earnByDay(ce.data, ce.all) : {};
    const eLine = k => er[k] ? `<div class="ff-earn"><span class="ff-earn-l">Earnings</span>${er[k].map(r => `<span class="ff-earn-i${r.weight ? ' big' : ''}" title="${esc(r.name)}"><b>${esc(r.symbol)}</b> ${r.when === 'before' ? 'before open' : r.when === 'after' ? 'after close' : ''}</span>`).join('')}</div>` : '';
    const rows = shown.map(k => {
      const evs = byDay[k];
      if (!evs) return head(k) + eLine(k) + `<div class="ff-none">${all.some(e => nyParts(e.time).date === k) ? 'Nothing for your filters on this day' : 'No events scheduled'}</div>`;
      let lastT = null;
      return head(k) + eLine(k) + evs.map(e => { const showT = e.time !== lastT; lastT = e.time; return ffRow(e, act, today, now, nextT, showT); }).join('');
    }).join('');
    const title = CAL.mode === 'day' ? dayFmt(CAL.sel, { weekday: 'long', month: 'long', day: 'numeric' }) : `Week of ${dayFmt(wk, { month: 'long', day: 'numeric' })}`;
    box.innerHTML = `<div class="ff-top"><h2 class="sec">${esc(title)}</h2>
        <div class="ff-step"><button type="button" class="mc-nav" data-step="-1" aria-label="Previous ${CAL.mode}">‹</button><button type="button" class="mc-nav" data-step="1" aria-label="Next ${CAL.mode}">›</button></div></div>
      <div class="ff-legend">${['High', 'Medium', 'Low', 'Holiday'].map(k => `<span>${ffIcon(k)}${IMP[k][1]}</span>`).join('')}<span><b class="ff-a good">Green</b> / <b class="ff-a bad">red</b> actual: better or worse than forecast for that currency</span></div>
      <div class="ff-table" role="table"><div class="ff-head" role="row"><span>Time</span><span>Cur.</span><span>Impact</span><span>Event</span><span>Actual</span><span>Forecast</span><span>Previous</span></div>${rows}</div>${stamp(data)}`;
    box.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { CAL.sel = addDay(CAL.sel, (CAL.mode === 'day' ? 1 : 7) * +b.dataset.step); CAL.month = monthKey(CAL.sel); draw(); });
    if (CAL.mode === 'week' && CAL.sel !== today && !refreshing) { const el = document.getElementById('d-' + CAL.sel); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }
  const tnc = mountTradeNews('calTn', { sel: CAL.sel, onPick: d => { CAL.sel = d; CAL.month = monthKey(d); if (CAL.mode === 'day') draw(); else { grid(); list(); } } });
  function draw() { if (!data) return; grid(); list(); tnc.setSel(CAL.sel); }
  api('calendar', 10 * 60e3).then(d => { data = d; draw(); }).catch(() => { const box = $('#ff'); if (box) box.innerHTML = '<p class="empty">Couldn’t load the calendar. Try again in a minute.</p>'; });
};

// ---------- Glossary ----------
PAGES.glossary = () => {
  const cats = Object.keys(GLOSSARY);
  const total = cats.reduce((n, c) => n + GLOSSARY[c].length, 0);
  let q = '', cat = '';
  layout(`<h1 class="page-h">Market terms, explained</h1>
    <p class="page-intro">${total} words and phrases you’ll see in market news, from the basics to options, crypto and trading strategies, each explained in plain English.</p>
    <input class="search" id="glQ" type="search" placeholder="Search terms, for example “yield” or “liquidity”" aria-label="Search the glossary">
    <div class="chips" role="group" aria-label="Category"><button class="chip" data-c="" aria-pressed="true">All</button>${cats.map(c => `<button class="chip" data-c="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>
    <div id="glList"></div>`);
  const hl = (s, needle) => { const e = esc(s); if (!needle) return e; const re = new RegExp('(' + needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'); return e.replace(re, '<mark>$1</mark>'); };
  const draw = () => {
    const needle = q.trim();
    const html = cats.filter(c => !cat || c === cat).map(c => {
      const rows = GLOSSARY[c].filter(([t, d]) => !needle || (t + ' ' + d).toLowerCase().includes(needle.toLowerCase()));
      if (!rows.length) return '';
      return `<section class="gl-cat"><h2 class="sec">${esc(c)}</h2><dl class="gl">${rows.map(([t, d]) => `<dt id="t-${esc(t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}">${hl(t, needle)}</dt><dd>${hl(d, needle)}</dd>`).join('')}</dl></section>`;
    }).join('');
    $('#glList').innerHTML = html || `<p class="empty">No terms match “${esc(needle)}”. Try a shorter word.</p>`;
  };
  $('#glQ').addEventListener('input', e => { q = e.target.value; draw(); });
  main.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { cat = b.dataset.c; main.querySelectorAll('[data-c]').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  draw();
};

// ---------- Privacy policy and terms ----------
const LEGAL_UPDATED = 'November 2, 2026';
const CONTACT = 'sinlex46@gmail.com';
PAGES.privacy = () => {
  document.title = 'Privacy | The Open One';
  layout(`<article class="legal">
    <h1 class="page-h">Privacy policy</h1>
    <p class="page-intro">Last updated ${LEGAL_UPDATED}. This explains what The Open One stores about you, why, and how to have it removed.</p>
    <h2 class="sec">What we store</h2>
    <ul>
      <li><b>Your account:</b> your email address and the username you choose. If you sign in with Google, Google shares your name, email address and profile picture with us. We never see your Google password.</li>
      <li><b>Your setup:</b> the answers you give when you set up your briefing (markets, sessions, strategy, alerts), so the site can show what matters to you.</li>
      <li><b>Your profile:</b> the display name, bio and photo you add, and the badges you choose to show.</li>
      <li><b>Usage for badges and limits:</b> which days you visit and the earliest time you visit each day, and how many AI reads you use each day.</li>
      <li><b>Your plan:</b> which plan you have and whether it came from a lifetime code or a subscription.</li>
      <li><b>Reports you send:</b> if you use “Report a mistake”, the message you write and the headline it’s about.</li>
    </ul>
    <h2 class="sec">What we don’t do</h2>
    <ul>
      <li>We don’t sell your information or share it with advertisers.</li>
      <li>We don’t use advertising or tracking cookies.</li>
      <li>We never see or store card numbers. Payments, if they’re switched on, are handled entirely by Stripe.</li>
    </ul>
    <h2 class="sec">Services we use</h2>
    <ul>
      <li><b>Supabase</b> stores your account and the information above.</li>
      <li><b>Vercel</b> hosts the website.</li>
      <li><b>Google</b> handles “Continue with Google” sign-in.</li>
      <li><b>Stripe</b> handles payments and billing.</li>
      <li><b>Anthropic</b> powers AI reads. Only headlines and market names are sent to it, never your account details.</li>
      <li>Market prices, charts and the calendar come from public sources (Yahoo Finance, CoinGecko, DexScreener, TradingView, ForexFactory). Your browser may load content from them.</li>
    </ul>
    <h2 class="sec">On your device</h2>
    <p>The site keeps a few settings in your browser (your sign-in session, your chosen layout and alert preferences). Clearing your browser data removes them.</p>
    <h2 class="sec">Removing your data</h2>
    <p>To delete your account and everything linked to it, email <a href="mailto:${CONTACT}">${CONTACT}</a> from the address you signed up with. It’s removed within 30 days. You can change or clear your profile and setup at any time from your account menu.</p>
    <h2 class="sec">Changes</h2>
    <p>If this policy changes, the date at the top changes too. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
  </article>`);
};
PAGES.terms = () => {
  document.title = 'Terms | The Open One';
  layout(`<article class="legal">
    <h1 class="page-h">Terms of use</h1>
    <p class="page-intro">Last updated ${LEGAL_UPDATED}. By using The Open One you agree to these terms.</p>
    <h2 class="sec">News and context, not advice</h2>
    <p>Everything on The Open One, including briefings, “Likely up / down” reads, the live read, AI reads and the calendar, is general information and education. It isn’t financial, investment or trading advice, and it isn’t a recommendation to buy or sell anything. Trading is risky and you can lose money. Make your own decisions.</p>
    <h2 class="sec">Accuracy</h2>
    <p>Prices can be delayed, and reads can be wrong. The Scorecard shows how past calls actually turned out. Headlines belong to their publishers and link to them.</p>
    <h2 class="sec">Your account</h2>
    <p>Keep your sign-in details to yourself. Lifetime codes are for one person and can be cancelled if they’re shared or misused. Don’t try to break, overload or copy the site.</p>
    <h2 class="sec">Plans</h2>
    <p>Paid plans renew monthly until you cancel from the Plans page. Cancelling stops the next renewal; you keep your plan until the end of the period you paid for.</p>
    <h2 class="sec">Changes and contact</h2>
    <p>The site and these terms can change. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a>. See also the <a href="/privacy">privacy policy</a>.</p>
  </article>`);
};

// ---------- Scorecard: how the "Likely up / down" calls actually turned out ----------
const CALL_NAME = { NQ: 'Nasdaq futures (NQ)', BTC: 'Bitcoin', EURUSD: 'EUR/USD' };
const RES_TXT = { right: 'Right', wrong: 'Wrong', flat: 'Barely moved', pending: 'Waiting' };
function hitRate(t) { const n = t.right + t.wrong; return n ? Math.round(t.right / n * 100) : null; }
function scoreTile(label, t, sub) {
  const r = hitRate(t), n = t.right + t.wrong;
  return `<div class="sc-tile"><p class="sc-l">${esc(label)}</p><p class="sc-big">${r == null ? '—' : r + '%'}</p><p class="sc-sub">${n ? `${t.right} right, ${t.wrong} wrong` : 'Not enough graded calls yet'}${t.flat ? ` · ${t.flat} barely moved` : ''}${t.pending ? ` · ${t.pending} waiting` : ''}</p><div class="sc-bar" aria-hidden="true"><i class="up" style="width:${n ? t.right / (n + t.flat) * 100 : 0}%"></i><i class="down" style="width:${n ? t.wrong / (n + t.flat) * 100 : 0}%"></i></div>${sub ? `<p class="sc-note">${esc(sub)}</p>` : ''}</div>`;
}
function gradeCell(g) {
  if (!g || g.result === 'pending') return `<span class="gr pending">Waiting</span>`;
  const mv = g.moved != null ? `${g.moved > 0 ? '+' : g.moved < 0 ? '−' : ''}${g.unit === '$' ? '$' : ''}${num(Math.abs(g.moved), g.unit === 'pts' ? 2 : 0)}${g.unit === 'pts' ? ' pts' : g.unit === 'pips' ? ' pips' : ''}` : '';
  return `<span class="gr ${g.result}">${RES_TXT[g.result]}</span><small>${mv}</small>`;
}
PAGES.scorecard = () => {
  layout(`<h1 class="page-h">Scorecard</h1>
    <p class="page-intro">Every “Likely up” and “Likely down” call in the briefing is saved the moment it’s made, with the price at that time. We check it against what price actually did an hour later and at the 4 PM New York close. Nothing is deleted, so the misses stay here too.</p>
    <div id="scBody">${skel(3)}</div><section class="block"><div class="sec-row"><h2 class="sec">Your day bias, by confidence</h2></div><div id="scDay">${skel(2)}</div></section><section class="block"><div class="sec-row"><h2 class="sec">Live read, every 5 minutes</h2></div><div id="scPulse">${skel(2)}</div></section><section class="block"><div class="sec-row"><h2 class="sec">Release calls</h2></div><div id="scRel">${skel(2)}</div></section><section class="block"><div class="sec-row"><h2 class="sec">Automatic adjustments</h2></div><div id="scAdj">${skel(1)}</div></section>`);
  fill('scRel', 'the release-call record', api('relscore', 5 * 60e3), d => {
    if (!d.ready) return `<div class="sc-empty"><p><b>Release-call tracking is being set up.</b></p></div>`;
    if (!d.total) return `<div class="sc-empty"><p><b>Tracking starts with the next big release.</b> When CPI, jobs, PPI, retail sales or a Fed decision comes out, the site’s call for NQ, Bitcoin and EUR/USD is saved with the price and graded 15 minutes later, an hour later and at the close.</p></div>`;
    const s = d.summary;
    return `<div class="sc-tiles sc3">${scoreTile('After 15 minutes', s.m15, 'The first move, often a fake-out')}${scoreTile('After 1 hour', s.hour, 'The main grade for release calls')}${scoreTile('By the close', s.close)}</div>
      <p class="sc-fine">Last ${d.days} days, ${d.total} calls. Rule calls (the “if above / if below” read, set before the number) are graded from the price at the release. Calls that follow the first move are graded from the price when they were made, so they get no credit for the move they followed.</p>
      ${Object.keys(d.byRule).length ? `<h2 class="sec">By rule, after 1 hour</h2><div class="sc-mk">${Object.entries(d.byRule).map(([k, t]) => { const [kind, mk] = k.split('|'); return `<div class="sc-mrow"><b>${esc(kind)} → ${esc(CALL_NAME[mk] || mk)}</b><span>${hitRate(t) == null ? '—' : hitRate(t) + '%'} <small>(${t.right + t.wrong} graded)</small></span><span></span></div>`; }).join('')}</div>` : ''}
      <div class="sc-list" role="table" aria-label="Latest release calls">
        <div class="sc-row sc-rel sc-head" role="row"><span role="columnheader">Call</span><span role="columnheader">Release</span><span role="columnheader">15 min</span><span role="columnheader">1 hour</span><span role="columnheader">Close</span></div>
        ${d.calls.map(c => `<div class="sc-row sc-rel" role="row">
          <span role="cell"><span class="pill ${c.dir}"><b>${esc(c.market === 'EURUSD' ? 'EUR/USD' : c.market)}</b> ${c.dir === 'up' ? '↑ Up' : '↓ Down'}</span><small>${c.how === 'rule' ? 'Rule' : 'Followed first move'}</small></span>
          <span role="cell" class="sc-story"><b>${esc(c.title)}</b><small>${new Date(c.time).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}, ${fmtTime(c.time)} · ${esc(c.actual)}${c.forecast ? ` vs ${esc(c.forecast)}` : ''}</small></span>
          <span role="cell" class="sc-g">${gradeCell(c.m15)}</span><span role="cell" class="sc-g">${gradeCell(c.hour)}</span><span role="cell" class="sc-g">${gradeCell(c.close)}</span></div>`).join('')}
      </div>${stamp(d)}`;
  });
  fill('scAdj', 'the automatic adjustments', api('adjust', 5 * 60e3), d => {
    const items = d.list || [], watch = d.watching || [];
    return `<p class="sc-fine">The site changes its own calls when the record says so. A release rule that’s right under 40% of the time (6+ graded calls) is paused, and the site follows the market’s first real move instead. A market whose high or medium confidence is right under half the time (40+ graded Live reads, or 12+ day biases) has its confidence capped one level. Every change lifts by itself once the numbers recover, and paused rules keep being graded so they can come back.</p>
      ${items.length ? `<div class="adj-list">${items.map(x => `<div class="adj-i"><span class="adj-a">${esc(x.area)}</span><b>${esc(x.what)}</b><p>${esc(x.why)}</p></div>`).join('')}</div>` : `<div class="sc-empty"><p><b>No adjustments right now.</b> Nothing has enough graded results that are bad enough to change.</p></div>`}
      ${watch.length ? `<p class="sc-fine"><b>Being watched:</b> ${watch.slice(0, 6).map(x => `${esc(x.what)} (${esc(x.why)})`).join(' · ')}</p>` : ''}${stamp(d)}`;
  });
  fill('scDay', 'the session bias record', api('dayscore', 5 * 60e3), d => {
    if (!d.ready) return `<div class="sc-empty"><p><b>Session bias tracking is being set up.</b></p></div>`;
    const graded = d.summary.right + d.summary.wrong + d.summary.flat;
    const intro = `<p class="sc-fine">The “Bias: up / down” call for NQ, Bitcoin and EUR/USD is saved once a day at 9:30 AM New York, with its confidence, and graded at the 4 PM close.${graded < 10 ? ' It needs a couple of weeks of trading days before these numbers mean much.' : ''}</p>`;
    if (!d.total) return `<div class="sc-empty"><p><b>Tracking starts at the next 9:30 AM New York open.</b> Each market’s session bias gets saved with its confidence and checked at the 4 PM close.</p></div>`;
    return `<div class="sc-tiles sc4">${scoreTile('All days', d.summary)}${scoreTile('High confidence', d.byConf.high)}${scoreTile('Medium confidence', d.byConf.medium)}${scoreTile('Low confidence', d.byConf.low)}</div>${intro}
      <div class="sc-list" role="table" aria-label="Recent session biases">
        <div class="sc-row sc-day sc-head" role="row"><span role="columnheader">Day</span><span role="columnheader">Bias</span><span role="columnheader">Confidence</span><span role="columnheader">At the close</span></div>
        ${d.days.map(x => `<div class="sc-row sc-day" role="row"><span role="cell">${new Date(x.day + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })}</span><span role="cell"><span class="pill ${x.call}"><b>${esc(x.market === 'EURUSD' ? 'EUR/USD' : x.market)}</b> ${x.call === 'up' ? '↑ Up' : '↓ Down'}</span></span><span role="cell" class="sc-cf ${esc(x.conf)}">${esc(x.conf.charAt(0).toUpperCase() + x.conf.slice(1))}</span><span role="cell" class="sc-g">${gradeCell(x.close)}</span></div>`).join('')}
      </div>${stamp(d)}`;
  });
  fill('scPulse', 'the live read score', api('pulsescore', 5 * 60e3), d => {
    if (!d.ready || !d.total) return `<div class="sc-empty"><p><b>No live reads graded yet.</b> Each “Leaning up” or “Leaning down” read is checked one hour later.</p></div>`;
    return `<div class="sc-tiles sc4">${scoreTile('All leans', d.summary)}${scoreTile('High confidence', d.byConf.high, 'News and price strongly agree')}${scoreTile('Medium confidence', d.byConf.medium)}${scoreTile('Low confidence', d.byConf.low)}</div>
      <p class="sc-fine">Last ${d.days} days, ${d.total} leans, each checked one hour later. “No clear lean” reads aren’t graded. Confidence only means something if high beats medium and medium beats low.</p>
      ${Object.keys(d.byMarket).length ? `<div class="sc-mk">${Object.entries(d.byMarket).map(([k, t]) => `<div class="sc-mrow"><b>${esc(CALL_NAME[k] || k)}</b><span>1 hour: ${hitRate(t) == null ? '—' : hitRate(t) + '%'} <small>(${t.right + t.wrong} graded)</small></span><span></span></div>`).join('')}</div>` : ''}`;
  });
  fill('scBody', 'the scorecard', api('calls', 5 * 60e3), d => {
    if (!d.ready) return `<div class="sc-empty"><p><b>The scorecard is being set up.</b> Calls will start showing here once tracking is switched on.</p></div>`;
    if (!d.total) return `<div class="sc-empty"><p><b>New record started November 2.</b> The call rules were improved: no calls against the last hour of price, fresh stories only, graded at the close. Earlier calls came from the old rules and no longer count. New calls show up here as they are graded.</p></div>`;
    const s = d.summary;
    return `<div class="sc-tiles">${scoreTile('Right by the close', s.close, 'The main grade: news plays out over the session, not the first hour')}${scoreTile('Right after 1 hour', s.hour, 'The first hour is mostly noise and fake-outs')}</div>
      <p class="sc-fine">Last ${d.days} days, ${d.total} calls. “Barely moved” means price moved less than a normal hourly wiggle (0.1% for NQ, 0.3% for Bitcoin, 0.05% for EUR/USD), so it isn’t counted either way. Calls made while a market is closed are checked from when it reopens.</p>
      ${d.byMarket.length > 1 ? `<h2 class="sec">By market</h2><div class="sc-mk">${d.byMarket.map(b => `<div class="sc-mrow"><b>${esc(CALL_NAME[b.market] || b.market)}</b><span>By the close: ${hitRate(b.close) == null ? '—' : hitRate(b.close) + '%'} <small>(${b.close.right + b.close.wrong} graded)</small></span><span>1 hour: ${hitRate(b.hour) == null ? '—' : hitRate(b.hour) + '%'} <small>(${b.hour.right + b.hour.wrong} graded)</small></span></div>`).join('')}</div>` : ''}
      <h2 class="sec">Latest calls</h2>
      <div class="sc-list" role="table" aria-label="Latest calls">
        <div class="sc-row sc-head" role="row"><span role="columnheader">Call</span><span role="columnheader">Story</span><span role="columnheader">After 1 hour</span><span role="columnheader">At the close</span></div>
        ${d.calls.map(c => `<div class="sc-row" role="row">
          <span role="cell"><span class="pill ${c.dir}"><b>${esc(c.market === 'EURUSD' ? 'EUR/USD' : c.market)}</b> ${c.dir === 'up' ? '↑ Likely up' : '↓ Likely down'}</span><small>${new Date(c.time).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })}, ${fmtTime(c.time)}${c.price != null ? ` · at ${num(c.price, c.market === 'EURUSD' ? 4 : c.market === 'BTC' ? 0 : 2)}` : ''}</small></span>
          <span role="cell" class="sc-story"><a href="${esc(c.link)}" target="_blank" rel="noopener">${esc(c.headline)}</a><small>${esc(c.source || '')}${c.outlets > 1 ? ` and ${c.outlets - 1} more` : ' · one outlet'}</small></span>
          <span role="cell" class="sc-g">${gradeCell(c.hour)}</span>
          <span role="cell" class="sc-g">${gradeCell(c.close)}</span></div>`).join('')}
      </div>${stamp(d)}`;
  });
};

// ---------- AI read (one click per story) and the Plans page ----------
const AIR_KEYS = { futures: 'NQ', stocks: 'ES', options: 'ES', crypto: 'BTC', memes: 'SOL', forex: 'EURUSD' };
const airMarkets = () => { const k = [...new Set(myMarkets().map(m => AIR_KEYS[m]).filter(Boolean))]; return (k.length ? k : ['NQ']).slice(0, 3); };
const SPARK = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path fill="currentColor" d="M8 0l1.6 5.1L15 6.6l-4.4 2.9L11.9 15 8 11.6 4.1 15l1.3-5.5L1 6.6l5.4-1.5z"/></svg>';
function airBtn(headline, inline = false) {
  return `${inline ? '' : '<div class="air-row">'}<button type="button" class="ai-btn" data-air="${esc(headline)}" aria-expanded="false">${SPARK}AI read</button>${inline ? '' : '</div>'}`;
}
const PLAN_NAME = { free: 'Free', plus: 'Plus', pro: 'Pro' };
// Flip to true when Plus and Pro go on sale (the server checks this too)
const PAYMENTS_OPEN = false;
function upsellHTML(why, msg) {
  if (why === 'signin') return `<p class="air-up">Sign in to use AI reads. Everyone gets 3 free a day. <a href="/plans">See plans</a></p>`;
  if (why === 'limit') return `<p class="air-up">${esc(msg)} ${plan.tier === 'pro' || !PAYMENTS_OPEN ? '' : `<a href="/plans">Upgrade for more</a>`}</p>`;
  if (why === 'tier') return `<p class="air-up">${esc(msg)} <a href="/plans">See plans</a></p>`;
  return `<p class="air-up">${esc(msg || 'Something went wrong. Try again in a minute.')}</p>`;
}
async function postAI(fn, body) {
  const tok = await authToken();
  const r = await fetch('/api/data?fn=' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.why = j.why || (r.status === 401 ? 'signin' : ''); throw e; }
  return j;
}
function airResultHTML(x, headline) {
  const rows = x.reads.map(r => `<div class="air-r"><span class="pill ${r.dir === 'up' ? 'up' : r.dir === 'down' ? 'down' : ''}"><b>${esc(r.label)}</b> ${DIR_TXT[r.dir] || '↕ Unclear'}</span><span class="air-c">${esc(r.conf)} confidence</span><p>${esc(r.why)}</p></div>`).join('');
  const deep = plan.tier === 'pro' ? `<button type="button" class="linkbtn air-deep" data-deep="${esc(headline)}">Deep dive</button>` : `<a class="linkbtn air-deep-up" href="/plans">Deep dive is part of Pro${PAYMENTS_OPEN ? '' : ' (coming soon)'}</a>`;
  return `<div class="air-head">${SPARK}<b>AI read</b><span>${x.used} of ${x.limit} used today</span></div>${rows}${x.take ? `<p class="air-take">${esc(x.take)}</p>` : ''}<div class="air-foot">${deep}<span>A lean, not a promise. Not financial advice.</span></div><div class="air-deepbox" hidden></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('[data-air]');
  if (b) {
    e.preventDefault();
    const host = b.closest('.air-row') || b.closest('.nr-meta') || b.parentElement;
    let box = host.nextElementSibling && host.nextElementSibling.classList.contains('air-box') ? host.nextElementSibling : null;
    if (box) { box.remove(); b.setAttribute('aria-expanded', 'false'); return; }
    box = document.createElement('div'); box.className = 'air-box'; host.after(box); b.setAttribute('aria-expanded', 'true');
    if (!signedIn()) { box.innerHTML = upsellHTML('signin'); return; }
    box.innerHTML = `<div class="air-head">${SPARK}<b>AI read</b><span>Reading the story…</span></div>${skel(2)}`;
    try { const x = await postAI('airead', { headline: b.dataset.air, markets: airMarkets() }); plan.used = x.used; box.innerHTML = airResultHTML(x, b.dataset.air); }
    catch (err) { box.innerHTML = upsellHTML(err.why, err.message); }
    return;
  }
  const d = e.target.closest && e.target.closest('[data-deep]');
  if (d) {
    const dbox = d.closest('.air-box').querySelector('.air-deepbox'); if (!dbox) return;
    if (!dbox.hidden) { dbox.hidden = true; return; }
    dbox.hidden = false; dbox.innerHTML = skel(3);
    try {
      const x = await postAI('aideep', { headline: d.dataset.deep, markets: airMarkets(), p: (profileQuery().match(/(?:^|&)p=([^&]*)/) || [])[1] ? decodeURIComponent(profileQuery().match(/(?:^|&)p=([^&]*)/)[1]) : '' });
      dbox.innerHTML = `<dl class="air-dl"><dt>If it plays out bullish</dt><dd>${esc(x.bull)}</dd><dt>If it plays out bearish</dt><dd>${esc(x.bear)}</dd><dt>What would change the read</dt><dd>${esc(x.flip)}</dd>${x.watch.length ? `<dt>Watch next</dt><dd><ul>${x.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul></dd>` : ''}${x.fit ? `<dt>For your strategies</dt><dd>${esc(x.fit)}</dd>` : ''}</dl>`;
    } catch (err) { dbox.innerHTML = upsellHTML(err.why, err.message); }
  }
});

const TIERS = [
  { id: 'free', name: 'Free', price: '$0', per: '', tag: 'Everything you use today', feats: ['All news, the Calendar, earnings and “Trade the news?”', 'Briefing calls from the site’s own rules, plus market reactions', 'Live read every minute, and the Scorecard', '3 AI reads a day when you’re signed in'] },
  { id: 'plus', name: 'Plus', price: '$10', per: '/ month', tag: 'AI on the stories that matter', feats: ['Everything in Free', 'AI read on any story: 40 a day', 'Your briefing’s “Unclear” calls filled in by AI automatically', 'AI-written morning brief and “Explain this” on every story'] },
  { id: 'pro', name: 'Pro', price: '$30', per: '/ month', tag: 'The full AI desk', feats: ['Everything in Plus', '250 AI reads a day', 'Deep dive on any story: both scenarios, what would flip it, what to watch, how it fits your strategies', 'AI-written “What’s next” outlook and game plan for your strategies', 'AI theses on memecoins'] }
];
PAGES.plans = () => {
  const paid = new URLSearchParams(location.search).get('paid');
  layout(`<div class="today-head"><h1 class="page-h">Plans</h1>
    <p class="page-intro">The news, calendar and rule-based reads stay free. Plus and Pro add AI that reads each story and tells you how your markets most likely react.${PAYMENTS_OPEN ? '' : ' Plus and Pro open soon. If you have a code, enter it below.'}</p></div>
    ${!PAYMENTS_OPEN && plan.admin ? '<p class="callout plans-ok">Sales are closed to the public. Only admins see the buy buttons, and payments are in Stripe test mode (fake cards only).</p>' : ''}
    ${paid ? '<p class="callout plans-ok">Thanks! Your payment went through. Your plan updates within a minute.</p>' : ''}
    <div id="plansNow"></div>
    <div class="plans">${TIERS.map(t => `<article class="plan-c ${t.id}" data-tier="${t.id}">
      <p class="plan-n">${t.name}${t.id === 'pro' ? '<span class="pill acc">Best value per read</span>' : ''}</p>
      <p class="plan-p"><b>${t.price}</b><span>${t.per}</span></p>
      <p class="plan-t">${esc(t.tag)}</p>
      <ul>${t.feats.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="plan-cta" data-cta="${t.id}"></div></article>`).join('')}</div>
    <section class="plan-code"><h2 class="sec">Have a code?</h2><p class="small faint">Lifetime codes give Pro for good. Each code works once.</p>
      <form id="codeForm" class="code-f"><input id="codeIn" class="search" placeholder="OPEN-XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false" aria-label="Your code"><button class="btn-ghost" type="submit">Redeem</button></form><p class="small" id="codeMsg" role="status"></p></section>
    <section class="plan-admin" id="planAdmin" hidden></section>
    <p class="disclaim">Prices in US dollars. Cancel anytime from “Manage billing”; you keep your plan until the end of the period you paid for. AI reads are a lean, not a promise, and not financial advice.</p>`);
  const draw = () => {
    const now = $('#plansNow');
    if (now) now.innerHTML = signedIn() ? `<p class="plans-now">You’re on <b class="plan-badge ${plan.tier}">${PLAN_NAME[plan.tier]}${plan.lifetime ? ' · lifetime' : ''}</b>${plan.period_end && !plan.lifetime ? ` · renews ${new Date(plan.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''} · ${plan.used || 0} of ${plan.limit || 3} AI reads used today${plan.has_billing ? ' · <button class="linkbtn" id="billBtn" type="button">Manage billing</button>' : ''}</p>` : '<p class="plans-now">Sign in to pick a plan or use a code.</p>';
    main.querySelectorAll('[data-cta]').forEach(el => { const t = el.dataset.cta;
      el.innerHTML = plan.tier === t ? '<span class="plan-cur">Your plan</span>' : t === 'free' ? '' : plan.lifetime ? '<span class="plan-cur">Included in your lifetime plan</span>' : !PAYMENTS_OPEN && !plan.admin ? '<span class="plan-cur">Coming soon</span>' : `<button class="${t === 'pro' ? 'btn-primary' : 'btn-ghost'}" type="button" data-buy="${t}">${TIER_RANK_C[t] > TIER_RANK_C[plan.tier] ? 'Get ' + PLAN_NAME[t] : 'Switch to ' + PLAN_NAME[t]}</button>`; });
    main.querySelectorAll('.plan-c').forEach(c => c.classList.toggle('cur', c.dataset.tier === plan.tier));
    main.querySelectorAll('[data-buy]').forEach(btn => btn.onclick = async () => {
      if (!signedIn()) { $('#codeMsg').textContent = ''; btn.textContent = 'Sign in first'; return; }
      btn.disabled = true; btn.textContent = 'Opening checkout…';
      try { const x = await postAI('checkout', { tier: btn.dataset.buy }); location.href = x.url; } catch (e) { btn.disabled = false; btn.textContent = e.message; }
    });
    const bb = $('#billBtn'); if (bb) bb.onclick = async () => { bb.textContent = 'Opening…'; try { location.href = (await postAI('portal', {})).url; } catch (e) { bb.textContent = e.message; } };
    drawAdmin();
  };
  $('#codeForm').onsubmit = async ev => { ev.preventDefault(); const msg = $('#codeMsg'), v = $('#codeIn').value.trim(); if (!v) return;
    if (!signedIn()) { msg.textContent = 'Sign in first, then enter your code.'; return; }
    msg.textContent = 'Checking…';
    try { const r = await rpc('open_redeem', { code: v }); if (r.ok) { msg.className = 'small ok'; msg.textContent = `Done. You now have ${PLAN_NAME[r.tier]} for life.`; $('#codeIn').value = ''; cache.clear(); await loadPlan(); draw(); } else { msg.className = 'small bad'; msg.textContent = r.why; } }
    catch (e) { msg.className = 'small bad'; msg.textContent = e.message; } };
  async function drawAdmin() {
    const box = $('#planAdmin'); if (!box) return;
    if (!plan.admin) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<h2 class="sec">Lifetime codes <span class="faint small">Only you see this</span></h2>
      <form class="code-f" id="mkForm"><input class="search" id="mkNote" placeholder="Who is it for? (only you see this)" maxlength="80"><select id="mkTier" class="search"><option value="pro">Pro</option><option value="plus">Plus</option></select><button class="btn-primary" type="submit">Make a code</button></form>
      <div id="mkOut"></div><div id="codeList">${skel(2)}</div>`;
    $('#mkForm').onsubmit = async ev => { ev.preventDefault(); const out = $('#mkOut');
      try { const code = await rpc('open_make_code', { p_tier: $('#mkTier').value, p_note: $('#mkNote').value });
        out.innerHTML = `<div class="code-new"><p class="small faint">Copy it now. For safety it’s only shown once.</p><code>${esc(code)}</code><button class="btn-ghost" type="button" id="cpCode">Copy</button></div>`;
        $('#cpCode').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(code); $('#cpCode').textContent = 'Copied'; };
        $('#mkNote').value = ''; listCodes(); } catch (e) { out.innerHTML = `<p class="small bad">${esc(e.message)}</p>`; } };
    listCodes();
  }
  async function listCodes() {
    const el = $('#codeList'); if (!el) return;
    try { const rows = await rpc('open_list_codes');
      el.innerHTML = rows.length ? `<table class="t codes"><tr><th>Code</th><th>For</th><th>Plan</th><th>Status</th><th></th></tr>${rows.map(r => `<tr><td><code>…${esc(r.hint)}</code></td><td>${esc(r.note || '—')}</td><td>${PLAN_NAME[r.tier]}</td><td>${r.revoked ? '<span class="faint">Cancelled</span>' : r.used ? `Used ${new Date(r.used_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Not used yet'}</td><td>${r.revoked ? '' : `<button class="linkbtn danger" type="button" data-revoke="${r.id}">Cancel</button>`}</td></tr>`).join('')}</table>` : '<p class="small faint">No codes yet.</p>';
      el.querySelectorAll('[data-revoke]').forEach(b => b.onclick = async () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sure? Click again'; return; } await rpc('open_revoke_code', { p_id: +b.dataset.revoke }); listCodes(); });
    } catch (e) { el.innerHTML = `<p class="small bad">${esc(e.message)}</p>`; }
  }
  draw();
  if (signedIn()) loadPlan().then(draw);
};
const TIER_RANK_C = { free: 0, plus: 1, pro: 2 };
addEventListener('open:plan', () => { cache.clear(); if (started) route(); });

// Today: keep the right column in view while the (longer) left column scrolls
function stickRight() {
  const r = document.querySelector('.front3 .t-right');
  if (!r) return;
  if (innerWidth < 981) { r.style.top = ''; return; }
  const head = (document.querySelector('.mast') || { offsetHeight: 0 }).offsetHeight || 0;
  r.style.top = Math.min(head + 16, innerHeight - r.offsetHeight - 16) + 'px';
}
addEventListener('resize', stickRight);
setInterval(() => { if (document.visibilityState === 'visible') stickRight(); }, 1500);
// ---------- Profile & badges ----------
const ICO = {
  star: '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/>',
  flame: '<path d="M12 2c1 3.5 5 5.6 5 10.5A5 5 0 0 1 12 22a5 5 0 0 1-5-5c0-2.7 1.6-4 2.6-5.6.3 1.6 1.1 2.6 2.4 3.1C11.4 11 10.9 6 12 2z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  crown: '<path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/>',
  cal: '<path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4" fill="none" stroke="currentColor" stroke-width="2"/>',
  check: '<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  spark: '<path d="M12 2l2.2 6.8L21 11l-6.8 2.2L12 20l-2.2-6.8L3 11l6.8-2.2z"/>',
  target: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.5"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>'
};
const ico = k => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${ICO[k] || ICO.star}</svg>`;
// Each badge: how it's earned, and progress toward it
const BADGES = [
  { id: 'founder', name: 'Founder', ico: 'crown', how: 'Runs The Open One', test: s => s.admin },
  { id: 'lifetime', name: 'Lifetime member', ico: 'shield', how: 'Has a lifetime code', test: s => s.lifetime },
  { id: 'pro', name: 'Pro', ico: 'spark', how: 'On the Pro plan', test: s => s.tier === 'pro' },
  { id: 'plus', name: 'Plus', ico: 'spark', how: 'On the Plus plan', test: s => s.tier === 'plus' },
  { id: 'early', name: 'Early member', ico: 'star', how: 'Joined in 2026, before the crowd', test: s => s.joined && Date.parse(s.joined) < Date.parse('2027-01-01') },
  { id: 'setup', name: 'All set up', ico: 'check', how: 'Picked markets and strategy in setup', test: () => hasProfile() },
  { id: 'alerts', name: 'Never miss it', ico: 'bell', how: 'Turned on alerts and notifications', test: () => { try { return 'Notification' in window && Notification.permission === 'granted'; } catch { return false; } } },
  { id: 'ai1', name: 'First AI read', ico: 'bolt', how: 'Use the AI read once', goal: 1, val: s => s.ai_reads },
  { id: 'ai25', name: 'AI regular', ico: 'bolt', how: 'Use 25 AI reads', goal: 25, val: s => s.ai_reads },
  { id: 'ai100', name: 'AI power user', ico: 'bolt', how: 'Use 100 AI reads', goal: 100, val: s => s.ai_reads },
  { id: 'streak3', name: 'On a roll', ico: 'flame', how: 'Open the site 3 days in a row', goal: 3, val: s => s.best_streak },
  { id: 'streak7', name: 'Full week', ico: 'flame', how: '7 days in a row', goal: 7, val: s => s.best_streak },
  { id: 'streak30', name: 'Every session', ico: 'flame', how: '30 days in a row', goal: 30, val: s => s.best_streak },
  { id: 'days10', name: 'Regular', ico: 'cal', how: 'Active on 10 different days', goal: 10, val: s => s.days_active },
  { id: 'days50', name: 'Veteran', ico: 'cal', how: 'Active on 50 different days', goal: 50, val: s => s.days_active },
  { id: 'days100', name: 'Centurion', ico: 'cal', how: 'Active on 100 different days', goal: 100, val: s => s.days_active },
];
// Personal badges, built from the answers each person gave in setup: who they are as a trader, and goals tied to their own session
const STRAT_BADGE = { ict: ['Smart money', 'Trades ICT concepts'], pa: ['Price action purist', 'Reads price, support and resistance'], sd: ['Zone trader', 'Trades supply and demand zones'], orderflow: ['Tape reader', 'Reads order flow and volume'], ind: ['Indicator tuner', 'Trades with indicators'], news: ['Headline hunter', 'Trades the news'], trend: ['Trend rider', 'Follows the trend'], momentum: ['Momentum chaser', 'Trades momentum and breakouts'], fundamentals: ['Macro mind', 'Trades central banks and fundamentals'], value: ['Value hunter', 'Buys good companies cheap'], growth: ['Growth investor', 'Backs fast-growing companies'], index: ['Index investor', 'Buys and holds index funds'], dividends: ['Dividend collector', 'Invests for dividends'], earnings: ['Earnings player', 'Trades earnings'], buy: ['Options buyer', 'Buys calls and puts'], sell: ['Premium seller', 'Sells options premium'], spreads: ['Spread builder', 'Trades option spreads'], zero: ['0DTE', 'Trades same-day options'], perps: ['Leverage pilot', 'Trades perpetual futures'], narratives: ['Sector rotator', 'Rotates between crypto sectors'], onchain: ['On-chain sleuth', 'Reads on-chain data'], launches: ['Launch sniper', 'Catches new launches early'], trending: ['Trend surfer', 'Rides trending coins'], wallets: ['Wallet tracker', 'Copies smart wallets'], hold: ['Diamond hands', 'Holds for the long run'], swing: ['Chart swinger', 'Swing trades the charts'] };
const HOLD_BADGE = { scalp: ['Scalper', 'In and out in minutes'], minutes: ['Quick flipper', 'Flips in minutes'], day: ['Day trader', 'Flat by the close'], swing: ['Swing trader', 'Holds for days to weeks'], position: ['Position trader', 'Holds for weeks to months'], invest: ['Long game', 'Invests for years'], hold: ['Long game', 'Holds for months or longer'] };
const SESS_BADGE = { premarket: ['Early riser', 'Watches the hours before the US open'], nyopen: ['Opening bell', 'Trades the New York open'], midday: ['Midday trader', 'Trades the middle of the day'], nyclose: ['Closing bell', 'Trades into the close'], evening: ['After hours', 'Watches the evening'], asia: ['Night owl', 'Trades the Asia session'], london: ['London early bird', 'Trades the London open'], weekend: ['Weekend warrior', 'Watches the weekends'] };
function personalBadges() {
  const a = me.answers || {}, out = [], seen = new Set();
  const add = (id, name, how, ico) => { if (seen.has(name)) return; seen.add(name); out.push({ id, name, how, ico, test: () => true, personal: true }); };
  const mk = (a.markets || []).filter(m => m !== 'learning');
  mk.forEach(m => (a[`${m}.strategy`] || []).forEach(st => { const b = STRAT_BADGE[st]; if (b) add('st-' + st, b[0], b[1], 'target'); }));
  mk.forEach(m => (a[`${m}.hold`] || []).forEach(h => { const b = HOLD_BADGE[h]; if (b) add('hd-' + h, b[0], b[1], 'bolt'); }));
  const acct = mk.flatMap(m => a[`${m}.account`] || []);
  if (acct.includes('funded')) add('ac-funded', 'Funded trader', 'Trades a funded prop account', 'shield');
  else if (acct.includes('eval')) add('ac-eval', 'Prop challenger', 'Working on a prop firm evaluation', 'shield');
  else if (acct.includes('prop')) add('ac-prop', 'Prop trader', 'Trades a prop firm account', 'shield');
  if (mk.length >= 3) add('mk-multi', 'Multi-market', `Follows ${mk.length} markets`, 'star');
  (a.sessions || []).forEach(id => { const b = SESS_BADGE[id]; if (b) add('ss-' + id, b[0], b[1], 'cal'); });
  if ((a.markets || []).includes('learning')) add('lv-learn', 'Learning the ropes', 'Here to learn the markets', 'star');
  // Goals tied to their own trading time: on the site before their session starts
  const ss = (a.sessions || []).map(id => ({ id, ...(SESSIONS_C[id] || {}) })).find(x => x.from != null);
  if (ss) [[5, 'Ready'], [20, 'Prepared'], [50, 'Never unprepared']].forEach(([g, n]) => out.push({ id: `prep${g}-${ss.id}`, name: `${n} · ${ss.label}`, ico: 'flame', how: `On the site before ${ss.phrase || ss.label} starts, on ${g} days`, goal: g, val: s => (s.first_mins || []).filter(x => x <= ss.from && x >= ss.from - 180).length, personal: true }));
  return out;
}
const earned = (b, s) => b.test ? !!b.test(s) : (b.val(s) || 0) >= b.goal;
function badgeHTML(b, s, opts = {}) {
  const ok = earned(b, s), v = b.val ? Math.min(b.val(s) || 0, b.goal) : null;
  return `<button type="button" class="bdg${ok ? ' on' : ''}${opts.picked ? ' picked' : ''}" data-bdg="${b.id}" ${ok ? '' : 'disabled'} title="${esc(b.how)}">
    <span class="bdg-i">${ico(b.ico)}</span><span class="bdg-t"><b>${esc(b.name)}</b><small>${ok ? esc(b.how) : b.goal ? `${v} / ${b.goal} · ${esc(b.how)}` : esc(b.how)}</small>${!ok && b.goal ? `<span class="bdg-p"><i style="width:${Math.round(v / b.goal * 100)}%"></i></span>` : ''}</span>
    ${opts.picked ? '<span class="bdg-pin">Shown</span>' : ''}</button>`;
}
const chip = (b) => `<span class="bdg-chip">${ico(b.ico)}${esc(b.name)}</span>`;
const PROF = {
  async get() { const sb = sbClient(); const { data } = await sb.from('open_user_profile').select('display_name, bio, avatar_url, showcase').eq('user_id', me.user.id).maybeSingle(); return data || {}; },
  async save(p) { const sb = sbClient(); const { error } = await sb.from('open_user_profile').upsert({ user_id: me.user.id, ...p, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }); if (error) throw new Error(error.message); },
  stats: () => rpc('open_my_stats'),
  async upload(blob) { const sb = sbClient(); const path = `${me.user.id}/avatar-${Date.now()}.webp`; const { error } = await sb.storage.from('open-avatars').upload(path, blob, { contentType: 'image/webp', upsert: true }); if (error) throw new Error(error.message); return sb.storage.from('open-avatars').getPublicUrl(path).data.publicUrl; }
};
// Square-crop and shrink a photo to 256px WebP in the browser (also strips location data from phone photos)
function shrinkPhoto(file) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(new Error('Pick an image file (PNG, JPG, WebP or GIF).'));
    if (file.size > 8 * 1024 * 1024) return rej(new Error('That image is over 8 MB. Pick a smaller one.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Couldn’t read that image.')), 'image/webp', 0.88); };
    img.onerror = () => rej(new Error('Couldn’t read that image.'));
    img.src = url;
  });
}
PAGES.profile = () => {
  const P = window.__PROF || PROF;
  if (!signedIn()) { layout(`<h1 class="page-h">Profile</h1><p class="page-intro">Sign in to set your photo, name and bio, and to start earning badges.</p>`); return; }
  layout(`<h1 class="page-h">Profile</h1>
    <section class="prof-card" id="profCard">${skel(3)}</section>
    <section class="prof-edit" id="profEdit" hidden></section>
    <h2 class="sec">Your stats</h2><div class="prof-stats" id="profStats">${skel(1)}</div>
    <div class="sec-row"><h2 class="sec">Badges</h2><span class="small faint">Pick up to 3 to show next to your name</span></div>
    <div class="bdg-grid" id="bdgGrid">${skel(3)}</div>`);
  let prof = {}, st = {};
  const draw = () => {
    const all = [...personalBadges(), ...BADGES];
    const show = (prof.showcase || []).map(id => all.find(b => b.id === id)).filter(b => b && earned(b, st));
    const name = prof.display_name || me.name || 'You';
    $('#profCard').innerHTML = `<div class="prof-av">${prof.avatar_url ? `<img src="${esc(prof.avatar_url)}" alt="">` : `<span>${esc(name.charAt(0).toUpperCase())}</span>`}</div>
      <div class="prof-main"><p class="prof-name">${esc(name)}${plan.tier !== 'free' ? ` <span class="plan-badge ${plan.tier}">${PLAN_NAME[plan.tier]}</span>` : ''}</p>
        <p class="prof-bio">${prof.bio ? esc(prof.bio) : '<span class="faint">No bio yet.</span>'}</p>
        <div class="prof-show">${show.map(chip).join('') || '<span class="small faint">No badges shown yet. Pick some below.</span>'}</div></div>
      <button type="button" class="btn-ghost" id="profEditBtn">Edit profile</button>`;
    $('#profEditBtn').onclick = openEdit;
    const since = st.joined ? new Date(st.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
    $('#profStats').innerHTML = [['Day streak', st.streak || 0], ['Best streak', st.best_streak || 0], ['Days active', st.days_active || 0], ['AI reads', st.ai_reads || 0], ['Member since', since]].map(([l, v]) => `<div><small>${l}</small><b>${esc(String(v))}</b></div>`).join('');
    const pick = new Set(prof.showcase || []);
    const list = [...personalBadges(), ...BADGES].filter(b => !['plus', 'pro', 'founder', 'lifetime'].includes(b.id) || earned(b, st));
    const on = list.filter(b => earned(b, st)), off = list.filter(b => !earned(b, st));
    const pers = on.filter(b => b.personal && !b.goal), rest = on.filter(b => !(b.personal && !b.goal));
    $('#bdgGrid').innerHTML = `<p class="small faint bdg-count">${on.length} of ${list.length} earned</p>`
      + (pers.length ? `<p class="bdg-sub">Your trader identity <span class="faint">· from your setup answers</span></p>` + pers.map(b => badgeHTML(b, st, { picked: pick.has(b.id) })).join('') : '')
      + `<p class="bdg-sub">Earned</p>` + rest.map(b => badgeHTML(b, st, { picked: pick.has(b.id) })).join('')
      + (off.length ? `<p class="bdg-sub">Still to earn</p>` + off.map(b => badgeHTML(b, st)).join('') : '');
    $('#bdgGrid').querySelectorAll('.bdg.on').forEach(el => el.onclick = async () => {
      const id = el.dataset.bdg; const cur = new Set(prof.showcase || []);
      if (cur.has(id)) cur.delete(id); else { if (cur.size >= 3) { const first = [...cur][0]; cur.delete(first); } cur.add(id); }
      prof.showcase = [...cur]; draw();
      try { await P.save({ showcase: prof.showcase }); setProfileLocal({ showcase: prof.showcase }); } catch (e) { toastMsg(e.message); }
    });
  };
  const toastMsg = m => { const t = $('#profMsg'); if (t) t.textContent = m; };
  function openEdit() {
    const box = $('#profEdit'); box.hidden = false;
    box.innerHTML = `<form id="profForm" class="prof-form">
      <div class="prof-photo"><div class="prof-av" id="pfAv">${prof.avatar_url ? `<img src="${esc(prof.avatar_url)}" alt="">` : `<span>${esc((prof.display_name || me.name || 'Y').charAt(0).toUpperCase())}</span>`}</div>
        <label class="btn-ghost"><input type="file" id="pfFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>Change photo</label>
        ${prof.avatar_url ? '<button type="button" class="linkbtn" id="pfDel">Remove photo</button>' : ''}</div>
      <label class="pf-l">Display name<input class="search" id="pfName" maxlength="40" value="${esc(prof.display_name || me.name || '')}"></label>
      <label class="pf-l">Bio <small class="faint" id="pfCnt"></small><textarea class="search" id="pfBio" maxlength="280" rows="3" placeholder="What you trade, your style, your goals…">${esc(prof.bio || '')}</textarea></label>
      <div class="pf-btns"><button class="btn-primary" type="submit">Save</button><button class="btn-ghost" type="button" id="pfCancel">Cancel</button><span class="small" id="profMsg" role="status"></span></div></form>`;
    let newPhoto = undefined;
    const cnt = () => { $('#pfCnt').textContent = `${$('#pfBio').value.length}/280`; }; cnt(); $('#pfBio').oninput = cnt;
    $('#pfFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { newPhoto = await shrinkPhoto(f); $('#pfAv').innerHTML = `<img src="${URL.createObjectURL(newPhoto)}" alt="">`; toastMsg(''); } catch (err) { toastMsg(err.message); } };
    if ($('#pfDel')) $('#pfDel').onclick = () => { newPhoto = null; $('#pfAv').innerHTML = `<span>${esc(($('#pfName').value || 'Y').charAt(0).toUpperCase())}</span>`; };
    $('#pfCancel').onclick = () => { box.hidden = true; };
    $('#profForm').onsubmit = async ev => { ev.preventDefault(); toastMsg('Saving…');
      try {
        const upd = { display_name: $('#pfName').value.trim().slice(0, 40) || null, bio: $('#pfBio').value.trim().slice(0, 280) || null };
        if (newPhoto) upd.avatar_url = await P.upload(newPhoto); else if (newPhoto === null) upd.avatar_url = null;
        await P.save(upd); prof = { ...prof, ...upd }; setProfileLocal({ display_name: upd.display_name || me.name, avatar_url: 'avatar_url' in upd ? upd.avatar_url : prof.avatar_url });
        box.hidden = true; draw();
      } catch (e) { toastMsg('Couldn’t save: ' + e.message); } };
  }
  Promise.all([P.get().catch(() => ({})), P.stats().catch(() => ({}))]).then(([p, s]) => { prof = p || {}; st = s || {}; if (!$('#profCard')) return; draw(); });
};

// ---------- router ----------
const ALIASES = { movers: 'markets', memecoins: 'memes', economy: 'calendar', earnings: 'calendar' };
const SLUG = { memes: 'memecoins' };
const pagePath = key => key === 'today' ? '/' : '/' + (SLUG[key] || key);
function currentPage() {
  // Old links used #news style addresses: move them to /news (but leave sign-in tokens alone)
  const h = location.hash.slice(1).split('?')[0];
  if (h && (PAGES[h] || ALIASES[h])) history.replaceState(null, '', pagePath(ALIASES[h] || h));
  const p = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || 'today';
  const key = ALIASES[p] || p;
  if (p === 'earnings') store.set('calEarnings', true);
  if (ALIASES[p] && PAGES[key]) history.replaceState(null, '', pagePath(key) + location.search);
  // Keep one address per page, e.g. /memes becomes /memecoins
  if (PAGES[key] && SLUG[key] && p !== SLUG[key]) history.replaceState(null, '', pagePath(key) + location.search);
  return key;
}
function route(isRefresh = false) {
  const page = currentPage();
  const key = PAGES[page] ? page : 'today';
  if (!PAGES[page] && location.pathname !== '/') history.replaceState(null, '', '/');
  if (isRefresh && key === 'glossary') return;
  refreshing = isRefresh && shownPage === key;
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === pagePath(key) ? 'page' : 'false'));
  const cur = document.querySelector('#tabs a[aria-current="page"]');
  if (cur && !isRefresh) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.title = key === 'today' ? 'The Open One' : (cur ? cur.textContent : '') + ' | The Open One';
  shownPage = key; main.dataset.page = key;
  PAGES[key]();
  refreshing = false;
}
function go(path) {
  if (!started) { if (path !== location.pathname) location.assign(path); return; }
  if (path !== location.pathname) history.pushState(null, '', path);
  exitFs(); route(); main.focus({ preventScroll: true }); window.scrollTo({ top: 0 });
}
document.addEventListener('click', e => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest && e.target.closest('a[href^="/"]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const p = url.pathname.replace(/^\/+|\/+$/g, '') || 'today';
  if (!PAGES[ALIASES[p] || p]) return;
  e.preventDefault();
  go(url.pathname);
});
addEventListener('popstate', () => { if (!started) return; exitFs(); route(); });
function orderTabs() {
  const nav = $('#tabs'), mk = myMarkets();
  const links = [...nav.querySelectorAll('a')];
  const fixed = ['/', '/news', '/markets', '/heatmaps'].map(h => links.find(a => a.getAttribute('href') === h));
  const mine = links.filter(a => a.dataset.m && a.dataset.m.split(' ').some(m => mk.includes(m)));
  const rest = links.filter(a => !fixed.includes(a) && !mine.includes(a));
  links.forEach(a => a.classList.toggle('mine', mine.includes(a)));
  [...fixed, ...mine, ...rest].forEach(a => nav.appendChild(a));
}
async function levelRows() {
  const D = await personalData();
  return myAssets().map(a => assetView(a, D)).filter(v => v && v.L).map(v => ({ id: shortName(v.a), L: v.L.levels, fmt: x => (v.money ? '$' : '') + num(x, v.dp) }));
}


// ---------- Live: livestreams, the floating player and the release room ----------
// Only red (high-impact) events for the user's currencies get a stream or a release room.
const LS = { ch: {}, cal: [], room: null, tick: null, loaded: false };
const LS_STREAM = [
  { re: /election/i, ccy: 'USD', src: 'cspan', what: 'Election night coverage' },
  { re: /fomc press conference|press conference.*(fed|fomc)|powell/i, ccy: 'USD', src: 'fed', what: 'Fed press conference' },
  { re: /fomc statement|federal funds rate|fed interest rate|fomc economic projections/i, ccy: 'USD', src: 'fed', what: 'Fed decision' },
  { re: /president trump|trump speaks|white house|address to the nation/i, ccy: 'USD', src: 'wh', what: 'White House' },
  { re: /fomc member|fed chair|fed governor|speaks|testif/i, ccy: 'USD', src: 'bloomberg', what: 'Fed speaker coverage' },
  { re: /ecb press conference|lagarde|main refinancing rate|monetary policy statement|deposit facility/i, ccy: 'EUR', src: 'bloomberg', what: 'ECB coverage' },
  { re: /official bank rate|boe|bailey|mpc/i, ccy: 'GBP', src: 'boe', what: 'Bank of England' },
  { re: /boj|policy rate|ueda/i, ccy: 'JPY', src: 'bloomberg', what: 'Bank of Japan coverage' }
];
const LS_CHANNEL_FALLBACK = { fed: 'UCAzhpt9DmG6PnHXjmJTvRGQ', wh: 'UCYxRlFDqcWM4y7FfpiAN3KQ', bloomberg: 'UCIALMKvObZNtJ6AmdCLP7Lg', yahoo: 'UCEAZeUIeJs0IjQiqTCdVSIg', cspan: 'UCb--64Gl51jIEVE-GLDAVTg', boe: 'UCZ25rmSDSnjIWZxjd2-04Rg' };
const LS_NAMES = { fed: 'Federal Reserve', wh: 'The White House', bloomberg: 'Bloomberg Television', yahoo: 'Yahoo Finance', cspan: 'C-SPAN', boe: 'Bank of England', cnbc: 'CNBC Television' };
// Big live moments outside the calendar: a White House or C-SPAN stream about something that moves markets
const LS_MOVER = /election|tariff|trade deal|china|iran|israel|russia|ukraine|strike|military|war|sanction|oil|economy|inflation|fed\b|interest rate|jobs|crypto|bitcoin|stablecoin|executive order|address to the nation|press conference|announcement|deal/i;
const lsKey = e => `${e.country}|${e.title}|${e.time}`;
function lsFor(e) {
  if (!e) return null;
  const elec = /election/i.test(e.title) && e.country === 'USD';
  if ( e.impact !== 'High' || (e.allDay && !elec) || (TN_NOTREL.test(e.title) && !elec) || !tnCcys().has(e.country)) return null;
  const t = `${e.title} ${e.name || ''}`;
  const s = LS_STREAM.find(x => x.ccy === e.country && x.re.test(t));
  if (s) {
    // Calendar times for speeches and events can be placeholders. When the channel has posted the stream,
    // its own scheduled start (or the fact it's live) wins, as long as it's the same day's event.
    const ch = LS.ch[s.src], near = t2 => Math.abs(t2 - e.time) < 14 * 3600e3;
    let ev = e;
    if (ch && ch.start && (ch.state === 'upcoming' || ch.state === 'live') && near(ch.start)) ev = { ...e, time: ch.start, calTime: e.time };
    else if (ch && ch.state === 'live' && near(Date.now())) ev = { ...e, time: Math.min(e.time, Date.now()), calTime: e.time };
    return { kind: 'stream', src: s.src, what: s.what, key: lsKey(e), ev, live: !!ch && ch.state === 'live' };
  }
  return { kind: 'release', src: e.country === 'USD' ? 'yahoo' : 'bloomberg', what: 'Release room', key: lsKey(e), ev: e };
}
const lsChan = k => LS.ch[k] || { key: k, name: LS_NAMES[k] || k, channel: LS_CHANNEL_FALLBACK[k], state: 'unknown' };
async function loadLive(force) {
  try { const d = await api('streams', force ? 0 : 45e3); (d.channels || []).forEach(c => { LS.ch[c.key] = c; }); } catch {}
  try { const c = await api('calendar', 10 * 60e3); LS.cal = c.events || []; } catch {}
  LS.loaded = true; renderLiveSoon(); lsMarkCalendar();
}
function lsNext(now = Date.now()) {
  // Everything big left today (or in the next 12 hours), plus what's live or just out. Same-time releases are one card.
  const day = nyDay(now), seen = new Set();
  const list = LS.cal.map(lsFor).filter(Boolean).filter(x => {
    const t = x.ev.time;
    if (t > now) return nyDay(t) === day || t - now < 12 * 3600e3;
    return x.kind === 'stream' ? (x.live || now - t < 90 * 60e3) : now - t < 20 * 60e3;
  }).filter(x => { const k = x.kind + x.ev.time; if (seen.has(k)) return false; seen.add(k); return true; });
  const names = x => [...new Set(LS.cal.filter(e => e.time === (x.ev.calTime ?? x.ev.time) && lsFor(e) && lsFor(e).kind === x.kind).map(e => e.name || e.title))];
  list.forEach(x => { x.names = names(x); });
  const soon = list.filter(x => x.ev.time > now).sort((a, b) => a.ev.time - b.ev.time);
  const on = list.filter(x => x.ev.time <= now).sort((a, b) => b.ev.time - a.ev.time);
  return [...on.slice(0, 1), ...soon].slice(0, 3);
}
const nyDay = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
function lsMover() {
  return ['wh', 'cspan'].map(lsChan).find(c => c.state === 'live' && c.embed !== false && LS_MOVER.test(c.title || '')) || null;
}
function lsWhen(t, now = Date.now()) {
  const s = Math.round((t - now) / 1e3);
  if (s <= 0) return null;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  return m < 10 ? `${m}m ${String(r).padStart(2, '0')}s` : `${m} min`;
}
function renderLiveSoon() {
  const el = $('#liveSoon'); if (!el) return;
  const now = Date.now(), xs = lsNext(now), mv = lsMover();
  if (!xs.length && !mv) { el.hidden = true; el.innerHTML = ''; return; }
  let html = '';
  for (const x of xs) {
    const ch = lsChan(x.src), until = lsWhen(x.ev.time, now), live = x.kind === 'stream' && ch.state === 'live';
    const head = x.kind === 'stream' ? (live ? 'Live now' : until ? `Livestream in <b data-cd="${x.ev.time}">${until}</b>` : 'Starting now') : (until ? `News drop in <b data-cd="${x.ev.time}">${until}</b>` : 'Just dropped');
    const far = x.ev.time - now > 60 * 60e3;
    html += `<div class="ls-card ${x.kind}${live ? ' on' : ''}${far ? ' far' : ''}"><span class="ls-dot"></span><div class="ls-txt"><p class="ls-head">${head}</p><p class="ls-name">${esc((x.names || [x.ev.name || x.ev.title]).slice(0, 2).join(' + '))} <span class="faint">· ${live ? esc(ch.title || 'On air') : `${fmtTime(x.ev.time)} ${tzAbbr(x.ev.time)}`} · ${esc(x.kind === 'stream' ? ch.name : 'High volatility')}</span></p></div>
      <div class="ls-acts">${x.kind === 'stream' ? `<button class="btn-primary sm" data-ls="${esc(x.key)}">${live ? 'Watch live' : 'Join early'}</button>` : `<button class="btn-primary sm" data-ls="${esc(x.key)}">${far ? 'Release room' : 'Open release room'}</button>${far ? '' : `<button class="btn-ghost sm" data-ls-src="${x.src}">Watch coverage</button>`}`}</div></div>`;
  }
  if (mv && !xs.some(x => x.kind === 'stream' && x.src === mv.key && lsChan(x.src).state === 'live')) html += `<div class="ls-card mover on"><span class="ls-dot"></span><div class="ls-txt"><p class="ls-head">Live now · ${esc(mv.name)}</p><p class="ls-name">${esc(mv.title)}</p></div><div class="ls-acts"><button class="btn-primary sm" data-ls-src="${mv.key}">Watch live</button></div></div>`;
  el.innerHTML = html; el.hidden = false;
}
// Countdown text updates every second without re-rendering
function lsTick() {
  const now = Date.now();
  document.querySelectorAll('[data-cd]').forEach(b => { const w = lsWhen(+b.dataset.cd, now); if (w) b.textContent = w; else { renderLiveSoon(); } });
  if (LS.room) renderRoom(true);
}
function lsMarkCalendar() {
  document.querySelectorAll('.ff-row[data-k]').forEach(row => {
    if (row.querySelector('.ls-btn')) return;
    const e = LS.cal.find(x => lsKey(x) === row.dataset.k); const x = lsFor(e);
    if (!x) return;
    const ch = lsChan(x.src), live = x.kind === 'stream' && ch.state === 'live';
    const b = document.createElement('button'); b.type = 'button'; b.className = `ls-btn ${x.kind}${live ? ' on' : ''}`; b.dataset.ls = x.key;
    b.innerHTML = x.kind === 'stream' ? `<span class="ls-dot"></span>${live ? 'Live now' : 'Livestream'}` : '<span class="ls-dot"></span>Release room';
    b.title = x.kind === 'stream' ? `Watch on ${ch.name}` : 'Countdown, the actual number the moment it lands, and a live 1-minute chart';
    const host = row.querySelector('.ff-e'); if (host) host.appendChild(b);
  });
}
// ---- floating player: drag the bar to move it, drag the corner to resize, keeps playing while you browse ----
function openPlayer(src, opt = {}) {
  const ch = lsChan(src);
  const vid = opt.vid || ch.vid;
  const url = vid ? `https://www.youtube.com/embed/${vid}?autoplay=1&playsinline=1&rel=0` : `https://www.youtube.com/embed/live_stream?channel=${ch.channel}&autoplay=1&playsinline=1`;
  let p = $('#lsPlayer');
  if (!p) {
    p = document.createElement('div'); p.id = 'lsPlayer'; p.className = 'lsp'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Livestream player');
    p.innerHTML = `<div class="lsp-bar"><span class="ls-dot"></span><span class="lsp-t"></span><div class="lsp-b"><button type="button" data-sz="s" title="Small">S</button><button type="button" data-sz="m" title="Medium">M</button><button type="button" data-sz="l" title="Large">L</button><button type="button" class="lsp-min" title="Minimize" aria-label="Minimize">–</button><button type="button" class="lsp-x" title="Close" aria-label="Close">×</button></div></div><div class="lsp-v"><iframe allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><div class="lsp-shield"></div></div><span class="lsp-grip" aria-hidden="true"></span>`;
    document.body.appendChild(p);
    const box = store.get('lsBox', null);
    const place = (b) => { const w = Math.min(Math.max(b.w, 280), innerWidth - 16), h = Math.min(Math.max(b.h, 158), innerHeight - 16); p.style.width = w + 'px'; p.style.height = h + 'px'; p.style.left = Math.min(Math.max(8, b.x), innerWidth - w - 8) + 'px'; p.style.top = Math.min(Math.max(8, b.y), innerHeight - h - 8) + 'px'; };
    const save = () => { const r = p.getBoundingClientRect(); store.set('lsBox', { x: r.left, y: r.top, w: r.width, h: r.height }); };
    const def = () => { const w = Math.min(480, innerWidth - 24), h = Math.round(w * 9 / 16) + 36; return { w, h, x: innerWidth - w - 16, y: innerHeight - h - 16 }; };
    place(box || def());
    const drag = (el, fn) => el.addEventListener('pointerdown', ev => { if (ev.button !== 0 || ev.target.closest('button')) return; ev.preventDefault(); const r = p.getBoundingClientRect(), sx = ev.clientX, sy = ev.clientY; p.classList.add('moving'); el.setPointerCapture(ev.pointerId);
      const mv = e2 => fn(r, e2.clientX - sx, e2.clientY - sy); const up = () => { p.classList.remove('moving'); el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); save(); }; el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); });
    drag(p.querySelector('.lsp-bar'), (r, dx, dy) => place({ x: r.left + dx, y: r.top + dy, w: r.width, h: r.height }));
    drag(p.querySelector('.lsp-grip'), (r, dx, dy) => place({ x: r.left, y: r.top, w: r.width + dx, h: r.height + dy }));
    const SZ = { s: 320, m: 480, l: Math.min(860, innerWidth - 32) };
    p.querySelectorAll('[data-sz]').forEach(b => b.onclick = () => { const r = p.getBoundingClientRect(), w = Math.min(SZ[b.dataset.sz], innerWidth - 16), h = Math.round(w * 9 / 16) + 36; p.classList.remove('min'); place({ x: r.right - w, y: r.bottom - h, w, h }); save(); });
    p.querySelector('.lsp-min').onclick = () => p.classList.toggle('min');
    p.querySelector('.lsp-x').onclick = () => { p.querySelector('iframe').src = 'about:blank'; p.remove(); };
    addEventListener('resize', () => { if (document.body.contains(p)) { const r = p.getBoundingClientRect(); place({ x: r.left, y: r.top, w: r.width, h: r.height }); } });
  }
  p.classList.remove('min');
  p.querySelector('.lsp-t').textContent = opt.title || (ch.title ? `${ch.name} · ${ch.title}` : ch.name);
  p.classList.toggle('on', ch.state === 'live');
  const f = p.querySelector('iframe'); if (f.src !== url) f.src = url;
}
// ---- release room: countdown, then actual vs forecast the moment it lands, with a live 1-minute chart ----
function openRoom(x) {
  LS.room = x;
  let o = $('#lsRoom');
  if (!o) { o = document.createElement('div'); o.id = 'lsRoom'; o.className = 'lsr'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); document.body.appendChild(o); }
  const sym = (myAssets().find(a => a.tv) || {}).tv || 'OANDA:NAS100USD';
  o.innerHTML = `<div class="lsr-in"><div class="lsr-top"><p class="lsr-k"><span class="ls-dot"></span>Release room · ${esc(x.ev.country)} · High volatility</p><button type="button" class="lsr-x" aria-label="Close release room">×</button></div>
    <h2 class="lsr-h">${esc(x.ev.name || x.ev.title)}</h2>
    <div class="lsr-grid"><div class="lsr-main"><div id="lsrBody"></div><div class="lsr-acts"><button type="button" class="btn-ghost sm" data-ls-src="${x.src}">Watch market coverage</button></div></div>
    <div class="lsr-chart"><div class="lsr-ch-h"><span>Live 1-minute chart</span><span class="faint small">${esc((myAssets().find(a => a.tv) || {}).name || 'Nasdaq 100')}</span></div><div id="lsrChart" class="lsr-tv"></div></div></div></div>`;
  o.hidden = false; document.body.classList.add('room-open');
  o.querySelector('.lsr-x').onclick = closeRoom;
  o.onclick = ev => { if (ev.target === o) closeRoom(); };
  try { tvWidget($('#lsrChart'), 'advanced-chart', { autosize: true, symbol: sym, interval: '1', timezone: 'America/New_York', theme: tvTheme(), style: '1', locale: 'en', hide_volume: true, allow_symbol_change: true, save_image: false, calendar: false, hide_side_toolbar: true }); } catch {}
  renderRoom();
  pollResults();
}
function closeRoom() { LS.room = null; const o = $('#lsRoom'); if (o) { o.hidden = true; o.innerHTML = ''; } document.body.classList.remove('room-open'); }
function renderRoom(tickOnly) {
  const x = LS.room, el = $('#lsrBody'); if (!x || !el) return;
  const r = results.map[x.key] || null, now = Date.now(), t = x.ev.time;
  const done = r && r.released && r.actual;
  if (tickOnly && el.dataset.state === (done ? 'done' : 'wait') && !done) { const c = el.querySelector('.lsr-cd'); if (c) c.innerHTML = lsClock(t - now); return; }
  if (tickOnly && done && el.dataset.state === 'done') return;
  el.dataset.state = done ? 'done' : 'wait';
  const fc = (r && r.forecast) || x.ev.forecast || '', pv = ((r && r.previous) || x.ev.previous || '').split('|')[0];
  if (!done) {
    el.innerHTML = `<div class="lsr-cd">${lsClock(t - now)}</div><p class="lsr-sub">${t > now ? `Out at ${fmtTime(t)} ${tzAbbr(t)}. The number appears here the moment it lands.` : 'Waiting for the number. It usually appears within seconds.'}</p>
      <div class="lsr-nums"><div><small>Forecast</small><b>${esc(fc || '—')}</b></div><div><small>Previous</small><b>${esc(pv || '—')}</b></div><div class="lsr-act"><small>Actual</small><b class="faint">…</b></div></div>
      ${scenHTML(x.ev, r)}
      <p class="lsr-note">The first minute after big data is often a fake-out. The site waits 10 minutes before its Live read leans again.</p>${histSlot(x.ev, r)}`;
    fillHist(el);
    return;
  }
  const v = relVerdict(r), rest = v.effs.slice(1);
  el.innerHTML = `<p class="lsr-call ${v.cls}">${esc(v.head)}</p>
    <div class="lsr-nums big"><div class="lsr-act"><small>Actual</small><b class="${r.ccyDir === 'good' ? 'up' : r.ccyDir === 'bad' ? 'down' : ''}">${esc(r.actual)}</b></div><div><small>Forecast</small><b>${esc(fc || '—')}</b></div><div><small>Previous</small><b>${esc(pv || '—')}</b></div></div>
    <p class="lsr-text"><b>Why:</b> ${esc(v.why)}</p>
    ${rest.length ? `<p class="lsr-k2">Your other markets</p><div class="rel-effs">${rest.map(e => `<div class="beff">${relCallPill(e)}<small>${esc(e.how === 'react' ? 'Following the first move after the release.' : e.reason || '')}</small></div>`).join('')}</div>` : ''}
    ${(r.since || []).length ? `<p class="rel-since"><span>Since the release:</span> ${r.since.map(s => reactTxt(s).replace(' since</span>', '</span>')).join(' · ')}</p>` : ''}
    ${revisionTxt(x.ev, r) ? `<p class="ff-rev">${esc(revisionTxt(x.ev, r))}</p>` : ''}${r.src === 'FRED' ? '<p class="faint small">Number from FRED (backup source).</p>' : ''}${histSlot(x.ev, r)}`;
  fillHist(el);
}
function lsClock(ms) {
  if (ms <= 0) return '<span class="lsr-now">Releasing…</span>';
  const s = Math.ceil(ms / 1e3), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(sec).padStart(2, '0')}`;
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ls],[data-ls-src]'); if (!b) return;
  ev.preventDefault(); ev.stopPropagation();
  if (b.dataset.lsSrc) { openPlayer(b.dataset.lsSrc); return; }
  const e = LS.cal.find(x => lsKey(x) === b.dataset.ls); const x = lsFor(e); if (!x) return;
  if (x.kind === 'stream') { const ch = lsChan(x.src); openPlayer(x.src, { title: `${x.ev.name || x.ev.title} · ${ch.name}` }); }
  else openRoom(x);
}, true);
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && LS.room) closeRoom(); });
function startLive() {
  loadLive();
  clearInterval(LS.tick); LS.tick = setInterval(lsTick, 1000);
  setInterval(() => { if (document.visibilityState === 'visible') loadLive(); }, 60e3);
}

// ---------- start ----------
let calendarCache = null;
tick(); setInterval(tick, 30e3);
$('#bellBtn').onclick = () => { if (started) openAlerts(); };
// Privacy and terms show straight away, signed in or not
if (/^\/(privacy|terms)\/?$/.test(location.pathname)) { const k = location.pathname.replace(/\W/g, ''); shownPage = k; main.dataset.page = k; PAGES[k](); }
initMe(() => {
  started = true;
  orderTabs(); mountStrip(); route(); pollResults(); lastRefresh = Date.now(); mStatus();
  startLive();
  new MutationObserver(() => { if (LS.loaded && main.querySelector('.ff-row[data-k]:not([data-lsd])')) { main.querySelectorAll('.ff-row[data-k]').forEach(r => r.dataset.lsd = 1); lsMarkCalendar(); } }).observe(main, { childList: true, subtree: true });
  api('calendar', 10 * 60e3).then(d => { calendarCache = d.events; }).catch(() => {});
  startAlerts({ calendar: () => (LS.cal && LS.cal.length ? LS.cal : calendarCache), live: lsFor, open: x => { if (x.kind === 'stream') { const ch = lsChan(x.src); openPlayer(x.src, { title: `${x.ev.name || x.ev.title} · ${ch.name}` }); } else openRoom(x); }, wire: () => api('wire?section=all', 60e3).then(d => d.items), levels: levelRows });
});
addEventListener('open:tz', () => { TZ = userTZ(); cache.clear(); refreshing = false; tick(); mStatus(); route(); });
addEventListener('open:profile', () => { orderTabs(); mountStrip(); cache.clear(); route(); });
// ---------- market status line: open or closed, where prices are from, next update ----------
function mStatus() {
  const el = $('#mstatus'); if (!el || !started) return;
  const mk = myMarkets().filter(m => m !== 'learning');
  const reopen = allShut(mk);
  const next = fmtLeft(60e3 - Date.now() % 60e3);
  const upd = `<span>Updated ${fmtTime(lastRefresh)} ${tzAbbr()}</span><span class="ms-next">Next update in ${next}</span>`;
  if (reopen) {
    const names = [...new Set(mk.map(m => MS_NAME[m]).filter(Boolean))];
    const who = names.length > 2 ? 'Your markets' : names.join(' and ') || 'Markets';
    const friClose = reopen - 49 * 36e5; // Friday afternoon, two days before the Sunday reopen
    const fri = new Date(friClose).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' });
    const day = new Date(reopen).toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' });
    const left = reopen - Date.now(), h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
    el.className = 'mstatus shut';
    el.innerHTML = `<div class="wrap ms-row"><span class="ms-state"><i></i>${esc(who)} closed for the weekend</span><span>Prices from ${esc(fri)} close</span><span>Reopens ${esc(day)} ${fmtTime(reopen)} ${tzAbbr(reopen)}, in ${h ? h + 'h ' : ''}${m}m</span>${upd}</div>`;
  } else {
    el.className = 'mstatus';
    el.innerHTML = `<div class="wrap ms-row"><span class="ms-state"><i></i>Markets open</span><span>Prices update live; futures and stocks can lag up to 15 min</span>${upd}</div>`;
  }
  el.hidden = false;
}
setInterval(() => { if (document.visibilityState === 'visible') mStatus(); }, 1000);

// Headlines: check for new stories every 30 seconds on the News page
setInterval(() => {
  if (!started || document.visibilityState !== 'visible' || document.body.classList.contains('locked') || main.dataset.page !== 'news') return;
  [...cache.keys()].filter(k => String(k).startsWith('wire')).forEach(k => cache.delete(k));
  route(true);
}, 30e3);
// Refresh data on every 1-minute bar close (:00), without reloading charts
function minuteRefresh() {
  setTimeout(minuteRefresh, 60e3 - Date.now() % 60e3 + 1500);
  if (!started || document.visibilityState !== 'visible' || document.body.classList.contains('locked')) return;
  cache.clear(); mountStrip(); lastRefresh = Date.now();
  api('calendar').then(d => { calendarCache = d.events; }).catch(() => {});
  route(true);
}
setTimeout(minuteRefresh, 60e3 - Date.now() % 60e3 + 1500);
