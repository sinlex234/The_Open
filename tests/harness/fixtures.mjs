// Sample data for offline testing: replaces global fetch with realistic fake responses.
const nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
function ny(ms) { const p = Object.fromEntries(nyFmt.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, dow: p.weekday, date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute }; }

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const BASE = { 'NQ=F': 25400, 'ES=F': 6720, 'YM=F': 46800, 'RTY=F': 2480, '^NDX': 25350, '^GSPC': 6705, '^DJI': 46700, '^RUT': 2475, 'CL=F': 61.2, 'GC=F': 4320, '^VIX': 17.8, '^VIX9D': 16.9, '^VIX3M': 19.6, '^VXN': 22.4, '^TNX': 4.06, 'DX-Y.NYB': 98.6, 'EURUSD=X': 1.1642, 'GBPUSD=X': 1.3381, 'USDJPY=X': 151.42, 'AUDUSD=X': 0.6512, 'USDCAD=X': 1.4011, 'USDCHF=X': 0.7954, 'NZDUSD=X': 0.5741, 'EURGBP=X': 0.8701, 'SPY': 669.4, 'QQQ': 611.2, 'BTC-USD': 108400, '^IXIC': 23100, '^STOXX50E': 5650, '^GDAXI': 24300, '^FTSE': 9520, '^N225': 49100, '^HSI': 25800, '000001.SS': 3910, '^IRX': 3.82, '^FVX': 3.71, '^TYX': 4.63, 'USDCNY=X': 7.12, 'BZ=F': 65.4, 'NG=F': 3.41, 'SI=F': 51.2, 'HG=F': 5.02, 'ETH-USD': 3880, 'SOL-USD': 187, 'NVDA': 182, 'AAPL': 252, 'MSFT': 515, 'AMZN': 221, 'AVGO': 345, 'META': 712, 'GOOGL': 251, 'TSLA': 438, 'COST': 915, 'NFLX': 1210, 'AMD': 233, 'PLTR': 178 };

function chart(sym, range) {
  const base = BASE[sym] || 100, vol = base * 0.0011;
  const days = range === '1d' ? 1 : range === '1mo' ? 30 : 10;
  const now = Date.now(), step = 15 * 60e3;
  const start = Math.floor((now - days * 864e5) / step) * step;
  const ts = [], o = [], h = [], l = [], c = [];
  let p = base * (1 - 0.01 * days * 0.2);
  for (let t = start; t <= now; t += step) {
    const n = ny(t);
    const fut = /=F|=X|BTC/.test(sym);
    if (!/BTC/.test(sym)) { if (n.dow === 'Sat' || (n.dow === 'Sun' && n.h < 18) || (n.dow === 'Fri' && n.h >= 17)) continue; }
    if (!fut && (n.mins < 570 || n.mins >= 960 || n.dow === 'Sat' || n.dow === 'Sun')) continue;
    const sess = n.h >= 8 && n.h < 11 ? 2.2 : n.h >= 2 && n.h < 5 ? 1.4 : 0.7;
    const op = p; p = p + (rnd() - 0.48) * vol * sess;
    ts.push(t / 1000); o.push(op); c.push(p); h.push(Math.max(op, p) + rnd() * vol * 0.6); l.push(Math.min(op, p) - rnd() * vol * 0.6);
  }
  return { chart: { result: [{ meta: { symbol: sym, regularMarketPrice: c[c.length - 1], chartPreviousClose: c[0] * (1 - (rnd() - 0.5) * 0.01) }, timestamp: ts, indicators: { quote: [{ open: o, high: h, low: l, close: c, volume: c.map(() => Math.round(200 + rnd() * 1800)) }] } }] } };
}

