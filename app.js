// The Open One: front end. Plain JS, no build step.
import { initMe, me, myMarkets, myAssets, mySessions, isBeginner, has, forYouEvent, forYouHeadline, greeting, windowStatus, startAlerts, openAlerts } from './me.js';
const $ = s => document.querySelector(s);
const main = $('#main');
const TZ = 'America/New_York';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- storage (per-viewer conveniences only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem('open:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('open:' + k, JSON.stringify(v)); } catch {} },
};

// ---------- theme ----------
function applyTheme() { const t = store.get('theme', null); if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme();
$('#themeBtn').onclick = () => {
  const light = document.documentElement.dataset.theme === 'light';
  store.set('theme', light ? 'dark' : 'light'); applyTheme();
  if (started) { mountTicker(); route(); }
};
let started = false;

// ---------- time helpers ----------
const nyParts = (t = Date.now()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, mi: +p.minute, mins: +p.hour * 60 + +p.minute, dow: p.weekday };
};
const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtDay = (t, opts = { weekday: 'long', month: 'short', day: 'numeric' }) => new Date(t).toLocaleDateString('en-US', { timeZone: TZ, ...opts });
const dayLabel = dateStr => { const today = nyParts().date; const d = new Date(dateStr + 'T12:00:00Z'); const tm = new Date(today + 'T12:00:00Z'); const diff = Math.round((d - tm) / 864e5); const base = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }); return diff === 0 ? 'Today, ' + base : diff === 1 ? 'Tomorrow, ' + base : base; };
const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60e3); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; };
const until = t => { const m = Math.round((t - Date.now()) / 60e3); if (m <= 0) return 'now'; if (m < 60) return `in ${m} min`; const h = Math.floor(m / 60), r = m % 60; if (h < 24) return `in ${h}h${r ? ' ' + r + 'm' : ''}`; return 'on ' + fmtDay(t, { weekday: 'long' }); };

// ---------- number helpers ----------
const num = (v, dp = 2) => v == null || !isFinite(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
const usd = v => { if (v == null || !isFinite(v)) return '—'; if (v >= 1) return '$' + num(v, v >= 1000 ? 0 : 2); const d = Math.max(2, -Math.floor(Math.log10(v)) + 3); return '$' + v.toFixed(Math.min(d, 10)); };
const big = v => v == null ? '—' : v >= 1e12 ? '$' + (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? '$' + (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(0) + 'K' : '$' + Math.round(v);
const chg = v => { if (v == null || !isFinite(v)) return '<span class="chg flat">—</span>'; const c = v > 0.005 ? 'up' : v < -0.005 ? 'down' : 'flat'; return `<span class="chg ${c}">${v > 0 ? '+' : ''}${v.toFixed(2)}%</span>`; };
function spark(vals, w = 90, h = 26) {
  vals = (vals || []).filter(v => v != null && isFinite(v));
  if (vals.length < 3) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 2 - (v - mn) / r * (h - 4)).toFixed(1)}`).join(' ');
  const col = vals[vals.length - 1] >= vals[0] ? 'var(--up)' : 'var(--down)';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// ---------- data ----------
const cache = new Map();
async function api(path, maxAgeMs = 90e3) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < maxAgeMs) return hit.p;
  const p = fetch('/api/data?fn=' + path.replace('?', '&')).then(async r => { const j = await r.json().catch(() => ({})); if (r.status === 404) throw new Error('the data service isn’t set up. Check that data.js and vercel.json are in your GitHub repo'); if (!r.ok || j.error) throw new Error(j.error || 'request failed, ' + r.status); return j; });
  cache.set(path, { t: Date.now(), p });
  p.catch(() => cache.delete(path));
  return p;
}
const errBox = (what, msg) => `<div class="err" role="alert"><span>Couldn’t load ${esc(what)} right now (${esc(msg)}). It will try again on the next refresh.</span><button class="btn" onclick="location.reload()">Reload</button></div>`;
const skel = (n = 4) => Array.from({ length: n }, (_, i) => `<div class="skel" style="width:${90 - i * 12}%"></div>`).join('');
async function fill(el, what, promise, render) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  if (!el.innerHTML.trim()) el.innerHTML = skel();
  try { const d = await promise; if (el.isConnected) el.innerHTML = render(d); }
  catch (e) { if (el.isConnected) el.innerHTML = errBox(what, e.message); }
}

// ---------- markets the viewer trades ----------
const MARKETS = [['futures', 'Futures & indexes'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['memes', 'Memecoins'], ['options', 'Options']];
const briefMarkets = () => [...new Set(myMarkets().map(m => m === 'stocks' ? 'futures' : m))];

// ---------- clock + session ribbon ----------
const SESSIONS = [
  { from: 0, to: 120, cls: 'lull', label: 'Overnight' },
  { from: 120, to: 300, cls: 'london', label: 'London open' },
  { from: 300, to: 420, cls: 'lull', label: 'Europe' },
  { from: 420, to: 600, cls: 'ny', label: 'New York morning' },
  { from: 600, to: 720, cls: 'pm', label: 'Late morning' },
  { from: 720, to: 810, cls: 'lull', label: 'Lunch' },
  { from: 810, to: 960, cls: 'pm', label: 'Afternoon' },
  { from: 960, to: 1080, cls: 'lull', label: 'After hours' },
  { from: 1200, to: 1440, cls: 'asia', label: 'Asia' },
];
const SESSION_WORDS = {
  'Overnight': 'Overnight. Thin trading between Asia and London',
  'London open': 'London is open. Often where the day’s first real move starts',
  'Europe': 'Europe is trading, New York not yet',
  'New York morning': 'New York morning, the busiest hours of the day',
  'Late morning': 'Late morning. The opening rush is fading',
  'Lunch': 'Lunch hour. Quiet, choppy trading',
  'Afternoon': 'Afternoon session, into the 4:00 close',
  'After hours': 'After hours. Futures still trade, stocks are closed',
  'Asia': 'Asia session. The overnight range is forming',
};
const TICKS = [[0, '12a', 'Midnight: the day’s opening price'], [120, '2a', ''], [300, '5a', ''], [510, '8:30', 'Most big US news drops here'], [570, '9:30', 'Stock market opens'], [600, '10', 'Second wave of news'], [720, '12p', ''], [840, '2p', 'Fed decisions land here'], [960, '4p', 'Stock market closes'], [1080, '6p', 'Futures reopen'], [1200, '8p', 'Asia session starts'], [1440, '12a', '']];
let calendarCache = null;

function isClosed(n) { return n.dow === 'Sat' || (n.dow === 'Sun' && n.h < 18) || (n.dow === 'Fri' && n.h >= 17); }
function currentSession(n) { return SESSIONS.find(s => n.mins >= s.from && n.mins < s.to) || { label: 'Evening', cls: 'lull' }; }

function drawRibbon() {
  const n = nyParts();
  const el = $('#ribbon');
  const x = m => (m / 1440 * 100).toFixed(3) + '%';
  let h = '<div class="rb-track"></div>';
  SESSIONS.forEach(s => {
    const past = n.mins >= s.to;
    h += `<div class="rb-band ${s.cls}${past ? ' past' : ''}" style="left:calc(${x(s.from)} + 1px);width:calc(${x(s.to - s.from)} - 2px)" data-tip="${esc(s.label)}: ${fmtHM(s.from)}–${fmtHM(s.to)}">${esc(s.label)}</div>`;
  });
  TICKS.forEach(([m, lab, tip]) => { h += `<div class="rb-tick${tip ? '' : ' minor'}${m === 570 || m === 600 ? ' dense' : ''}" style="left:${x(Math.min(m, 1439))}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${lab}</div>`; });
  if (calendarCache) {
    const today = calendarCache.filter(e => nyParts(e.time).date === n.date && !e.allDay && (e.impact === 'High' || (e.country === 'USD' && e.impact === 'Medium')));
    const byTime = {};
    today.forEach(e => { (byTime[e.time] = byTime[e.time] || []).push(e); });
    Object.values(byTime).forEach(list => {
      const top = list.find(e => e.impact === 'High') || list[0];
      const m = nyParts(top.time).mins;
      const tip = list.map(e => `${e.country} ${e.name}`).join(' / ') + ` at ${fmtTime(top.time)}`;
      h += `<button class="rb-pin ${top.impact}${top.time < Date.now() ? ' past' : ''}" style="left:${x(m)}" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></button>`;
    });
  }
  if (isClosed(n)) h += `<div class="rb-closed">Futures and forex are closed until Sunday 6 PM</div>`;
  else h += `<div class="rb-now" style="left:${x(n.mins)}"><span>${fmtTime(Date.now())}</span></div>`;
  el.innerHTML = h;
  const s = currentSession(n);
  $('#sessionNow').innerHTML = isClosed(n) ? '<b>Weekend.</b> Crypto is still trading.' : `<span class="dot" style="background:var(--${s.cls === 'pm' ? 'ny' : s.cls})"></span><b>${esc((SESSION_WORDS[s.label] || s.label).split('.')[0])}.</b> ${esc((SESSION_WORDS[s.label] || '').split('. ').slice(1).join('. '))}`;
  if (calendarCache) {
    const next = calendarCache.find(e => e.time > Date.now() - 60e3 && (e.impact === 'High') && (e.country === 'USD' || myMarkets().includes('forex')));
    $('#nextUp').innerHTML = next ? `Next big release: <b>${esc(next.name)}</b> (${esc(next.country)}) ${until(next.time)}, ${fmtTime(next.time)}` : 'No big releases left this week.';
  }
}
const fmtHM = m => { const h = Math.floor(m / 60) % 24, mi = m % 60; const ap = h >= 12 ? 'pm' : 'am'; const h12 = h % 12 || 12; return h12 + (mi ? ':' + String(mi).padStart(2, '0') : '') + ap; };
function tick() {
  const now = new Date();
  $('#clock').innerHTML = `<b>${now.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}</b> New York<br>${now.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' })}`;
  drawRibbon();
}

// tooltips for ribbon pins/bands
const tip = $('#tip');
document.addEventListener('pointerover', e => { const t = e.target.closest('[data-tip]'); if (!t) return; tip.textContent = t.dataset.tip; tip.classList.add('show'); const r = t.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 270, Math.max(8, r.left + r.width / 2 - 100)) + 'px'; tip.style.top = (r.bottom + 8) + 'px'; });
document.addEventListener('pointerout', e => { if (e.target.closest('[data-tip]')) tip.classList.remove('show'); });
document.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if (t) t.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); });
document.addEventListener('focusout', () => tip.classList.remove('show'));

