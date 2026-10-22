# The Open One

Everything is in one flat folder with no subfolders. Upload all these files to the top level of your GitHub repo:
index.html, app.js, app.css, me.js, config.js, data.js, vercel.json, icon.svg, supabase-open-one.sql, README.md, dev-server.mjs

## One-time account setup (uses the same Supabase project as Crema)
1. **config.js:** paste the same Project URL and publishable key you used for Crema.
2. **Supabase → SQL Editor → New query:** paste `supabase-open-one.sql` and click Run. This creates the table that stores each person's setup answers.
3. **Supabase → Authentication → URL Configuration → Redirect URLs:** add `https://the-open-one.vercel.app/**`.
4. **Google Cloud → your OAuth client → Authorized JavaScript origins:** add `https://the-open-one.vercel.app`. Google sign-in then works on both sites.

Until config.js is filled in, the site runs without accounts and saves the setup answers on each device.

## Notes
- Email sign-up only works for addresses on your Supabase team until you add an email sender (Supabase → Authentication → Emails → SMTP). Google sign-in works for everyone.
- Live charts and heatmaps come from TradingView's free widgets. Index futures show as their CFD twins (US100 for NQ, US500 for ES), which track them live.
- Alerts work while the site is open in a browser tab.
- Optional AI-written market brief: in Vercel, go to Settings → Environment Variables, add `ANTHROPIC_API_KEY`, then redeploy.