function calendar() {
  const n = ny(Date.now());
  const at = (dayOff, hhmm) => { const d = new Date(n.date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + dayOff); return d.toISOString().slice(0, 10) + `T${hhmm}:00-04:00`; };
  return [
    { title: 'German PPI m/m', country: 'EUR', date: at(0, '02:00'), impact: 'Low', forecast: '0.1%', previous: '-0.5%' },
    { title: 'CPI y/y', country: 'GBP', date: at(0, '02:00'), impact: 'High', forecast: '3.9%', previous: '3.8%' },
    { title: 'Core CPI m/m', country: 'USD', date: at(0, '08:30'), impact: 'High', forecast: '0.3%', previous: '0.3%' },
    { title: 'CPI m/m', country: 'USD', date: at(0, '08:30'), impact: 'High', forecast: '0.4%', previous: '0.4%' },
    { title: 'Crude Oil Inventories', country: 'USD', date: at(0, '10:30'), impact: 'Low', forecast: '1.2M', previous: '3.5M' },
    { title: 'FOMC Member Waller Speaks', country: 'USD', date: at(0, '13:00'), impact: 'Medium', forecast: '', previous: '' },
    { title: '20-y Bond Auction', country: 'USD', date: at(0, '13:00'), impact: 'Low', forecast: '', previous: '4.60|2.5' },
    { title: 'PPI m/m', country: 'USD', date: new Date(Math.floor((Date.now() + 4 * 60e3) / 60e3) * 60e3).toISOString(), impact: 'High', forecast: '0.2%', previous: '0.3%' },
    { title: 'Fed Chair Powell Speaks', country: 'USD', date: new Date(Math.floor((Date.now() + 7 * 60e3) / 60e3) * 60e3).toISOString(), impact: 'High', forecast: '', previous: '' },
    { title: 'Retail Sales m/m', country: 'USD', date: new Date(Math.floor((Date.now() - 10 * 60e3) / 60e3) * 60e3).toISOString(), impact: 'High', forecast: '0.4%', previous: '0.6%' },
    { title: 'Unemployment Claims', country: 'USD', date: at(1, '08:30'), impact: 'High', forecast: '225K', previous: '218K' },
    { title: 'Existing Home Sales', country: 'USD', date: at(1, '10:00'), impact: 'Medium', forecast: '4.06M', previous: '4.00M' },
    { title: 'Flash Manufacturing PMI', country: 'USD', date: at(2, '09:45'), impact: 'Medium', forecast: '52.0', previous: '52.0' },
    { title: 'Prelim UoM Consumer Sentiment', country: 'USD', date: at(2, '10:00'), impact: 'High', forecast: '55.0', previous: '55.1' },
    { title: 'Main Refinancing Rate', country: 'EUR', date: at(3, '08:15'), impact: 'High', forecast: '2.15%', previous: '2.15%' },
    { title: 'Federal Funds Rate', country: 'USD', date: at(5, '14:00'), impact: 'High', forecast: '3.75%', previous: '4.00%' },
    { title: 'FOMC Press Conference', country: 'USD', date: at(5, '14:30'), impact: 'High', forecast: '', previous: '' },
  ];
}

