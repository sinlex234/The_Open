// The Open One: accounts, the setup questions, personal notes and alerts.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('open:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('open:' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('open:' + k); } catch {} },
};
const TZ = 'America/New_York';
const nyMins = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
const nyDate = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtM = m => { const h = Math.floor(m / 60) % 24, mi = m % 60, ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${ap}`; };
const list = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

// ---------- what people can pick ----------
export const MARKETS = [
  ['futures', 'Futures', 'NQ, ES, oil, gold'], ['forex', 'Forex', 'Currency pairs and gold'], ['stocks', 'Stocks', 'Shares and ETFs'],
  ['options', 'Options', 'SPX, SPY, QQQ'], ['crypto', 'Crypto', 'Bitcoin and the big coins'], ['memes', 'Memecoins', 'New tokens on-chain'],
];
// src: where the site gets data. pt: dollars per point for one futures contract. tv: live chart symbol.
export const ASSETS = {
  futures: [
    { id: 'NQ', label: 'Nasdaq 100 (NQ)', src: 'fut', short: 'NQ', pt: 20, tv: 'OANDA:NAS100USD' },
    { id: 'MNQ', label: 'Micro Nasdaq (MNQ)', src: 'fut', short: 'NQ', pt: 2, tv: 'OANDA:NAS100USD' },
    { id: 'ES', label: 'S&P 500 (ES)', src: 'fut', short: 'ES', pt: 50, tv: 'OANDA:SPX500USD' },
    { id: 'MES', label: 'Micro S&P (MES)', src: 'fut', short: 'ES', pt: 5, tv: 'OANDA:SPX500USD' },
    { id: 'YM', label: 'Dow (YM)', src: 'futq', short: 'YM', pt: 5, tv: 'OANDA:US30USD' },
    { id: 'RTY', label: 'Russell 2000 (RTY)', src: 'futq', short: 'RTY', pt: 50, tv: 'OANDA:US2000USD' },
    { id: 'CL', label: 'Crude oil (CL)', src: 'futq', short: 'Oil', pt: 1000, tv: 'TVC:USOIL' },
    { id: 'GC', label: 'Gold (GC)', src: 'fx', short: 'Gold', pt: 100, tv: 'OANDA:XAUUSD' },
  ],
  forex: [
    { id: 'EURUSD', label: 'EUR/USD', src: 'fx', short: 'EUR/USD', pip: 0.0001, ccy: ['EUR', 'USD'], tv: 'FX:EURUSD' },
    { id: 'GBPUSD', label: 'GBP/USD', src: 'fx', short: 'GBP/USD', pip: 0.0001, ccy: ['GBP', 'USD'], tv: 'FX:GBPUSD' },
    { id: 'USDJPY', label: 'USD/JPY', src: 'fx', short: 'USD/JPY', pip: 0.01, ccy: ['USD', 'JPY'], tv: 'FX:USDJPY' },
    { id: 'XAUUSD', label: 'Gold (XAU/USD)', src: 'fx', short: 'Gold', ccy: ['USD'], tv: 'OANDA:XAUUSD' },
    { id: 'AUDUSD', label: 'AUD/USD', src: 'fxq', short: 'AUD/USD', pip: 0.0001, ccy: ['AUD', 'USD'], tv: 'FX:AUDUSD' },
    { id: 'USDCAD', label: 'USD/CAD', src: 'fxq', short: 'USD/CAD', pip: 0.0001, ccy: ['USD', 'CAD'], tv: 'FX:USDCAD' },
    { id: 'USDCHF', label: 'USD/CHF', src: 'fxq', short: 'USD/CHF', pip: 0.0001, ccy: ['USD', 'CHF'], tv: 'FX:USDCHF' },
    { id: 'NZDUSD', label: 'NZD/USD', src: 'fxq', short: 'NZD/USD', pip: 0.0001, ccy: ['NZD', 'USD'], tv: 'FX:NZDUSD' },
    { id: 'EURGBP', label: 'EUR/GBP', src: 'fxq', short: 'EUR/GBP', pip: 0.0001, ccy: ['EUR', 'GBP'], tv: 'FX:EURGBP' },
  ],
  stocks: [
    { id: 'bigtech', label: 'Big tech (Apple, Nvidia…)', src: 'none', tv: 'NASDAQ:NVDA' },
    { id: 'growth', label: 'Growth & small caps', src: 'none', tv: 'AMEX:IWM' },
    { id: 'etfs', label: 'Index ETFs (SPY, QQQ)', src: 'none', tv: 'AMEX:SPY' },
  ],
  options: [
    { id: 'SPX', label: 'S&P 500 (SPX / SPY)', src: 'em', short: 'SPX', tv: 'OANDA:SPX500USD' },
    { id: 'NDX', label: 'Nasdaq (QQQ / NDX)', src: 'em', short: 'NDX', tv: 'OANDA:NAS100USD' },
    { id: 'single', label: 'Single stocks', src: 'none', tv: 'NASDAQ:AAPL' },
  ],
  crypto: [
    { id: 'BTC', label: 'Bitcoin', src: 'btc', short: 'BTC', tv: 'BINANCE:BTCUSDT' },
    { id: 'ETH', label: 'Ethereum', src: 'coin', short: 'ETH', tv: 'BINANCE:ETHUSDT' },
    { id: 'SOL', label: 'Solana', src: 'coin', short: 'SOL', tv: 'BINANCE:SOLUSDT' },
    { id: 'XRP', label: 'XRP', src: 'coin', short: 'XRP', tv: 'BINANCE:XRPUSDT' },
    { id: 'BNB', label: 'BNB', src: 'coin', short: 'BNB', tv: 'BINANCE:BNBUSDT' },
    { id: 'DOGE', label: 'Dogecoin', src: 'coin', short: 'DOGE', tv: 'BINANCE:DOGEUSDT' },
    { id: 'alts', label: 'Other altcoins', src: 'none', tv: 'BINANCE:ETHBTC' },
  ],
  memes: [
    { id: 'solana', label: 'Solana memecoins', src: 'meme', chain: 'solana' },
    { id: 'base', label: 'Base memecoins', src: 'meme', chain: 'base' },
    { id: 'ethereum', label: 'Ethereum memecoins', src: 'meme', chain: 'ethereum' },
    { id: 'bignames', label: 'Big names (DOGE, PEPE, BONK…)', src: 'meme', chain: null },
  ],
};
export const ASSET_BY_ID = Object.fromEntries(Object.values(ASSETS).flat().map(a => [a.id, a]));
export const SESSIONS = {
  asia: { label: 'Asia', from: 1200, to: 1440, hint: '8 PM – midnight' },
  london: { label: 'London', from: 120, to: 300, hint: '2 – 5 AM' },
  nyam: { label: 'New York morning', from: 420, to: 660, hint: '7 – 11 AM' },
  nypm: { label: 'New York afternoon', from: 810, to: 960, hint: '1:30 – 4 PM' },
};
const QUESTIONS = [
  { id: 'markets', title: 'What do you trade?', sub: 'Pick everything you trade or want to follow. The site puts these first.', multi: true, options: MARKETS.map(([id, l, s]) => ({ id, label: l, sub: s })), min: 1 },
  { id: 'assets', title: 'Which ones exactly?', sub: 'Your daily game plan and alerts are built around these.', multi: true, assets: true, min: 1 },
  { id: 'experience', title: 'How long have you been trading?', sub: 'This sets how much each note explains.', options: [['new', 'Under 6 months'], ['learning', '6 – 12 months'], ['some', '1 – 3 years'], ['vet', '3+ years']].map(([id, label]) => ({ id, label })) },
  { id: 'account', title: 'What kind of account?', sub: 'Pick all that apply.', multi: true, options: [['paper', 'Paper / demo'], ['funded', 'Funded / prop firm'], ['live', 'Live money']].map(([id, label]) => ({ id, label })), min: 1 },
  { id: 'style', title: 'How do you trade?', sub: 'Pick all that apply.', multi: true, options: [['scalp', 'Scalping', 'In and out in minutes'], ['day', 'Day trading', 'Flat by the close'], ['swing', 'Swing trading', 'Days to weeks'], ['long', 'Long term', 'Weeks or more']].map(([id, label, sub]) => ({ id, label, sub })), min: 1 },
  { id: 'strategy', title: 'What’s your approach?', sub: 'Pick all that apply.', multi: true, options: [['ict', 'ICT / smart money'], ['pa', 'Price action, support & resistance'], ['ind', 'Indicators'], ['news', 'Trading the news'], ['unsure', 'Still figuring it out']].map(([id, label]) => ({ id, label })), min: 1 },
  { id: 'sessions', title: 'When do you usually trade?', sub: 'New York time. Your game plan and alerts follow these hours.', multi: true, options: Object.entries(SESSIONS).map(([id, s]) => ({ id, label: s.label, sub: s.hint })), min: 1 },
  { id: 'goals', title: 'What do you want help with?', sub: 'Pick all that apply.', multi: true, options: [['news', 'Not getting caught by news'], ['levels', 'Knowing the key levels'], ['why', 'Understanding why price moves'], ['setups', 'Spotting setups faster'], ['discipline', 'Staying disciplined']].map(([id, label]) => ({ id, label })), min: 1 },
];

// ---------- state ----------
export const me = { user: null, name: '', answers: null, alerts: ls.get('alerts', { news: true, lead: 5, sessions: true, levels: false }) };
let sb = null, onReadyCb = null, readyFired = false;
const configured = !!(SUPABASE_URL && SUPABASE_KEY && window.supabase);

// ---------- personal helpers used by the pages ----------
export const hasProfile = () => !!(me.answers && me.answers.markets && me.answers.markets.length);
export const myMarkets = () => (me.answers && me.answers.markets) || ['futures'];
export const myAssets = () => ((me.answers && me.answers.assets) || ['NQ']).map(id => ASSET_BY_ID[id]).filter(Boolean);
export const mySessions = () => ((me.answers && me.answers.sessions) || ['nyam']).map(id => ({ id, ...SESSIONS[id] })).filter(s => s.label);
export const isBeginner = () => ['new', 'learning'].includes(me.answers && me.answers.experience);
export const has = (q, v) => !!(me.answers && (me.answers[q] || []).includes(v));
export function myCurrencies() {
  const c = new Set();
  myMarkets().forEach(m => { if (m !== 'forex') c.add('USD'); });
  myAssets().forEach(a => (a.ccy || []).forEach(x => c.add(x)));
  if (!c.size) c.add('USD');
  return c;
}
function assetsForCurrency(ccy) {
  const out = myAssets().filter(a => a.src !== 'none' && a.src !== 'meme' && (a.ccy ? a.ccy.includes(ccy) : ccy === 'USD')).map(a => a.id);
  if (ccy === 'USD' && myMarkets().some(m => ['crypto', 'memes'].includes(m)) && !out.length) out.push('crypto');
  return out;
}
export function windowFor(mins) {
  for (const s of mySessions()) {
    const inside = s.from <= mins && mins < s.to;
    if (inside) return { s, kind: 'inside' };
  }
  let best = null;
  for (const s of mySessions()) {
    const before = (s.from - mins + 1440) % 1440;
    if (before > 0 && before <= 90 && (!best || before < best.d)) best = { s, kind: 'before', d: before };
  }
  if (best) return best;
  for (const s of mySessions()) { const after = (mins - s.to + 1440) % 1440; if (after < 60) return { s, kind: 'after', d: after }; }
  return { kind: 'outside' };
}
export function forYouEvent(e) {
  if (!me.answers || e.impact === 'Low' || e.allDay) return null;
  if (!myCurrencies().has(e.country)) return null;
  const who = assetsForCurrency(e.country);
  const w = windowFor(nyMins(e.time));
  let t = w.kind === 'inside' ? `Lands inside your ${w.s.label} window.`
    : w.kind === 'before' ? `Hits ${w.d} min before your ${w.s.label} window opens, so the first reaction may still be playing out when you start.`
    : w.kind === 'after' ? `Comes just after your ${w.s.label} window closes.`
    : 'Outside the hours you usually trade.';
  const extra = [];
  if (e.impact === 'High') {
    if (has('strategy', 'news')) extra.push('This is the kind of release news traders line up for.');
    else if (has('strategy', 'ict') || has('strategy', 'pa')) extra.push('Expect the obvious highs and lows nearby to get tested first.');
    if (has('account', 'funded') && w.kind !== 'outside') extra.push('Check your firm’s news rules for this one.');
    if (isBeginner() && w.kind !== 'outside') extra.push('Sitting out the first 5–15 minutes is a common habit.');
  }
  const prefix = who.length ? `For ${list(who.map(x => x === 'crypto' ? 'your crypto' : x))}: ` : '';
  return prefix + t + (extra.length ? ' ' + extra.slice(0, isBeginner() ? 2 : 1).join(' ') : '');
}
const THEME_LINES = {
  ai: a => a.some(x => ['NQ', 'MNQ', 'NDX', 'bigtech'].includes(x)) ? 'NQ is packed with tech and chip stocks, so this can move it directly.' : null,
  earnings: a => a.some(x => ['NQ', 'MNQ', 'ES', 'MES', 'NDX', 'SPX', 'bigtech'].includes(x)) ? 'Big company results can push the whole index you trade.' : null,
  rates: a => 'Rate news tends to move ' + (a.some(x => ['NQ', 'MNQ'].includes(x)) ? 'NQ more than ES, ' : '') + 'the dollar and bonds at once.',
  inflation: () => 'Inflation surprises feed straight into rate expectations, which your markets react to.',
  dollar: a => a.some(x => ASSET_BY_ID[x] && ASSET_BY_ID[x].ccy) ? 'Your pairs all have a dollar or euro side, so this matters for you.' : null,
  gold: a => a.some(x => ['GC', 'XAUUSD'].includes(x)) ? 'You trade gold, so keep this one in mind.' : null,
  energy: a => a.includes('CL') ? 'You trade oil, so this is directly relevant.' : null,
  crypto: () => myMarkets().includes('crypto') ? 'Relevant to the coins you follow.' : null,
  memes: () => myMarkets().includes('memes') ? 'Relevant to the memecoins you trade.' : null,
};
export function forYouHeadline(h) {
  if (!me.answers) return null;
  const mk = new Set(myMarkets().map(m => m === 'stocks' ? 'futures' : m));
  if (!h.markets || !h.markets.some(m => mk.has(m))) return null;
  const ids = myAssets().map(a => a.id);
  const f = THEME_LINES[h.theme];
  return (f && f(ids)) || null;
}
export function greeting() {
  const h = Math.floor(nyMins(Date.now()) / 60);
  const part = h < 5 ? 'Up early' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return me.name ? `${part}, ${me.name.split(/[ @]/)[0]}` : part;
}
export function windowStatus(now = Date.now()) {
  const m = nyMins(now);
  const ss = mySessions();
  const inside = ss.find(s => s.from <= m && m < s.to);
  if (inside) return { now: true, s: inside, text: `You’re in your ${inside.label} window now, until ${fmtM(inside.to % 1440)}.` };
  const next = ss.map(s => ({ s, d: (s.from - m + 1440) % 1440 })).sort((a, b) => a.d - b.d)[0];
  if (!next) return { text: '' };
  const h = Math.floor(next.d / 60), mi = next.d % 60;
  return { now: false, s: next.s, inMins: next.d, text: `Your ${next.s.label} window opens in ${h ? h + 'h ' : ''}${mi}m, at ${fmtM(next.s.from)}.` };
}

// ---------- Supabase ----------
const redirectURL = () => location.origin + location.pathname;
async function loadAnswers() {
  if (!sb || !me.user) return null;
  const { data, error } = await sb.from('open_profiles').select('answers').eq('user_id', me.user.id).maybeSingle();
  if (error) { console.warn('profile load failed', error.message); return ls.get('answers:' + me.user.id, null); }
  return data && data.answers && Object.keys(data.answers).length ? data.answers : null;
}
async function saveAnswers(a) {
  me.answers = a;
  if (me.user) ls.set('answers:' + me.user.id, a); else ls.set('answers:guest', a);
  if (!sb || !me.user) return true;
  const { error } = await sb.from('open_profiles').upsert({ user_id: me.user.id, answers: a, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) { console.warn('profile save failed', error.message); return false; }
  return true;
}
async function loadName() {
  const md = (me.user && me.user.user_metadata) || {};
  me.name = md.full_name || md.name || md.username || '';
  if (sb && me.user) {
    const { data } = await sb.from('profiles').select('username').eq('id', me.user.id).maybeSingle();
    if (data && data.username && !me.name) me.name = data.username;
  }
  if (!me.name && me.user && me.user.email) me.name = me.user.email.split('@')[0];
}

// ---------- the gate (sign in / sign up) ----------
const GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
let authMode = 'signup';
function gateHTML() {
  return `<div class="gate-card" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
    <div class="gate-side">
      <div class="gate-brand">The Open One</div>
      <h1 id="gateTitle" class="gate-h">Know how today’s market affects <em>your</em> trades.</h1>
      <ul class="gate-points">
        <li>A morning game plan built around what you trade and when</li>
        <li>Every news release and headline explained in plain English, with what it means for you</li>
        <li>Live charts, heatmaps, key levels and alerts in one place</li>
      </ul>
      <p class="gate-fine">One account works here and on Crema, the trading journal.</p>
    </div>
    <div class="gate-form" id="gateForm">
      <div class="seg" id="authSeg" role="tablist"><button data-mode="signup" role="tab">Create account</button><button data-mode="signin" role="tab">Sign in</button></div>
      <button class="btn-google" id="gGoogle">${GOOGLE}Continue with Google</button>
      <div class="or">or</div>
      <label class="fld" id="fEmail"><span>Email</span><input type="email" id="aEmail" autocomplete="email" placeholder="you@example.com"></label>
      <label class="fld" id="fUser"><span>Username</span><input type="text" id="aUser" autocomplete="username" maxlength="20" placeholder="3–20 letters, numbers or _"></label>
      <label class="fld" id="fId"><span>Email or username</span><input type="text" id="aId" autocomplete="username"></label>
      <label class="fld" id="fPass"><span>Password</span><input type="password" id="aPass" autocomplete="new-password" placeholder="At least 8 characters"></label>
      <button class="linkbtn" id="aForgot" type="button">Forgot password?</button>
      <div class="amsg" id="aMsg" role="status"></div>
      <button class="btn-primary" id="aSubmit">Create account</button>
    </div>
    <div class="gate-form" id="gateReset" hidden>
      <h2>Choose a new password</h2>
      <label class="fld"><span>New password</span><input type="password" id="aNew" autocomplete="new-password" placeholder="At least 8 characters"></label>
      <div class="amsg" id="rMsg" role="status"></div>
      <button class="btn-primary" id="rSubmit">Save password</button>
    </div>
  </div>`;
}
function msg(id, text, ok) { const el = $('#' + id); el.textContent = text || ''; el.className = 'amsg' + (text ? (ok ? ' ok' : ' bad') : ''); }
function setMode(m) {
  authMode = m; msg('aMsg', '');
  document.querySelectorAll('#authSeg button').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === m));
  const up = m === 'signup', fg = m === 'forgot';
  $('#fEmail').hidden = !up; $('#fUser').hidden = !up; $('#fId').hidden = up; $('#fPass').hidden = fg;
  $('#aForgot').hidden = m !== 'signin'; $('#authSeg').hidden = fg; $('#gGoogle').hidden = fg; $('#gateForm .or').hidden = fg;
  $('#aPass').autocomplete = up ? 'new-password' : 'current-password';
  $('#aSubmit').textContent = up ? 'Create account' : fg ? 'Email me a reset link' : 'Sign in';
}
const USER_RE = /^[a-z0-9_]{3,20}$/;
function friendly(e) {
  const m = (e && e.message) || String(e);
  if (/invalid login credentials/i.test(m)) return 'That email or username and password don’t match.';
  if (/email not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link.';
  if (/already registered/i.test(m)) return 'An account with that email already exists. Sign in instead.';
  if (/not authorized/i.test(m)) return 'Email sign-up isn’t open to new addresses yet. Use Continue with Google.';
  if (/rate limit|too many/i.test(m)) return 'Too many attempts. Wait a minute and try again.';
  if (/failed to fetch|network/i.test(m)) return 'Can’t reach the server. Check your connection.';
  return m;
}
async function resolveEmail(id) {
  if (id.includes('@')) return id;
  const { data, error } = await sb.rpc('email_for_username', { uname: id.toLowerCase() });
  if (error) throw error; return data || null;
}
async function submit() {
  const b = $('#aSubmit'); if (b.disabled) return; b.disabled = true; msg('aMsg', '');
  try {
    if (authMode === 'signup') {
      const email = $('#aEmail').value.trim(), user = $('#aUser').value.trim().toLowerCase(), pass = $('#aPass').value;
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg('aMsg', 'Enter a valid email address.');
      if (!USER_RE.test(user)) return msg('aMsg', 'Usernames are 3–20 characters: lowercase letters, numbers or _.');
      if (pass.length < 8) return msg('aMsg', 'Use a password of at least 8 characters.');
      const { data: free, error: e1 } = await sb.rpc('username_available', { uname: user }); if (e1) throw e1;
      if (!free) return msg('aMsg', 'That username is taken. Try another.');
      const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { username: user }, emailRedirectTo: redirectURL() } });
      if (error) throw error;
      if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) return msg('aMsg', 'An account with that email already exists. Sign in instead.');
      if (!data.session) return msg('aMsg', `Check ${email} for a confirmation link, then come back here.`, true);
    } else if (authMode === 'forgot') {
      const id = $('#aId').value.trim(); if (!id) return msg('aMsg', 'Enter your email or username.');
      const email = await resolveEmail(id);
      if (email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectURL() }); if (error) throw error; }
      msg('aMsg', 'If that account exists, a reset link is on its way.', true);
    } else {
      const id = $('#aId').value.trim(), pass = $('#aPass').value;
      if (!id || !pass) return msg('aMsg', 'Enter your email or username and your password.');
      const email = await resolveEmail(id); if (!email) return msg('aMsg', 'No account found with that username.');
      const { error } = await sb.auth.signInWithPassword({ email, password: pass }); if (error) throw error;
    }
  } catch (e) { msg('aMsg', friendly(e)); } finally { b.disabled = false; }
}
function showGate(reset = false) {
  const g = $('#gate'); g.innerHTML = gateHTML(); g.hidden = false; document.body.classList.add('locked');
  document.querySelectorAll('#authSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  $('#aForgot').onclick = () => setMode('forgot');
  $('#aSubmit').onclick = submit;
  ['aEmail', 'aUser', 'aId', 'aPass'].forEach(id => $('#' + id).addEventListener('keydown', e => { if (e.key === 'Enter') submit(); }));
  $('#gGoogle').onclick = async () => { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectURL() } }); if (error) msg('aMsg', friendly(error)); };
  $('#rSubmit').onclick = async () => {
    const p = $('#aNew').value; if (p.length < 8) return msg('rMsg', 'Use at least 8 characters.');
    const { error } = await sb.auth.updateUser({ password: p }); if (error) return msg('rMsg', friendly(error));
    msg('rMsg', 'Password saved.', true); setTimeout(() => afterSignIn(me.user), 800);
  };
  if (reset) { $('#gateForm').hidden = true; $('#gateReset').hidden = false; } else setMode(ls.get('seen', false) ? 'signin' : 'signup');
}
function hideGate() { const g = $('#gate'); g.hidden = true; g.innerHTML = ''; document.body.classList.remove('locked'); }

// ---------- setup questions ----------
function wizard(existing, onDone) {
  const a = JSON.parse(JSON.stringify(existing || {}));
  let i = 0;
  const w = $('#wizard'); w.hidden = false; document.body.classList.add('locked');
  const steps = QUESTIONS;
  function optsFor(q) {
    if (!q.assets) return q.options;
    return (a.markets || []).flatMap(m => ASSETS[m].map(x => ({ id: x.id, label: x.label, group: MARKETS.find(k => k[0] === m)[1] })));
  }
  function render() {
    const q = steps[i], opts = optsFor(q), val = a[q.id] || (q.multi ? [] : null);
    let groups = '';
    if (q.assets) {
      const by = {}; opts.forEach(o => (by[o.group] = by[o.group] || []).push(o));
      groups = Object.entries(by).map(([g, os]) => `<div class="wz-group"><div class="wz-glabel">${esc(g)}</div><div class="wz-opts">${os.map(btn).join('')}</div></div>`).join('');
    } else groups = `<div class="wz-opts">${opts.map(btn).join('')}</div>`;
    function btn(o) { const on = q.multi ? val.includes(o.id) : val === o.id; return `<button class="wz-opt" data-id="${esc(o.id)}" aria-pressed="${on}"><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`; }
    w.innerHTML = `<div class="wz-card" role="dialog" aria-modal="true" aria-labelledby="wzTitle">
      <div class="wz-top"><span class="wz-brand">The Open One</span><span class="wz-count">${i + 1} of ${steps.length}</span></div>
      <div class="wz-bar"><i style="width:${(i + 1) / steps.length * 100}%"></i></div>
      <h2 id="wzTitle" class="wz-h">${esc(q.title)}</h2><p class="wz-sub">${esc(q.sub)}</p>
      ${groups}
      <div class="wz-foot"><button class="btn-ghost" id="wzBack" ${i === 0 ? 'hidden' : ''}>Back</button><span class="wz-err" id="wzErr"></span><button class="btn-primary" id="wzNext">${i === steps.length - 1 ? 'Show me my day' : 'Next'}</button></div>
    </div>`;
    w.querySelectorAll('.wz-opt').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (q.multi) { const s = new Set(a[q.id] || []); s.has(id) ? s.delete(id) : s.add(id); a[q.id] = [...s]; }
      else a[q.id] = id;
      if (q.id === 'markets') a.assets = (a.assets || []).filter(x => (a.markets || []).some(m => ASSETS[m].some(y => y.id === x)));
      render();
      if (!q.multi) setTimeout(() => $('#wzNext') && $('#wzNext').click(), 180);
    });
    $('#wzBack').onclick = () => { i--; render(); };
    $('#wzNext').onclick = async () => {
      const v = a[q.id];
      if (!v || (q.multi && v.length < (q.min || 1))) { $('#wzErr').textContent = 'Pick at least one to continue.'; return; }
      if (i < steps.length - 1) { i++; render(); return; }
      $('#wzNext').disabled = true; $('#wzNext').textContent = 'Saving…';
      const ok = await saveAnswers(a);
      if (!ok) { $('#wzErr').textContent = 'Saved on this device. It will sync to your account next time.'; await new Promise(r => setTimeout(r, 1200)); }
      w.hidden = true; w.innerHTML = ''; document.body.classList.remove('locked');
      onDone && onDone();
    };
    const first = w.querySelector('.wz-opt[aria-pressed="true"]') || w.querySelector('.wz-opt'); if (first) first.focus({ preventScroll: true });
  }
  render();
}
export function editSetup() { wizard(me.answers, () => { window.dispatchEvent(new Event('open:profile')); }); }

// ---------- account button + menu ----------
function renderAccount() {
  const b = $('#acctBtn'); if (!b) return;
  const n = me.name || 'You';
  b.innerHTML = `<span class="av">${esc(n.charAt(0).toUpperCase())}</span>`;
  b.title = me.user ? `Signed in as ${me.user.email || n}` : 'Your setup';
  b.hidden = false;
}
function openMenu() {
  const m = $('#acctMenu');
  if (!m.hidden) { m.hidden = true; return; }
  const a = me.answers || {};
  const names = myAssets().map(x => x.id).join(', ');
  m.innerHTML = `<div class="am-head"><span class="av big">${esc((me.name || 'Y').charAt(0).toUpperCase())}</span><div><b>${esc(me.name || 'Your setup')}</b><small>${esc(me.user ? me.user.email || '' : 'Not signed in')}</small></div></div>
    <div class="am-sum">${esc(names || 'No markets picked yet')}${a.sessions ? ' · ' + esc(mySessions().map(s => s.label).join(', ')) : ''}</div>
    <button class="am-item" id="amEdit">Edit my setup</button>
    <button class="am-item" id="amAlerts">Alerts</button>
    ${me.user ? '<button class="am-item danger" id="amOut">Sign out</button>' : ''}`;
  m.hidden = false;
  $('#amEdit').onclick = () => { m.hidden = true; editSetup(); };
  $('#amAlerts').onclick = () => { m.hidden = true; openAlerts(); };
  if ($('#amOut')) $('#amOut').onclick = async () => { m.hidden = true; await sb.auth.signOut(); };
}
document.addEventListener('click', e => { const m = $('#acctMenu'); if (m && !m.hidden && !e.target.closest('#acctMenu,#acctBtn')) m.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const m = $('#acctMenu'); if (m) m.hidden = true; const p = $('#alertsPanel'); if (p) p.hidden = true; } });

// ---------- alerts ----------
let alertGetters = null, alertTimer = null;
function toast(title, body) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = `<b>${esc(title)}</b><span>${esc(body)}</span><button aria-label="Dismiss">×</button>`;
  t.hidden = false; t.querySelector('button').onclick = () => { t.hidden = true; };
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 12000);
}
function notify(key, title, body) {
  const sent = ls.get('sent', {});
  const today = nyDate(Date.now());
  Object.keys(sent).forEach(k => { if (sent[k] !== today) delete sent[k]; });
  if (sent[key]) return;
  sent[key] = today; ls.set('sent', sent);
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body, icon: 'icon.svg', tag: key }); } catch { toast(title, body); }
  } else toast(title, body);
}
async function checkAlerts() {
  if (!me.answers || !alertGetters) return;
  const A = me.alerts, now = Date.now(), m = nyMins(now), today = nyDate(now);
  if (A.news) {
    const cal = alertGetters.calendar() || [];
    cal.filter(e => e.impact === 'High' && myCurrencies().has(e.country) && e.time > now && e.time - now <= A.lead * 60e3)
      .forEach(e => notify('ev:' + e.title + e.time, `${e.name} in ${Math.max(1, Math.round((e.time - now) / 60e3))} min`, `${e.country}, ${fmtTime(e.time)}. ${forYouEvent(e) || e.why}`));
  }
  if (A.sessions) {
    mySessions().forEach(s => { const d = (s.from - m + 1440) % 1440; if (d <= 5 && d >= 0) notify('ss:' + s.id + today, `${s.label} window ${d ? `opens in ${d} min` : 'is open'}`, windowStatus(now + 6 * 60e3).text || 'Time to get set up.'); });
  }
  if (A.levels && alertGetters.levels) {
    try {
      const rows = await alertGetters.levels();
      rows.forEach(({ id, L, fmt }) => {
        if (!L || !L.prevDay || !L.adr) return;
        const near = L.adr * 0.1;
        [['high', L.prevDay.high, 'yesterday’s high'], ['low', L.prevDay.low, 'yesterday’s low']].forEach(([k, v, label]) => {
          if (Math.abs(L.price - v) <= near) notify(`lv:${id}:${k}:${today}`, `${id} is near ${label}`, `${id} at ${fmt(L.price)}, ${label} is ${fmt(v)}. Orders tend to pile up just past it.`);
        });
      });
    } catch {}
  }
}
export function startAlerts(getters) { alertGetters = getters; clearInterval(alertTimer); alertTimer = setInterval(checkAlerts, 30e3); setTimeout(checkAlerts, 4000); }
function openAlerts() {
  const p = $('#alertsPanel'); const A = me.alerts;
  const perm = !('Notification' in window) ? 'unsupported' : Notification.permission;
  p.innerHTML = `<div class="ap-h"><h2>Alerts</h2><button class="x" aria-label="Close">×</button></div>
    <p class="muted small">Alerts pop up while this site is open in a tab, even in the background.</p>
    ${perm === 'granted' ? '' : perm === 'unsupported' ? '<p class="small muted">This browser can’t show notifications, so alerts appear as banners on the page.</p>' : (perm === 'denied' ? '<p class="small muted">Notifications are blocked for this site. Turn them on in your browser’s site settings. Until then, alerts appear as banners on the page.</p>' : '<button class="btn-primary" id="apPerm" style="width:100%;margin:8px 0 4px">Allow notifications</button>')}
    <label class="tg"><input type="checkbox" id="apNews" ${A.news ? 'checked' : ''}><span><b>Before big news in my markets</b><small>
      <select id="apLead">${[2, 5, 10, 15, 30].map(v => `<option value="${v}" ${A.lead === v ? 'selected' : ''}>${v} min</option>`).join('')}</select> ahead</small></span></label>
    <label class="tg"><input type="checkbox" id="apSess" ${A.sessions ? 'checked' : ''}><span><b>When my trading window opens</b><small>${esc(mySessions().map(s => s.label).join(', '))}</small></span></label>
    <label class="tg"><input type="checkbox" id="apLv" ${A.levels ? 'checked' : ''}><span><b>When price nears yesterday’s high or low</b><small>For ${esc(myAssets().filter(a => ['fut', 'fx', 'btc'].includes(a.src)).map(a => a.id).join(', ') || 'NQ, ES, the main forex pairs, gold and Bitcoin')}. Based on prices that can lag up to 15 min.</small></span></label>
    <button class="btn-ghost" id="apTest" style="margin-top:10px">Send a test alert</button>`;
  p.hidden = false;
  const save = () => { me.alerts = { news: $('#apNews').checked, lead: +$('#apLead').value, sessions: $('#apSess').checked, levels: $('#apLv').checked }; ls.set('alerts', me.alerts); if (me.answers) saveAnswers({ ...me.answers, alerts: me.alerts }); };
  ['apNews', 'apLead', 'apSess', 'apLv'].forEach(id => $('#' + id).onchange = save);
  p.querySelector('.x').onclick = () => { p.hidden = true; };
  if ($('#apPerm')) $('#apPerm').onclick = async () => { await Notification.requestPermission(); openAlerts(); };
  $('#apTest').onclick = () => { const k = 'test' + Date.now(); notify(k, 'Alerts are working', 'You’ll get notes like this before news and when your window opens.'); };
}
export { openAlerts };

// ---------- start-up ----------
async function afterSignIn(user) {
  me.user = user;
  await loadName();
  ls.set('seen', true);
  const saved = await loadAnswers();
  if (saved) { me.answers = saved; if (saved.alerts) me.alerts = saved.alerts; }
  hideGate(); renderAccount();
  if (!hasProfile()) wizard({}, ready); else ready();
}
function ready() {
  if (readyFired) { window.dispatchEvent(new Event('open:profile')); return; }
  readyFired = true; onReadyCb && onReadyCb();
}
export async function initMe(onReady) {
  onReadyCb = onReady;
  $('#acctBtn').onclick = openMenu;
  if (!configured) {
    // Accounts aren't set up yet (config.js is empty): run in guest mode so the site still works.
    me.answers = ls.get('answers:guest', null);
    me.name = '';
    renderAccount();
    if (!hasProfile()) wizard({}, ready); else ready();
    return;
  }
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  let handled = null;
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') { me.user = session && session.user; setTimeout(() => showGate(true), 0); return; }
    if (session && session.user) {
      if (handled === session.user.id) return; handled = session.user.id;
      setTimeout(() => afterSignIn(session.user), 0);
    } else if (event === 'INITIAL_SESSION' || event === 'SIGNED_OUT') {
      handled = null; me.user = null; me.answers = null;
      if (event === 'SIGNED_OUT') { readyFired = false; location.hash = '#today'; }
      showGate();
    }
  });
}