// ---------- shared renderers ----------
function tapeRow(q) { return `<div class="tq"><div class="nm">${esc(q.short)}<small>${esc(q.name)}</small></div><div class="px">${num(q.price, q.dp)}</div>${chg(q.changePct)}</div>`; }
function qcard(q) { return `<div class="qcard"><div class="top"><span class="nm">${esc(q.short)}</span>${chg(q.changePct)}</div><div class="full">${esc(q.name)}</div><div class="top"><span class="px">${num(q.price, q.dp)}</span>${spark(q.spark)}</div></div>`; }
function ladder(table, price, dp, fmt = v => num(v, dp), adr = null) {
  const rows = [...table];
  const near = adr ? adr * 0.08 : Math.abs(price) * 0.0008;
  let placed = false, h = '';
  for (const r of rows) {
    if (!placed && price >= r.value) { h += `<div class="lrow price"><span class="lb">Price now</span><span class="lv">${fmt(price)}</span></div>`; placed = true; }
    h += `<div class="lrow${Math.abs(r.value - price) <= near ? ' near' : ''}"><span class="lb">${esc(r.label)}<span class="lh">${esc(r.hint)}</span></span><span class="lv">${fmt(r.value)}</span></div>`;
  }
  if (!placed) h += `<div class="lrow price"><span class="lb">Price now</span><span class="lv">${fmt(price)}</span></div>`;
  return `<div class="ladder"><p class="ladder-t">Levels people are watching, highest first. An amber edge means price is close to that level.</p>${h}</div>`;
}
function leaderBlock(L, fmt) {
  return `<article class="leader">
    <div>
      <div class="leader-h"><h2 style="margin:0">${esc(L.name)}</h2><span class="big">${fmt ? fmt(L.price) : num(L.price, L.dp)}</span>${chg(L.changePct)}</div>
      <ul class="notes">${L.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>
    ${ladder(L.table, L.price, L.dp, fmt, L.levels && L.levels.adr)}
  </article>`;
}
function newsList(items, limit = 14) {
  if (!items.length) return '<p class="muted">No fresh headlines right now.</p>';
  const pro = !isBeginner();
  return `<ul class="news">${items.slice(0, limit).map(i => {
    const fy = forYouHeadline(i);
    const why = pro && fy ? '' : i.why;
    return `<li><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
    ${why ? `<div class="why">${esc(why)}</div>` : ''}${fy ? `<div class="fy"><b>For you</b> ${esc(fy)}</div>` : ''}
    <div class="meta">${i.themeLabel ? `<span class="tag">${esc(i.themeLabel)}</span>` : ''}<span>${esc(i.source)}</span><span>${ago(i.time)}</span></div></li>`;
  }).join('')}</ul>`;
}
function rankNews(items) {
  // Stories that touch your markets first, then the rest, newest first within each group
  const mk = new Set(myMarkets().map(m => m === 'stocks' ? 'futures' : m));
  const mine = items.filter(i => i.markets && i.markets.some(m => mk.has(m)));
  return [...mine, ...items.filter(i => !mine.includes(i))];
}
function eventRow(e, mini = false, showFy = true) {
  const past = e.time < Date.now() - 5 * 60e3, soon = !past && e.time - Date.now() < 60 * 60e3;
  const fp = [e.forecast && `Expected ${e.forecast}`, e.previous && `Last ${e.previous.split('|')[0]}`].filter(Boolean).join(', ');
  const fy = showFy ? forYouEvent(e) : null;
  const beginner = isBeginner();
  const body = [beginner && e.what ? `<p>${esc(e.what)}</p>` : '', `<p>${esc(e.why)}</p>`,
    e.note && (beginner || has('strategy', 'ict') || has('strategy', 'pa') || has('strategy', 'news')) ? `<p class="note">${esc(e.note)}</p>` : '',
    mini && fp ? `<p class="muted small">${esc(fp)}</p>` : ''].join('');
  return `<details class="ev${past ? ' past' : ''}${soon ? ' soon' : ''}${mini ? ' mini' : ''}${fy ? ' mine' : ''}"><summary>
      <span class="t">${e.allDay ? 'All day' : fmtTime(e.time)}</span><span class="imp ${e.impact}" title="${e.impact} impact"></span>
      ${mini ? '' : `<span class="cc">${esc(e.country)}</span>`}
      <span class="nm">${esc(e.name)}${e.name !== e.title ? `<small>${mini ? esc(e.country) + ', ' : ''}${esc(e.title)}</small>` : (mini ? `<small>${esc(e.country)}</small>` : '')}</span>
      ${mini ? '' : `<span class="fp">${esc(fp)}</span>`}
      ${fy ? `<span class="fy"><b>For you</b> ${esc(fy)}</span>` : ''}</summary>
    <div class="body">${body}</div></details>`;
}
const stamp = d => `<p class="stamp">Updated ${fmtTime(d.updated || Date.now())}</p>`;

// ---------- live widgets (TradingView) ----------
const tvTheme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
function tvWidget(el, kind, cfg, height) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (!el) return;
  el.innerHTML = '';
  // The widget fills its parent, so the parent box carries the size (charts get a responsive height from CSS)
  if (!el.classList.contains('chartbox')) el.style.height = height + 'px';
  const c = document.createElement('div'); c.className = 'tradingview-widget-container'; c.style.height = '100%'; c.style.width = '100%';
  const w = document.createElement('div'); w.className = 'tradingview-widget-container__widget'; w.style.height = '100%'; c.appendChild(w);
  const sc = document.createElement('script'); sc.src = `https://s3.tradingview.com/external-embedding/embed-widget-${kind}.js`; sc.async = true; sc.innerHTML = JSON.stringify(cfg); c.appendChild(sc);
  el.appendChild(c);
}
function tvChart(el, symbol, height = 500) {
  if (typeof el === 'string') el = document.getElementById(el);
  if (el) el.classList.add('chartbox');
  const dark = tvTheme() === 'dark';
  tvWidget(el, 'advanced-chart', { autosize: true, symbol, interval: '15', timezone: 'America/New_York', theme: tvTheme(), style: '1', locale: 'en', allow_symbol_change: true, hide_volume: true, save_image: false, calendar: false, support_host: 'https://www.tradingview.com', backgroundColor: dark ? 'rgba(6,9,18,1)' : 'rgba(255,255,255,1)', gridColor: dark ? 'rgba(140,165,255,0.06)' : 'rgba(30,45,90,0.06)' }, height);
}
const CHART_NOTE = 'Live chart from TradingView. Index futures are shown with their CFD twins (e.g. US100 for NQ), which track them tick for tick and are free to embed. Type any symbol into the chart to switch.';
function chartPicker(boxId, pickId, options, noteId) {
  const pick = document.getElementById(pickId); if (!pick) return;
  const uniq = []; const seen = new Set(); options.forEach(o => { if (o.tv && !seen.has(o.tv)) { seen.add(o.tv); uniq.push(o); } });
  if (!uniq.length) return;
  pick.innerHTML = uniq.map((o, i) => `<button class="chip" data-tv="${esc(o.tv)}" aria-pressed="${i === 0}">${esc(o.id)}</button>`).join('');
  pick.querySelectorAll('button').forEach(b => b.onclick = () => { pick.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); tvChart(boxId, b.dataset.tv); });
  tvChart(boxId, uniq[0].tv);
  addFullscreen(boxId, pick);
  if (noteId && document.getElementById(noteId)) document.getElementById(noteId).textContent = CHART_NOTE;
}
// Full-screen chart: the chart box is lifted into a fixed overlay (no reload), plus browser full screen where allowed
function addFullscreen(boxId, pick) {
  const box = document.getElementById(boxId); if (!box) return;
  let shell = box.parentElement;
  if (!shell.classList.contains('chart-shell')) {
    shell = document.createElement('div'); shell.className = 'chart-shell';
    box.parentNode.insertBefore(shell, box); shell.appendChild(box);
    const x = document.createElement('button'); x.className = 'fs-exit'; x.type = 'button';
    x.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>Exit full screen';
    x.onclick = () => exitFs(shell); shell.appendChild(x);
  }
  if (!pick.parentElement.querySelector('.fs-btn')) {
    const b = document.createElement('button'); b.className = 'chip fs-btn'; b.type = 'button';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>Full screen';
    b.onclick = () => enterFs(shell); pick.parentElement.appendChild(b);
  }
}
function enterFs(shell) {
  shell.classList.add('fs'); document.body.classList.add('fs-open');
  if (shell.requestFullscreen) shell.requestFullscreen().catch(() => {});
  const x = shell.querySelector('.fs-exit'); if (x) x.focus();
}
function exitFs(shell) {
  shell = shell || document.querySelector('.chart-shell.fs'); if (!shell) return;
  shell.classList.remove('fs'); document.body.classList.remove('fs-open');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitFs(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.querySelector('.chart-shell.fs')) exitFs(); });
