// The Open One: accounts, the setup questions, the reader's profile, personal notes and alerts.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ls = {
  get(k, d) { try { const v = localStorage.getItem('open:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('open:' + k, JSON.stringify(v)); } catch {} },
};
const TZ = 'America/New_York';
const nyMins = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value])); return +p.hour * 60 + +p.minute; };
const nyDate = t => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(t));
const fmtTime = t => new Date(t).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const fmtM = m => { m = ((m % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mi = m % 60, ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 || 12}${mi ? ':' + String(mi).padStart(2, '0') : ''} ${ap}`; };
const list = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const opt = (id, label, sub) => ({ id, label, sub });

// ================= what people can pick =================
export const MARKET_LIST = [
  opt('stocks', 'Stocks & ETFs', 'Shares like Apple or Nvidia, and funds like SPY'),
  opt('futures', 'Futures', 'Index futures like NQ and ES, plus oil and gold'),
  opt('forex', 'Forex', 'Currency pairs like EUR/USD, and gold'),
  opt('options', 'Options', 'Calls and puts on stocks and indexes'),
  opt('crypto', 'Crypto', 'Bitcoin, Ethereum and other coins'),
  opt('memes', 'Memecoins', 'Fast-moving tokens on Solana, Base and other chains'),
  opt('learning', 'Not trading yet', 'I want to understand the markets first'),
];
const MNAME = { stocks: 'stocks', futures: 'futures', forex: 'forex', options: 'options', crypto: 'crypto', memes: 'memecoins', learning: 'the markets' };
const MSECTION = { stocks: 'Stocks', futures: 'Futures', forex: 'Forex', options: 'Options', crypto: 'Crypto', memes: 'Memecoins', learning: 'Getting started' };
export const marketLabel = m => (MARKET_LIST.find(x => x.id === m) || { label: m }).label;

// ysym: Yahoo symbol for prices. lv: has computed levels. tv: live chart symbol. kw: words that mark a headline as about it.
export const ASSETS = {
  stocks: [
    { id: 'index', label: 'Index funds (SPY, QQQ, VOO)', ysym: '^GSPC', tv: 'AMEX:SPY', kw: /s&p|nasdaq|index fund|etf/i },
    { id: 'bigtech', label: 'Big tech (Apple, Microsoft, Amazon…)', sector: 'XLK', tv: 'NASDAQ:QQQ', kw: /apple|microsoft|amazon|alphabet|google|meta|big tech/i },
    { id: 'chips', label: 'Chips & AI (Nvidia, AMD, Broadcom…)', sector: 'SMH', tv: 'NASDAQ:NVDA', kw: /nvidia|amd|broadcom|chip|semiconductor|\bai\b/i },
    { id: 'banks', label: 'Banks & finance', sector: 'XLF', tv: 'AMEX:XLF', kw: /bank|jpmorgan|goldman|financial/i },
    { id: 'energy', label: 'Energy stocks', sector: 'XLE', tv: 'AMEX:XLE', kw: /exxon|chevron|oil|energy/i },
    { id: 'health', label: 'Health care & pharma', sector: 'XLV', tv: 'AMEX:XLV', kw: /pharma|drug|health|eli lilly|novo/i },
    { id: 'consumer', label: 'Retail & consumer brands', sector: 'XLY', tv: 'AMEX:XLY', kw: /retail|consumer|walmart|tesla|nike/i },
    { id: 'smallcaps', label: 'Small caps', ysym: '^RUT', tv: 'AMEX:IWM', kw: /small cap|russell/i },
    { id: 'dividends', label: 'Dividend stocks', sector: 'XLP', tv: 'AMEX:SCHD', kw: /dividend/i },
    { id: 'cryptostocks', label: 'Crypto stocks (Coinbase, Strategy…)', tv: 'NASDAQ:COIN', kw: /coinbase|microstrategy|strategy inc|crypto stock/i },
  ],
  futures: [
    { id: 'NQ', label: 'Nasdaq 100 (NQ)', ysym: 'NQ=F', lv: 'fut', short: 'NQ', pt: 20, tv: 'OANDA:NAS100USD', kw: /nasdaq|tech stocks|\bnq\b/i },
    { id: 'MNQ', label: 'Micro Nasdaq (MNQ)', ysym: 'NQ=F', lv: 'fut', short: 'NQ', pt: 2, tv: 'OANDA:NAS100USD', kw: /nasdaq|tech stocks/i },
    { id: 'ES', label: 'S&P 500 (ES)', ysym: 'ES=F', lv: 'fut', short: 'ES', pt: 50, tv: 'OANDA:SPX500USD', kw: /s&p|stock futures|wall street/i },
    { id: 'MES', label: 'Micro S&P (MES)', ysym: 'ES=F', lv: 'fut', short: 'ES', pt: 5, tv: 'OANDA:SPX500USD', kw: /s&p|stock futures|wall street/i },
    { id: 'YM', label: 'Dow (YM)', ysym: 'YM=F', short: 'YM', pt: 5, tv: 'OANDA:US30USD', kw: /\bdow\b/i },
    { id: 'RTY', label: 'Russell 2000 (RTY)', ysym: '^RUT', short: 'RTY', pt: 50, tv: 'OANDA:US2000USD', kw: /russell|small cap/i },
    { id: 'CL', label: 'Crude oil (CL)', ysym: 'CL=F', short: 'Oil', pt: 1000, tv: 'TVC:USOIL', kw: /\boil\b|crude|opec/i },
    { id: 'GC', label: 'Gold (GC)', ysym: 'GC=F', lv: 'fx', short: 'Gold', pt: 100, tv: 'OANDA:XAUUSD', kw: /\bgold\b/i },
    { id: 'SI', label: 'Silver (SI)', ysym: 'SI=F', short: 'Silver', pt: 5000, tv: 'OANDA:XAGUSD', kw: /silver/i },
    { id: 'NG', label: 'Natural gas (NG)', ysym: 'NG=F', short: 'Gas', pt: 10000, tv: 'TVC:NATURALGAS', kw: /natural gas|\blng\b/i },
    { id: 'ZN', label: 'Treasury notes (ZN)', ysym: '^TNX', short: '10Y', tv: 'TVC:US10Y', kw: /treasur|bond|yield/i },
  ],
  forex: [
    { id: 'EURUSD', label: 'EUR/USD', ysym: 'EURUSD=X', lv: 'fx', short: 'EUR/USD', pip: 0.0001, ccy: ['EUR', 'USD'], tv: 'FX:EURUSD', kw: /\beuro\b|eur\/usd|ecb/i },
    { id: 'GBPUSD', label: 'GBP/USD', ysym: 'GBPUSD=X', lv: 'fx', short: 'GBP/USD', pip: 0.0001, ccy: ['GBP', 'USD'], tv: 'FX:GBPUSD', kw: /pound|sterling|gbp|bank of england/i },
    { id: 'USDJPY', label: 'USD/JPY', ysym: 'USDJPY=X', lv: 'fx', short: 'USD/JPY', pip: 0.01, ccy: ['USD', 'JPY'], tv: 'FX:USDJPY', kw: /\byen\b|bank of japan|boj|usd\/jpy/i },
    { id: 'XAUUSD', label: 'Gold (XAU/USD)', ysym: 'GC=F', lv: 'fx', short: 'Gold', ccy: ['USD'], tv: 'OANDA:XAUUSD', kw: /\bgold\b/i },
    { id: 'AUDUSD', label: 'AUD/USD', short: 'AUD/USD', pip: 0.0001, ccy: ['AUD', 'USD'], tv: 'FX:AUDUSD', kw: /aussie|australian dollar|rba/i },
    { id: 'USDCAD', label: 'USD/CAD', short: 'USD/CAD', pip: 0.0001, ccy: ['USD', 'CAD'], tv: 'FX:USDCAD', kw: /canadian dollar|loonie|bank of canada/i },
    { id: 'USDCHF', label: 'USD/CHF', short: 'USD/CHF', pip: 0.0001, ccy: ['USD', 'CHF'], tv: 'FX:USDCHF', kw: /swiss franc|snb/i },
    { id: 'NZDUSD', label: 'NZD/USD', short: 'NZD/USD', pip: 0.0001, ccy: ['NZD', 'USD'], tv: 'FX:NZDUSD', kw: /new zealand dollar|kiwi|rbnz/i },
    { id: 'EURGBP', label: 'EUR/GBP', short: 'EUR/GBP', pip: 0.0001, ccy: ['EUR', 'GBP'], tv: 'FX:EURGBP', kw: /eur\/gbp/i },
  ],
  options: [
    { id: 'SPX', label: 'S&P 500 (SPX or SPY)', em: 'SPX', ysym: '^GSPC', tv: 'OANDA:SPX500USD', kw: /s&p|spy\b/i },
    { id: 'NDX', label: 'Nasdaq (QQQ or NDX)', em: 'NDX', ysym: '^IXIC', tv: 'OANDA:NAS100USD', kw: /nasdaq|qqq/i },
    { id: 'IWM', label: 'Small caps (IWM)', ysym: '^RUT', tv: 'AMEX:IWM', kw: /russell|small cap/i },
    { id: 'single', label: 'Single stocks', tv: 'NASDAQ:AAPL', kw: /earnings|shares/i },
  ],
  crypto: [
    { id: 'BTC', label: 'Bitcoin', ysym: 'BTC-USD', lv: 'btc', short: 'BTC', tv: 'BINANCE:BTCUSDT', kw: /bitcoin|\bbtc\b/i },
    { id: 'ETH', label: 'Ethereum', ysym: 'ETH-USD', short: 'ETH', tv: 'BINANCE:ETHUSDT', kw: /ethereum|\beth\b|ether\b/i },
    { id: 'SOL', label: 'Solana', ysym: 'SOL-USD', short: 'SOL', tv: 'BINANCE:SOLUSDT', kw: /solana|\bsol\b/i },
    { id: 'XRP', label: 'XRP', short: 'XRP', tv: 'BINANCE:XRPUSDT', kw: /\bxrp\b|ripple/i },
    { id: 'BNB', label: 'BNB', short: 'BNB', tv: 'BINANCE:BNBUSDT', kw: /\bbnb\b|binance/i },
    { id: 'DOGE', label: 'Dogecoin', short: 'DOGE', tv: 'BINANCE:DOGEUSDT', kw: /dogecoin|\bdoge\b/i },
    { id: 'alts', label: 'Other altcoins', tv: 'BINANCE:ETHBTC', kw: /altcoin/i },
  ],
  memes: [
    { id: 'solana', label: 'Solana memecoins', chain: 'solana', kw: /solana|pump\.fun|bonk/i },
    { id: 'base', label: 'Base memecoins', chain: 'base', kw: /\bbase\b/i },
    { id: 'ethereum', label: 'Ethereum memecoins', chain: 'ethereum', kw: /pepe|shiba|ethereum/i },
    { id: 'bsc', label: 'BNB Chain memecoins', chain: 'bsc', kw: /bnb chain|four\.meme/i },
    { id: 'bignames', label: 'Big names (DOGE, PEPE, BONK…)', chain: null, kw: /dogecoin|pepe|bonk|shiba|memecoin|meme coin/i },
  ],
};
export const ASSET_BY_ID = Object.fromEntries(Object.values(ASSETS).flat().map(a => [a.id, a]));
const ASSET_MARKET = Object.fromEntries(Object.entries(ASSETS).flatMap(([m, l]) => l.map(a => [a.id, m])));

const EXP = [opt('new', 'Just starting'), opt('lt6', 'Under 6 months'), opt('6to12', '6 to 12 months'), opt('1to3', '1 to 3 years'), opt('3plus', 'More than 3 years')];
const EXP_RANK = { new: 0, lt6: 1, '6to12': 2, '1to3': 3, '3plus': 4 };
const HOLD = {
  stocks: [opt('day', 'Same day', 'Day trading'), opt('swing', 'Days to a few weeks', 'Swing trading'), opt('position', 'Months'), opt('invest', 'Years', 'Long-term investing')],
  futures: [opt('scalp', 'Minutes', 'Scalping'), opt('day', 'Hours, out by the close', 'Day trading'), opt('swing', 'Days to weeks', 'Swing trading')],
  forex: [opt('scalp', 'Minutes', 'Scalping'), opt('day', 'Hours', 'Day trading'), opt('swing', 'Days to weeks', 'Swing trading'), opt('position', 'Weeks to months')],
  options: [opt('zero', 'Same day', '0DTE'), opt('days', 'A few days'), opt('weeks', 'Weeks'), opt('months', 'Months or longer')],
  crypto: [opt('scalp', 'Minutes', 'Scalping'), opt('day', 'Hours', 'Day trading'), opt('swing', 'Days to weeks', 'Swing trading'), opt('hold', 'Months or longer', 'Holding')],
  memes: [opt('minutes', 'Minutes', 'Quick flips'), opt('hours', 'Hours'), opt('days', 'Days'), opt('hold', 'Weeks or longer')],
};
const STRATS = {
  stocks: [opt('index', 'Buy and hold index funds'), opt('value', 'Value investing', 'Buying good companies cheap'), opt('growth', 'Growth investing', 'Fast-growing companies'), opt('momentum', 'Momentum and breakouts'), opt('earnings', 'Trading earnings'), opt('dividends', 'Dividends and income'), opt('ta', 'Chart analysis'), opt('unsure', 'Still finding my strategy')],
  futures: [opt('ict', 'ICT / smart money concepts'), opt('pa', 'Price action, support and resistance'), opt('sd', 'Supply and demand zones'), opt('orderflow', 'Order flow and volume'), opt('ind', 'Indicators', 'Moving averages, RSI, VWAP…'), opt('news', 'Trading the news', 'CPI, jobs, Fed days'), opt('trend', 'Trend following and breakouts'), opt('algo', 'Automated or bots'), opt('unsure', 'Still finding my strategy')],
  forex: [opt('ict', 'ICT / smart money concepts'), opt('pa', 'Price action, support and resistance'), opt('sd', 'Supply and demand zones'), opt('ind', 'Indicators'), opt('news', 'Trading the news'), opt('fundamentals', 'Fundamentals and central banks'), opt('carry', 'Carry trades', 'Earning the interest-rate difference'), opt('algo', 'Automated or bots'), opt('unsure', 'Still finding my strategy')],
  options: [opt('buy', 'Buying calls and puts'), opt('sell', 'Selling premium', 'Covered calls, cash-secured puts'), opt('spreads', 'Spreads', 'Verticals, iron condors…'), opt('zero', 'Same-day options (0DTE)'), opt('earnings', 'Earnings plays'), opt('hedge', 'Hedging my stocks'), opt('unsure', 'Still finding my strategy')],
  crypto: [opt('hold', 'Buy and hold, or buying regularly'), opt('swing', 'Swing trading the charts'), opt('ict', 'ICT / smart money concepts'), opt('perps', 'Leverage and perpetual futures'), opt('narratives', 'Rotating between sectors', 'AI coins, layer 2s, DeFi…'), opt('onchain', 'On-chain data'), opt('defi', 'DeFi and earning yield'), opt('news', 'Trading news and listings'), opt('unsure', 'Still finding my strategy')],
  memes: [opt('launches', 'Catching new launches early'), opt('trending', 'Riding trending coins'), opt('kols', 'Following influencer calls'), opt('wallets', 'Copy-trading smart wallets'), opt('charts', 'Chart setups'), opt('hold', 'Holding a few for the long run'), opt('unsure', 'Still finding my strategy')],
};
const STRAT_SHORT = Object.fromEntries(Object.values(STRATS).flat().map(o => [o.id, o.label]));
STRAT_SHORT.ict = 'ICT'; STRAT_SHORT.pa = 'Price action'; STRAT_SHORT.unsure = 'Still deciding';
const NEWS_EVENTS = {
  base: [opt('cpi', 'Inflation (CPI)'), opt('nfp', 'Jobs report (NFP)'), opt('fomc', 'Fed decisions and speeches'), opt('gdp', 'GDP'), opt('retail', 'Retail sales'), opt('pmi', 'Business surveys (PMI, ISM)'), opt('claims', 'Weekly jobless claims')],
  forex: [opt('cb', 'Other central banks (ECB, BoE, BoJ…)')],
  futures: [opt('earnings', 'Big tech earnings')],
  crypto: [opt('etf', 'Crypto fund (ETF) flows'), opt('listings', 'Exchange listings'), opt('reg', 'Regulation and lawsuits'), opt('unlocks', 'Token unlocks')],
};
// Follow-up questions that appear only when a strategy is picked
const FOLLOW = {
  ict: m => ({ title: `Which ICT concepts do you use most for ${MNAME[m]}?`, sub: 'We use these to decide which price levels and times to point out to you.', multi: true, options: [opt('liquidity', 'Liquidity runs', 'Stops above highs and below lows'), opt('fvg', 'Fair value gaps'), opt('ob', 'Order blocks'), opt('killzones', 'Killzones and session timing'), opt('sb', 'Silver Bullet'), opt('po3', 'Power of 3', 'Accumulation, manipulation, distribution'), opt('judas', 'Judas swing'), opt('smt', 'SMT divergence'), opt('ote', 'Optimal trade entry (OTE)'), opt('pd', 'Premium and discount'), opt('bias', 'Daily and weekly bias'), opt('opens', 'Midnight and session opens')] }),
  pa: m => ({ title: `What do you look for on your ${MNAME[m]} charts?`, multi: true, options: [opt('sr', 'Support and resistance'), opt('trendlines', 'Trendlines and channels'), opt('patterns', 'Chart patterns', 'Flags, triangles, head and shoulders'), opt('candles', 'Candlestick patterns'), opt('breakouts', 'Breakouts and retests'), opt('ranges', 'Ranges'), opt('fib', 'Fibonacci levels')] }),
  ind: m => ({ title: `Which indicators do you use for ${MNAME[m]}?`, multi: true, options: [opt('ma', 'Moving averages'), opt('rsi', 'RSI'), opt('macd', 'MACD'), opt('vwap', 'VWAP'), opt('bb', 'Bollinger Bands'), opt('vp', 'Volume profile'), opt('atr', 'ATR'), opt('stoch', 'Stochastic')] }),
  orderflow: () => ({ title: 'Which order flow tools do you use?', multi: true, options: [opt('footprint', 'Footprint charts'), opt('dom', 'DOM / order book'), opt('vp', 'Volume profile'), opt('delta', 'Cumulative delta'), opt('tape', 'Time and sales')] }),
  news: m => ({ title: `Which news events do you trade in ${MNAME[m]}?`, sub: 'These get flagged for you on the calendar and in alerts.', multi: true, options: [...(m === 'crypto' ? [] : NEWS_EVENTS.base), ...(NEWS_EVENTS[m] || []), ...(m === 'crypto' ? [opt('fomc', 'Fed decisions'), opt('cpi', 'Inflation (CPI)')] : [])] }),
  fundamentals: () => ({ title: 'Which central banks do you follow?', multi: true, options: [opt('fed', 'Federal Reserve (US)'), opt('ecb', 'European Central Bank'), opt('boe', 'Bank of England'), opt('boj', 'Bank of Japan'), opt('rba', 'Reserve Bank of Australia'), opt('boc', 'Bank of Canada'), opt('snb', 'Swiss National Bank')] }),
  sell: () => ({ title: 'Which premium-selling strategies do you use?', multi: true, options: [opt('cc', 'Covered calls'), opt('csp', 'Cash-secured puts'), opt('credit', 'Credit spreads'), opt('ic', 'Iron condors'), opt('strangle', 'Strangles and straddles'), opt('wheel', 'The wheel')] }),
  spreads: () => ({ title: 'Which spreads do you trade?', multi: true, options: [opt('vertical', 'Vertical spreads'), opt('ic', 'Iron condors'), opt('fly', 'Butterflies'), opt('calendar', 'Calendars and diagonals')] }),
  zero: () => ({ title: 'Where do you trade same-day options?', multi: true, options: [opt('spx', 'SPX or SPY'), opt('qqq', 'QQQ or NDX'), opt('stocks', 'Single stocks')] }),
  earnings: m => ({ title: m === 'options' ? 'How do you play earnings with options?' : 'Do you hold through earnings?', options: m === 'options' ? [opt('before', 'Buy before the report'), opt('sellvol', 'Sell the volatility crush'), opt('after', 'Trade the move after')] : [opt('yes', 'Yes, I hold through'), opt('no', 'No, I get out before'), opt('trade', 'I trade the reaction after')] }),
  perps: () => ({ title: 'How much leverage do you usually use?', options: [opt('1to3', '1x to 3x'), opt('3to10', '3x to 10x'), opt('10to25', '10x to 25x'), opt('25plus', 'More than 25x')] }),
  narratives: () => ({ title: 'Which crypto sectors do you follow?', multi: true, options: [opt('ai', 'AI coins'), opt('l1', 'Layer 1s', 'Solana, Avalanche…'), opt('l2', 'Layer 2s', 'Arbitrum, Base…'), opt('defi', 'DeFi'), opt('rwa', 'Real-world assets'), opt('gaming', 'Gaming'), opt('memes', 'Memecoins')] }),
};
const SECTOR_TRIGGERS = ['value', 'growth', 'momentum', 'ta', 'dividends', 'earnings'];
const MEME_TOOL_TRIGGERS = ['launches', 'trending', 'kols', 'wallets'];
export const SESSIONS = {
  premarket: { label: 'Before the US open', phrase: 'the hours before the US open', from: 420, to: 570 },
  nyopen: { label: 'The New York open', phrase: 'the New York open', from: 570, to: 690 },
  midday: { label: 'Midday', phrase: 'midday', from: 690, to: 810 },
  nyclose: { label: 'The afternoon into the close', phrase: 'the afternoon session', from: 810, to: 960 },
  evening: { label: 'Evenings after the close', phrase: 'the evening', from: 960, to: 1200 },
  asia: { label: 'The Asia session', phrase: 'the Asia session', from: 1200, to: 1440 },
  london: { label: 'The London open', phrase: 'the London open', from: 120, to: 300 },
  weekend: { label: 'Weekends' }, anytime: { label: 'No set time' },
};
const LEVEL_STRATS = ['ict', 'pa', 'sd', 'orderflow', 'charts', 'ta'];

// Local-time hint for session times
function localRange(from, to) {
  const d = new Date(), base = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  const nyOff = (() => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(base)).map(x => [x.type, x.value])); return (+p.hour * 60 + +p.minute) - 720; })();
  const myOff = -new Date(base).getTimezoneOffset();
  const diff = myOff - nyOff;
  if (!diff) return '';
  return `${fmtM(from + diff)} to ${fmtM(to + diff)} your time`;
}

// ================= the question flow =================
// Every step is computed from the answers so far, so each answer can add (or remove) follow-up questions.
function buildSteps(a) {
  const steps = [];
  const add = (id, section, q, extra = {}) => steps.push({ id, section, ...q, ...extra });
  add('markets', 'Your markets', { title: 'What do you trade or invest in?', sub: 'Pick everything you trade or want to follow. Each one gets its own follow-up questions.', multi: true, options: MARKET_LIST, exclusive: ['learning'] });
  const mk = a.markets || [];
  if (mk.includes('learning')) {
    add('learning.interest', MSECTION.learning, { title: 'Which markets are you curious about?', sub: 'We’ll explain the news for these first.', multi: true, options: MARKET_LIST.filter(o => o.id !== 'learning') });
    add('learning.goal', MSECTION.learning, { title: 'What would you like to do eventually?', options: [opt('invest', 'Invest for the long term'), opt('trade', 'Trade actively'), opt('understand', 'Just understand the news and the economy')] });
  } else {
    mk.forEach(m => {
      const sec = MSECTION[m], name = MNAME[m];
      add(`${m}.exp`, sec, { title: `How long have you been trading ${name}?`, sub: 'This sets how much we explain in your briefing.', options: EXP });
      add(`${m}.assets`, sec, { title: m === 'stocks' ? 'Which kinds of stocks do you trade or own?' : m === 'memes' ? 'Which chains do you trade memecoins on?' : m === 'options' ? 'What do you trade options on?' : `Which ${name} do you trade?`, sub: 'Your prices, charts and news are built around these.', multi: true, options: ASSETS[m].map(x => opt(x.id, x.label)) });
      add(`${m}.hold`, sec, { title: m === 'stocks' ? 'How long do you usually hold?' : `How long do you usually hold a ${m === 'memes' ? 'memecoin' : name === 'options' ? 'options' : name} trade?`, sub: 'Pick all that apply.', multi: true, options: HOLD[m] });
      add(`${m}.strategy`, sec, { title: `What strategy do you use for ${name}?`, sub: 'Pick all that apply. Some of these lead to a few more questions.', multi: true, options: STRATS[m], exclusive: ['unsure'] });
      const strats = a[`${m}.strategy`] || [];
      strats.forEach(s => { if (FOLLOW[s]) add(`${m}.s.${s}`, sec, FOLLOW[s](m), { optional: true }); });
      if (m === 'stocks' && strats.some(s => SECTOR_TRIGGERS.includes(s))) add('stocks.sectors', sec, { title: 'Which sectors do you focus on?', multi: true, optional: true, options: [opt('tech', 'Technology'), opt('chips', 'Chips and AI'), opt('finance', 'Banks and finance'), opt('energy', 'Energy'), opt('health', 'Health care'), opt('consumer', 'Consumer and retail'), opt('industrials', 'Industrials'), opt('realestate', 'Real estate'), opt('utilities', 'Utilities')] });
      if (m === 'memes' && strats.some(s => MEME_TOOL_TRIGGERS.includes(s))) add('memes.tools', sec, { title: 'Which platforms and tools do you use?', multi: true, optional: true, options: [opt('pumpfun', 'pump.fun'), opt('letsbonk', 'LetsBonk'), opt('photon', 'Photon'), opt('axiom', 'Axiom'), opt('bullx', 'BullX'), opt('gmgn', 'GMGN'), opt('tgbots', 'Telegram bots', 'Trojan, BonkBot…'), opt('dexscreener', 'DEX Screener')] });
      if (m === 'futures') {
        add('futures.account', sec, { title: 'What kind of futures account do you trade?', multi: true, options: [opt('paper', 'Paper or demo'), opt('eval', 'Prop firm evaluation'), opt('funded', 'Funded prop account'), opt('personal', 'My own money')] });
        if ((a['futures.account'] || []).some(x => x === 'eval' || x === 'funded')) {
          add('futures.firm', sec, { title: 'Which prop firm?', multi: true, optional: true, options: [opt('topstep', 'Topstep'), opt('apex', 'Apex Trader Funding'), opt('mffu', 'MyFundedFutures'), opt('tradeify', 'Tradeify'), opt('lucid', 'Lucid Trading'), opt('tpt', 'Take Profit Trader'), opt('alpha', 'Alpha Futures'), opt('other', 'Another firm')] });
          add('futures.newsrule', sec, { title: 'Does your firm let you trade during big news?', sub: 'If not, we’ll warn you before restricted releases.', options: [opt('yes', 'Yes, news is allowed'), opt('no', 'No, there’s a news restriction'), opt('unsure', 'I’m not sure')] });
          add('futures.dll', sec, { title: 'What’s your daily loss limit?', optional: true, options: [opt('lt1k', 'Under $1,000'), opt('1to2k', '$1,000 to $2,000'), opt('2to3k', '$2,000 to $3,000'), opt('3kplus', 'More than $3,000'), opt('none', 'No daily limit')] });
        }
      }
      if (m === 'forex') {
        add('forex.account', sec, { title: 'What kind of forex account do you trade?', multi: true, options: [opt('paper', 'Paper or demo'), opt('prop', 'Prop firm account'), opt('personal', 'My own money with a broker')] });
        if ((a['forex.account'] || []).includes('prop')) {
          add('forex.firm', sec, { title: 'Which prop firm?', multi: true, optional: true, options: [opt('ftmo', 'FTMO'), opt('fundednext', 'FundedNext'), opt('the5ers', 'The5ers'), opt('e8', 'E8 Markets'), opt('fundingpips', 'FundingPips'), opt('other', 'Another firm')] });
          add('forex.newsrule', sec, { title: 'Does your firm let you trade during big news?', sub: 'If not, we’ll warn you before restricted releases.', options: [opt('yes', 'Yes, news is allowed'), opt('no', 'No, there’s a news restriction'), opt('unsure', 'I’m not sure')] });
        }
      }
      if (m === 'stocks') add('stocks.account', sec, { title: 'What kind of account do you use for stocks?', multi: true, optional: true, options: [opt('paper', 'Paper or demo'), opt('brokerage', 'A regular brokerage account'), opt('retirement', 'A retirement account', 'IRA, 401(k)…'), opt('margin', 'A margin account')] });
      if (m === 'crypto') add('crypto.venue', sec, { title: 'Where do you trade crypto?', multi: true, optional: true, options: [opt('cex', 'Big exchanges', 'Coinbase, Binance, Kraken…'), opt('perpdex', 'On-chain perpetuals', 'Hyperliquid and similar'), opt('dex', 'DEXs and my own wallet'), opt('apps', 'Apps', 'Robinhood, Cash App…')] });
    });
  }
  const learning = mk.includes('learning');
  const allLong = !learning && mk.length && mk.every(m => (a[`${m}.hold`] || []).length && (a[`${m}.hold`] || []).every(h => ['invest', 'hold', 'position', 'months'].includes(h)));
  const S = 'About you';
  if (!learning) add('sessions', S, { title: allLong ? 'When do you usually check the markets?' : 'When are you usually watching the markets?', sub: 'New York time. Alerts and timing notes follow these hours.', multi: true, exclusive: ['anytime'], options: Object.entries(SESSIONS).map(([id, s]) => opt(id, s.label, s.from != null ? `${fmtM(s.from)} to ${fmtM(s.to)} New York${localRange(s.from, s.to) ? ', ' + localRange(s.from, s.to) : ''}` : '')) });
  if (!learning && !allLong) add('risk', S, { title: 'How much of your account do you usually risk on one trade?', optional: true, options: [opt('lt05', 'Less than 0.5%'), opt('05to1', '0.5% to 1%'), opt('1to2', '1% to 2%'), opt('gt2', 'More than 2%'), opt('unsure', 'I don’t track it yet')] });
  if (!learning) add('size', S, { title: 'Roughly how big is your trading account?', sub: 'Optional. It helps us size examples to you.', optional: true, options: [opt('lt1k', 'Under $1,000'), opt('1to10k', '$1,000 to $10,000'), opt('10to50k', '$10,000 to $50,000'), opt('50to150k', '$50,000 to $150,000'), opt('150kplus', 'More than $150,000'), opt('private', 'I’d rather not say')] });
  add('struggles', S, { title: learning ? 'What do you find hardest about following the markets?' : 'What trips you up most?', sub: 'We’ll point these out at the right moments.', multi: true, optional: true, options: learning ? [opt('jargon', 'The jargon'), opt('why', 'Knowing why prices moved'), opt('overload', 'Too much information'), opt('start', 'Knowing where to start')] : [opt('news', 'Getting caught by surprise news'), opt('why', 'Not knowing why the market moved'), opt('overtrading', 'Overtrading'), opt('revenge', 'Revenge trading after a loss'), opt('fomo', 'Chasing moves (FOMO)'), opt('holding', 'Holding losers too long'), opt('early', 'Taking profits too early'), opt('overload', 'Too much information')] });
  const P = 'Your briefing';
  add('goals', P, { title: 'What do you want from The Open One?', multi: true, options: [opt('why', 'Understand what’s moving markets and why'), opt('opps', 'Spot opportunities in world events'), opt('avoid', 'Avoid getting caught by news'), opt('briefing', 'A daily briefing before I trade'), opt('learn', 'Learn how markets work'), opt('alerts', 'Alerts when something big happens')] });
  add('detail', P, { title: 'How should we write for you?', options: [opt('quick', 'Quick', 'Headlines and the key point'), opt('balanced', 'Balanced', 'The key point plus why it matters'), opt('deep', 'In depth', 'Full explanations, terms explained')] });
  const lvOk = mk.some(m => (a[`${m}.strategy`] || []).some(s => LEVEL_STRATS.includes(s)));
  add('notify', P, { title: 'Which alerts do you want?', sub: 'Alerts show while the site is open in a tab. You can change these any time.', multi: true, exclusive: ['none'], options: [opt('events', 'Before big scheduled news in my markets'), opt('breaking', 'Breaking stories about my markets'), ...(learning ? [] : [opt('session', 'When my usual trading time starts')]), ...(lvOk ? [opt('levels', 'When price nears yesterday’s high or low')] : []), opt('none', 'No alerts')] });
  return steps;
}
// Drop answers that no longer belong to the flow (e.g. a market that was unselected)
function prune(a) {
  const keep = new Set(buildSteps(a).map(s => s.id));
  const out = {};
  Object.keys(a).forEach(k => { if (keep.has(k) || ['v', 'done', 'updated', 'alerts'].includes(k)) out[k] = a[k]; });
  return out;
}
// Answers from the first version of the setup
function migrate(o) {
  if (!o || o.v === 2) return o;
  const a = { v: 2 };
  const mk = (o.markets || []).filter(m => ASSETS[m]);
  a.markets = mk;
  const expMap = { new: 'lt6', learning: '6to12', some: '1to3', vet: '3plus' };
  const holdMap = { scalp: 'scalp', day: 'day', swing: 'swing', long: 'hold' };
  mk.forEach(m => {
    a[`${m}.assets`] = (o.assets || []).filter(id => ASSETS[m].some(x => x.id === id));
    if (expMap[o.experience]) a[`${m}.exp`] = expMap[o.experience];
    a[`${m}.strategy`] = (o.strategy || []).filter(s => STRATS[m].some(x => x.id === s));
    a[`${m}.hold`] = (o.style || []).map(s => holdMap[s]).filter(h => HOLD[m].some(x => x.id === h));
  });
  if (mk.includes('futures')) a['futures.account'] = (o.account || []).map(x => ({ paper: 'paper', funded: 'funded', live: 'personal' })[x]).filter(Boolean);
  a.sessions = (o.sessions || []).map(s => ({ nyam: 'nyopen', nypm: 'nyclose', asia: 'asia', london: 'london' })[s]).filter(Boolean);
  a.goals = (o.goals || []).map(g => ({ news: 'avoid', why: 'why', levels: 'briefing', setups: 'opps', discipline: 'briefing' })[g]).filter(Boolean);
  a.done = false;
  return a;
}

// ================= state =================
export const me = { user: null, name: '', answers: null, alerts: ls.get('alerts', { news: true, lead: 5, breaking: true, sessions: true, levels: false }) };
let sb = null, onReadyCb = null, readyFired = false;
const configured = !!(SUPABASE_URL && SUPABASE_KEY && window.supabase);

// ================= profile helpers used by the pages =================
const A = () => me.answers || {};
export const hasProfile = () => !!(me.answers && me.answers.v === 2 && me.answers.done);
export const isLearning = () => (A().markets || []).includes('learning');
export const myMarkets = () => { const a = A(); if (isLearning()) return (a['learning.interest'] || []).length ? a['learning.interest'] : ['stocks']; return (a.markets || []).length ? a.markets : ['stocks']; };
export const myAssets = () => {
  const a = A(); const ids = [];
  (isLearning() ? [] : myMarkets()).forEach(m => (a[`${m}.assets`] || []).forEach(id => { if (!ids.includes(id)) ids.push(id); }));
  return ids.map(id => ASSET_BY_ID[id]).filter(Boolean);
};
export const stratsFor = m => A()[`${m}.strategy`] || [];
export const hasStrat = s => myMarkets().some(m => stratsFor(m).includes(s));
export const levelTrader = () => LEVEL_STRATS.some(hasStrat);
export const followUps = (m, s) => A()[`${m}.s.${s}`] || [];
export const isBeginner = () => {
  if (isLearning()) return true;
  const r = myMarkets().map(m => EXP_RANK[A()[`${m}.exp`]]).filter(x => x != null);
  return r.length ? r.reduce((x, y) => x + y, 0) / r.length < 2.5 : false;
};
export const depth = () => A().detail || (isBeginner() ? 'deep' : 'balanced');
export const intraday = () => myMarkets().some(m => (A()[`${m}.hold`] || []).some(h => ['scalp', 'day', 'zero', 'minutes', 'hours'].includes(h)));
export const newsRestricted = () => ['futures', 'forex'].some(m => A()[`${m}.newsrule`] === 'no');
export const newsRuleUnsure = () => ['futures', 'forex'].some(m => A()[`${m}.newsrule`] === 'unsure');
export const isProp = () => (A()['futures.account'] || []).some(x => x === 'eval' || x === 'funded') || (A()['forex.account'] || []).includes('prop');
export const myStruggles = () => A().struggles || [];
export const mySessions = () => (A().sessions || []).map(id => ({ id, ...SESSIONS[id] })).filter(s => s.from != null);
export function profileQuery() {
  const a = A();
  const seg = isLearning() ? myMarkets().map(m => `${m}:unsure::`).concat(['learning:::'])
    : myMarkets().map(m => `${m}:${stratsFor(m).join('.')}:${(a[`${m}.assets`] || []).join('.')}:${(a[`${m}.hold`] || []).join('.')}`);
  return `p=${encodeURIComponent(seg.join(';'))}&lvl=${isBeginner() ? 'beginner' : 'pro'}&d=${depth()}`;
}
export function profileSummary() {
  if (!me.answers) return '';
  if (isLearning()) return `Learning: ${myMarkets().map(marketLabel).join(', ')}`;
  return myMarkets().map(m => `${marketLabel(m)}${stratsFor(m).length ? ` (${stratsFor(m).map(s => STRAT_SHORT[s] || s).join(', ')})` : ''}`).join('; ');
}
export function myCurrencies() {
  const c = new Set();
  myMarkets().forEach(m => { if (m !== 'forex') c.add('USD'); });
  myAssets().forEach(x => (x.ccy || []).forEach(y => c.add(y)));
  if (!c.size) c.add('USD');
  return c;
}
function assetsForCurrency(ccy) {
  const out = myAssets().filter(x => !x.chain && (x.ccy ? x.ccy.includes(ccy) : ccy === 'USD')).map(x => x.id === 'index' ? 'your index funds' : x.short || x.id);
  if (ccy === 'USD' && myMarkets().some(m => ['crypto', 'memes'].includes(m)) && !out.some(x => /BTC|ETH|SOL/.test(x))) out.push('crypto');
  return [...new Set(out)].slice(0, 4);
}
export function windowFor(mins) {
  for (const s of mySessions()) if (s.from <= mins && mins < s.to) return { s, kind: 'inside' };
  let best = null;
  for (const s of mySessions()) { const before = (s.from - mins + 1440) % 1440; if (before > 0 && before <= 90 && (!best || before < best.d)) best = { s, kind: 'before', d: before }; }
  if (best) return best;
  for (const s of mySessions()) { const after = (mins - s.to + 1440) % 1440; if (after < 60) return { s, kind: 'after', d: after }; }
  return { kind: mySessions().length ? 'outside' : 'none' };
}
const EVENT_KEYS = [[/cpi/i, 'cpi'], [/non-farm|payroll/i, 'nfp'], [/federal funds|fomc|fed chair|powell/i, 'fomc'], [/gdp/i, 'gdp'], [/retail sales/i, 'retail'], [/pmi|ism/i, 'pmi'], [/jobless|unemployment claims/i, 'claims'], [/main refinancing|ecb|boe|official bank rate|boj|policy rate|cash rate|overnight rate/i, 'cb']];
const eventKey = title => (EVENT_KEYS.find(([re]) => re.test(title)) || [])[1];
export function forYouEvent(e) {
  if (!me.answers || e.impact === 'Low' || e.allDay || !myCurrencies().has(e.country)) return null;
  const who = assetsForCurrency(e.country);
  const w = windowFor(nyMins(e.time));
  const parts = [];
  if (w.kind === 'inside') parts.push(`Lands during ${w.s.phrase}, when you usually trade.`);
  else if (w.kind === 'before') parts.push(`Comes ${w.d} minutes before ${w.s.phrase}, so the reaction may still be playing out when you start.`);
  else if (w.kind === 'after') parts.push(`Comes just after ${w.s.phrase} ends.`);
  const extra = [];
  if (e.impact === 'High') {
    const k = eventKey(e.title);
    if (newsRestricted() && w.kind !== 'outside') extra.push('Your prop firm restricts trading around news like this. Check the exact window before you trade.');
    else if (newsRuleUnsure() && w.kind !== 'outside') extra.push('Check your prop firm’s news rules for this one.');
    if (hasStrat('news') && k && myMarkets().some(m => followUps(m, 'news').includes(k))) extra.push('This is one of the releases you trade.');
    if (hasStrat('ict') || hasStrat('pa') || hasStrat('sd')) extra.push('The obvious highs and lows nearby often get tested first.');
    if (hasStrat('perps')) extra.push('Leveraged positions get squeezed hardest in the first minutes after releases like this.');
    if (hasStrat('sell') || hasStrat('zero')) extra.push('Option prices are pumped up going in, and the move after can be large.');
    if (isBeginner() && w.kind !== 'outside') extra.push('Many traders wait 5 to 15 minutes before acting on a release.');
    if (myStruggles().includes('news')) extra.push('Getting caught by news is something you said trips you up. Plan for this one.');
  }
  const n = depth() === 'quick' ? 1 : depth() === 'deep' ? 3 : 2;
  const body = (parts.join(' ') + (extra.length ? ' ' + extra.slice(0, n).join(' ') : '')).trim();
  if (!body) return e.impact === 'High' && who.length ? `Matters for ${list(who)}.` : null;
  return (who.length ? `For ${list(who)}: ` : '') + body;
}
const has = id => myAssets().some(x => x.id === id);
const hasAny = ids => ids.some(has);
function fyLine(h) {
  const m = myMarkets();
  switch (h.theme) {
    case 'ai': if (hasAny(['NQ', 'MNQ', 'NDX', 'chips', 'bigtech'])) return 'Chip and tech stocks drive the Nasdaq, so this can move what you trade directly.'; break;
    case 'earnings': if (hasStrat('earnings')) return 'An earnings story, which is one of your strategies.'; if (hasAny(['NQ', 'MNQ', 'ES', 'MES', 'SPX', 'NDX', 'index', 'bigtech', 'chips'])) return 'Results from big companies can move the whole index you trade.'; break;
    case 'rates': case 'inflation': case 'jobs': {
      const hit = myAssets().filter(x => ['NQ', 'MNQ', 'ES', 'MES', 'EURUSD', 'GBPUSD', 'USDJPY', 'GC', 'XAUUSD', 'BTC', 'ZN', 'SPX', 'NDX', 'index', 'bigtech', 'chips', 'dividends'].includes(x.id)).map(x => x.short || x.id);
      if (hasStrat('carry') || hasStrat('fundamentals')) return 'Anything that shifts interest-rate expectations feeds straight into your currency trades.';
      if (hit.length) return `Rate expectations move ${list([...new Set(hit)].slice(0, 3))}.`;
      if (m.includes('crypto') || m.includes('memes')) return 'Rate news sets the mood for crypto: lower rates tend to help, higher rates tend to hurt.';
      break;
    }
    case 'dollar': if (myAssets().some(x => x.ccy)) return 'Your currency pairs have a side in this, so it matters for you.'; break;
    case 'gold': if (hasAny(['GC', 'XAUUSD'])) return 'You trade gold, so this is directly relevant.'; break;
    case 'energy': if (hasAny(['CL', 'NG', 'energy'])) return 'You trade energy, so this is directly relevant.'; if (m.includes('stocks') || m.includes('futures')) return 'Oil swings feed into inflation worries, which weigh on stocks.'; break;
    case 'crypto': if (m.includes('crypto')) return hasStrat('perps') ? 'A crypto story. Mind your leverage if it moves Bitcoin quickly.' : 'Relevant to the coins you follow.'; if (m.includes('memes')) return 'Bitcoin’s mood spills over into memecoins, usually more sharply.'; break;
    case 'memes': if (m.includes('memes')) return 'Directly about the memecoin market you trade.'; break;
    case 'world': case 'trade': case 'gov': return depth() === 'deep' ? 'Big political and world headlines hit the riskiest markets first, and first moves are often overdone.' : null;
    case 'options': if (m.includes('options')) return 'Relevant to option prices and volatility.'; break;
  }
  return null;
}
// 2 = mentions something they trade, 1 = clearly relevant to their markets, 0 = not specifically theirs
export function forYouStrength(h) {
  if (!me.answers) return 0;
  if (myAssets().some(x => x.kw && x.kw.test(h.title))) return 2;
  return fyLine(h) ? 1 : 0;
}
export function forYouHeadline(h) {
  if (!me.answers) return null;
  const mine = myAssets().find(x => x.kw && x.kw.test(h.title));
  const line = fyLine(h);
  if (!line && !mine) return null;
  if (!line) return `Mentions ${mine.short || mine.label}, which you trade.`;
  return line;
}
// How relevant a story is to this reader (used to rank news, never to hide it)
export function relevance(h) {
  let r = h.score || 0;
  const mk = new Set(myMarkets().flatMap(m => m === 'stocks' ? ['stocks', 'futures'] : m === 'memes' ? ['memes', 'crypto'] : [m]));
  if (h.markets && h.markets.some(m => mk.has(m))) r += 1.5;
  if (myAssets().some(x => x.kw && x.kw.test(h.title))) r += 2;
  if (fyLine(h)) r += 1;
  return r;
}
export function greeting() {
  const h = Math.floor(nyMins(Date.now()) / 60);
  const part = h < 5 ? 'Up early' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return me.name ? `${part}, ${me.name.split(/[ @]/)[0]}` : part;
}
export function windowStatus(now = Date.now()) {
  const m = nyMins(now), ss = mySessions();
  if (!ss.length) return { text: '' };
  const inside = ss.find(s => s.from <= m && m < s.to);
  if (inside) return { now: true, s: inside, text: `You’re in your usual trading time, ${inside.phrase}, until ${fmtM(inside.to)}.` };
  const next = ss.map(s => ({ s, d: (s.from - m + 1440) % 1440 })).sort((x, y) => x.d - y.d)[0];
  const h = Math.floor(next.d / 60), mi = next.d % 60;
  return { now: false, s: next.s, inMins: next.d, text: `Your usual trading time, ${next.s.phrase}, starts in ${h ? h + 'h ' : ''}${mi}m at ${fmtM(next.s.from)} New York time.` };
}

// ================= Supabase =================
const redirectURL = () => location.origin + '/';
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

// ================= sign in / sign up =================
const GOOGLE = '<svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
let authMode = 'signup';
function gateHTML() {
  return `<div class="gate-card" role="dialog" aria-modal="true" aria-labelledby="gateTitle">
    <div class="gate-side">
      <div class="gate-brand">The Open One</div>
      <h1 id="gateTitle" class="gate-h">What’s happening in the world, and what it means for your trades.</h1>
      <ul class="gate-points">
        <li>A front page that explains the day’s world news and how each story is moving markets</li>
        <li>Every story tied to the markets you trade, with what it means for your strategy</li>
        <li>Live prices, the economic calendar, alerts and a plain-English glossary</li>
      </ul>
      <p class="gate-fine">Free. Setting up your briefing takes a couple of minutes.</p>
    </div>
    <div class="gate-form" id="gateForm">
      <div class="seg" id="authSeg" role="tablist"><button data-mode="signup" role="tab">Create account</button><button data-mode="signin" role="tab">Sign in</button></div>
      <button class="btn-google" id="gGoogle">${GOOGLE}Continue with Google</button>
      <div class="or">or</div>
      <label class="fld" id="fEmail"><span>Email</span><input type="email" id="aEmail" autocomplete="email" placeholder="you@example.com"></label>
      <label class="fld" id="fUser"><span>Username</span><input type="text" id="aUser" autocomplete="username" maxlength="20" placeholder="3 to 20 letters, numbers or _"></label>
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
      if (!USER_RE.test(user)) return msg('aMsg', 'Usernames are 3 to 20 characters: lowercase letters, numbers or _.');
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

// ================= the setup screens =================
function wizard(existing, onDone, { editing = false, notice = '' } = {}) {
  let a = JSON.parse(JSON.stringify(existing || {}));
  a.v = 2;
  let cur = 'markets';
  const w = $('#wizard'); w.hidden = false; document.body.classList.add('locked');
  const val = (q) => a[q.id] ?? (q.multi ? [] : null);
  const answered = (q) => { const v = a[q.id]; return q.multi ? Array.isArray(v) && v.length > 0 : v != null; };
  async function finish() {
    const btn = $('#wzNext'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    a = prune(a); a.done = true; a.updated = Date.now();
    const notify = a.notify || [];
    me.alerts = { ...me.alerts, news: notify.includes('events'), breaking: notify.includes('breaking'), sessions: notify.includes('session'), levels: notify.includes('levels') };
    a.alerts = me.alerts; ls.set('alerts', me.alerts);
    const ok = await saveAnswers(a);
    if (!ok) { const e = $('#wzErr'); if (e) e.textContent = 'Saved on this device. It will sync to your account next time.'; await new Promise(r => setTimeout(r, 1200)); }
    w.hidden = true; w.innerHTML = ''; document.body.classList.remove('locked');
    onDone && onDone();
  }
  function render() {
    const steps = buildSteps(a);
    let i = steps.findIndex(s => s.id === cur); if (i < 0) { i = 0; cur = steps[0].id; }
    const q = steps[i], v = val(q), last = i === steps.length - 1;
    const sections = [...new Set(steps.map(s => s.section))];
    const secIdx = sections.indexOf(q.section);
    const inSec = steps.filter(s => s.section === q.section), posInSec = inSec.indexOf(q) + 1;
    const btn = o => { const on = q.multi ? v.includes(o.id) : v === o.id; return `<button type="button" class="wz-opt" data-id="${esc(o.id)}" aria-pressed="${on}"><span class="wz-tick" aria-hidden="true"></span><span><b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span></button>`; };
    w.innerHTML = `<div class="wz-card" role="dialog" aria-modal="true" aria-labelledby="wzTitle">
      <aside class="wz-side">
        <div class="wz-brand">The Open One</div>
        <p class="wz-intro">${editing ? 'Change anything below. Your briefing updates as soon as you save.' : 'A few questions so your front page explains the news for the way you trade.'}</p>
        <ol class="wz-steps">${sections.map((s, k) => `<li class="${k < secIdx ? 'done' : k === secIdx ? 'now' : ''}">${esc(s)}</li>`).join('')}</ol>
      </aside>
      <div class="wz-main">
        ${notice ? `<p class="wz-notice">${esc(notice)}</p>` : ''}
        <p class="wz-count">${esc(q.section)}, question ${posInSec} of ${inSec.length}</p>
        <h2 id="wzTitle" class="wz-h">${esc(q.title)}</h2>
        ${q.sub ? `<p class="wz-sub">${esc(q.sub)}</p>` : ''}
        <div class="wz-opts${q.options.length > 6 ? ' many' : ''}" role="group" aria-labelledby="wzTitle">${q.options.map(btn).join('')}</div>
        <div class="wz-foot">
          <button type="button" class="btn-ghost" id="wzBack" ${i === 0 ? 'hidden' : ''}>Back</button>
          <span class="wz-err" id="wzErr" role="status"></span>
          ${q.optional && !answered(q) ? '<button type="button" class="btn-ghost" id="wzSkip">Skip</button>' : ''}
          ${editing && !last ? '<button type="button" class="btn-ghost" id="wzSave">Save and close</button>' : ''}
          <button type="button" class="btn-primary" id="wzNext">${last ? (editing ? 'Save changes' : 'Show me my front page') : 'Next'}</button>
        </div>
      </div>
    </div>`;
    w.querySelectorAll('.wz-opt').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (q.multi) {
        let s = new Set(a[q.id] || []);
        if (s.has(id)) s.delete(id);
        else if ((q.exclusive || []).includes(id)) s = new Set([id]);
        else { (q.exclusive || []).forEach(x => s.delete(x)); s.add(id); }
        a[q.id] = [...s];
      } else a[q.id] = id;
      render();
      if (!q.multi) setTimeout(() => { const n = $('#wzNext'); if (n && !n.disabled) n.click(); }, 220);
    });
    $('#wzBack').onclick = () => { cur = steps[i - 1].id; render(); };
    if ($('#wzSkip')) $('#wzSkip').onclick = () => {
      delete a[q.id];
      const next = buildSteps(a), j = next.findIndex(s => s.id === q.id);
      if (j === next.length - 1) finish(); else { cur = next[j + 1].id; render(); }
    };
    if ($('#wzSave')) $('#wzSave').onclick = () => {
      const missing = buildSteps(a).find(s => !s.optional && !answered(s));
      if (missing) { cur = missing.id; render(); $('#wzErr').textContent = 'This one needs an answer before you save.'; return; }
      finish();
    };
    $('#wzNext').onclick = () => {
      if (!answered(q) && !q.optional) { $('#wzErr').textContent = 'Pick at least one to continue.'; return; }
      const next = buildSteps(a);
      const j = next.findIndex(s => s.id === q.id);
      if (j === next.length - 1) { finish(); return; }
      cur = next[j + 1].id; render();
    };
    const first = w.querySelector('.wz-opt[aria-pressed="true"]') || w.querySelector('.wz-opt'); if (first) first.focus({ preventScroll: true });
  }
  render();
}
export function editSetup() { wizard(me.answers, () => { window.dispatchEvent(new Event('open:profile')); }, { editing: hasProfile() }); }

// ================= account button + menu =================
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
  m.innerHTML = `<div class="am-head"><span class="av big">${esc((me.name || 'Y').charAt(0).toUpperCase())}</span><div><b>${esc(me.name || 'Your setup')}</b><small>${esc(me.user ? me.user.email || '' : 'Not signed in')}</small></div></div>
    <p class="am-sum">${esc(profileSummary() || 'No markets picked yet')}</p>
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

// ================= alerts =================
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
  if (!hasProfile() || !alertGetters) return;
  const AL = me.alerts, now = Date.now(), m = nyMins(now), today = nyDate(now);
  if (AL.news) {
    (alertGetters.calendar() || []).filter(e => e.impact === 'High' && myCurrencies().has(e.country) && e.time > now && e.time - now <= (AL.lead || 5) * 60e3)
      .forEach(e => notify('ev:' + e.title + e.time, `${e.name} in ${Math.max(1, Math.round((e.time - now) / 60e3))} min`, `${e.country}, ${fmtTime(e.time)}. ${forYouEvent(e) || e.why}`));
  }
  if (AL.breaking && alertGetters.wire) {
    try { (await alertGetters.wire()).filter(h => h.breaking && relevance(h) - (h.score || 0) >= 1.5).slice(0, 2).forEach(h => notify('br:' + h.id, 'Breaking: ' + h.title, forYouHeadline(h) || h.why || h.source)); } catch {}
  }
  if (AL.sessions) mySessions().forEach(s => { const d = (s.from - m + 1440) % 1440; if (d <= 5) notify('ss:' + s.id + today, `${s.label} ${d ? `starts in ${d} min` : 'has started'}`, 'Your briefing is up to date on the front page.'); });
  if (AL.levels && alertGetters.levels) {
    try {
      (await alertGetters.levels()).forEach(({ id, L, fmt }) => {
        if (!L || !L.prevDay || !L.adr) return;
        [['high', L.prevDay.high, 'yesterday’s high'], ['low', L.prevDay.low, 'yesterday’s low']].forEach(([k, v, label]) => {
          if (Math.abs(L.price - v) <= L.adr * 0.1) notify(`lv:${id}:${k}:${today}`, `${id} is near ${label}`, `${id} at ${fmt(L.price)}, ${label} is ${fmt(v)}. Orders tend to pile up just past it.`);
        });
      });
    } catch {}
  }
}
export function startAlerts(getters) { alertGetters = getters; clearInterval(alertTimer); alertTimer = setInterval(checkAlerts, 30e3); setTimeout(checkAlerts, 4000); }
export function openAlerts() {
  const p = $('#alertsPanel'); const AL = me.alerts;
  const perm = !('Notification' in window) ? 'unsupported' : Notification.permission;
  const lv = levelTrader();
  p.innerHTML = `<div class="ap-h"><h2>Alerts</h2><button class="x" aria-label="Close">×</button></div>
    <p class="muted small">Alerts show while this site is open in a tab, even in the background.</p>
    ${perm === 'granted' ? '' : perm === 'unsupported' ? '<p class="small muted">This browser can’t show notifications, so alerts appear as banners on the page.</p>' : (perm === 'denied' ? '<p class="small muted">Notifications are blocked for this site. Turn them on in your browser’s site settings. Until then, alerts appear as banners on the page.</p>' : '<button class="btn-primary" id="apPerm" style="width:100%;margin:8px 0 4px">Allow notifications</button>')}
    <label class="tg"><input type="checkbox" id="apNews" ${AL.news ? 'checked' : ''}><span><b>Before big scheduled news in my markets</b><small><select id="apLead">${[2, 5, 10, 15, 30].map(v => `<option value="${v}" ${AL.lead === v ? 'selected' : ''}>${v} min</option>`).join('')}</select> ahead</small></span></label>
    <label class="tg"><input type="checkbox" id="apBreak" ${AL.breaking ? 'checked' : ''}><span><b>Breaking stories about my markets</b><small>Only big stories that touch what you trade.</small></span></label>
    <label class="tg"><input type="checkbox" id="apSess" ${AL.sessions ? 'checked' : ''}><span><b>When my usual trading time starts</b><small>${esc(mySessions().map(s => s.label).join(', ') || 'Set your times in Edit my setup')}</small></span></label>
    ${lv ? `<label class="tg"><input type="checkbox" id="apLv" ${AL.levels ? 'checked' : ''}><span><b>When price nears yesterday’s high or low</b><small>Based on prices that can lag up to 15 minutes.</small></span></label>` : ''}
    <button class="btn-ghost" id="apTest" style="margin-top:10px">Send a test alert</button>`;
  p.hidden = false;
  const save = () => { me.alerts = { news: $('#apNews').checked, lead: +$('#apLead').value, breaking: $('#apBreak').checked, sessions: $('#apSess').checked, levels: lv ? $('#apLv').checked : false }; ls.set('alerts', me.alerts); if (me.answers) saveAnswers({ ...me.answers, alerts: me.alerts }); };
  ['apNews', 'apLead', 'apBreak', 'apSess', 'apLv'].forEach(id => { if ($('#' + id)) $('#' + id).onchange = save; });
  p.querySelector('.x').onclick = () => { p.hidden = true; };
  if ($('#apPerm')) $('#apPerm').onclick = async () => { await Notification.requestPermission(); openAlerts(); };
  $('#apTest').onclick = () => notify('test' + Date.now(), 'Alerts are working', 'You’ll get notes like this before big news and when your trading time starts.');
}

// ================= start-up =================
function startWizardIfNeeded() {
  if (hasProfile()) return ready();
  const old = me.answers && me.answers.v !== 2;
  if (old) me.answers = migrate(me.answers);
  wizard(me.answers || {}, ready, { notice: old ? 'We’ve added more questions so your briefing fits you better. Your earlier answers are already filled in.' : '' });
}
async function afterSignIn(user) {
  me.user = user;
  await loadName();
  ls.set('seen', true);
  const saved = await loadAnswers();
  if (saved) { me.answers = saved; if (saved.alerts) me.alerts = { ...me.alerts, ...saved.alerts }; }
  hideGate(); renderAccount();
  startWizardIfNeeded();
}
function ready() {
  if (readyFired) { window.dispatchEvent(new Event('open:profile')); return; }
  readyFired = true; onReadyCb && onReadyCb();
}
export async function initMe(onReady) {
  onReadyCb = onReady;
  $('#acctBtn').onclick = openMenu;
  if (!configured) {
    me.answers = ls.get('answers:guest', null);
    renderAccount();
    startWizardIfNeeded();
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
      if (event === 'SIGNED_OUT') { readyFired = false; if (location.pathname !== '/') { history.pushState(null, '', '/'); dispatchEvent(new PopStateEvent('popstate')); } }
      showGate();
    }
  });
}
