// Test server: sample data + the site folder given as argv[2], on port argv[3]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
await import('./fixtures.mjs');
const root = path.resolve(process.argv[2]); const port = +process.argv[3] || 3400;
const handler = createRequire(import.meta.url)(path.join(root, 'data.js'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/data') {
    const shim = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, send(b) { res.writeHead(this.statusCode, this.headers); res.end(b); } };
    try { await handler(Object.assign(req, { query: Object.fromEntries(url.searchParams) }), shim); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
    return;
  }
  const pages = /^\/(today|news|markets|futures|forex|crypto|memes|memecoins|options|calendar|economy|confluences|earnings|glossary|heatmaps|movers|scorecard|privacy|terms|plans|profile|alerts)\/?$/;
  const p = path.join(root, decodeURIComponent(url.pathname === '/' || pages.test(url.pathname) ? '/index.html' : url.pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
}).listen(port, () => console.log('test server on ' + port));