addEventListener('hashchange', () => exitFs());

function mountTicker() {
  const el = document.getElementById('tickerTape'); if (!el) return;
  const mine = myAssets().filter(a => a.tv).map(a => ({ proName: a.tv, title: a.id }));
  const base = [{ proName: 'OANDA:NAS100USD', title: 'US100' }, { proName: 'OANDA:SPX500USD', title: 'US500' }, { proName: 'FX:EURUSD', title: 'EUR/USD' }, { proName: 'OANDA:XAUUSD', title: 'Gold' }, { proName: 'BINANCE:BTCUSDT', title: 'BTC' }, { proName: 'BINANCE:ETHUSDT', title: 'ETH' }];
  const seen = new Set(); const symbols = [...mine, ...base].filter(x => !seen.has(x.proName) && seen.add(x.proName)).slice(0, 12);
  tvWidget(el, 'ticker-tape', { symbols, showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: tvTheme(), locale: 'en' }, 46);
}

// ---------- pages ----------
const PAGES = {};
let refreshing = false, shownPage = null;
function layout(html) { if (refreshing && main.dataset.page === shownPage && main.innerHTML) return false; main.innerHTML = html; return true; }

// ---------- personal data: gather what the viewer's assets need ----------
function needs() {
  const src = new Set(myAssets().map(a => a.src));
  return {
    fut: src.has('fut') || src.has('futq') || myMarkets().includes('futures') || myMarkets().includes('stocks'),
    fx: src.has('fx') || src.has('fxq'),
    crypto: src.has('btc') || src.has('coin') || myMarkets().includes('crypto'),
    em: src.has('em'), memes: src.has('meme'),
  };
}
async function personalData() {
  const n = needs();
  const jobs = { cal: api('calendar', 10 * 60e3) };
  if (n.fut) jobs.fut = api('markets?section=futures');
  if (n.fx) jobs.fx = api('markets?section=forex');
  if (n.crypto) jobs.crypto = api('crypto');
  if (n.em) jobs.opt = api('markets?section=options');
  if (n.memes) jobs.memes = api('memes');
  const keys = Object.keys(jobs);
  const res = await Promise.allSettled(keys.map(k => jobs[k]));
  const out = {}; keys.forEach((k, i) => { out[k] = res[i].status === 'fulfilled' ? res[i].value : null; });
  return out;
}
// One card of numbers + notes for each of the viewer's assets
function assetView(a, D) {
  const find = (arr, short) => (arr || []).find(x => x.short === short);
  if (a.src === 'fut' && D.fut) { const L = find(D.fut.leaders, a.short); if (L) return { a, price: L.price, dp: L.dp, ch: L.changePct, L, notes: L.notes, adr: L.levels && L.levels.adr }; }
  if ((a.src === 'futq' || a.src === 'fut') && D.fut) { const q = find(D.fut.quotes, a.short) || find(D.fut.leaders, a.short); if (q) return { a, price: q.price, dp: q.dp, ch: q.changePct, notes: [] }; }
  if (a.src === 'fx' && D.fx) { const L = find(D.fx.leaders, a.short); if (L) return { a, price: L.price, dp: L.dp, ch: L.changePct, L, notes: L.notes, adr: L.levels && L.levels.adr }; }
  if ((a.src === 'fxq' || a.src === 'fx') && D.fx) { const q = find(D.fx.quotes, a.short); if (q) return { a, price: q.price, dp: q.dp, ch: q.changePct, notes: [] }; }
  if (a.src === 'btc' && D.crypto && D.crypto.btc) { const b = D.crypto.btc; return { a, price: b.price, dp: 0, ch: b.changePct, L: { ...b, name: 'Bitcoin', dp: 0 }, notes: b.notes, adr: b.levels && b.levels.adr, money: true }; }
  if (a.src === 'coin' && D.crypto) { const c = D.crypto.coins.find(x => x.symbol === a.short); if (c) return { a, price: c.price, dp: c.price > 100 ? 0 : c.price > 1 ? 2 : 4, ch: c.ch24, notes: [], money: true }; }
  if (a.src === 'em' && D.opt) { const e = (D.opt.expectedMove || []).find(x => x.short === a.short); if (e) return { a, price: e.price, dp: 0, ch: null, notes: [`Options are pricing a move of about ±${num(e.move, 0)} points today (${num(e.price - e.move, 0)} to ${num(e.price + e.move, 0)}).`] }; }
  if (a.src === 'meme' && D.memes) {
    const hot = D.memes.hot.filter(t => !a.chain || t.chain === a.chain);
    const top = hot.slice(0, 3).map(t => `${t.symbol} (${t.ch24 > 0 ? '+' : ''}${(t.ch24 || 0).toFixed(0)}%)`);
    return { a, meme: true, notes: [hot.length ? `${hot.length} of the most-promoted tokens right now are ${a.chain ? 'on ' + a.chain : 'getting attention'}: ${top.join(', ')}.` : `Quiet on ${a.chain} among the most-promoted tokens right now.`] };
  }
  return null;
}
function moveLine(v) {
  const a = v.a; if (!v.adr) return '';
  if (a.pt) return `A normal day moves about <b>${num(v.adr, 0)} points</b>, which is <b>$${num(v.adr * a.pt, 0)}</b> per ${a.id} contract.`;
  if (a.pip) return `A normal day moves about <b>${num(v.adr / a.pip, 0)} pips</b>.`;
  if (v.money) return `A normal day moves about <b>$${num(v.adr, 0)}</b>.`;
  return `A normal day moves about <b>${num(v.adr, v.dp)}</b>.`;
}
function planCard(v) {
  const a = v.a, beginner = isBeginner();
  if (v.meme) return `<div class="pcard"><div class="pc-h"><b>${esc(a.label)}</b></div><p class="pc-n">${esc(v.notes[0])}</p><a class="pc-link" href="#memes">See the tokens</a></div>`;
  const notes = (v.notes || []).slice(0, beginner ? 3 : 2);
  return `<div class="pcard"><div class="pc-h"><b>${esc(a.id)}</b><span class="pc-px">${v.money ? '$' : ''}${num(v.price, v.dp)}</span>${v.ch != null ? chg(v.ch) : ''}</div>
    ${moveLine(v) ? `<p class="pc-m">${moveLine(v)}</p>` : ''}
    ${notes.length ? `<ul class="pc-notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : `<p class="pc-n muted">Live price only. Key levels are worked out for NQ, ES, the main forex pairs, gold and Bitcoin.</p>`}</div>`;
}
function planHTML(D) {
  const ws = windowStatus();
  const now = Date.now(), today = nyParts().date;
  const seenEv = new Set();
  const evs = (D.cal ? D.cal.events : []).filter(e => nyParts(e.time).date === today && e.impact !== 'Low' && forYouEvent(e)).filter(e => { const k = e.name + e.time; if (seenEv.has(k)) return false; seenEv.add(k); return true; });
  const later = evs.filter(e => e.time > now - 10 * 60e3);
  const big = later.filter(e => e.impact === 'High');
  const views = myAssets().map(a => assetView(a, D)).filter(Boolean);
  const beginner = isBeginner();
  let verdict;
  if (big.length) {
    const inWin = big.filter(e => /inside your/.test(forYouEvent(e)));
    verdict = inWin.length ? `${inWin.length === 1 ? 'A big release lands' : `${inWin.length} big releases land`} inside your trading window today. Plan around ${esc(inWin[0].name)} at ${fmtTime(inWin[0].time)}.`
      : `There’s big news today (${esc(big[0].name)} at ${fmtTime(big[0].time)}), but it falls outside your usual hours.`;
  } else if (later.length) verdict = 'Only smaller news for your markets today. Price levels should matter more than headlines.';
  else verdict = 'Nothing on the calendar for your markets today. A cleaner day to trade off levels.';
  const tips = [];
  if (has('goals', 'news') && big.length) tips.push(`Turn on alerts and you’ll get a heads-up before ${esc(big[0].name)}.`);
  if (has('goals', 'levels')) tips.push('Your levels are below, highest first, with the ones price is close to marked.');
  if (has('goals', 'discipline')) tips.push(big.length ? 'Decide now whether you’ll trade the release or wait it out, and stick to it.' : 'With a quiet calendar, the risk is overtrading. Pick your best setup and stop there.');
  if (has('goals', 'why') && beginner) tips.push('Tap any calendar event to see what it is and how price usually reacts.');
  return `<div class="plan-top">
      <div><h1 class="head plan-h">${esc(greeting())}.</h1><p class="plan-v">${verdict}</p><p class="plan-w"><span class="dot" style="background:var(--${ws.now ? 'up' : 'ny'})"></span>${esc(ws.text)}</p></div>
      ${tips.length ? `<ul class="plan-tips">${tips.slice(0, beginner ? 3 : 2).map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="plan-grid">
      <div class="plan-col"><h2>Watch out for</h2>${evs.length ? `<div class="cal-mini">${evs.map(e => eventRow(e, true)).join('')}</div>` : '<p class="muted">No news on today’s calendar touches your markets.</p>'}
        ${big.length ? `<button class="btn-ghost small-btn" id="planAlerts">Set alerts for these</button>` : ''}</div>
      <div class="plan-col"><h2>Your markets</h2><div class="pcards">${views.slice(0, 4).map(planCard).join('') || '<p class="muted">Pick some assets in your setup to see them here.</p>'}</div></div>
    </div>`;
}

// ---------- news-site layer: live desk, wire, movers, recaps ----------
const lens = () => has('strategy', 'ict') ? 'ict' : has('strategy', 'pa') ? 'pa' : has('strategy', 'news') ? 'news' : has('strategy', 'ind') ? 'ind' : 'general';
const level = () => isBeginner() ? 'beginner' : 'pro';
const ASSET_TO_DESK = { NQ: 'NQ', MNQ: 'NQ', ES: 'ES', MES: 'ES', YM: 'ES', RTY: 'ES', CL: 'Oil', GC: 'Gold', XAUUSD: 'Gold', EURUSD: 'EUR/USD', GBPUSD: 'Dollar', USDJPY: 'Dollar', AUDUSD: 'Dollar', USDCAD: 'Dollar', USDCHF: 'Dollar', NZDUSD: 'Dollar', EURGBP: 'EUR/USD', BTC: 'BTC', ETH: 'BTC', SOL: 'BTC', XRP: 'BTC', BNB: 'BTC', DOGE: 'BTC', alts: 'BTC', SPX: 'ES', NDX: 'NQ', bigtech: 'NQ', growth: 'ES', etfs: 'ES', single: 'ES' };
const ASSET_TO_RECAP = { NQ: 'NQ', MNQ: 'NQ', NDX: 'NQ', bigtech: 'NQ', ES: 'ES', MES: 'ES', SPX: 'ES', YM: 'ES', RTY: 'ES', EURUSD: 'EURUSD', GBPUSD: 'GBPUSD', USDJPY: 'USDJPY', GC: 'GOLD', XAUUSD: 'GOLD', BTC: 'BTC', ETH: 'BTC', SOL: 'BTC' };
const RECAP_NAMES = { NQ: 'NQ', ES: 'ES', EURUSD: 'EUR/USD', GBPUSD: 'GBP/USD', USDJPY: 'USD/JPY', GOLD: 'Gold', BTC: 'Bitcoin' };
const myDeskKeys = () => [...new Set(myAssets().map(a => ASSET_TO_DESK[a.id]).filter(Boolean))];
const myRecapKeys = () => { const k = [...new Set(myAssets().map(a => ASSET_TO_RECAP[a.id]).filter(Boolean))]; return k.length ? k : ['NQ']; };

function reactChip(r) {
  if (!r) return '';
  const sign = r.change > 0 ? '+' : r.change < 0 ? '−' : '';
  const amt = Math.abs(r.change).toLocaleString('en-US', { maximumFractionDigits: r.unit === 'pts' ? 1 : 0 });
  const val = r.unit === '$' ? `${sign}$${amt}` : `${sign}${amt} ${r.unit}`;
  const cls = r.change > 0 ? 'up' : r.change < 0 ? 'down' : 'flat';
  return `<span class="react ${cls}" title="Price when the story broke: ${r.from}, now ${r.now}">${esc(r.label)} ${val} since</span>`;
}
function withRefs(text, refs) {
  return esc(text).replace(/\[(\d+)\]/g, (m, n) => { const r = refs[+n - 1]; return r ? `<a class="ref" href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(r.title)} (${esc(r.source)})">${n}</a>` : ''; });
}
function deskHTML(d) {
  const mine = myDeskKeys();
  const mk = [...d.markets].sort((a, b) => (mine.includes(b.key) - mine.includes(a.key)));
  const usedRefs = [...new Set(mk.flatMap(m => m.refs || []))].sort((a, b) => a - b).slice(0, 10);
  const pxFmt = m => m.key === 'BTC' ? '$' + num(m.price, 0) : m.key === '10Y' ? num(m.price, 2) + '%' : num(m.price, m.dp);
  return `<div class="desk-top"><span class="live-dot"></span><span class="desk-kicker">Why markets are moving</span><span class="desk-meta">Updated ${fmtTime(d.updated)}${d.source === 'ai' ? ', written by AI from live prices and news' : ''}</span></div>
    <h1 class="head desk-h">${esc(d.headline)}</h1>
    <p class="desk-bp">${withRefs(d.bigPicture || '', d.refs)}</p>
    <div class="desk-grid">${mk.map(m => `<article class="dk${mine.includes(m.key) ? ' mine' : ''}">
      <div class="dk-h"><b>${esc(m.key)}</b>${mine.includes(m.key) ? '<span class="dk-you">You trade this</span>' : ''}<span class="dk-px">${pxFmt(m)}</span>${chg(m.pct)}</div>
      <p>${withRefs(m.text || '', d.refs)}</p></article>`).join('')}</div>
    <div class="desk-foot">
      ${d.forYou ? `<div class="desk-you"><h3>For you</h3><p>${withRefs(d.forYou, d.refs)}</p></div>` : ''}
      ${d.watch && d.watch.length ? `<div class="desk-watch"><h3>What could move things next</h3><ul>${d.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
    </div>
    ${usedRefs.length ? `<details class="desk-src"><summary>Sources (${usedRefs.length})</summary><ol>${usedRefs.map(n => { const r = d.refs[n - 1]; return `<li value="${n}"><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a> <span class="muted small">${esc(r.source)}, ${ago(r.time)}</span></li>`; }).join('')}</ol></details>` : ''}`;
}

// ----- news wire -----
const explainOpen = new Set();
function wireItem(i, opts = {}) {
  const fy = forYouHeadline(i);
  const id = esc(i.id);
  return `<li class="wi imp-${i.impact}" data-id="${id}">
    <div class="wi-top">${i.breaking ? '<span class="badge-break">Breaking</span>' : ''}<span class="imp-dot ${i.impact}" title="${i.impact} impact"></span><span class="wi-time">${ago(i.time)}</span>${i.themeLabel ? `<span class="tag">${esc(i.themeLabel)}</span>` : ''}${reactChip(i.reaction)}</div>
    <a class="wi-title" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a>
    ${!isBeginner() && fy ? '' : i.why ? `<div class="why">${esc(i.why)}</div>` : ''}
    ${fy ? `<div class="fy"><b>For you</b> ${esc(fy)}</div>` : ''}
    <div class="wi-meta"><span>${esc(i.source)}${i.count > 1 ? `, and ${i.count - 1} more outlet${i.count > 2 ? 's' : ''}` : ''}</span>
      ${opts.noExplain ? '' : `<button class="linkbtn wi-x" data-x="${id}" aria-expanded="${explainOpen.has(i.id)}">${explainOpen.has(i.id) ? 'Hide explanation' : 'Explain this'}</button>`}</div>
    <div class="wi-explain" id="x-${id}" ${explainOpen.has(i.id) ? '' : 'hidden'}></div></li>`;
}
function explainURL(i) {
  const r = i.reaction ? `${i.reaction.label} ${i.reaction.change > 0 ? '+' : ''}${i.reaction.change} ${i.reaction.unit} since it broke` : '';
  const p = new URLSearchParams({ title: i.title, summary: (i.summary || '').slice(0, 400), source: i.source || '', reaction: r, lens: lens(), level: level(), assets: myAssets().map(a => a.id).join(',') });
  return 'explain?' + p.toString();
}
function wireBind(root, items) {
  root.querySelectorAll('.wi-x').forEach(b => b.onclick = async () => {
    const id = b.dataset.x, item = items.find(x => x.id === id), box = root.querySelector('#x-' + CSS.escape(id));
    if (!item || !box) return;
    if (explainOpen.has(id)) { explainOpen.delete(id); box.hidden = true; b.textContent = 'Explain this'; b.setAttribute('aria-expanded', 'false'); return; }
    explainOpen.add(id); box.hidden = false; b.textContent = 'Hide explanation'; b.setAttribute('aria-expanded', 'true');
    fillExplain(box, item);
  });
  root.querySelectorAll('.wi-explain:not([hidden])').forEach(box => { const id = box.id.slice(2); const item = items.find(x => x.id === id); if (item) fillExplain(box, item); });
}
function fillExplain(box, item) {
  box.innerHTML = '<div class="skel" style="width:80%"></div><div class="skel" style="width:60%"></div>';
  api(explainURL(item), 864e5).then(x => {
    box.innerHTML = `<dl class="xp"><dt>What happened</dt><dd>${esc(x.what)}</dd><dt>Why markets care</dt><dd>${esc(x.why)}</dd><dt>How price reacted</dt><dd>${esc(x.reaction)}</dd>${x.for_you ? `<dt>For you</dt><dd>${esc(x.for_you)}</dd>` : ''}</dl>${x.source === 'ai' ? '<p class="muted small">Written by AI from the headline and live prices.</p>' : ''}`;
  }).catch(e => { box.innerHTML = errBox('the explanation', e.message); });
}

// ----- movers -----
function giantsChart(g, limit = 12) {
  const rows = g.slice(0, limit); const mx = Math.max(1, ...rows.map(x => Math.abs(x.nqPts || 0)));
  return `<div class="gchart">${rows.map(x => { const w = Math.abs(x.nqPts || 0) / mx * 50; const up = (x.nqPts || 0) >= 0;
    return `<div class="gc-row"><span class="gc-n"><b>${esc(x.sym)}</b><small>${esc(x.name)}</small></span>
      <span class="gc-bar"><i class="${up ? 'up' : 'down'}" style="${up ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`}"></i></span>
      <span class="gc-v ${up ? 'pos' : 'neg'}">${up ? '+' : '−'}${Math.abs(x.nqPts || 0).toFixed(1)} pts</span>${chg(x.pct)}</div>`; }).join('')}</div>`;
}

// ----- recaps & timeline -----
function recapHTML(d) {
  const cards = d.sessions.map(s => `<div class="rc ${s.status}"><div class="rc-h"><b>${esc(s.label)}</b><span class="rc-st">${s.status === 'live' ? 'Live now' : s.status === 'done' ? 'Done' : s.status === 'upcoming' ? 'Later' : 'No data'}</span>${s.change != null ? chg(s.open ? s.change / s.open * 100 : null) : ''}</div><p>${esc(s.text)}</p></div>`).join('');
  const tl = d.timeline.length ? `<ol class="tl">${d.timeline.map(t => `<li class="tl-${t.kind}${t.upcoming ? ' up' : ''}${t.kind === 'move' ? (t.change > 0 ? ' gain' : ' loss') : ''}"><span class="tl-t">${fmtTime(t.t)}</span><div class="tl-b"><b>${esc(t.text)}</b>${t.sub ? `<span class="muted small">${esc(t.sub)}</span>` : ''}${t.cause ? `<span class="tl-c">${esc(t.cause)}</span>` : ''}${(t.news || []).map(n => `<a class="tl-n" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)} <span class="muted">(${esc(n.source)})</span></a>`).join('')}</div></li>`).join('')}</ol>` : '<p class="muted">Nothing notable yet today.</p>';
  return `<div class="rc-grid">${cards}</div><h3 class="tl-h">Today’s timeline</h3>${tl}${stamp(d)}`;
}
function recapSection(boxId, pickId, keys) {
  const pick = document.getElementById(pickId), box = document.getElementById(boxId); if (!pick || !box) return;
  const cur = store.get('recapKey:' + boxId, keys[0]); const first = keys.includes(cur) ? cur : keys[0];
  pick.innerHTML = keys.map(k => `<button class="chip" data-k="${k}" aria-pressed="${k === first}">${esc(RECAP_NAMES[k] || k)}</button>`).join('');
  const load = k => { box.innerHTML = ''; fill(box, 'the session recap', api('recap?sym=' + k, 3 * 60e3), recapHTML); };
  pick.querySelectorAll('button').forEach(b => b.onclick = () => { pick.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); store.set('recapKey:' + boxId, b.dataset.k); load(b.dataset.k); });
  if (refreshing && box.innerHTML) fill(box, 'the session recap', api('recap?sym=' + first, 3 * 60e3), recapHTML); else load(first);
}

PAGES.today = async () => {
  if (layout(`
    <div class="lead desk-lead">
      <section class="desk" id="desk" aria-live="polite"></section>
      <aside class="col-side">
        <section><h2>Your markets right now</h2><div id="tape" class="tape"></div></section>
        <section class="cal-mini"><h2>Today’s calendar</h2><div id="todayCal"></div></section>
      </aside>
    </div>
    <section class="plan" id="plan"></section>
    <section class="chart-sec"><div class="chart-h"><h2>Live chart</h2><div class="chips tight" id="todayPick"></div></div><div id="todayChart" class="tvbox"></div><p class="muted small" id="todayNote"></p></section>
    <section class="block"><div class="chart-h"><h2>How today has played out</h2><div class="chips tight" id="rcPick"></div></div><div id="recap"></div></section>
    <div class="grid2 block">
      <section><div class="chart-h"><h2>Who’s moving NQ</h2><a class="pc-link" href="#movers">All movers</a></div><div id="miniMovers"></div></section>
      <section><div class="chart-h"><h2>Latest news</h2><a class="pc-link" href="#news">Full news wire</a></div><div id="miniWire"></div></section>
    </div>`)) {
    chartPicker('todayChart', 'todayPick', myAssets(), 'todayNote');
  }
  recapSection('recap', 'rcPick', myRecapKeys());
  const D = personalData();
  fill('desk', 'the live desk', api(`desk?lens=${lens()}&level=${level()}`, 5 * 60e3), deskHTML);
  fill('plan', 'your game plan', D, d => planHTML(d)).then(() => { const b = document.getElementById('planAlerts'); if (b) b.onclick = openAlerts; });
  fill('todayCal', 'the calendar', api('calendar', 10 * 60e3), d => {
    const n = nyParts();
    const ev = d.events.filter(e => nyParts(e.time).date === n.date && (e.country === 'USD' || e.impact === 'High') && e.impact !== 'Low');
    return ev.length ? ev.map(e => eventRow(e, true, false)).join('') : '<p class="muted">Nothing important scheduled today.</p>';
  });
  fill('tape', 'prices', D.then(d => {
    const rows = myAssets().map(a => assetView(a, d)).filter(v => v && !v.meme && v.price != null).map(v => ({ short: v.a.id, name: v.a.label, price: v.price, dp: v.dp, changePct: v.ch }));
    if (d.fut) d.fut.quotes.filter(q => ['VIX', '10Y', 'DXY'].includes(q.short)).forEach(q => rows.push(q));
    if (!rows.length) throw new Error('no prices'); return rows;
  }), qs => qs.map(tapeRow).join(''));
  fill('miniMovers', 'movers', api('movers', 2 * 60e3), x => (x.lines[0] ? `<p class="muted small">${esc(x.lines[0])}</p>` : '') + giantsChart(x.giants, 6));
  const wireP = api('wire?section=all', 60e3);
  fill('miniWire', 'news', wireP, x => `<ul class="wire compact">${rankNews(x.items).slice(0, 7).map(i => wireItem(i, { noExplain: true })).join('')}</ul>`);
};

PAGES.news = async () => {
  const f = store.get('wireFilter', { section: 'all', impact: 'all', mineFirst: true, theme: '' });
  layout(`<h1 class="head">News wire</h1>
    <p class="sec-intro">Every market-moving story from ${'<span id="srcCount">dozens of</span>'} sources, grouped when several outlets report the same thing, rated by impact, with the price move since it broke. Tap <b>Explain this</b> on any story for a plain-English breakdown${me.answers ? ' written for how you trade' : ''}.</p>
    <div class="chips" role="group" aria-label="Market"><span class="chips-label">Market:</span>${[['all', 'Everything'], ['futures', 'Stocks & futures'], ['forex', 'Forex'], ['crypto', 'Crypto']].map(([k, l]) => `<button class="chip" data-sec="${k}" aria-pressed="${f.section === k}">${l}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Impact"><span class="chips-label">Show:</span>${[['all', 'All stories'], ['medium', 'Medium and high'], ['high', 'High impact only']].map(([k, l]) => `<button class="chip" data-imp="${k}" aria-pressed="${f.impact === k}">${l}</button>`).join('')}<button class="chip" id="mineFirst" aria-pressed="${f.mineFirst}">My markets first</button></div>
    <div class="chips" id="themeChips" role="group" aria-label="Topic"></div>
    <div class="newbar" id="newBar" hidden></div>
    <ul class="wire" id="wireList"></ul>`);
  const rerender = () => { refreshing = false; PAGES.news(); };
  main.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { f.section = b.dataset.sec; f.theme = ''; store.set('wireFilter', f); rerender(); });
  main.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => { f.impact = b.dataset.imp; store.set('wireFilter', f); rerender(); });
  document.getElementById('mineFirst').onclick = () => { f.mineFirst = !f.mineFirst; store.set('wireFilter', f); rerender(); };
  const P = api('wire?section=' + f.section, 60e3);
  P.then(d => {
    const sc = document.getElementById('srcCount'); if (sc) sc.textContent = d.sources;
    const themes = [...new Set(d.items.map(i => i.themeLabel).filter(Boolean))];
    const tc = document.getElementById('themeChips');
    if (tc) { tc.innerHTML = `<span class="chips-label">Topic:</span><button class="chip" data-th="" aria-pressed="${!f.theme}">All topics</button>` + themes.map(t => `<button class="chip" data-th="${esc(t)}" aria-pressed="${f.theme === t}">${esc(t)}</button>`).join(''); tc.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { f.theme = b.dataset.th; store.set('wireFilter', f); rerender(); }); }
    const seen = store.get('wireSeen', []);
    const fresh = d.items.filter(i => !seen.includes(i.id)).length;
    if (refreshing && fresh && seen.length) { const nb = document.getElementById('newBar'); if (nb) { nb.hidden = false; nb.textContent = `${fresh} new ${fresh === 1 ? 'story' : 'stories'} added at the top`; } }
    store.set('wireSeen', d.items.map(i => i.id).slice(0, 120));
  }).catch(() => {});
  fill('wireList', 'the news wire', P, d => {
    let items = d.items.filter(i => f.impact === 'all' || (f.impact === 'high' ? i.impact === 'high' : i.impact !== 'low')).filter(i => !f.theme || i.themeLabel === f.theme);
    if (f.mineFirst) items = rankNews(items);
    return items.length ? items.map(i => wireItem(i)).join('') : '<li class="muted">No stories match those filters right now.</li>';
  }).then(() => P.then(d => wireBind(document.getElementById('wireList') || main, d.items)).catch(() => {}));
};

PAGES.movers = async () => {
  layout(`<h1 class="head">What’s moving</h1>
    <p class="sec-intro" id="mvIntro"></p>
    <div class="grid2 block">
      <section><h2>The giants behind NQ</h2><p class="muted small" style="margin-top:-6px">How many NQ points each of the biggest Nasdaq stocks is adding or taking away today (based on approximate index weights).</p><div id="mvGiants"></div></section>
      <section><h2>Sectors</h2><div id="mvSectors"></div></section>
    </div>
    <section class="block"><h2>The stories behind the moves</h2><div id="mvStories"></div></section>
    <section class="block"><h2>Biggest movers in US stocks</h2><div id="mvHot" class="tvbox"></div></section>`);
  const d = api('movers', 2 * 60e3);
  fill('mvIntro', 'summary', d, x => esc(x.lines.join(' ')));
  fill('mvGiants', 'the giants', d, x => giantsChart(x.giants) + stamp(x));
  fill('mvSectors', 'sectors', d, x => { const mx = Math.max(0.2, ...x.sectors.map(s => Math.abs(s.pct))); return `<div class="strength">${x.sectors.map(s => { const w = Math.abs(s.pct) / mx * 50; return `<div class="srow wide"><b>${esc(s.name)}</b><div class="b"><i style="${s.pct >= 0 ? `left:50%;width:${w}%;background:var(--up)` : `left:${50 - w}%;width:${w}%;background:var(--down)`}"></i></div><span style="text-align:right">${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2)}%</span></div>`; }).join('')}</div>`; });
  fill('mvStories', 'stories', d, x => { const st = x.giants.filter(g => g.story); return st.length ? `<ul class="wire compact">${st.map(g => `<li class="wi"><div class="wi-top"><b>${esc(g.name)}</b>${chg(g.pct)}<span class="muted small">${g.nqPts >= 0 ? '+' : ''}${g.nqPts} NQ pts</span></div><a class="wi-title" href="${esc(g.story.link)}" target="_blank" rel="noopener">${esc(g.story.title)}</a><div class="wi-meta"><span>${esc(g.story.source)}, ${ago(g.story.time)}</span></div></li>`).join('')}</ul>` : '<p class="muted">No company-specific stories behind today’s moves yet.</p>'; });
  if (!refreshing) tvWidget('mvHot', 'hotlists', { colorTheme: tvTheme(), dateRange: '1D', exchange: 'US', showChart: true, locale: 'en', isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, width: '100%', height: '100%' }, 560);
};

PAGES.futures = async () => {
  if (layout(`<h1 class="head">Futures &amp; indexes</h1>
    <p class="sec-intro" id="futIntro"></p>
    <section class="chart-sec"><div class="chart-h"><h2>Live chart</h2><div class="chips tight" id="futPick"></div></div><div id="futChart" class="tvbox"></div><p class="muted small" id="futNote"></p></section>
    <div id="futLeaders"></div>
    <section class="block"><div class="chart-h"><h2>How today has played out</h2><div class="chips tight" id="futRcPick"></div></div><div id="futRecap"></div></section>
    <section style="margin-top:30px"><h2>Everything else</h2><div id="futQuotes"></div></section>
    <div class="grid2" style="margin-top:34px">
      <section class="cal-mini"><h2>US news this week</h2><div id="futCal"></div></section>
      <section><h2>Headlines that move indexes</h2><div id="futNews"></div></section>
    </div>`)) {
    const mine = myAssets().filter(a => ['fut', 'futq'].includes(a.src));
    chartPicker('futChart', 'futPick', [...mine, { id: 'NQ', tv: 'OANDA:NAS100USD' }, { id: 'ES', tv: 'OANDA:SPX500USD' }, { id: 'YM', tv: 'OANDA:US30USD' }, { id: 'RTY', tv: 'OANDA:US2000USD' }], 'futNote');
  }
  recapSection('futRecap', 'futRcPick', ['NQ', 'ES']);
  const d = api('markets?section=futures');
  fill('futIntro', 'summary', d, x => esc(x.macro.join(' ') || 'Here’s how the main index futures are set up.'));
  fill('futLeaders', 'futures', d, x => x.leaders.map(L => leaderBlock(L)).join('') + stamp(x));
  fill('futQuotes', 'prices', d, x => `<div class="qgrid">${x.quotes.map(qcard).join('')}</div>`);
  fill('futCal', 'the calendar', api('calendar', 10 * 60e3), x => {
    const ev = x.events.filter(e => e.country === 'USD' && e.impact !== 'Low' && e.time > Date.now() - 6 * 36e5).slice(0, 12);
    return ev.length ? ev.map(e => `<div class="small muted" style="margin-top:10px">${esc(fmtDay(e.time, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>` + eventRow(e, true)).join('') : '<p class="muted">Nothing major coming up.</p>';
  });
  fill('futNews', 'headlines', api('news?section=futures'), x => newsList(x.items, 12));
};

PAGES.forex = async () => {
  if (layout(`<h1 class="head">Forex</h1>
    <p class="sec-intro" id="fxIntro"></p>
    <section class="chart-sec"><div class="chart-h"><h2>Live chart</h2><div class="chips tight" id="fxPick"></div></div><div id="fxChart" class="tvbox"></div></section>
    <div class="grid2" style="margin:24px 0 10px"><section><h2>Strongest to weakest today</h2><div id="fxStrength"></div></section><section><h2>Other pairs</h2><div id="fxQuotes" class="tape"></div></section></div>
    <div id="fxLeaders"></div>
    <section class="block"><div class="chart-h"><h2>How today has played out</h2><div class="chips tight" id="fxRcPick"></div></div><div id="fxRecap"></div></section>
    <div class="grid2" style="margin-top:34px">
      <section class="cal-mini"><h2>Central banks &amp; big releases</h2><div id="fxCal"></div></section>
      <section><h2>Currency headlines</h2><div id="fxNews"></div></section>
    </div>`)) {
    const mine = myAssets().filter(a => ['fx', 'fxq'].includes(a.src));
    chartPicker('fxChart', 'fxPick', [...mine, { id: 'EUR/USD', tv: 'FX:EURUSD' }, { id: 'GBP/USD', tv: 'FX:GBPUSD' }, { id: 'USD/JPY', tv: 'FX:USDJPY' }, { id: 'Gold', tv: 'OANDA:XAUUSD' }]);
  }
  recapSection('fxRecap', 'fxRcPick', ['EURUSD', 'GBPUSD', 'USDJPY', 'GOLD']);
  const d = api('markets?section=forex');
  fill('fxIntro', 'summary', d, x => esc((x.strength && x.strength.length > 1 ? `The ${x.strength[0].ccy} is leading and the ${x.strength[x.strength.length - 1].ccy} is lagging today. ` : '') + x.macro.join(' ')));
  fill('fxStrength', 'currency strength', d, x => {
    const s = x.strength || []; const mx = Math.max(0.05, ...s.map(r => Math.abs(r.score)));
    return `<div class="strength">${s.map(r => { const w = Math.abs(r.score) / mx * 50; return `<div class="srow"><b>${r.ccy}</b><div class="b"><i style="${r.score >= 0 ? `left:50%;width:${w}%;background:var(--up)` : `left:${50 - w}%;width:${w}%;background:var(--down)`}"></i></div><span style="text-align:right">${r.score > 0 ? '+' : ''}${r.score.toFixed(2)}%</span></div>`; }).join('')}</div><p class="muted small">Average move of each currency against the others today.</p>`;
  });
  fill('fxQuotes', 'pairs', d, x => x.quotes.map(tapeRow).join(''));
  fill('fxLeaders', 'pairs', d, x => x.leaders.map(L => leaderBlock(L)).join('') + stamp(x));
  fill('fxCal', 'the calendar', api('calendar', 10 * 60e3), x => {
    const ev = x.events.filter(e => e.impact === 'High' && e.time > Date.now() - 6 * 36e5).slice(0, 14);
    return ev.length ? ev.map(e => `<div class="small muted" style="margin-top:10px">${esc(fmtDay(e.time, { weekday: 'short', month: 'short', day: 'numeric' }))}</div>` + eventRow(e, true)).join('') : '<p class="muted">Nothing major coming up.</p>';
  });
  fill('fxNews', 'headlines', api('news?section=forex'), x => newsList(x.items, 12));
};

PAGES.crypto = async () => {
  if (layout(`<h1 class="head">Crypto</h1>
    <div class="lead"><div><div id="cIntro" class="story"></div></div><aside><h2>Crypto mood</h2><div id="cMood"></div></aside></div>
    <section class="chart-sec"><div class="chart-h"><h2>Live chart</h2><div class="chips tight" id="cPick"></div></div><div id="cChart" class="tvbox"></div></section>
    <div id="cBtc" style="margin-top:24px"></div>
    <section class="block"><div class="chart-h"><h2>How today has played out</h2><div class="chips tight" id="cRcPick"></div></div><div id="cRecap"></div></section>
    <div class="grid2" style="margin-top:30px">
      <section><h2>Biggest coins</h2><div id="cCoins"></div></section>
      <section><h2>What people are searching for</h2><div id="cTrend"></div></section>
    </div>
    <section style="margin-top:34px"><h2>Crypto headlines</h2><div id="cNews"></div></section>`)) {
    const mine = myAssets().filter(a => ['btc', 'coin'].includes(a.src));
    chartPicker('cChart', 'cPick', [...mine, { id: 'BTC', tv: 'BINANCE:BTCUSDT' }, { id: 'ETH', tv: 'BINANCE:ETHUSDT' }, { id: 'SOL', tv: 'BINANCE:SOLUSDT' }]);
  }
  recapSection('cRecap', 'cRcPick', ['BTC']);
  const d = api('crypto');
  fill('cIntro', 'summary', d, x => x.lines.map(l => `<p>${esc(l)}</p>`).join('') + (x.summary ? `<p class="muted small">Total value of all crypto: ${big(x.summary.mcap)}. Traded in the last day: ${big(x.summary.vol)}.</p>` : ''));
  fill('cMood', 'mood', d, x => x.fear ? `<div class="gauge"><span class="num">${x.fear.value}</span><div><b>${esc(x.fear.label)}</b><div class="muted small">out of 100</div></div></div><div class="gbar"><i style="left:${x.fear.value}%"></i></div><div class="em-ends"><span>Fear</span><span>Greed</span></div><p class="small muted">Readings near the ends have often marked turning points.</p>` : '<p class="muted">Not available.</p>');
  fill('cBtc', 'Bitcoin levels', d, x => x.btc ? `<h2>Bitcoin levels</h2>${leaderBlock({ ...x.btc, name: 'Bitcoin', dp: 0 }, v => '$' + num(v, 0))}<p class="muted small">Crypto never closes, so “yesterday” here means midnight to midnight, New York time.</p>` : '');
  fill('cCoins', 'coins', d, x => `<table class="t"><thead><tr><th>Coin</th><th>Price</th><th>24h</th><th class="hide-sm">7 days</th></tr></thead><tbody>${x.coins.map(c => `<tr><td class="n">${c.image ? `<img class="coin-img" src="${esc(c.image)}" alt="" loading="lazy">` : ''}${esc(c.symbol)}<small>${esc(c.name)}</small></td><td>${usd(c.price)}</td><td>${chg(c.ch24)}</td><td class="hide-sm">${spark(c.spark, 80, 22)}</td></tr>`).join('')}</tbody></table>`);
  fill('cTrend', 'trending', d, x => x.trending.length ? `<table class="t"><thead><tr><th>Coin</th><th>Rank</th><th>24h</th></tr></thead><tbody>${x.trending.map(c => `<tr><td class="n">${c.image ? `<img class="coin-img" src="${esc(c.image)}" alt="" loading="lazy">` : ''}${esc(c.symbol)}<small>${esc(c.name)}</small></td><td>${c.rank ? '#' + c.rank : '—'}</td><td>${chg(c.ch24)}</td></tr>`).join('')}</tbody></table><p class="muted small">The most-searched coins on CoinGecko in the last day. Attention often comes before big moves, in either direction.</p>` : '<p class="muted">Not available.</p>');
  fill('cNews', 'headlines', api('news?section=crypto'), x => newsList(x.items, 14));
};

PAGES.memes = async () => {
  layout(`<h1 class="head">Memecoins</h1>
    <div class="lead"><div><div id="mIntro" class="story"></div></div>
      <aside><div class="callout">Most new tokens go to zero. Watch liquidity: it decides whether you can actually sell. “Promoted” means someone paid to put the token in front of buyers.</div></aside></div>
    <div class="grid2" style="margin-top:30px">
      <section><h2>Getting the most attention</h2><p class="muted small" style="margin-top:-6px">The most-promoted tokens on DexScreener right now${myAssets().some(a => a.chain) ? ', your chains first' : ''}</p><div id="mHot"></div></section>
      <section><h2>The established names</h2><div id="mMajors"></div><h2 style="margin-top:30px">Memecoin headlines</h2><div id="mNews"></div></section>
    </div>`);
  const d = api('memes');
  const chains = myAssets().map(a => a.chain).filter(Boolean);
  fill('mIntro', 'summary', d, x => x.lines.map(l => `<p>${esc(l)}</p>`).join('') || '<p>Here’s where the attention is.</p>');
  fill('mHot', 'tokens', d, x => { const hot = [...x.hot.filter(t => chains.includes(t.chain)), ...x.hot.filter(t => !chains.includes(t.chain))]; return hot.length ? hot.map(t => `<div class="tok"><div class="nm">${t.icon ? `<img class="coin-img" src="${esc(t.icon)}" alt="" loading="lazy">` : ''}<a href="${esc(t.url)}" target="_blank" rel="noopener" style="text-decoration:none">${esc(t.name)}</a><small>${esc(t.symbol)} on ${esc(t.chain)}</small></div><div>${chg(t.ch24)}</div>
      <div class="stats"><span>Price ${usd(t.price)}</span><span>Value ${big(t.mcap)}</span><span>Liquidity ${big(t.liq)}</span><span>Traded today ${big(t.vol24)}</span><span>Last hour ${t.ch1 == null ? '—' : (t.ch1 > 0 ? '+' : '') + t.ch1.toFixed(1) + '%'}</span></div>
      ${t.notes.length ? `<div class="flags">${t.notes.map(n => `<span class="flag ${n.tone}">${esc(n.text)}</span>`).join('')}</div>` : ''}</div>`).join('') : '<p class="muted">Nothing to show right now.</p>'; });
  fill('mMajors', 'memecoins', d, x => `<table class="t"><thead><tr><th>Coin</th><th>Price</th><th>24h</th><th class="hide-sm">7 days</th></tr></thead><tbody>${x.majors.map(c => `<tr><td class="n">${c.image ? `<img class="coin-img" src="${esc(c.image)}" alt="" loading="lazy">` : ''}${esc(c.symbol)}<small>${esc(c.name)}, ${big(c.mcap)}</small></td><td>${usd(c.price)}</td><td>${chg(c.ch24)}</td><td class="hide-sm">${chg(c.ch7)}</td></tr>`).join('')}</tbody></table>`);
  fill('mNews', 'headlines', api('news?section=memes'), x => newsList(x.items.filter(i => i.markets.includes('memes')).concat(x.items.filter(i => !i.markets.includes('memes'))), 8));
};

PAGES.options = async () => {
  layout(`<h1 class="head">Options</h1>
    <p class="sec-intro" id="oIntro"></p>
    <section style="margin-top:22px"><h2>How far the market is expected to move today</h2><div id="oEM"></div></section>
    <div class="grid2" style="margin-top:30px">
      <section><h2>Fear gauges</h2><div id="oVol" class="tape"></div></section>
      <section><h2>Expiration dates</h2><div id="oOpex"></div></section>
    </div>
    <section style="margin-top:34px"><h2>Headlines</h2><div id="oNews"></div></section>`);
  const d = api('markets?section=options');
  fill('oIntro', 'summary', d, x => esc([...(x.structure || []), ...x.macro].join(' ')));
  fill('oEM', 'expected move', d, x => x.expectedMove.length ? `<div class="em">${x.expectedMove.map(e => `<div class="em-card"><h3>${esc(e.name)}</h3><div class="rng">± ${num(e.move, 0)} points</div><div class="muted small">About ${(e.move / e.price * 100).toFixed(2)}% either way, based on what options traders are paying</div><div class="em-bar"><i></i></div><div class="em-ends"><span>${num(e.price - e.move, 0)}</span><span>${num(e.price, 0)}</span><span>${num(e.price + e.move, 0)}</span></div></div>`).join('')}</div><p class="muted small" style="max-width:70ch">Roughly two days out of three stay inside this range. A day that breaks well past it is unusual, and that’s often when trends start or traders get caught on the wrong side.</p>` : '<p class="muted">Not available.</p>');
  fill('oVol', 'fear gauges', d, x => x.quotes.filter(q => /VIX|VXN/.test(q.short)).map(tapeRow).join('') + `<p class="muted small">Higher numbers mean traders are paying more for protection. Under 15 is calm, over 25 is nervous.</p>`);
  fill('oOpex', 'expiration dates', d, x => {
    const o = x.opex; if (!o) return '';
    const lab = dt => new Date(dt + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
    return `<div class="callout"><p style="margin:0 0 8px"><b>${o.daysTo === 0 ? 'Today is' : 'Next is'} monthly expiration${o.next.quarterly ? ', a big quarterly one' : ''}:</b> ${lab(o.next.date)}${o.daysTo > 0 ? ` (${o.daysTo} day${o.daysTo > 1 ? 's' : ''} away)` : ''}.</p>
      <p style="margin:0 0 8px">${o.next.quarterly ? 'Quarterly expirations (“triple witching”) bring huge volume, especially at the open and the close.' : 'Around expiration, prices often get pulled toward big round-number strike prices and can stall there.'}</p>
      <p style="margin:0" class="muted">Index options also expire every weekday (same-day or “0DTE” options), which adds to late-day swings.</p></div>
      <div style="margin-top:12px">${o.upcoming.slice(1).map(u => `<div class="earn-row" style="grid-template-columns:1fr auto"><span>${lab(u.date)}</span><span class="when">${u.quarterly ? 'Quarterly' : 'Monthly'}</span></div>`).join('')}</div>`;
  });
  fill('oNews', 'headlines', api('news?section=options'), x => newsList(x.items, 10));
};

PAGES.heatmaps = async () => {
  if (!layout(`<h1 class="head">Heatmaps &amp; movers</h1>
    <p class="sec-intro">See what’s hot and what’s not at a glance. Bigger boxes are bigger companies or coins; green is up, red is down. These update live.</p>
    <div id="hmBlocks"></div>`)) return;
  const blocks = {
    stocks: `<section class="hm"><div class="chart-h"><h2>Stocks</h2><div class="chips tight" id="hmIdx"><button class="chip" data-src="NASDAQ100" aria-pressed="true">Nasdaq 100</button><button class="chip" data-src="SPX500" aria-pressed="false">S&amp;P 500</button></div></div><div id="hmStocks" class="tvbox"></div><p class="muted small">Tech is most of the Nasdaq 100. When the biggest boxes are green, NQ usually is too.</p></section>
      <section class="hm"><h2>Biggest movers in US stocks</h2><div id="hmMovers" class="tvbox"></div></section>`,
    crypto: `<section class="hm"><h2>Crypto</h2><div id="hmCrypto" class="tvbox"></div></section>`,
    forex: `<section class="hm"><h2>Currencies</h2><div id="hmFx" class="tvbox"></div><p class="muted small">Read across a row: each box shows how that currency is doing against the one in the column.</p></section>`,
  };
  const mk = myMarkets();
  const order = ['stocks', 'crypto', 'forex'].sort((a, b) => {
    const score = k => (k === 'stocks' ? ['futures', 'stocks', 'options'] : k === 'crypto' ? ['crypto', 'memes'] : ['forex']).some(m => mk.includes(m)) ? 0 : 1;
    return score(a) - score(b);
  });
  document.getElementById('hmBlocks').innerHTML = order.map(k => blocks[k]).join('');
  const theme = tvTheme();
  const stock = src => tvWidget('hmStocks', 'stock-heatmap', { exchanges: [], dataSource: src, grouping: 'sector', blockSize: 'market_cap_basic', blockColor: 'change', locale: 'en', colorTheme: theme, hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%' }, 560);
  stock('NASDAQ100');
  document.querySelectorAll('#hmIdx button').forEach(b => b.onclick = () => { document.querySelectorAll('#hmIdx button').forEach(x => x.setAttribute('aria-pressed', x === b)); stock(b.dataset.src); });
  tvWidget('hmMovers', 'hotlists', { colorTheme: theme, dateRange: '1D', exchange: 'US', showChart: true, locale: 'en', isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false, width: '100%', height: '100%' }, 560);
  tvWidget('hmCrypto', 'crypto-coins-heatmap', { dataSource: 'Crypto', blockSize: 'market_cap_calc', blockColor: '24h_close_change|5', locale: 'en', colorTheme: theme, hasTopBar: false, isDataSetEnabled: false, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false, width: '100%', height: '100%' }, 520);
  tvWidget('hmFx', 'forex-heat-map', { width: '100%', height: '100%', currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD', 'NZD'], isTransparent: true, colorTheme: theme, locale: 'en' }, 420);
};

PAGES.calendar = async () => {
  const mineCcy = [...new Set(['USD', ...myAssets().flatMap(a => a.ccy || [])])];
  const f = store.get('calFilter', { imp: ['High', 'Medium'], ccy: mineCcy });
  const CCY = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];
  layout(`<h1 class="head">Economic calendar</h1>
    <p class="sec-intro">Every scheduled release this week, explained in plain English${isBeginner() ? '. Tap any event to see what it is and how price tends to react' : ''}. Events that affect your markets say <b>For you</b>. Red means big, amber medium, grey small.</p>
    <div class="chips" role="group" aria-label="Impact"><span class="chips-label">Show:</span>${['High', 'Medium', 'Low'].map(i => `<button class="chip" data-imp="${i}" aria-pressed="${f.imp.includes(i)}">${i === 'High' ? 'Big' : i === 'Medium' ? 'Medium' : 'Small'}</button>`).join('')}</div>
    <div class="chips" role="group" aria-label="Currencies"><span class="chips-label">Countries:</span>${CCY.map(c => `<button class="chip" data-ccy="${c}" aria-pressed="${f.ccy.includes(c)}">${c}</button>`).join('')}</div>
    <div id="calList"></div>`);
  main.querySelectorAll('[data-imp]').forEach(b => b.onclick = () => { const k = b.dataset.imp; f.imp = f.imp.includes(k) ? f.imp.filter(x => x !== k) : [...f.imp, k]; store.set('calFilter', f); refreshing = false; PAGES.calendar(); });
  main.querySelectorAll('[data-ccy]').forEach(b => b.onclick = () => { const k = b.dataset.ccy; f.ccy = f.ccy.includes(k) ? f.ccy.filter(x => x !== k) : [...f.ccy, k]; store.set('calFilter', f); refreshing = false; PAGES.calendar(); });
  fill('calList', 'the calendar', api('calendar', 10 * 60e3), d => {
    const ev = d.events.filter(e => f.imp.includes(e.impact) && (f.ccy.includes(e.country) || (e.country === 'All' && f.imp.includes('Low'))));
    if (!ev.length) return '<p class="muted">Nothing matches those filters. Try adding more countries or sizes.</p>';
    const days = {};
    ev.forEach(e => { const k = nyParts(e.time).date; (days[k] = days[k] || []).push(e); });
    const today = nyParts().date;
    return Object.entries(days).filter(([k]) => k >= today || Object.keys(days).length < 4).map(([k, list]) => `<div class="cal-day"><h3>${esc(dayLabel(k))}</h3>${list.map(e => eventRow(e)).join('')}</div>`).join('') + stamp(d);
  });
};

PAGES.earnings = async () => {
  layout(`<h1 class="head">Earnings</h1>
    <p class="sec-intro" id="eIntro"></p>
    <div id="eList" style="margin-top:20px"></div>`);
  const d = api('earnings', 15 * 60e3);
  fill('eIntro', 'summary', d, x => esc(x.lines.join(' ')));
  fill('eList', 'earnings', d, x => x.days.map(day => `<div class="cal-day"><h3>${esc(dayLabel(day.date))}</h3>${day.rows.length ? day.rows.map(r => `<div class="earn-row"><span class="sym">${esc(r.symbol)}</span><span>${esc(r.name)}${r.heavy ? '<span class="badge">Moves the index</span>' : ''}<span class="muted small" style="display:block">${r.mcap ? big(r.mcap) + ' company' : ''}${r.eps ? ', expected ' + esc(r.eps) + ' a share' : ''}</span></span><span class="when">${r.when === 'before' ? 'Before the open' : r.when === 'after' ? 'After the close' : 'Time not set'}</span></div>`).join('') : '<p class="muted" style="padding:10px 0">No big companies reporting.</p>'}</div>`).join('') + '<p class="muted small">Showing companies worth $20B or more, plus the heavyweights that drive the Nasdaq and S&P.</p>' + stamp(x));
};

// ---------- router ----------
function route(isRefresh = false) {
  const page = (location.hash.slice(1) || 'today').split('?')[0];
  const key = PAGES[page] ? page : 'today';
  refreshing = isRefresh && shownPage === key;
  document.querySelectorAll('#tabs a').forEach(a => a.setAttribute('aria-current', a.getAttribute('href') === '#' + key ? 'page' : 'false'));
  const cur = document.querySelector('#tabs a[aria-current="page"]'); if (cur && !isRefresh) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  document.title = key === 'today' ? 'The Open One' : cur.textContent + ' | The Open One';
  shownPage = key; main.dataset.page = key;
  PAGES[key]();
  refreshing = false;
}
addEventListener('hashchange', () => { if (!started) return; route(); main.focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
function orderTabs() {
  const nav = document.getElementById('tabs'); const mk = myMarkets();
  const links = [...nav.querySelectorAll('a')];
  const mineFirst = links.filter(a => a.dataset.m && a.dataset.m.split(' ').some(m => mk.includes(m)));
  const rest = links.filter(a => a.getAttribute('href') !== '#today' && !mineFirst.includes(a));
  const fixed = ['#today', '#news', '#movers'].map(h => links.find(a => a.getAttribute('href') === h)).filter(Boolean);
  [...fixed, ...mineFirst, ...rest.filter(a => !fixed.includes(a))].forEach(a => nav.appendChild(a));
}
async function levelRows() {
  const D = await personalData();
  return myAssets().map(a => assetView(a, D)).filter(v => v && v.L).map(v => ({ id: v.a.id, L: v.L.levels, fmt: x => (v.money ? '$' : '') + num(x, v.dp) }));
}

// ---------- start ----------
api('calendar', 10 * 60e3).then(d => { calendarCache = d.events; drawRibbon(); }).catch(() => {});
tick(); setInterval(tick, 30e3);
document.getElementById('bellBtn').onclick = () => { if (started) openAlerts(); };
initMe(() => {
  started = true;
  orderTabs(); mountTicker(); route();
  startAlerts({ calendar: () => calendarCache, levels: levelRows });
});
addEventListener('open:profile', () => { orderTabs(); mountTicker(); cache.clear(); route(); });
// Refresh the open page's data every 2 minutes without reloading charts
setInterval(() => { if (started && document.visibilityState === 'visible') { cache.clear(); api('calendar').then(d => { calendarCache = d.events; }).catch(() => {}); route(true); } }, 120e3);