const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map(([t, mins]) => `<item><title><![CDATA[${t}]]></title><link>https://example.com/${encodeURIComponent(t.slice(0, 20))}</link><pubDate>${new Date(Date.now() - mins * 60e3).toUTCString()}</pubDate><description>Story summary.</description></item>`).join('')}</channel></rss>`;
const HEADLINES = {
  cnbc: [['Stock futures rise ahead of key inflation report as traders weigh Fed path', 25], ['Nvidia shares climb as AI chip demand stays strong into earnings', 70], ['Treasury yields slip ahead of CPI data', 95], ['Oil prices fall as OPEC weighs output increase', 140], ['Tesla to report third-quarter earnings after the bell', 200]],
  mw: [['What gave this city its best place to retire crown? You can actually afford it', 50], ['Our church has a $1.5 million bequest earning 3.75%. Is inflation eroding it?', 70], ['Strattec Security (STRT) Q1 Earnings Beat Estimates', 90], ['Is Alphabet Stock a Buy After Its Post-Earnings Drop?', 110], ['Mastercard: 3 Key Takeaways for Long-Term Investors', 130], ['Here’s what Wall Street expects from Wednesday’s CPI report', 40], ['White House says trade deal with China is close', 160], ['Dollar steadies as traders brace for inflation figures', 230], ['Gold hits record as investors seek safety', 300]],
  fed: [['Federal Reserve Board announces approval of application', 600]],
  fx: [['EUR/USD holds near 1.1650 ahead of US CPI', 30], ['USD/JPY: yen weakens as BoJ signals patience', 90], ['GBP/USD dips after UK inflation surprises higher', 260]],
  crypto: [['Bitcoin reclaims $108K as ETF inflows return', 20], ['Solana memecoin frenzy cools as Pump.fun volumes drop', 80], ['SEC delays decision on new crypto ETF applications', 150], ['Dogecoin jumps 9% as meme coin traders return', 210], ['Ethereum developers set date for next upgrade', 400]],
};

function cgMarkets(meme) {
  const list = meme ? [['dogecoin', 'Dogecoin', 'doge', 0.198, 29e9], ['shiba-inu', 'Shiba Inu', 'shib', 0.0000102, 6e9], ['pepe', 'Pepe', 'pepe', 0.0000071, 3e9], ['official-trump', 'Official Trump', 'trump', 6.1, 1.2e9], ['bonk', 'Bonk', 'bonk', 0.0000158, 1.3e9], ['dogwifcoin', 'dogwifhat', 'wif', 0.62, 6.2e8], ['floki', 'FLOKI', 'floki', 0.000071, 6.8e8], ['fartcoin', 'Fartcoin', 'fartcoin', 0.38, 3.8e8]]
    : [['bitcoin', 'Bitcoin', 'btc', 108400, 2.16e12], ['ethereum', 'Ethereum', 'eth', 3880, 4.68e11], ['tether', 'Tether', 'usdt', 1, 1.8e11], ['ripple', 'XRP', 'xrp', 2.41, 1.44e11], ['binancecoin', 'BNB', 'bnb', 1090, 1.5e11], ['solana', 'Solana', 'sol', 187, 1.02e11], ['usd-coin', 'USDC', 'usdc', 1, 7.6e10], ['dogecoin', 'Dogecoin', 'doge', 0.198, 2.9e10], ['tron', 'TRON', 'trx', 0.32, 3e10], ['cardano', 'Cardano', 'ada', 0.66, 2.4e10], ['chainlink', 'Chainlink', 'link', 18.2, 1.2e10], ['wrapped-bitcoin', 'Wrapped Bitcoin', 'wbtc', 108300, 1.4e10], ['hyperliquid', 'Hyperliquid', 'hype', 38.4, 1.3e10], ['sui', 'Sui', 'sui', 2.6, 9e9], ['avalanche-2', 'Avalanche', 'avax', 20.4, 8.6e9], ['litecoin', 'Litecoin', 'ltc', 94, 7.1e9]];
  return list.map(([id, name, sym, p, mc]) => ({ id, name, symbol: sym, image: '', current_price: p, market_cap: mc, total_volume: mc * 0.05, price_change_percentage_24h_in_currency: (rnd() - 0.4) * 12, price_change_percentage_7d_in_currency: (rnd() - 0.4) * 20, sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => p * (1 + Math.sin(i / 12) * 0.03 + (rnd() - 0.5) * 0.01)) } }));
}
function dsBoosts() { return Array.from({ length: 14 }, (_, i) => ({ url: 'https://dexscreener.com/solana/tok' + i, chainId: i % 4 === 3 ? 'base' : 'solana', tokenAddress: 'Tok' + i + 'pump', totalAmount: 500 - i * 20, icon: null, description: i % 2 ? 'The first community-run cat coin on Solana. No team tokens, liquidity locked. https://x.com/tok 🚀🚀' : '', links: i % 2 ? [{ type: 'twitter', url: 'https://x.com/tok' + i }] : [] })); }
function dsTokens(chain, addrs) {
  const names = ['Moo Deng 2', 'Gigachad Cat', 'Unicorn Fart Dust', 'Based Frog', 'Retardio', 'Pnut Returns', 'Chill Guy', 'Lockin', 'Doge Killer', 'Hamster Wheel', 'Nub', 'Mew Mew', 'Goat Sim', 'Toshi Jr'];
  return addrs.map(a => { const i = +a.match(/\d+/)[0]; const liq = [8e3, 42e3, 2.4e6, 310e3, 1.1e6, 95e3, 3.4e6, 18e3, 640e3, 220e3, 75e3, 1.6e6, 55e3, 400e3][i]; return { chainId: chain, dexId: chain === 'base' ? 'aerodrome' : 'raydium', url: 'https://dexscreener.com/' + chain + '/' + a, baseToken: { address: a, name: names[i], symbol: names[i].replace(/[^A-Za-z]/g, '').slice(0, 6).toUpperCase() }, priceUsd: String((rnd() * 0.01).toFixed(8)), priceChange: { h1: (rnd() - 0.5) * 30, h24: (rnd() - 0.3) * 220 }, volume: { h24: liq * (2 + rnd() * 12) }, liquidity: { usd: liq }, marketCap: liq * 9, pairCreatedAt: Date.now() - (i % 3 === 0 ? 6 : i % 3 === 1 ? 70 : 600) * 36e5, info: {} }; });
}
function earnings(date) {
  const w = new Date(date + 'T12:00:00Z').getUTCDay();
  const sets = { 1: [['NFLX', 'Netflix, Inc.', 520e9, 'time-after-hours']], 2: [['TSLA', 'Tesla, Inc.', 1.4e12, 'time-after-hours'], ['IBM', 'International Business Machines', 260e9, 'time-after-hours'], ['T', 'AT&T Inc.', 190e9, 'time-pre-market']], 3: [['INTC', 'Intel Corporation', 160e9, 'time-after-hours'], ['HON', 'Honeywell', 140e9, 'time-pre-market']], 4: [['GOOGL', 'Alphabet Inc.', 3e12, 'time-after-hours'], ['MSFT', 'Microsoft Corporation', 3.8e12, 'time-after-hours']], 5: [['XOM', 'Exxon Mobil', 480e9, 'time-pre-market'], ['ABBV', 'AbbVie', 400e9, 'time-pre-market']] };
  return { data: { rows: (sets[w] || []).concat([['SMALL', 'Small Co', 2e9, 'time-pre-market']]).map(([s, n, mc, t]) => ({ symbol: s, name: n, marketCap: '$' + mc.toLocaleString('en-US'), time: t, epsForecast: '$1.23', lastYearEPS: '$1.01', ...(date < new Date().toISOString().slice(0, 10) ? { eps: s === 'MSFT' ? '$1.41' : s === 'GOOGL' ? '$1.18' : '$1.30', surprise: s === 'MSFT' ? '14.6' : s === 'GOOGL' ? '-4.07' : '5.69' } : {}) })) } };
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const ok = (body, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'content-type': type } });
  await new Promise(r => setTimeout(r, 20));
  if (u.includes('supabase.co/rest/v1/rpc/open_log')) { const b = JSON.parse(opts.body); globalThis.__logged = (globalThis.__logged || []).concat(b.rows.map((r) => ({ tbl: b.tbl, ...r }))); return ok(b.rows.length); }
  if (u.includes('supabase.co/rest/v1/rpc/open_ai_check')) return ok({ ok: true, tier: 'pro', used: 3, limit: 250 });
  if (u.includes('supabase.co/rest/v1/rpc/email_for_login')) return ok(null);
  if (u.includes('supabase.co/rest/v1/rpc/open_use_ai')) return ok({ ok: true, tier: 'pro', used: 4, limit: 250 });
  if (u.includes('supabase.co/rest/v1/rpc/open_my_plan')) return ok({ tier: 'pro' });
  if (u.includes('api.anthropic.com')) {
    const body = JSON.parse(opts.body), user = body.messages[0].content;
    if (/"bull"/.test(body.system)) return ok({ content: [{ type: 'text', text: JSON.stringify({ bull: 'If traders read this as the Fed staying patient, yields ease and tech leads. NQ could extend the morning gain into the open.', bear: 'If the inflation number runs hot, the rally fades fast. Yields jump and NQ gives back the move, with tech hit hardest.', flip: 'A hot inflation print or a jump in the 10-year yield would flip the read to bearish.', watch: ['The 10-year yield into the release', 'Whether NQ holds the overnight high', 'Fed speakers after the number'], fit: 'For ICT: the overnight high is the obvious liquidity. A run above it before the release, then a reversal, is the classic trap.' }) }], stop_reason: 'end_turn' });
    if (/bias_is_wrong_if/.test(body.system)) { const f = JSON.parse(user.slice(user.indexOf('{'))); const a = f.levels_above[0], b = f.levels_below[0];
      return ok({ content: [{ type: 'text', text: JSON.stringify({ summary: `Today leans ${f.bias === 'down' ? 'lower' : 'higher'} for ${f.market}, but only slightly. The news points ${f.bias}, while the latest live read points the other way.`, why: ['Most of today\u2019s top stories point the same way as the bias.', 'The live read disagrees, which is why confidence is low.'],
        levels: [a && { price: a.price, what: `${a.name}: a quick run up here is the kind of trap the plan expects before a move ${f.bias === 'down' ? 'down' : 'up'}.` }, b && { price: b.price, what: `${b.name}: the first place price would likely head if the bias plays out.` }].filter(Boolean),
        flip: f.bias_is_wrong_if || 'If price holds above the levels above, the bias is wrong.', watch: ['The Fed Chair speaking can override everything else today.', 'Whether price reacts at the levels above first.'], plan: 'Your ICT plan waits for a sweep of the level above, then a strong move down that leaves a fair value gap, before doing anything.' }) }], stop_reason: 'end_turn', model: 'mock' });
    }
    if (/"stage_why"/.test(body.system)) { const mk = (user.match(/Markets \(use these codes for "m"\): (.*)/) || [])[1] || ''; const keys = mk.split('; ').map(x => x.split(' = ')[0]).filter(Boolean);
      return ok({ content: [{ type: 'text', text: JSON.stringify({ now: 'Users have pulled billions out of Binance after the hack, and withdrawals have now restarted. Crypto traders are watching whether the panic spreads to other exchanges or calms down.', stage: 'fading', stage_why: 'New headlines have slowed, and the latest ones moved Bitcoin less than the first ones did.',
        reads: keys.map(k => k === 'BTC' ? { m: k, dir: 'down', conf: 'medium', why: 'Bitcoin slipped when the hack hit, but it has since climbed back above where this round of news began. The selling looks like it is easing, not over.', up_if: 'withdrawals keep running smoothly and regulators stay quiet', down_if: 'regulators announce action against Binance or another exchange reports problems' }
          : { m: k, dir: 'unclear', conf: 'low', why: 'This story is mostly about crypto, and it has barely moved NQ. Stock traders are waiting for the inflation report instead.', up_if: 'the inflation report comes in cooler than expected', down_if: 'the inflation report runs hot' }),
        watch: ['The CPI inflation report on Tuesday morning', 'Any regulator statement on Binance', 'Whether Binance withdrawals keep running normally'] }) }], stop_reason: 'end_turn', model: 'mock' });
    }
    if (/"take"/.test(body.system)) { const mk = (user.match(/Markets: (.*)/) || [])[1] || ''; const keys = mk.split('; ').map(x => x.split(' = ')[0]).filter(Boolean);
      return ok({ content: [{ type: 'text', text: JSON.stringify({ reads: keys.map(k => ({ m: k, dir: k === 'BTC' ? 'up' : 'up', conf: k === 'BTC' ? 'medium' : 'high', why: k === 'BTC' ? 'Calmer rate worries usually help Bitcoin, though it often lags the move in stocks.' : 'Futures already rising into the report shows traders expect a soft number, which tends to carry tech higher.' })), take: 'This is mostly positioning before the inflation report. The real move comes when the number is out.' }) }], stop_reason: 'end_turn' }); }
    if (!/\{"reads"/.test(body.system)) return new Response(JSON.stringify({ error: { message: 'mock: only reads' } }), { status: 400 });
    const reads = user.split('\n').map(l => { const m = l.match(/^(\d+)\. Headline: "(.*)" \| Market: (.*)$/); if (!m) return null; const up = /rise|rall|climb|jump|gain|surge|inflows?|cool|ease/i.test(m[2]);
      const mk = /Bitcoin/.test(m[3]) ? 'Bitcoin' : 'NQ';
      return { n: +m[1], dir: up ? 'up' : 'down', conf: 'medium', why: up ? `Rising risk appetite in stocks usually carries over to ${mk}, and nothing in the story points the other way.` : `Traders tend to sell ${mk} on this kind of worry until there is a clearer answer.` }; }).filter(Boolean);
    return ok({ content: [{ type: 'text', text: JSON.stringify({ reads }) }], stop_reason: 'end_turn', model: 'mock' });
  }
  if (u.includes('fred.stlouisfed.org/graph/fredgraph.csv')) {
    const id = new URL(u).searchParams.get('id'); let rows = [], seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    if (id === 'ICSA') { for (let i = 60; i >= 1; i--) { const d = new Date(Date.UTC(2026, 9, 31) - i * 7 * 864e5); rows.push([d.toISOString().slice(0, 10), Math.round(205000 + (rnd() - .5) * 40000)]); } }
    else { let v = id === 'PAYEMS' ? 157000 : id === 'UNRATE' ? 4.0 : id === 'A191RL1Q225SBEA' ? 2.4 : 300;
      const q = id === 'A191RL1Q225SBEA';
      for (let m = 0; m < 29; m += q ? 3 : 1) { const d = new Date(Date.UTC(2024, 4 + m, 1)); if (d > new Date(Date.UTC(2026, 8, 1))) break;
        if (id === 'PAYEMS') v += Math.round(60 + rnd() * 140 - (rnd() < .15 ? 200 : 0)); else if (id === 'UNRATE' || q) v = +(v + (rnd() - .5) * (q ? 1.4 : .2)).toFixed(1); else v = +(v * (1 + (0.0005 + rnd() * 0.0045 - (rnd() < .15 ? .004 : 0)))).toFixed(3);
        rows.push([d.toISOString().slice(0, 10), v]); } }
    return ok('observation_date,' + id + '\n' + rows.map(r => r.join(',')).join('\n') + '\n', 'text/csv');
  }
  if (u.includes('ff_calendar_thisweek')) return ok(calendar());
  if (u.includes('ff_calendar_nextweek')) return ok([]);
  if (u.includes('supabase.co/rest/v1/open_calls')) {
    if (opts && opts.method === 'POST') { globalThis.__posted = (globalThis.__posted || []).concat(JSON.parse(opts.body)); return new Response('', { status: 201 }); }
    const H = 36e5, now = Date.now();
    const mk = (h, market, dir, headline, source, outlets, price) => ({ story_id: 'x' + h + market, market, dir, headline, source, link: 'https://example.com/' + h, outlets, price, called_at: new Date(now - h * H).toISOString() });
    return ok([mk(0.4, 'NQ', 'down', 'Nvidia drops 3% as chip stocks retreat on export curbs', 'Reuters', 3, 25402.25), mk(5, 'BTC', 'up', 'Bitcoin climbs above $108,000 as ETF inflows return', 'CoinDesk', 2, 108210), mk(7, 'EURUSD', 'down', 'Fed’s Waller says more rate cuts likely if inflation cools', 'Bloomberg', 1, 1.0841), mk(26, 'NQ', 'up', 'Microsoft beats estimates as cloud sales jump', 'CNBC', 4, 25210.5), mk(30, 'NQ', 'down', 'Treasury yields climb after hotter producer prices', 'MarketWatch', 2, 25330), mk(50, 'BTC', 'down', 'Crypto slides as ETF outflows hit a two-week high', 'Cointelegraph', 1, 109900), mk(75, 'NQ', 'up', 'Fed’s Powell says rate cuts still on the table', 'Reuters', 5, 25100), mk(100, 'EURUSD', 'up', 'ECB’s Lagarde says inflation fight nearly done', 'Financial Times', 3, 1.0802), mk(122, 'NQ', 'down', 'Oil jumps 2% as OPEC+ signals deeper supply cuts', 'Bloomberg', 2, 25250), mk(150, 'BTC', 'up', 'Bitcoin rallies as stablecoin bill clears Senate', 'Decrypt', 2, 107300)]);
  }
  if (u.includes('supabase.co/rest/v1/open_heads')) {
    if (opts && opts.method === 'POST') { globalThis.__heads = (globalThis.__heads || []).concat(JSON.parse(opts.body)); return new Response('', { status: 201 }); }
    const H = 36e5, now = Date.now();
    const hs = ['Democrats win House and Senate majorities in midterms', 'Stocks rally as midterm results point to divided government', 'Chip stocks slip as election results hit data-center optimism', 'Dollar dips as traders weigh Democrats sweep in Congress', 'Binance hack: users withdraw $3.6bn after biggest-ever crypto hack', 'Binance resumes withdrawals after hack', 'Bitcoin slips as Binance hack rattles crypto traders', 'Regulators probe Binance after hack', 'Treasury yields jump after hotter-than-expected producer prices', 'Stocks slide as hot inflation data dims rate-cut hopes', 'Yields climb as CPI comes in hotter than forecast', 'Nasdaq futures fall after inflation surprise', 'Producer prices rise more than expected in September', 'Dollar jumps as consumer prices beat forecasts', 'Wall Street drops as inflation stays sticky', 'Inflation cools more than expected, stocks rally', 'Stocks rise as softer inflation boosts rate-cut bets', 'Oil jumps 3% as Middle East tensions flare', 'Oil prices surge after attack on tanker', 'Crude jumps as OPEC+ agrees to extend output cuts', 'Oil climbs 2% on supply worries after OPEC meeting', 'Brent rallies as Saudi Arabia signals deeper cuts', 'Oil surges as OPEC+ surprises with bigger cut', 'Trump threatens new tariffs on China, futures slide', 'Stocks fall as Trump announces fresh tariffs', 'Fed’s Powell says rate cuts still likely this year', 'Bitcoin climbs as ETF inflows return', 'Nvidia rallies as AI chip demand stays strong', 'Jobless claims rise more than expected'];
    return ok(hs.map((h, i) => ({ story_id: 'h' + i, headline: h, source: ['Reuters', 'CNBC', 'Bloomberg', 'MarketWatch'][i % 4], theme: null, published_at: new Date(now - (i < 8 ? 1 + i * 2.5 : 30 + i * 37) * H).toISOString() })).concat(globalThis.__heads || []));
  }
  if (u.includes('supabase.co/rest/v1/open_crowd_tally')) {
    // readers' totals for the same releases the site called (see open_relcalls below)
    const H = 36e5, now = Date.now(), hs = [200, 150, 100, 60, 30, 5], t = ['CPI m/m', 'Non-Farm Employment Change', 'PPI m/m', 'Retail Sales m/m', 'CPI m/m', 'Unemployment Claims'];
    const v = [[14, 5], [3, 9], [6, 6], [2, 1], [11, 4], [8, 7]];
    return ok(hs.map((h, i) => ({ event_key: 'USD|' + t[i] + '|' + i, market: 'NQ', title: t[i], country: 'USD', released_at: new Date(Math.floor((now - h * H) / 3e5) * 3e5).toISOString(), up: v[i][0], down: v[i][1] })));
  }
  if (u.includes('supabase.co/rest/v1/open_crowd')) {
    const H = 36e5, now = Date.now(), rt = (h) => new Date(Math.floor((now - h * H) / 3e5) * 3e5).toISOString();
    return ok([{ event_key: 'USD|CPI m/m|0', title: 'CPI m/m', market: 'NQ', dir: 'up', released_at: rt(200) }, { event_key: 'USD|Non-Farm Employment Change|1', title: 'Non-Farm Employment Change', market: 'NQ', dir: 'up', released_at: rt(150) }, { event_key: 'USD|CPI m/m|4', title: 'CPI m/m', market: 'NQ', dir: 'up', released_at: rt(30) }]);
  }
  if (u.includes('supabase.co/rest/v1/open_relcalls')) {
    if (opts && opts.method === 'POST') { globalThis.__rel = (globalThis.__rel || []).concat(JSON.parse(opts.body)); return new Response('', { status: 201 }); }
    const H = 36e5, now = Date.now(), out = [];
    const ev = [['CPI m/m', 'Inflation report', 'up', '0.5%', '0.3%', 200], ['Non-Farm Employment Change', 'Jobs report', 'down', '29K', '65K', 150], ['PPI m/m', 'Inflation report', 'down', '0.1%', '0.3%', 100], ['Retail Sales m/m', 'Retail sales', 'up', '0.8%', '0.4%', 60], ['CPI m/m', 'Inflation report', 'down', '0.2%', '0.3%', 30], ['Unemployment Claims', 'Weekly jobless claims', 'up', '230K', '215K', 5]];
    ev.forEach(([t, kind, sur, a, f, h], i) => { const rt = new Date(Math.floor((now - h * H) / 3e5) * 3e5).toISOString();
      ['NQ', 'BTC', 'EURUSD'].forEach((m, j) => out.push({ event_key: 'USD|' + t + '|' + i, title: t, kind, country: 'USD', released_at: rt, actual: a, forecast: f, surprise: sur, market: m, dir: (i + j) % 2 ? 'up' : 'down', how: kind === 'Retail sales' ? 'react' : 'rule', price: m === 'NQ' ? 25400 : m === 'BTC' ? 108000 : 1.165, called_at: kind === 'Retail sales' ? new Date(Date.parse(rt) + 4 * 6e4).toISOString() : rt })); });
    return ok(out.concat(globalThis.__rel || []));
  }
  if (u.includes('supabase.co/rest/v1/open_pulse')) {
    if (opts && opts.method === 'POST') { globalThis.__pulse = (globalThis.__pulse || []).concat(JSON.parse(opts.body)); return new Response('', { status: 201 }); }
    if (u.includes('slot=eq.')) return ok([]);
    const now = Date.now(), S = 5 * 60e3, out = [];
    for (let i = 14; i < 600; i += 7) { const m = ['NQ', 'BTC', 'EURUSD'][i % 3]; out.push({ market: m, slot: Math.floor((now - i * S) / S) * S, lean: i % 2 ? 'up' : 'down', conf: i % 5 ? 'low' : 'medium', score: (i % 2 ? 1 : -1) * [0.4, 0.65, 0.85, 0.5][i % 4], price: m === 'NQ' ? 25400 : m === 'BTC' ? 108400 : 1.165 }); }
    return ok(out);
  }
  if (u.includes('supabase.co/rest/v1/open_daybias')) {
    if (opts && opts.method === 'POST') { globalThis.__day = (globalThis.__day || []).concat(JSON.parse(opts.body)); return new Response('', { status: 201 }); }
    if (u.includes('day=eq.')) return ok([]);
    const out = [], D = 864e5;
    for (let i = 1; i < 12; i++) { const d = new Date(Date.now() - i * D); if ([0, 6].includes(d.getUTCDay())) continue; ['NQ', 'BTC', 'EURUSD'].forEach((m, j) => { const t = new Date(d.toISOString().slice(0, 10) + 'T13:30:00Z'); out.push({ day: d.toISOString().slice(0, 10), market: m, call: (i + j) % 2 ? 'up' : 'down', conf: ['high', 'medium', 'low'][(i + j) % 3], score: 1.2, logged_at: t.toISOString() }); }); }
    return ok(out);
  }
  if (u.includes('supabase.co/rest/v1/open_reports')) { globalThis.__reports = (globalThis.__reports || []).concat(JSON.parse(opts.body)); return new Response('', { status: 201 }); }
  if (u.includes('financialjuice') || u.includes('investinglive')) return ok(rss([['US 10-year yield rises to 4.31% after PPI', 3], ['Fed’s Waller says more rate cuts likely if inflation cools', 4]]), 'application/xml');
  if (u.includes('/v8/finance/chart/')) { const sym = decodeURIComponent(u.split('/chart/')[1].split('?')[0]); return ok(chart(sym, /range=1d/.test(u) ? '1d' : /range=1mo/.test(u) ? '1mo' : '10d')); }
  if (u.includes('coingecko.com/api/v3/global')) return ok({ data: { total_market_cap: { usd: 3.71e12 }, total_volume: { usd: 1.4e11 }, market_cap_change_percentage_24h_usd: 1.8, market_cap_percentage: { btc: 58.3, eth: 12.6 } } });
  if (u.includes('category=meme-token')) return ok(cgMarkets(true));
  if (u.includes('coins/markets')) return ok(cgMarkets(false));
  if (u.includes('search/trending')) return ok({ coins: cgMarkets(false).slice(3, 11).map((c, i) => ({ item: { name: c.name, symbol: c.symbol.toUpperCase(), market_cap_rank: i + 4, small: '', data: { price: c.current_price, price_change_percentage_24h: { usd: (rnd() - 0.3) * 15 } } } })) });
  if (u.includes('alternative.me')) return ok({ data: [{ value: '64', value_classification: 'Greed' }] });
  if (u.includes('token-boosts')) return ok(dsBoosts());
  if (u.includes('token-profiles')) return ok([]);
  if (u.includes('dexscreener.com/tokens/v1/')) { const [, chain, list] = u.match(/tokens\/v1\/([^/]+)\/(.+)$/); return ok(dsTokens(chain, list.split(','))); }
  if (u.includes('api.exchange.coinbase.com/products/') && u.includes('/trades')) { const prod = u.split('/products/')[1].split('/')[0]; const base = BASE[prod] || 100; const after = +(u.split('after=')[1] || 9e6); const out = []; let p = base; const now = Date.now() - (9e6 - after) * 1500;
    for (let i = 0; i < 1000; i++) { p += (rnd() - 0.5) * base * 0.0002; out.push({ time: new Date(now - i * 1500).toISOString(), trade_id: after - 1 - i, price: p.toFixed(2), size: (rnd() * 0.3).toFixed(5), side: rnd() > 0.5 ? 'buy' : 'sell' }); } return ok(out); }
  if (u.includes('delayed_quotes/options/')) { const und = u.split('/options/')[1].split('.')[0]; const S = BASE[und] || 600; const opts = []; const now = new Date();
    for (let w = 0; w < 5; w++) { const e = new Date(now.getTime() + (w * 7 + 1) * 864e5); const ex = String(e.getUTCFullYear()).slice(2) + String(e.getUTCMonth() + 1).padStart(2, '0') + String(e.getUTCDate()).padStart(2, '0');
      for (let K = Math.round(S * 0.9); K <= S * 1.1; K += 1) { const c = Math.round(20000 * Math.exp(-(((K - S * 1.015) / (S * 0.012)) ** 2))) + 300, p = Math.round(26000 * Math.exp(-(((K - S * 0.975) / (S * 0.012)) ** 2))) + 300;
        const atm = Math.max(0.5, 6 - Math.abs(K - S) * 0.3);
        opts.push({ option: `${und}${ex}C${String(K * 1000).padStart(8, '0')}`, iv: 0.2, open_interest: c, bid: Math.max(0, S - K) + atm, ask: Math.max(0, S - K) + atm + 0.05 });
        opts.push({ option: `${und}${ex}P${String(K * 1000).padStart(8, '0')}`, iv: 0.24, open_interest: p, bid: Math.max(0, K - S) + atm, ask: Math.max(0, K - S) + atm + 0.05 }); } }
    return ok({ data: { current_price: S, close: S, options: opts } }); }
  if (u.includes('youtube.com/channel/')) {
    const id = u.split('/channel/')[1].split('/')[0];
    const page = (vid, title, live, start) => new Response(`<html><head><link rel="canonical" href="https://www.youtube.com/watch?v=${vid}"><meta name="title" content="${title}"></head><body>${live ? '"isLiveNow":true' : '"isUpcoming":true,"scheduledStartTime":"' + Math.floor(start / 1e3) + '"'} "playableInEmbed":true</body></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
    if (id === 'UCYxRlFDqcWM4y7FfpiAN3KQ') return page('icuRZ2LXk1E', 'President Trump Delivers Remarks on Tariffs and a China Trade Deal', true);
    if (id === 'UCAzhpt9DmG6PnHXjmJTvRGQ') return page('aaaaaaaaaaa', 'FOMC Press Conference', false, Date.now() + 7 * 60e3);
    if (id === 'UCEAZeUIeJs0IjQiqTCdVSIg') return page('KQp-e_XQnDE', 'Yahoo Finance Live', true);
    return new Response('<html></html>', { status: 200 });
  }
  if (u.includes('economicevents')) return ok({ data: { rows: [
    { gmt: '02:00', country: 'United Kingdom', eventName: 'CPI', actual: '4.1%', consensus: '3.9%', previous: '3.8%' },
    { gmt: '08:30', country: 'United States', eventName: 'Core CPI', actual: '0.2%', consensus: '0.3%', previous: '0.3%' },
    { gmt: '08:30', country: 'United States', eventName: 'CPI', actual: '0.5%', consensus: '0.4%', previous: '0.4%' },
    { gmt: (() => { const n = ny(Date.now() - 10 * 60e3); return String(n.h).padStart(2, '0') + ':' + String(n.mi).padStart(2, '0'); })(), country: 'United States', eventName: 'Retail Sales', actual: '-0.3%', consensus: '0.4%', previous: '0.6%' },
    { gmt: '13:00', country: 'United States', eventName: 'Fed Waller Speech', actual: '', consensus: '', previous: '' },
  ] } });
  if (u.includes('api.nasdaq.com')) return ok(earnings(u.split('date=')[1]));
  if (u.includes('news.google.com')) return ok(rss([['China\u2019s economy grows 4.8% as exports offset weak spending - Reuters', 45], ['Oil jumps 2% as OPEC+ signals deeper supply cuts - Bloomberg', 70], ['ECB holds rates, Lagarde says inflation fight nearly done - Financial Times', 95], ['Bank of Japan signals possible rate hike in December, yen strengthens - Nikkei Asia', 130], ['White House weighs new tariffs on European cars - AP', 160], ['Nvidia drops 3% as chip stocks retreat on export curbs - Reuters', 65], ['Fed\u2019s Waller says more rate cuts likely if inflation cools - Bloomberg', 120], ['Bitcoin climbs above $108,000 as ETF inflows return - CoinDesk', 25], ['Solana memecoin volumes fall as traders turn cautious - The Block', 210], ['US mortgage rates fall to lowest level in a year - CNBC', 240], ['Tesla shares slip ahead of earnings after the bell - CNBC', 140], ['Dogecoin jumps 8% as memecoin traders return - Decrypt', 55], ['Is This Millionaire-Maker Cryptocurrency the Next XRP? - Motley Fool', 50], ['Vertiseit (OM:VERT B) Stock Rises 4% - Simply Wall St', 40], ['Shafaq News..Oil prices rise on supply fears - Shafaq', 80], ['Japan&amp;#x2019;s megabanks test XRP payments - Nikkei', 90]]), 'application/xml');
  if (u.includes('bbci.co.uk') || u.includes('npr.org')) return ok(rss([['UK inflation unexpectedly rises to 3.9%', 300], ['Gold hits record as investors seek safety', 330]]), 'application/xml');
  if (u.includes('cnbc.com')) return ok(rss(HEADLINES.cnbc), 'application/xml');
  if (u.includes('dowjones') || u.includes('yahoo.com/news')) return ok(rss(HEADLINES.mw), 'application/xml');
  if (u.includes('federalreserve')) return ok(rss(HEADLINES.fed), 'application/xml');
  if (u.includes('fxstreet')) return ok(rss(HEADLINES.fx), 'application/xml');
  if (u.includes('coindesk') || u.includes('cointelegraph') || u.includes('decrypt')) return ok(rss(HEADLINES.crypto), 'application/xml');
  if (realFetch && u.startsWith('http://127.0.0.1')) return realFetch(url, opts);
  throw new Error('fixture: no mock for ' + u);
};
