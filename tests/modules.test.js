// The browser loads app.js, me.js and the other front-end files as modules. A mistake that only breaks a module
// (like importing the same name twice) blanks the whole site, so each one is checked exactly the way a browser reads it.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
// every module the page loads, and everything those import
function modules() {
  const seen = new Set(), todo = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]).filter((t) => /type="module"/.test(t)).map((t) => (t.match(/src="\/?([^"?]+)/) || [])[1]).filter((f) => f && !/^https?:/.test(f));
  while (todo.length) {
    const f = todo.pop(); if (seen.has(f) || !fs.existsSync(path.join(root, f))) continue; seen.add(f);
    const src = fs.readFileSync(path.join(root, f), "utf8");
    [...src.matchAll(/(?:import|from)\s*['"]\.\/([^'"]+)['"]/g)].forEach((m) => todo.push(m[1]));
  }
  return [...seen];
}
test("the page loads at least app.js as a module", () => assert.ok(modules().includes("app.js"), "found: " + modules().join(", ")));
for (const f of modules()) {
  test(`${f} is a valid browser module`, () => {
    const tmp = path.join(os.tmpdir(), "modcheck-" + f.replace(/\W/g, "_") + ".mjs");
    fs.writeFileSync(tmp, fs.readFileSync(path.join(root, f)));
    const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
    assert.equal(r.status, 0, (r.stderr || "").split("\n").filter(Boolean).slice(0, 4).join("\n"));
  });
}
