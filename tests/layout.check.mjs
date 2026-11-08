// Layout check: every page, at phone, tablet, laptop and big-monitor widths, must fit the screen.
// Fails if the page scrolls sideways, if a button or tab is cut off, or if content is clipped by a box
// that doesn't show it can scroll. Uses sample data (tests/harness), so it needs no network.
// Run: node tests/layout.check.mjs   (needs Playwright: npm i -D playwright && npx playwright install chromium)
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "..");
const PORT = 3411, BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ["/", "/news", "/markets", "/heatmaps", "/futures", "/forex", "/crypto", "/memecoins", "/options", "/calendar", "/scorecard", "/glossary"];
const WIDTHS = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1366, 768], [1920, 1080]];
// Rows allowed to scroll sideways: each shows a fade on the side that has more (see HSCROLL in app.js).
// .strip is the moving price ticker; .skip is the keyboard "Skip to content" link, hidden until focused.
const SCROLLERS = ".strip, .skip, .nav, .tfbar, .tn-strip, .th-row, .tv, .tv-wrap, .tvw, iframe, .tbl-wrap, .t-scroll, pre, code";
const MOCK = readFileSync(path.join(here, "harness/mock-supabase.js"), "utf8");
// a signed-in reader who trades everything, with lots of strategies, so every chip row is as full as it gets
const ans = { v: 2, done: true, markets: ["futures", "options", "forex", "crypto", "memes", "stocks"], "futures.strategy": ["ict", "pa", "orderflow", "news"], "forex.strategy": ["ict", "carry"], "crypto.strategy": ["swing", "perps"], "memes.strategy": ["launches", "trending"], "futures.assets": ["NQ", "ES", "GC"], "forex.assets": ["EURUSD", "GBPUSD", "USDJPY"], "crypto.assets": ["BTC", "ETH", "SOL"], level: "pro" };
const db = { users: [], profiles: [], open: [{ user_id: "u1", answers: ans }] };
const seed = `localStorage.setItem('__mocksess',JSON.stringify({user:{id:'u1',email:'t@x.com',user_metadata:{full_name:'Alex'}}}));localStorage.setItem('__mockdb',${JSON.stringify(JSON.stringify(db))});`;

const server = spawn(process.execPath, [path.join(here, "harness/server.mjs"), root, String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ok) => server.stdout.on("data", (d) => /test server/.test(String(d)) && ok()));
const browser = await chromium.launch();
const problems = [];
try {
  for (const [w, h] of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    await ctx.addInitScript(seed);
    await ctx.route("**/*", (r) => r.request().url().includes("supabase-js") ? r.fulfill({ body: MOCK, contentType: "application/javascript" }) : r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    const pg = await ctx.newPage();
    for (const p of PAGES) {
      await pg.goto(BASE + p); await pg.waitForTimeout(4500);
      // open every tab so hidden panels get checked too
      const found = await pg.evaluate(({ SCROLLERS }) => {
        const out = [], vw = innerWidth;
        if (document.documentElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth}px wide on a ${vw}px screen)`);
        const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"; };
        const name = (el) => (el.innerText || el.getAttribute("aria-label") || el.className || el.tagName).toString().trim().slice(0, 40);
        // buttons, tabs and chips must be fully on screen unless they sit in an allowed scroller
        document.querySelectorAll("button, a, .chip, .pill, [role=tab]").forEach((el) => {
          if (!vis(el) || el.closest(SCROLLERS) || el.closest("[hidden]")) return;
          const r = el.getBoundingClientRect();
          if (r.right > vw + 1 || r.left < -1) out.push(`cut off at the screen edge: "${name(el)}"`);
          // cut off by a parent that hides overflow
          let p = el.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (/(hidden|clip|auto|scroll)/.test(cs.overflowX) && !p.matches(SCROLLERS)) { const pr = p.getBoundingClientRect(); if (r.right > pr.right + 1 || r.left < pr.left - 1) { out.push(`cut off inside its box: "${name(el)}"`); break; } }
            p = p.parentElement;
          }
        });
        // boxes that hide content sideways without showing they scroll
        document.querySelectorAll("body *").forEach((el) => {
          if (!vis(el) || el.matches(SCROLLERS) || el.closest(SCROLLERS)) return;
          const cs = getComputedStyle(el);
          if (!/(hidden|clip|auto|scroll)/.test(cs.overflowX) || cs.textOverflow === "ellipsis" || /line-clamp|-webkit-box/.test(cs.display + cs.webkitLineClamp)) return;
          if (el.scrollWidth > el.clientWidth + 2 && el.children.length) out.push(`content clipped sideways in "${name(el)}" (${el.scrollWidth}px in a ${el.clientWidth}px box)`);
        });
        return [...new Set(out)].slice(0, 12);
      }, { SCROLLERS });
      found.forEach((f) => problems.push(`${p} at ${w}px: ${f}`));
    }
    await ctx.close();
  }
} finally { await browser.close(); server.kill(); }
if (problems.length) { console.log(problems.join("\n")); console.log(`\n${problems.length} layout problem(s).`); process.exit(1); }
console.log(`Layout OK: ${PAGES.length} pages at ${WIDTHS.length} screen sizes fit the screen.`);
