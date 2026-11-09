// Story threads: grouping headlines into ongoing stories, and the price line drawn under them.
// Rules (tests/threads.test.js checks each one):
// 1. Two words become one story only when they really travel together in BOTH directions. "Iran" headlines that
//    often mention the midterms don't make Iran part of the election story, because most election headlines
//    don't mention Iran.
// 2. The same headline repeated by the feed (or reworded slightly) shows once, at its newest time.
// 3. A headline only gets a "moved the market" grade if the market was open right after it (weekend and
//    overnight-closed headlines get none).
// 4. The price line skips time the market was closed, so a weekend isn't drawn as a long flat line.
"use strict";

const norm = (t) => String(t || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const wordsOf = (t) => new Set(norm(t).split(" ").filter((w) => w.length > 2));
function sameHeadline(a, b) {
  const x = norm(a), y = norm(b);
  if (x === y) return true;
  const A = wordsOf(a), B = wordsOf(b); let both = 0;
  A.forEach((w) => { if (B.has(w)) both++; });
  return both / Math.max(1, Math.min(A.size, B.size)) >= 0.85 && both / Math.max(A.size, B.size) >= 0.7;
}
// newest first in, newest kept
function dedupe(list) {
  const out = [];
  list.forEach((h) => { if (!out.some((k) => sameHeadline(k.title, h.title))) out.push(h); });
  return out;
}

// pool: [{ id, title, t, theme, label, words: [...] }]; broad: words too general to name a story
function findThreads(pool, broad) {
  const N = pool.length, freq = {};
  pool.forEach((h) => h.words.forEach((w) => { freq[w] = (freq[w] || 0) + 1; }));
  const keys = Object.entries(freq).filter(([w, n]) => n >= 3 && n <= Math.max(8, N * 0.35) && !(broad && broad.has(w))).sort((x, y) => y[1] - x[1]).map(([w]) => w).slice(0, 40);
  const groups = [];
  keys.forEach((k) => {
    const withK = pool.filter((h) => h.words.includes(k));
    const g = groups.find((gr) => {
      const withG = pool.filter((h) => h.words.includes(gr.keys[0]));
      const both = withK.filter((h) => h.words.includes(gr.keys[0])).length;
      // rule 1: together most of the time for k, AND a real share of the story's own headlines
      return both >= withK.length * 0.5 && both >= withG.length * 0.3;
    });
    if (g) g.keys.push(k); else groups.push({ keys: [k] });
  });
  const used = new Set(), threads = [];
  groups.forEach((g) => {
    const mem = dedupe(pool.filter((h) => !used.has(h.id) && g.keys.some((k) => h.words.includes(k))).sort((x, y) => y.t - x.t));
    pool.filter((h) => g.keys.some((k) => h.words.includes(k))).forEach((h) => used.add(h.id));
    if (mem.length < 4) return;
    const tc = {}; mem.forEach((h) => { tc[h.theme] = (tc[h.theme] || 0) + 1; });
    const theme = Object.entries(tc).sort((x, y) => y[1] - x[1])[0][0];
    const label = (mem.find((h) => h.theme === theme) || {}).label || theme;
    threads.push({ theme, label, keys: g.keys.slice(0, 3), members: mem });
  });
  return threads;
}

// rule 3: was the market trading in the half hour after t?
function openAt(bars, t, win = 30 * 6e4) {
  if (!bars || !bars.length) return false;
  for (let i = 0; i < bars.length; i++) { if (bars[i].t >= t) return bars[i].t - t <= win; }
  return false;
}
// rule 4: [t, price] points with closed stretches marked, so the chart can skip them
function tradingSeries(bars, maxPts = 160, gap = 2 * 36e5) {
  const step = Math.max(1, Math.ceil(bars.length / maxPts));
  const pts = bars.filter((_, i) => i % step === 0 || i === bars.length - 1).map((b) => [b.t, b.c]);
  const breaks = [];
  for (let i = 1; i < bars.length; i++) if (bars[i].t - bars[i - 1].t > gap) breaks.push(bars[i].t);
  return { pts, breaks };
}

module.exports = { findThreads, dedupe, sameHeadline, openAt, tradingSeries, norm };
