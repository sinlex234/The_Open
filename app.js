// The Open One: front end. Plain JavaScript modules, no build step.
import {
  initMe, me, myMarkets, myAssets, isBeginner, isLearning, depth, hasStrat, levelTrader, intraday, stratsFor,
  forYouEvent, forYouHeadline, forYouStrength, relevance, greeting, windowStatus, startAlerts, openAlerts, editSetup,
  profileQuery, marketLabel, myStruggles, isProp, newsRestricted,
} from './me.js';
import { GLOSSARY } from './glossary.js';

const $ = s => document.querySelector(s);
const main = $('#main');
const TZ = 'America/New_York';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- per-viewer conveniences ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('open:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('open:' + k, JSON.stringify(v)); } catch {} },
};
function applyTheme() { const t = store.get('theme', null); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme();
$('#themeBtn').onclick = () => { store.set('theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); applyTheme(); if (started) { mountStrip(true); route(); } };

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
  $('#mastDate').innerHTML = `${now.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br><b>${now.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}</b> in New York`;
  $('#exchanges').innerHTML = EXCH.map(x => { const s = exchState(x); return `<li class="${s.open ? 'open' : ''}" title="${esc(s.tip)}">${esc(x.name)}</li>`; }).join('');
}

// ---------- live ticker (TradingView, prices move in real time) ----------
const TAPE = [
  ['OANDA:SPX500USD', 'S&P 500'], ['OANDA:NAS100USD', 'Nasdaq 100'], ['OANDA:US30USD', 'Dow'], ['OANDA:DE30EUR', 'DAX'], ['OANDA:JP225USD', 'Nikkei'],
  ['FX:EURUSD', 'EUR/USD'], ['FX:USDJPY', 'USD/JPY'], ['FX:GBPUSD', 'GBP/USD'], ['OANDA:XAUUSD', 'Gold'], ['OANDA:WTICOUSD', 'Oil'],
  ['BINANCE:BTCUSDT', 'Bitcoin'], ['BINANCE:ETHUSDT', 'Ether'], ['BINANCE:SOLUSDT', 'Solana'],
];
let tapeKey = '';
function mountStrip(force = false) {
  const mine = myAssets().filter(a => a.tv).map(a => [a.tv, a.short || a.label]);
  const seen = new Set();
  const syms = [...mine, ...TAPE].filter(([s]) => !seen.has(s) && seen.add(s)).slice(0, 16);
  const key = tvTheme() + syms.map(x => x[0]).join(',');
  if (!force && key === tapeKey && $('#strip').children.length) return;
  tapeKey = key;
  tvWidget('strip', 'ticker-tape', { symbols: syms.map(([proName, title]) => ({ proName, title })), showSymbolLogo: false, isTransparent: true, displayMode: 'adaptive', colorTheme: tvTheme(), locale: 'en' }, 46);
}

// ---------- TradingView live charts and heatmaps ----------
const tvTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function tvWidget(el, kind, cfg, height) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.innerHTML = '';
  if (!el.classList.contains('chartbox')) el.style.height = height + 'px';
  const c = document.createElement('div'); c.className = 'tradingview-widget-container'; c.style.height = '100%'; c.style.width = '100%';
  const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; w.style.height = '100%'; c.appendChild(w);
  const sc = document.createElement('script'); sc.src = `https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js`; sc.async = true; sc.innerHTML = JSON.stringify(cfg); c.appendChild(sc);
  el.appendChild(c);
}
function tvChart(el, symbol) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.classList.add('chartbox');
  const dark = tvTheme() === 'dark';
  tvWidget(el, 'advanced-chart', { autosize: true, symbol, interval: intraday() ? '15' : 'D', timezone: 'America/New_York', theme: tvTheme(), style: '1', locale: 'en', allow_symbol_change: true, hide_volume: true, save_image: false, calendar: false, support_host: 'https://www.tradingview.com', backgroundColor: dark ? 'rgba(18,18,21,1)' : 'rgba(255,255,255,1)', gridColor: dark ? 'rgba(42,42,49,0.45)' : 'rgba(9,9,11,0.06)' }, 500);
}
function chartPicker(boxId, pickId, options) {
  const pick = document.getElementById(pickId); if (!pick) return;
  const seen = new Set(); const uniq = options.filter(o => o && o.tv && !seen.has(o.tv) && seen.add(o.tv)).slice(0, 7);
  if (!uniq.length) return;
  pick.innerHTML = uniq.map((o, i) => `<button class="chip" data-tv="${esc(o.tv)}" aria-pressed="${i === 0}">${esc(o.name || o.id)}</button>`).join('');
  pick.querySelectorAll('button').forEach(b => b.onclick = () => { pick.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); tvChart(boxId, b.dataset.tv); });
  tvChart(boxId, uniq[0].tv);
  addFullscreen(boxId, pick);
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
  return items.map(i => { const st = forYouStrength(i); const show = st >= 1 && left > 0; if (show) left--; return storyItem(i, { ...opts, fy: show, mark: st >= (opts.markAt || 1) }); }).join('');
}
function storyItem(i, { why = true, explain = false, fy: showFy = true, mark = null } = {}) {
  const fy = showFy ? forYouHeadline(i) : null;
  const isMine = mark ?? !!fy;
  const showWhy = why && i.why && (depth() !== 'quick' || !fy);
  return `<li class="${isMine ? 'mine' : ''}" data-id="${esc(i.id)}">
    <a class="t" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
    ${showWhy ? `<div class="why">${esc(i.why)}</div>` : ''}
    ${fy ? `<div class="fy"><b>For you</b>${esc(fy)}</div>` : ''}
    <div class="meta">${i.breaking ? '<span class="brk">Breaking</span>' : ''}<span class="imp ${esc(i.impact || 'low')}">${i.impact === 'high' ? 'Big story' : i.impact === 'medium' ? 'Notable' : 'Minor'}</span><span>${esc(SECTION_NAMES[i.section] || i.themeLabel || '')}</span><span>${esc(i.source)}${i.count > 1 ? ` and ${i.count - 1} more` : ''}</span><span>${ago(i.time)}</span>${reactTxt(i.reaction)}
      ${explain ? `<button class="linkbtn wi-x" data-x="${esc(i.id)}" aria-expanded="false">Explain this</button>` : ''}</div>
    ${explain ? `<div class="wi-explain" id="x-${esc(i.id)}" hidden></div>` : ''}</li>`;
}
function eventRow(e, mini = false, showFy = true) {
  const past = e.time < Date.now() - 5 * 60e3, soon = !past && e.time - Date.now() < 60 * 60e3;
  const fp = [e.forecast && `Expected ${e.forecast}`, e.previous && `Last ${e.previous.split('|')[0]}`].filter(Boolean).join(', ');
  const fy = showFy ? forYouEvent(e) : null;
  const deep = depth() !== 'quick';
  const body = [(isBeginner() || depth() === 'deep') && e.what ? `<p>${esc(e.what)}</p>` : '', `<p>${esc(e.why)}</p>`, e.note && deep ? `<p class="note">${esc(e.note)}</p>` : '', mini && fp ? `<p class="small">${esc(fp)}</p>` : ''].join('');
  return `<details class="ev${past ? ' past' : ''}${soon ? ' soon' : ''}${mini ? ' mini' : ''}"><summary>
      <span class="t">${e.allDay ? 'All day' : fmtTime(e.time)}</span><span class="dot ${e.impact}" title="${e.impact} impact"></span>
      ${mini ? '' : `<span class="cc">${esc(e.country)}</span>`}
      <span class="nm">${esc(e.name)}<small>${mini ? esc(e.country) + (e.name !== e.title ? ', ' + esc(e.title) : '') : (e.name !== e.title ? esc(e.title) : '')}</small></span>
      ${mini ? '' : `<span class="fp">${esc(fp)}</span>`}
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
      box.innerHTML = `<dl class="xp"><dt>What happened</dt><dd>${esc(x.what)}</dd><dt>Why markets care</dt><dd>${esc(x.why)}</dd><dt>How markets reacted</dt><dd>${esc(x.reaction)}</dd>${x.for_you ? `<dt>For you</dt><dd><mark>${esc(x.for_you)}</mark></dd>` : ''}</dl>`;
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
    <h2>New here? Start with these four things</h2>
    <p>The Open One tells you what’s happening in the world, what it means for markets, and what’s likely to happen next.</p>
    <ol>
      <li><b>Read “Today at a glance”</b>Three lines: what happened, what it means, and what’s likely next.</li>
      <li><b>Check “What’s likely next”</b>The scheduled events ahead, with what usually happens if they surprise up or down.</li>
      <li><b>Open your market’s tab</b>Tabs with a blue dot match your setup. Each one has prices, a live chart and the news for that market.</li>
      <li><b>Stuck on a word?</b>Every term is explained in plain English in the <a href="#glossary">Glossary</a>.</li>
    </ol></section>`;
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
    <div class="brief-actions"><button type="button" id="briefEdit">Edit my setup</button><button type="button" id="briefAlerts">Alerts</button>${isLearning() ? '<a href="#glossary" class="more">Learn the terms</a>' : ''}</div>`;
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
PAGES.today = () => {
  if (layout(`
    ${guideHTML()}
    <p class="eyebrow">Today at a glance</p>
    <div class="glance" id="glance"><div>${skel(2)}</div></div>
    <div class="front">
      <article class="lead" id="lead" aria-live="polite"></article>
      <aside class="rail">
        <section class="brief" id="brief"></section>
        <section><h2 class="sec">Today’s calendar</h2><div id="railCal"></div><a class="more" href="#calendar">Full economic calendar</a></section>
      </aside>
    </div>
    <section class="block"><div class="sec-row"><h2 class="sec">What’s likely next</h2><a href="#calendar">Full calendar</a></div><div id="outlook"></div></section>
    ${chartBlock('todayChart')}
    <section class="block"><div class="sec-row"><h2 class="sec">Top stories</h2><a href="#news">All news</a></div><div class="grid2" id="top"></div></section>
    <section class="block"><div class="topics" id="topics"></div></section>
    <section class="block"><div class="sec-row"><h2 class="sec">World markets</h2><a href="#markets">All markets</a></div><div id="worldMini"></div></section>`)) {
    chartPicker('todayChart', 'todayChartPick', todayChartOptions());
    const gx = $('#guideX'); if (gx) gx.onclick = () => { store.set('guideDone', true); const g = $('#guide'); if (g) g.remove(); };
  }
  const deskP = api('desk?' + profileQuery(), 5 * 60e3);
  const D = personalData();
  const wireP = api('wire?section=all', 60e3);
  fill('lead', 'the front page', deskP, leadHTML);
  fill('glance', 'today at a glance', deskP, glanceHTML);
  fill('outlook', 'what’s likely next', deskP, outlookHTML);
  fill('brief', 'your briefing', Promise.all([deskP.catch(() => null), D]), ([desk, d]) => briefHTML(desk, d)).then(() => {
    const e = $('#briefEdit'); if (e) e.onclick = editSetup; const al = $('#briefAlerts'); if (al) al.onclick = openAlerts;
  });
  fill('railCal', 'the calendar', api('calendar', 10 * 60e3), d => {
    const n = nyParts();
    const ev = d.events.filter(e => nyParts(e.time).date === n.date && (e.country === 'USD' || e.impact === 'High') && e.impact !== 'Low');
    return ev.length ? ev.map(e => eventRow(e, true, false)).join('') : '<p class="empty">Nothing important is scheduled today.</p>';
  });
  fill('top', 'top stories', Promise.all([wireP, deskP.catch(() => null)]), ([d, desk]) => {
    const inLead = new Set(desk ? (desk.stories || []).map(s => (desk.refs[s.ref - 1] || {}).link).filter(Boolean) : []);
    const top = rankStories(d.items.filter(i => i.time && Date.now() - i.time < 24 * 36e5 && i.impact !== 'low' && !inLead.has(i.link))).slice(0, 10);
    const half = Math.ceil(top.length / 2);
    return `<ul class="slist">${storyList(top.slice(0, half), { notes: 2 })}</ul><ul class="slist">${storyList(top.slice(half), { notes: 2 })}</ul>`;
  });
  fill('topics', 'news sections', wireP, d => topicsHTML(d.items));
  fill('worldMini', 'world markets', api('world', 120e3), d => worldHTML({ groups: d.groups.filter(g => g.id !== 'fut' && g.id !== 'vol') }, { rowsPer: 3, sparks: false }));
};

// ---------- News ----------
PAGES.news = () => {
  const f = store.get('newsFilter', { market: 'all', impact: 'all', topic: '', mine: true });
  layout(`<h1 class="page-h">News</h1>
    <p class="page-intro">Every market-moving story from <span id="srcCount">dozens of</span> sources, grouped when several outlets report the same thing, with how prices moved since it broke. Stories that touch your markets are marked <mark>for you</mark>.</p>
    <div class="chips" role="group" aria-label="Market"><span class="chips-label">Market</span>${[['all', 'Everything'], ['futures', 'Stocks and futures'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['memes', 'Memecoins']].map(([k, l]) => `<button class="chip" data-mk="${k}" aria-pressed="${f.market === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Topic"><span class="chips-label">Topic</span><button class="chip" data-tp="" aria-pressed="${!f.topic}">All topics</button>${Object.entries(SECTION_NAMES).map(([k, l]) => `<button class="chip" data-tp="${k}" aria-pressed="${f.topic === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Show"><span class="chips-label">Show</span>${[['all', 'All stories'], ['medium', 'Notable and big'], ['high', 'Big stories only']].map(([k, l]) => `<button class="chip" data-im="${k}" aria-pressed="${f.impact === k}">${l}</button>`).join('')}<button class="chip" id="mineFirst" aria-pressed="${f.mine}">My markets first</button></div>
    <div class="newbar" id="newBar" hidden></div>
    <ul class="slist wire" id="wireList"></ul>`);
  const rer = () => { store.set('newsFilter', f); refreshing = false; PAGES.news(); };
  main.querySelectorAll('[data-mk]').forEach(b => b.onclick = () => { f.market = b.dataset.mk; rer(); });
  main.querySelectorAll('[data-tp]').forEach(b => b.onclick = () => { f.topic = b.dataset.tp; rer(); });
  main.querySelectorAll('[data-im]').forEach(b => b.onclick = () => { f.impact = b.dataset.im; rer(); });
  $('#mineFirst').onclick = () => { f.mine = !f.mine; rer(); };
  const P = api('wire?section=' + f.market, 60e3);
  P.then(d => {
    const sc = $('#srcCount'); if (sc) sc.textContent = d.sources;
    const seen = store.get('newsSeen', []);
    const fresh = d.items.filter(i => !seen.includes(i.id)).length;
    if (refreshing && fresh && seen.length) { const nb = $('#newBar'); if (nb) { nb.hidden = false; nb.textContent = `${fresh} new ${fresh === 1 ? 'story' : 'stories'} added`; } }
    store.set('newsSeen', d.items.map(i => i.id).slice(0, 150));
  }).catch(() => {});
  fill('wireList', 'the news', P, d => {
    let items = d.items.filter(i => f.impact === 'all' || (f.impact === 'high' ? i.impact === 'high' : i.impact !== 'low')).filter(i => !f.topic || i.section === f.topic);
    if (f.mine) items = rankStories(items);
    return items.length ? storyList(items, { explain: true, notes: 'all' }) : '<li class="empty">No stories match those filters right now.</li>';
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
    <p class="page-intro">Prices across the world’s main markets, what’s driving US stocks, and live heatmaps. Your markets are highlighted.</p>
    <div id="world"></div>
    <div class="grid2 block">
      <section><h2 class="sec">What’s driving US stocks</h2><p class="muted" id="mvIntro"></p><div id="giants"></div></section>
      <section><h2 class="sec">Sectors today</h2><div id="sectors"></div></section>
    </div>
    <section class="block"><div class="chart-h"><h2 class="sec">Heatmaps</h2><div class="chips tight" id="hmPick"></div></div><div id="hm" class="tvbox"></div><p class="small faint">Bigger boxes are bigger companies or coins. Green is up, red is down.</p></section>`)) return;
  fill('world', 'world markets', api('world', 120e3), d => worldHTML(d) + stamp(d));
  const mv = api('movers', 2 * 60e3);
  fill('mvIntro', 'summary', mv, x => esc(x.lines.slice(0, 2).join(' ')));
  fill('giants', 'the biggest stocks', mv, x => `<p class="small faint">How many Nasdaq 100 points each of the biggest companies is adding or taking away, based on approximate index weights.</p>` + giantsHTML(x.giants));
  fill('sectors', 'sectors', mv, x => sectorsHTML(x.sectors));
  const maps = [
    ['stocks', 'US stocks', () => tvWidget('hm', 'stock-heatmap', { exchanges: [], dataSource: 'SPX500', grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change', locale: 'en', colorTheme: tvTheme(), hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%' }, 560)],
    ['crypto', 'Crypto', () => tvWidget('hm', 'crypto-coins-heatmap', { dataSource: 'Crypto', blockSize: 'market_cap_calc', blockColor: '24h_close_change|5', locale: 'en', colorTheme: tvTheme(), hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%' }, 520)],
    ['fx', 'Currencies', () => tvWidget('hm', 'forex-heat-map', { width: '100%', height: '100%', currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'], isTransparent: true, colorTheme: tvTheme(), locale: 'en' }, 420)],
  ];
  const mk = myMarkets();
  const first = mk.includes('forex') && !mk.some(m => ['stocks', 'futures', 'options'].includes(m)) ? 'fx' : (mk.includes('crypto') || mk.includes('memes')) && !mk.some(m => ['stocks', 'futures', 'options'].includes(m)) ? 'crypto' : 'stocks';
  const pick = $('#hmPick');
  pick.innerHTML = maps.map(([k, l]) => `<button class="chip" data-k="${k}" aria-pressed="${k === first}">${l}</button>`).join('');
  pick.querySelectorAll('button').forEach(b => b.onclick = () => { pick.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); maps.find(m => m[0] === b.dataset.k)[2](); });
  maps.find(m => m[0] === first)[2]();
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
const newsBlock = (id, title) => `<section class="block"><div class="sec-row"><h2 class="sec">${title}</h2><a href="#news">All news</a></div><ul class="slist" id="${id}"></ul></section>`;
function marketNews(id, section, n = 8) { fill(id, 'news', api('wire?section=' + section, 60e3), d => storyList(rankStories(d.items).slice(0, n), { notes: 3 }) || '<li class="empty">No fresh stories right now.</li>'); }

// ---------- Stocks & futures ----------
PAGES.futures = () => {
  const lv = levelTrader();
  if (layout(`<h1 class="page-h">Stocks and futures</h1>
    <p class="page-intro" id="futIntro"></p>
    <div id="futQuotes"></div>
    ${chartBlock('futChart')}
    ${lv ? '<section class="block"><h2 class="sec">Key levels</h2><div id="futLevels"></div></section>' : ''}
    ${recapBlock('futRecap')}
    <div class="grid2 block">
      <section><h2 class="sec">What’s driving the indexes</h2><div id="futGiants"></div></section>
      <section><h2 class="sec">US news this week</h2><div id="futCal"></div></section>
    </div>
    ${newsBlock('futNews', 'Stories moving stocks')}`)) {
    const mine = myAssets().filter(a => a.tv && !a.ccy && a.chain === undefined && !/^(BTC|ETH|SOL|XRP|BNB|DOGE|alts)$/.test(a.id));
    chartPicker('futChart', 'futChartPick', [...mine.map(a => ({ id: shortName(a), tv: a.tv })), { id: 'S&P 500', tv: 'OANDA:SPX500USD' }, { id: 'Nasdaq 100', tv: 'OANDA:NAS100USD' }, { id: 'Dow', tv: 'OANDA:US30USD' }, { id: 'Russell 2000', tv: 'OANDA:US2000USD' }]);
  }
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
  if (layout(`<h1 class="page-h">Forex</h1>
    <p class="page-intro" id="fxIntro"></p>
    <div class="grid2"><section><h2 class="sec">Strongest to weakest today</h2><div id="fxStrength"></div></section><section><h2 class="sec">Pairs</h2><div class="qgrid" id="fxQuotes"></div></section></div>
    ${chartBlock('fxChart')}
    ${lv ? '<section class="block"><h2 class="sec">Key levels</h2><div id="fxLevels"></div></section>' : ''}
    ${recapBlock('fxRecap')}
    <div class="grid2 block">
      <section><h2 class="sec">Central banks and big releases</h2><div id="fxCal"></div></section>
      <section><h2 class="sec">Currency stories</h2><ul class="slist" id="fxNews"></ul></section>
    </div>`)) {
    const mine = myAssets().filter(a => a.ccy);
    chartPicker('fxChart', 'fxChartPick', [...mine.map(a => ({ id: a.short, tv: a.tv })), { id: 'EUR/USD', tv: 'FX:EURUSD' }, { id: 'GBP/USD', tv: 'FX:GBPUSD' }, { id: 'USD/JPY', tv: 'FX:USDJPY' }, { id: 'Gold', tv: 'OANDA:XAUUSD' }]);
  }
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
  if (layout(`<h1 class="page-h">Crypto</h1>
    <div class="front"><div><div class="page-intro" id="cIntro"></div></div><aside><h2 class="sec">Crypto mood</h2><div id="cMood"></div></aside></div>
    ${chartBlock('cChart')}
    ${levelTrader() ? '<section class="block"><h2 class="sec">Bitcoin levels</h2><div id="cBtc"></div></section>' : ''}
    ${recapBlock('cRecap')}
    <div class="grid2 block">
      <section><h2 class="sec">Biggest coins</h2><div id="cCoins"></div></section>
      <section><h2 class="sec">What people are searching for</h2><div id="cTrend"></div></section>
    </div>
    ${newsBlock('cNews', 'Crypto stories')}`)) {
    const mine = myAssets().filter(a => /^(BTC|ETH|SOL|XRP|BNB|DOGE|alts)$/.test(a.id));
    chartPicker('cChart', 'cChartPick', [...mine.map(a => ({ id: a.label, tv: a.tv })), { id: 'Bitcoin', tv: 'BINANCE:BTCUSDT' }, { id: 'Ethereum', tv: 'BINANCE:ETHUSDT' }, { id: 'Solana', tv: 'BINANCE:SOLUSDT' }]);
  }
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
function tokenCard(t, news, mine) {
  const about = t.about || t.desc;
  const icon = t.icon || t.image;
  const links = (t.links || []).filter(l => /^https?:/.test(l.url)).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener nofollow">${esc(LINK_NAMES[l.type] || l.label || 'Link')}</a>`).join('');
  return `<article class="tok${mine ? ' mine' : ''}">
    <div class="nm">${icon ? `<img class="coin" src="${esc(icon)}" alt="" loading="lazy">` : `<span class="ph">${esc((t.symbol || '?').slice(0, 3))}</span>`}
      <div>${t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)}</a>` : `<b>${esc(t.name)}</b>`}<small>${esc(t.symbol)}${t.chain ? ' · ' + esc(t.chain) : ''}</small></div>
      <div class="r"><span class="pr">${usd(t.price)}</span>${chg(t.ch24)}</div></div>
    <p class="about${about ? '' : ' none'}">${about ? esc(about) : 'No description published. With no stated purpose, the price runs purely on attention.'}</p>
    <div class="stats"><span>Value<b>${big(t.mcap)}</b></span>${t.liq != null ? `<span>Liquidity<b>${big(t.liq)}</b></span><span>Volume<b>${big(t.vol24)}</b></span>` : `<span>7 days<b>${t.ch7 != null ? (t.ch7 > 0 ? '+' : '') + t.ch7.toFixed(1) + '%' : '—'}</b></span>`}</div>
    ${t.notes && t.notes.length ? `<div class="flags">${t.notes.map(n => `<span class="flag ${n.tone}">${esc(n.text)}</span>`).join('')}</div>` : ''}
    ${news && news.length ? `<ul class="tnews">${news.slice(0, 2).map(n => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><small>${esc(n.source)}, ${ago(n.time)}</small></li>`).join('')}</ul>` : ''}
    ${links ? `<div class="links">${links}</div>` : ''}
  </article>`;
}
PAGES.memes = () => {
  layout(`<h1 class="page-h">Memecoins</h1>
    <p class="page-intro">What each coin is about, the news moving memecoins, and what it means for the market you trade. Most new tokens go to zero, so read the warnings on each card.</p>
    <div class="mood" id="mMood"></div>
    <div class="grid2">
      <section><h2 class="sec">News moving memecoins</h2><ul class="drivers" id="mDrivers"></ul></section>
      <section><h2 class="sec">What it means for you</h2><ul class="fyl" id="mFor"></ul><p class="small faint" id="mIntro" style="margin-top:14px"></p></section>
    </div>
    <section class="block"><div class="sec-row"><h2 class="sec">The established names</h2></div><div class="mgrid" id="mMajors"></div></section>
    <section class="block"><div class="sec-row"><h2 class="sec">Getting the most attention right now</h2></div><p class="small faint" style="margin:-6px 0 14px">“Promoted” tokens are ones someone paid to put in front of buyers on DexScreener. That’s attention, not quality.</p><div class="mgrid" id="mHot"></div></section>`);
  const chains = myAssets().map(a => a.chain).filter(Boolean);
  const d = api('memes');
  const md = api('memedesk?' + profileQuery(), 3 * 60e3);
  fill('mMood', 'the memecoin mood', md, x => `<span class="gauge ${esc(x.mood.word)}">${esc(x.mood.word)}</span><div><p>${esc(x.mood.text)}</p>${x.summary ? `<p>${esc(x.summary)}</p>` : ''}</div>`);
  fill('mDrivers', 'news', md, x => x.drivers.length ? x.drivers.map(n => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a><div class="meta"><span>${esc(n.theme || '')}</span><span>${esc(n.source)}</span><span>${ago(n.time)}</span></div>${n.effect ? `<p class="eff-line">${esc(n.effect)}</p>` : ''}</li>`).join('') : '<li class="empty">No fresh stories right now.</li>');
  fill('mFor', 'your notes', md, x => x.forYou.length ? x.forYou.map(f => `<li><b>${esc(marketLabel(f.market))}</b>${esc(f.text)}</li>`).join('') : '<li class="empty">Add your markets in setup to see what memecoin news means for them.</li>');
  fill('mIntro', 'summary', d, x => esc(x.lines.join(' ')));
  const both = Promise.all([d, md.catch(() => ({ tokenNews: {} }))]);
  fill('mMajors', 'memecoins', both, ([x, m]) => x.majors.map(c => tokenCard(c, m.tokenNews[c.symbol], false)).join('') || '<p class="empty">Not available.</p>');
  fill('mHot', 'tokens', both, ([x, m]) => { const hot = [...x.hot.filter(t => chains.includes(t.chain)), ...x.hot.filter(t => !chains.includes(t.chain))]; return hot.length ? hot.map(t => tokenCard(t, m.tokenNews[String(t.symbol).toUpperCase()], chains.includes(t.chain))).join('') : '<p class="empty">Nothing to show right now.</p>'; });
};

// ---------- Options ----------
PAGES.options = () => {
  layout(`<h1 class="page-h">Options</h1>
    <p class="page-intro" id="oIntro"></p>
    <section><h2 class="sec">How far the market is expected to move today</h2><div id="oEM"></div></section>
    <div class="grid2 block">
      <section><h2 class="sec">Fear gauges</h2><div class="qgrid" id="oVol"></div></section>
      <section><h2 class="sec">Expiration dates</h2><div id="oOpex"></div></section>
    </div>
    ${newsBlock('oNews', 'Stories moving options')}`);
  const d = api('markets?section=options');
  fill('oIntro', 'summary', d, x => esc([...(x.structure || []), ...x.macro].join(' ')));
  fill('oEM', 'expected move', d, x => x.expectedMove.length ? `<div class="em">${x.expectedMove.map(e => `<div class="em-c"><h3 class="sec" style="border:none;padding:0;margin:0">${esc(e.name)}</h3><p class="rng">± ${num(e.move, 0)} points</p><p class="muted">About ${(e.move / e.price * 100).toFixed(2)}% either way: ${num(e.price - e.move, 0)} to ${num(e.price + e.move, 0)}.</p></div>`).join('')}</div><p class="muted small">Roughly two days in three stay inside this range. Days that break well past it are unusual, and that’s often when trends start.</p>` : '<p class="empty">Not available.</p>');
  fill('oVol', 'fear gauges', d, x => x.quotes.filter(q => /VIX|VXN/.test(q.short)).map(q => qcell({ ...q, pct: q.changePct }, q.short)).join('') + '<p class="small faint" style="grid-column:1/-1">Higher means traders are paying more for protection. Under 15 is calm, over 25 is nervous.</p>');
  fill('oOpex', 'expiration dates', d, x => { const o = x.opex; if (!o) return ''; const lab = dt => new Date(dt + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return `<p class="callout"><b>${o.daysTo === 0 ? 'Today is' : 'Next is'} monthly expiration${o.next.quarterly ? ', a big quarterly one' : ''}:</b> ${lab(o.next.date)}${o.daysTo > 0 ? `, ${o.daysTo} day${o.daysTo > 1 ? 's' : ''} away` : ''}. ${o.next.quarterly ? 'Quarterly expirations bring heavy volume at the open and close.' : 'Prices often get pulled toward big round-number strikes around expiration.'}</p>
      <table class="t">${o.upcoming.slice(1).map(u => `<tr><td>${lab(u.date)}</td><td>${u.quarterly ? 'Quarterly' : 'Monthly'}</td></tr>`).join('')}</table>`; });
  marketNews('oNews', 'options');
};

// ---------- Economy (calendar) ----------
PAGES.calendar = () => {
  const mineCcy = [...new Set(['USD', ...myAssets().flatMap(a => a.ccy || [])])];
  const f = store.get('calFilter2', { imp: ['High', 'Medium'], ccy: mineCcy });
  const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];
  layout(`<h1 class="page-h">Economic calendar</h1>
    <p class="page-intro">Every scheduled release and central-bank event this week, explained in plain English. Open any event to see what it is and how markets usually react. Events that affect your markets are marked <mark>for you</mark>.</p>
    <div class="chips" role="group" aria-label="Importance"><span class="chips-label">Show</span>${[['High', 'Big'], ['Medium', 'Medium'], ['Low', 'Small']].map(([k, l]) => `<button class="chip" data-imp="${k}" aria-pressed="${f.imp.includes(k)}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Countries"><span class="chips-label">Currency</span>${CCY.map(c => `<button class="chip" data-ccy="${c}" aria-pressed="${f.ccy.includes(c)}">${c}</button>`).join('')}</div>
    <div id="calList"></div>`);
  const rer = () => { store.set('calFilter2', f); refreshing = false; PAGES.calendar(); };
  main.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => { const k = b.dataset.imp; f.imp = f.imp.includes(k) ? f.imp.filter(x => x !== k) : [...f.imp, k]; rer(); });
  main.querySelectorAll('[data-ccy]').forEach(b => b.onclick = () => { const k = b.dataset.ccy; f.ccy = f.ccy.includes(k) ? f.ccy.filter(x => x !== k) : [...f.ccy, k]; rer(); });
  fill('calList', 'the calendar', api('calendar', 10 * 60e3), d => {
    const ev = d.events.filter(e => f.imp.includes(e.impact) && (f.ccy.includes(e.country) || (e.country === 'All' && f.imp.includes('Low'))));
    if (!ev.length) return '<p class="empty">Nothing matches those filters. Try adding more currencies or sizes.</p>';
    const days = {}; ev.forEach(e => { const k = nyParts(e.time).date; (days[k] = days[k] || []).push(e); });
    const today = nyParts().date;
    return Object.entries(days).filter(([k]) => k >= today || Object.keys(days).length < 4).map(([k, l]) => `<div class="cal-day"><h3>${esc(dayLabel(k))}</h3>${l.map(e => eventRow(e)).join('')}</div>`).join('') + stamp(d);
  });
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

// ---------- router ----------
const ALIASES = { heatmaps: 'markets', movers: 'markets' };
function route(isRefresh = false) {
  let page = (location.hash.slice(1) || 'today').split('?')[0];
  page = ALIASES[page] || page;
  const key = PAGES[page] ? page : 'today';
  if (isRefresh && key === 'glossary') return;
  refreshing = isRefresh && shownPage === key;
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + key ? 'page' : 'false'));
  const cur = document.querySelector('#tabs a[aria-current="page"]');
  if (cur && !isRefresh) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.title = key === 'today' ? 'The Open One' : (cur ? cur.textContent : '') + ' | The Open One';
  shownPage = key; main.dataset.page = key;
  PAGES[key]();
  refreshing = false;
}
addEventListener('hashchange', () => { if (!started) return; exitFs(); route(); main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
function orderTabs() {
  const nav = $('#tabs'), mk = myMarkets();
  const links = [...nav.querySelectorAll('a')];
  const fixed = ['#today', '#news', '#markets'].map(h => links.find(a => a.getAttribute('href') === h));
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
  orderTabs(); mountStrip(); route();
  api('calendar', 10 * 60e3).then(d => { calendarCache = d.events; }).catch(() => {});
  startAlerts({ calendar: () => calendarCache, wire: () => api('wire?section=all', 60e3).then(d => d.items), levels: levelRows });
});
addEventListener('open:profile', () => { orderTabs(); mountStrip(); cache.clear(); route(); });
// Refresh data every two minutes without reloading charts
setInterval(() => {
  if (!started || document.visibilityState !== 'visible' || document.body.classList.contains('locked')) return;
  cache.clear(); mountStrip();
  api('calendar').then(d => { calendarCache = d.events; }).catch(() => {});
  route(true);
}, 120e3);
