// The Open One: front end. Plain JavaScript modules, no build step.
import {
  initMe, me, myMarkets, myAssets, isBeginner, isLearning, depth, hasStrat, levelTrader, intraday, stratsFor,
  forYouEvent, forYouHeadline, forYouStrength, relevance, greeting, windowStatus, startAlerts, openAlerts, editSetup,
  profileQuery, marketLabel, myStruggles, isProp, newsRestricted, notify,
  userTZ,
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
  const p = fetch('/api/data?fn=' + path.replace('?', '&')).then(async r => {
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
  let cd = shell && shell.querySelector(':scope > .cd');
  if (shell && !cd) { cd = document.createElement('div'); cd.className = 'cd'; cd.setAttribute('aria-live', 'off'); shell.appendChild(cd); }
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
  if (shell && !shell.querySelector(':scope > .tfbar')) {
    const bar = document.createElement('div'); bar.className = 'tfbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Timeframe');
    bar.innerHTML = TFS.map(([v, l]) => `<button type="button" data-tf="${v}" aria-pressed="${v === chartTf()}">${l}</button>`).join('') + `<button type="button" class="tf-reload" title="Reload chart" aria-label="Reload chart"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/></svg></button>`;
    bar.querySelector('.tf-reload').onclick = () => tvChart(boxId, box.dataset.sym);
    bar.querySelectorAll('button[data-tf]').forEach(b => b.onclick = () => { store.set('chartTf', b.dataset.tf); document.querySelectorAll('.tfbar button[data-tf]').forEach(x => x.setAttribute('aria-pressed', x.dataset.tf === b.dataset.tf)); tvChart(boxId, box.dataset.sym); });
    shell.insertBefore(bar, box);
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
function releasedHTML() {
  const now = Date.now(), gone = store.get('relDismissed', []);
  const list = Object.values(results.map).filter(r => r.released && r.actual && now - r.time < 90 * 60e3 && !gone.includes(r.key) && r.impact !== 'Low' && (r.impact === 'High' || forYouEvent(r))).sort((a, b) => b.time - a.time).slice(0, 3);
  if (!list.length) return '';
  return list.map(r => {
    const effs = relEffects(r);
    const cls = r.dir === 'up' ? 'up' : r.dir === 'down' ? 'down' : '';
    return `<article class="rel" data-key="${esc(r.key)}">
      <button class="x rel-x" aria-label="Hide this result">×</button>
      <p class="rel-top"><span class="rel-live"></span>Just released · ${fmtTime(r.time)} ${tzAbbr(r.time)} · ${esc(r.country)}</p>
      <h2 class="rel-h">${esc(r.name || r.title)}</h2>
      <div class="rel-nums"><div><small>Actual</small><b class="${cls}">${esc(r.actual)}</b></div>${r.forecast ? `<div><small>Forecast</small><b>${esc(r.forecast)}</b></div>` : ''}${r.previous ? `<div><small>Previous</small><b>${esc(r.previous)}</b></div>` : ''}${r.label ? `<div class="rel-lab"><span class="pill ${cls || 'acc'}">${esc(r.label)}</span></div>` : ''}</div>
      ${r.text ? `<p class="rel-text">${esc(r.text)}</p>` : ''}
      ${effs.length ? `<div class="rel-effs">${effs.map(e => `<div class="beff"><span class="pill ${e.paused ? 'paused' : e.dir === 'up' ? 'up' : e.dir === 'down' ? 'down' : ''}"><b>${esc(e.label)}</b> ${e.paused ? '⏸ Call paused' : DIR_TXT[e.dir] || ''}</span><span class="br">${esc(e.reason)}</span></div>`).join('')}</div>` : ''}
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
        results.loaded = true;
        renderReleased();
        if (changed && started && ['today', 'calendar', 'futures', 'forex'].includes(shownPage)) route(true);
      }
    }
  } catch {}
  results.timer = setTimeout(pollResults, fast ? 5000 : 60000);
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
      ${explain ? `<button class="linkbtn wi-x" data-x="${esc(i.id)}" aria-expanded="false">Explain this</button>` : ''}</div>
    ${explain ? `<div class="wi-explain" id="x-${esc(i.id)}" hidden></div>` : ''}</li>`;
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
function bottomLine(list) {
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
  const call = x => { const r = x.score / x.w; return r >= 0.5 ? ['up', '↑ Most likely up'] : r >= 0.2 ? ['up', '↗ Leaning up'] : r <= -0.5 ? ['down', '↓ Most likely down'] : r <= -0.2 ? ['down', '↘ Leaning down'] : ['', '↕ No clear direction']; };
  const count = x => [x.up && `${x.up} up`, x.down && `${x.down} down`, x.mixed && `${x.mixed} unclear`].filter(Boolean).join(' · ');
  return `<li class="bsum"><p class="bsum-h">Overall summary</p>${rows.map(x => { const [c, t] = call(x); return `<div class="bsum-r"><span class="pill dir"><b>${esc(x.label)}</b> <i class="${c}">${t.slice(0, 1)}</i> ${t.slice(2)}</span><span class="br">${count(x)} across the ${list.length > 1 ? list.length + ' stories' : 'story'} for ${esc(sessionDay().day)}’s session</span></div>`; }).join('')}${(() => { const ws = list.map(b => b.when).filter(w => w && w.kind !== 'priced').sort((a, b) => a.time - b.time); if (!ws.length) return ''; const w = ws[0]; const txt = w.kind === 'now' ? 'Fresh news is out while futures are trading, so expect the reaction in the next few minutes.' : w.kind === 'reopen' ? `Markets are closed, so these stories hit price ${w.label}.` : `Next likely move: ${w.label}${w.typical ? `, usually about ${unitTxt(w.typical, w.unit)} in that ${w.step === 60 ? 'hour' : 'half hour'}` : ''}.`; return `<div class="bsum-r"><span class="pill when">⏱ ${esc(whenPill(w))}</span><span class="br">${esc(txt)}</span></div>`; })()}<p class="bsum-n">Weighs each story’s usual market reaction, with the top story counting most and stories only one outlet has reported counting half. A lean, not a promise.</p></li>`;
}
// Track record from the Scorecard: how calls for this market did one hour later (last 30 days)
const REC_KEY = { futures: 'NQ', stocks: 'NQ', options: 'NQ', crypto: 'BTC', memes: 'BTC', forex: 'EURUSD' };
function recLine(effs, rec) {
  if (!rec || !rec.byMarket) return '';
  const seen = new Set(), out = [];
  (effs || []).forEach(e => {
    if (e.paused || e.dir === 'mixed') return;
    const k = REC_KEY[e.market]; if (!k || seen.has(k)) return; seen.add(k);
    const t = (rec.byMarket.find(x => x.market === k) || {}).hour; if (!t) return;
    const n = t.right + t.wrong; if (n < 5) return;
    out.push(`${esc(CALL_NAME[k] || k)} calls were right ${Math.round(t.right / n * 100)}% of the time an hour later (${n} graded)`);
  });
  return out.length ? `<p class="brec">Track record: ${out.join('; ')}. <a href="/scorecard">Scorecard</a></p>` : '';
}
function briefingHTML(d, { empty = 'No major stories for this market right now.', rec = null, fresh = null } = {}) {
  const list = d.briefing || [];
  if (!list.length) return `<li class="empty">${esc(empty)}</li>`;
  const showWhy = isBeginner() || depth() === 'deep';
  const seenWhy = new Set();
  const group = effs => { const g = []; (effs || []).forEach(e => { const k = e.dir + '|' + e.reason + '|' + !!e.paused; const f = g.find(x => x.k === k); if (f) f.label += ' · ' + e.label; else g.push({ ...e, k }); }); return g; };
  return bottomLine(list) + list.map((b, i) => { const dupWhy = b.why && seenWhy.has(b.why); if (b.why) seenWhy.add(b.why); const raw = b.effects; b = { ...b, why: dupWhy ? '' : b.why, effects: group(b.effects) };
    const isNew = fresh && fresh.has(b.id || b.link);
    return `<li class="bc${isNew ? ' bc-new' : ''}">
    <span class="bn">${String(i + 1).padStart(2, '0')}</span>
    <div class="bb">
      <a class="bh" href="${esc(b.link)}" target="_blank" rel="noopener">${isNew ? '<span class="newtag">New</span>' : ''}${esc(b.headline)}</a>
      <p class="bm">${srcLine(b)}${b.time ? ' · ' + ago(b.time) : ''}${b.topic ? ' · ' + esc(b.topic) : ''}${b.since ? ` · <span class="bm-moved">${reactTxt(b.since)}</span>` : ''}</p>
      ${showWhy && b.why ? `<p class="bwhy">${esc(b.why)}</p>` : ''}
      <div class="bfx">${b.effects && b.effects.length ? b.effects.map(e => `<div class="beff">${dirPill(e.label, e.dir, e.paused)}${b.when && e === b.effects[0] ? `<span class="pill when">⏱ ${esc(whenPill(b.when))}</span>` : ''}<span class="br">${esc(e.reason)}</span></div>`).join('') : `<div class="beff">${b.when ? `<span class="pill when">⏱ ${esc(whenPill(b.when))}</span>` : ''}<span class="br">Little direct effect on your markets.</span></div>`}</div>
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
  const conf = r.conf ? `<span class="pill ${r.conf === 'medium' ? 'acc' : ''}">${r.conf === 'medium' ? 'Medium' : 'Low'} confidence</span>` : '';
  const mv = r.move ? `<small class="${r.move.ch60 > 0 ? 'up' : r.move.ch60 < 0 ? 'down' : 'faint'}">${unitAmt(r.move.ch60, r.move.unit)} last hour</small>` : '';
  const why = r.closed && r.reopens ? `Reads restart when it reopens, ${new Date(r.reopens).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : r.why;
  return `<article class="pl-card pl-${r.lean}${r.closed ? ' pl-closed' : ''}">
    <div class="pl-top"><b>${esc(r.name)}</b><span class="pl-px">${r.price != null ? num(r.price, PULSE_DP[r.key]) : ''} ${mv}</span></div>
    <div class="pl-lean"><span>${lean}</span>${conf}</div>
    <p class="pl-why">${esc(why)}</p>
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
const PULSE_MS = 5 * 60e3, PULSE_GRACE = 4e3;
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
  el.innerHTML = `Next scan <b>${fmtLeft(left)}</b>`; el.title = 'Scans when each 5-minute bar closes';
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
        <section class="t-prices card" id="myPrices"></section>
      </div>
    </div>
`)) {
    chartPicker('todayChart', 'todayChartPick', todayChartOptions());
    const gx = $('#guideX'); if (gx) gx.onclick = () => { store.set('guideDone', true); const g = $('#guide'); if (g) g.remove(); };
  }
  loadPulse();
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
// ---------- News: a newsroom front page ----------
// Top stories first (one lead, two beside it), then everything else by time. Each row: time, headline, one quiet line.
function nrMeta(i, explain) {
  const src = `${esc(i.source)}${(i.outlets || i.count) > 1 ? ` +${(i.outlets || i.count) - 1}` : i.confirmed === false && i.impact === 'high' ? ' only' : ''}`;
  return `<p class="nr-meta">${i.breaking ? '<span class="nr-brk">Breaking</span>' : ''}<span>${src}</span><span>${esc(SECTION_NAMES[i.section] || i.themeLabel || '')}</span>${reactTxt(i.reaction)}${explain ? `<button class="linkbtn wi-x" data-x="${esc(i.id)}" aria-expanded="false">Explain this</button>` : ''}</p>${explain ? `<div class="wi-explain" id="x-${esc(i.id)}" hidden></div>` : ''}`;
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
  const top = (pool.length >= 3 ? pool : ranked).slice(0, 3), topIds = new Set(top.map(i => i.id));
  const seenWhy = new Set();
  const why = i => { if (!i.why || seenWhy.has(i.why)) return ''; seenWhy.add(i.why); return esc(i.why); };
  const [lead, ...side] = top;
  const fy = lead ? forYouHeadline(lead) : null;
  const leadHTML = lead ? `<article class="nr-lead${mine(lead) ? ' mine' : ''}">
      <p class="nr-eye">${mineFirst && mine(lead) ? 'Top story for your markets' : 'Most influential right now'} · ${ago(lead.time)}</p>
      <a class="nr-h1" href="${esc(lead.link)}" target="_blank" rel="noopener">${esc(lead.title)}</a>
      ${why(lead) ? `<p class="nr-why">${esc(lead.why)}</p>` : ''}
      ${fy ? `<p class="nr-fy"><b>For you</b> ${esc(fy)}</p>` : ''}
      ${nrMeta(lead, true)}
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
PAGES.news = () => {
  const f = store.get('newsFilter', { market: 'all', impact: 'matters', topic: '', mine: true });
  if (f.impact === 'medium' || (f.impact === 'all' && !f.v2)) { f.impact = 'matters'; f.v2 = 1; }
  const wasRefresh = refreshing;
  layout(`<h1 class="page-h">News</h1>
    <p class="page-intro">The stories moving markets right now, from <span id="srcCount">dozens of</span> sources. Stories that touch your markets have a blue line.</p>
    <div class="chips" role="group" aria-label="Market"><span class="chips-label">Market</span>${[['all', 'Everything'], ['futures', 'Stocks and futures'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['memes', 'Memecoins']].map(([k, l]) => `<button class="chip" data-mk="${k}" aria-pressed="${f.market === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Topic"><span class="chips-label">Topic</span><button class="chip" data-tp="" aria-pressed="${!f.topic}">All topics</button>${Object.entries(SECTION_NAMES).map(([k, l]) => `<button class="chip" data-tp="${k}" aria-pressed="${f.topic === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Show"><span class="chips-label">Show</span>${[['matters', 'Market-moving'], ['high', 'Big stories only'], ['all', 'Everything']].map(([k, l]) => `<button class="chip" data-im="${k}" aria-pressed="${f.impact === k}">${l}</button>`).join('')}<button class="chip" id="mineFirst" aria-pressed="${f.mine}">My markets first</button></div>
    ${shellHTML({ noChart: true, left: '<div class="newbar" id="newBar" hidden></div><div class="newsroom" id="wireList"></div><p class="stale-note" id="staleNote" hidden></p>' })}`);
  startNow();
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

function ffRow(e, act, today, now, nextT, showT) {
  const imp = impOf(e), r = act[`${e.country}|${e.title}|${e.time}`];
  const past = e.time < now - 60e3 && !e.allDay, isNext = e.time === nextT;
  const fy = forYouEvent(e);
  const body = [e.what ? `<p>${esc(e.what)}</p>` : '', e.why ? `<p>${esc(e.why)}</p>` : '', e.note ? `<p class="note">${esc(e.note)}</p>` : '', r && r.text ? `<p><b>${esc(r.label || '')}.</b> ${esc(r.text)}</p>` : '', fy ? `<p class="ff-fy-b"><b>For you:</b> ${esc(fy)}</p>` : ''].join('');
  return `<details class="ff-row${past ? ' past' : ''}${isNext ? ' next' : ''}${imp === 'High' ? ' hi' : ''}"><summary>
      <span class="ff-t">${showT ? (e.allDay ? 'All day' : fmtTime(e.time).replace(' ', '').toLowerCase()) : ''}</span>
      <span class="ff-c">${esc(e.country)}</span>
      <span class="ff-i">${ffIcon(imp)}</span>
      <span class="ff-e">${esc(e.title)}${e.name && e.name !== e.title ? `<small>${esc(e.name)}</small>` : ''}${fy ? '<span class="ff-fy">For you</span>' : ''}</span>
      <span class="ff-vals"><span class="ff-v ff-a ${r && r.ccyDir ? r.ccyDir : ''}" data-l="Actual">${r ? esc(r.actual) : ''}</span>
      <span class="ff-v" data-l="Forecast">${esc(e.forecast || (r && r.forecast) || '')}</span>
      <span class="ff-v" data-l="Previous">${esc((e.previous || '').split('|')[0])}</span></span>
    </summary>${body ? `<div class="ff-body">${body}</div>` : ''}</details>`;
}

PAGES.calendar = () => {
  const mine = [...new Set(['USD', ...myAssets().flatMap(a => a.ccy || [])])].filter(c => FF_CCY.includes(c));
  const f = store.get('ffFilter', { imp: ['High', 'Medium', 'Low', 'Holiday'], ccy: mine.length ? mine : ['USD'] });
  const today = nyParts().date;
  if (!CAL.sel) { CAL.sel = today; CAL.month = monthKey(today); }
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
      </aside>
      <section class="cal-main"><div class="ff" id="ff"><p class="loading">Loading the calendar…</p></div></section>
    </div>`);
  const rer = () => { store.set('ffFilter', f); draw(); };
  main.querySelectorAll('[data-fi]').forEach(b => b.onclick = () => { const k = b.dataset.fi; f.imp = f.imp.includes(k) ? f.imp.filter(x => x !== k) : [...f.imp, k]; b.setAttribute('aria-pressed', f.imp.includes(k)); rer(); });
  main.querySelectorAll('[data-fc]').forEach(b => b.onclick = () => { const k = b.dataset.fc; f.ccy = f.ccy.includes(k) ? f.ccy.filter(x => x !== k) : [...f.ccy, k]; b.setAttribute('aria-pressed', f.ccy.includes(k)); rer(); });
  $('#ffMine').onclick = () => { f.ccy = mine.length ? mine.slice() : ['USD']; main.querySelectorAll('[data-fc]').forEach(b => b.setAttribute('aria-pressed', f.ccy.includes(b.dataset.fc))); rer(); };

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
      <p class="mc-note">Calendar data covers this week${hi > addDay(weekStart(today), 6) ? ' and next week' : ''}. Next week’s events usually appear over the weekend.</p>`;
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
    const rows = shown.map(k => {
      const evs = byDay[k];
      if (!evs) return head(k) + `<div class="ff-none">${all.some(e => nyParts(e.time).date === k) ? 'Nothing for your filters on this day' : 'No events scheduled'}</div>`;
      let lastT = null;
      return head(k) + evs.map(e => { const showT = e.time !== lastT; lastT = e.time; return ffRow(e, act, today, now, nextT, showT); }).join('');
    }).join('');
    const title = CAL.mode === 'day' ? dayFmt(CAL.sel, { weekday: 'long', month: 'long', day: 'numeric' }) : `Week of ${dayFmt(wk, { month: 'long', day: 'numeric' })}`;
    box.innerHTML = `<div class="ff-top"><h2 class="sec">${esc(title)}</h2>
        <div class="ff-step"><button type="button" class="mc-nav" data-step="-1" aria-label="Previous ${CAL.mode}">‹</button><button type="button" class="mc-nav" data-step="1" aria-label="Next ${CAL.mode}">›</button></div></div>
      <div class="ff-legend">${['High', 'Medium', 'Low', 'Holiday'].map(k => `<span>${ffIcon(k)}${IMP[k][1]}</span>`).join('')}<span><b class="ff-a good">Green</b> / <b class="ff-a bad">red</b> actual: better or worse than forecast for that currency</span></div>
      <div class="ff-table" role="table"><div class="ff-head" role="row"><span>Time</span><span>Cur.</span><span>Impact</span><span>Event</span><span>Actual</span><span>Forecast</span><span>Previous</span></div>${rows}</div>${stamp(data)}`;
    box.querySelectorAll('[data-step]').forEach(b => b.onclick = () => { CAL.sel = addDay(CAL.sel, (CAL.mode === 'day' ? 1 : 7) * +b.dataset.step); CAL.month = monthKey(CAL.sel); draw(); });
    if (CAL.mode === 'week' && CAL.sel !== today && !refreshing) { const el = document.getElementById('d-' + CAL.sel); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }
  function draw() { if (!data) return; grid(); list(); }
  api('calendar', 10 * 60e3).then(d => { data = d; draw(); }).catch(() => { const box = $('#ff'); if (box) box.innerHTML = '<p class="empty">Couldn’t load the calendar. Try again in a minute.</p>'; });
};

// ---------- Earnings ----------
PAGES.earnings = () => {
  layout(`<h1 class="page-h">Earnings</h1>
    <p class="page-intro" id="eIntro"></p>
    <div id="eList"></div>`);
  const d = api('earnings', 15 * 60e3);
  fill('eIntro', 'summary', d, x => esc(x.lines.join(' ')));
  fill('eList', 'earnings', d, x => x.days.map(day => `<div class="cal-day"><h3>${esc(dayLabel(day.date))}</h3>${day.rows.length ? day.rows.map(r => `<div class="earn"><b>${esc(r.symbol)}</b><span>${esc(r.name)}${r.heavy ? '<span class="tag-heavy">Moves the index</span>' : ''}<span class="small faint" style="display:block">${r.mcap ? big(r.mcap) + ' company' : ''}${r.eps ? ', expected ' + esc(r.eps) + ' a share' : ''}</span></span><span class="w">${r.when === 'before' ? 'Before the open' : r.when === 'after' ? 'After the close' : 'Time not set'}</span></div>`).join('') : '<p class="empty" style="padding:10px 0">No big companies reporting.</p>'}</div>`).join('') + '<p class="small faint">Companies worth $20 billion or more, plus the heavyweights that drive the Nasdaq and S&P 500.</p>' + stamp(x));
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
    <div id="scBody">${skel(3)}</div><section class="block"><div class="sec-row"><h2 class="sec">Live read, every 5 minutes</h2></div><div id="scPulse">${skel(2)}</div></section>`);
  fill('scPulse', 'the live read score', api('pulsescore', 5 * 60e3), d => {
    if (!d.ready || !d.total) return `<div class="sc-empty"><p><b>No live reads graded yet.</b> Each “Leaning up” or “Leaning down” read is checked one hour later.</p></div>`;
    return `<div class="sc-tiles sc3">${scoreTile('Right after 1 hour', d.summary)}${scoreTile('Low confidence', d.byConf.low)}${scoreTile('Medium confidence', d.byConf.medium)}</div>
      <p class="sc-fine">Last ${d.days} days, ${d.total} leans. “No clear lean” reads aren’t graded. If medium confidence isn’t beating low confidence, the confidence label isn’t telling you anything yet.</p>
      ${Object.keys(d.byMarket).length ? `<div class="sc-mk">${Object.entries(d.byMarket).map(([k, t]) => `<div class="sc-mrow"><b>${esc(CALL_NAME[k] || k)}</b><span>1 hour: ${hitRate(t) == null ? '—' : hitRate(t) + '%'} <small>(${t.right + t.wrong} graded)</small></span><span></span></div>`).join('')}</div>` : ''}`;
  });
  fill('scBody', 'the scorecard', api('calls', 5 * 60e3), d => {
    if (!d.ready) return `<div class="sc-empty"><p><b>The scorecard is being set up.</b> Calls will start showing here once tracking is switched on.</p></div>`;
    if (!d.total) return `<div class="sc-empty"><p><b>No calls logged yet.</b> The first ones appear the next time the briefing makes an up or down call.</p></div>`;
    const s = d.summary;
    return `<div class="sc-tiles">${scoreTile('Right after 1 hour', s.hour)}${scoreTile('Right at the close', s.close)}</div>
      <p class="sc-fine">Last ${d.days} days, ${d.total} calls. “Barely moved” means price moved less than a normal hourly wiggle (0.1% for NQ, 0.3% for Bitcoin, 0.05% for EUR/USD), so it isn’t counted either way. Calls made while a market is closed are checked from when it reopens.</p>
      ${d.byMarket.length > 1 ? `<h2 class="sec">By market</h2><div class="sc-mk">${d.byMarket.map(b => `<div class="sc-mrow"><b>${esc(CALL_NAME[b.market] || b.market)}</b><span>1 hour: ${hitRate(b.hour) == null ? '—' : hitRate(b.hour) + '%'} <small>(${b.hour.right + b.hour.wrong} graded)</small></span><span>Close: ${hitRate(b.close) == null ? '—' : hitRate(b.close) + '%'} <small>(${b.close.right + b.close.wrong} graded)</small></span></div>`).join('')}</div>` : ''}
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

// ---------- router ----------
const ALIASES = { movers: 'markets', memecoins: 'memes', economy: 'calendar' };
const SLUG = { memes: 'memecoins' };
const pagePath = key => key === 'today' ? '/' : '/' + (SLUG[key] || key);
function currentPage() {
  // Old links used #news style addresses: move them to /news (but leave sign-in tokens alone)
  const h = location.hash.slice(1).split('?')[0];
  if (h && (PAGES[h] || ALIASES[h])) history.replaceState(null, '', pagePath(ALIASES[h] || h));
  const p = location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || 'today';
  const key = ALIASES[p] || p;
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
  if (path !== location.pathname) history.pushState(null, '', path);
  if (!started) return;
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

// ---------- start ----------
let calendarCache = null;
tick(); setInterval(tick, 30e3);
$('#bellBtn').onclick = () => { if (started) openAlerts(); };
initMe(() => {
  started = true;
  orderTabs(); mountStrip(); route(); pollResults(); lastRefresh = Date.now(); mStatus();
  api('calendar', 10 * 60e3).then(d => { calendarCache = d.events; }).catch(() => {});
  startAlerts({ calendar: () => calendarCache, wire: () => api('wire?section=all', 60e3).then(d => d.items), levels: levelRows });
});
addEventListener('open:tz', () => { TZ = userTZ(); cache.clear(); refreshing = false; tick(); mStatus(); route(); });
addEventListener('open:profile', () => { orderTabs(); mountStrip(); cache.clear(); route(); });
// ---------- market status line: open or closed, where prices are from, next update ----------
function mStatus() {
  const el = $('#mstatus'); if (!el || !started) return;
  const mk = myMarkets().filter(m => m !== 'learning');
  const reopen = allShut(mk);
  const next = fmtLeft(lastRefresh + 120e3 - Date.now());
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
// Refresh data every two minutes without reloading charts
setInterval(() => {
  if (!started || document.visibilityState !== 'visible' || document.body.classList.contains('locked')) return;
  cache.clear(); mountStrip(); lastRefresh = Date.now();
  api('calendar').then(d => { calendarCache = d.events; }).catch(() => {});
  route(true);
}, 120e3);
