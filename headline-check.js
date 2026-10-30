// Checks the headline reader in data.js against headline-tests.txt. Run: node headline-check.js
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'data.js'), 'utf8') + "\n;module.exports.__hd = headlineDirs;";
const m = { exports: {} }; new Function('module', 'exports', 'require', 'process', src)(m, m.exports, require, process);
const L = { u: 1, d: -1, '0': 0 }, S = { 1: 'up', '-1': 'down', 0: 'no call' };
let ok = 0, bad = 0;
for (const line of fs.readFileSync(path.join(__dirname, 'headline-tests.txt'), 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [t, a, b, c] = line.split(' | ').map((s) => s.trim()); const g = m.exports.__hd(t);
  [['NQ', a], ['Bitcoin', b], ['EUR/USD', c]].forEach(([k, w], i) => { const got = g[['NQ', 'BTC', 'EURUSD'][i]]; if (got === L[w]) ok++; else { bad++; console.log(`WRONG ${k}: should be ${S[L[w]]}, reads ${S[got]}  ←  ${t}`); } });
}
console.log(`${ok} right, ${bad} wrong`);
process.exit(bad ? 1 : 0);
