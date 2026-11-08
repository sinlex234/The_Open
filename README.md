# The Open One

A news site that explains what is happening in the world and how it moves markets, personalised to the way each reader trades.

All files sit at the top level of the repo (no folders):
index.html, app.js, app.css, me.js, glossary.js, config.js, data.js, vercel.json, icon.svg, supabase-open-one.sql, README.md, dev-server.mjs

- `data.js` is the data service (prices, news, calendar, AI writing). `vercel.json` runs it at `/api/data`.
- `me.js` holds sign-in, the setup questions and the reader's profile.
- `glossary.js` holds the market terms page.
- `config.js` holds the Supabase project URL and publishable key.

## Setup
1. Paste your Supabase Project URL and publishable key into `config.js`.
2. In Supabase, run `supabase-open-one.sql` in the SQL Editor once.
3. In Supabase, go to Authentication, then URL Configuration, and add `https://the-open-one.vercel.app/**` to Redirect URLs.
4. In Vercel, add an `ANTHROPIC_API_KEY` environment variable so the front page and "Explain this" are written by AI. Without it the site uses rule-based writing.


## Checks before anything goes live

- `recap.js` holds the session recap rules as plain functions. `tests/recap.test.js` has one test for each mistake that has happened or could: a bias saved after the session started, ES borrowing NQ's bias, a gap at the open counted as a liquidity grab, stops placed exactly at the high, exact-top/bottom "best moves", a fixed "quiet" threshold, stock-market hours used for forex and crypto, and anything after the session changing the result.
- Run them with `node --test tests/*.test.js`. They run automatically on every push to GitHub (the `tests` workflow); a red X on a commit means something broke.
- New rules get a new test in the same change.
