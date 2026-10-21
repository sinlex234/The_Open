# The Open One

Everything sits in one flat folder, with no subfolders. Upload all of these files to the top level of your GitHub repo:

index.html, app.js, app.css, icon.svg, data.js, vercel.json, README.md, dev-server.mjs

- `data.js` is the whole data service (calendar, prices, crypto, memecoins, earnings, headlines).
- `vercel.json` tells Vercel to run `data.js` as the data service at `/api/data`. **Without it the site shows errors.**
- Don't add a `package.json` with `"type": "module"`.

After Vercel deploys, `https://your-site.vercel.app/api/data?fn=calendar` should show data.

Optional AI-written morning brief: in Vercel, go to Settings → Environment Variables, add `ANTHROPIC_API_KEY`, then redeploy.

Run it on your own computer: `node dev-server.mjs`, then open http://localhost:3000 (needs Node 20+).
