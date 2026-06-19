import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, dirname, extname } from "node:path";
import assert from "node:assert/strict";

const root = resolve(new URL("..", import.meta.url).pathname);
const htmlFiles = [];
async function walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = resolve(dir, entry);
    const info = await stat(full);
    if (info.isDirectory() && !full.includes("node_modules")) await walk(full);
    else if (extname(entry) === ".html") htmlFiles.push(full);
  }
}
await walk(root);
const missing = [];
for (const file of htmlFiles) {
  const html = await readFile(file, "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
    const ref = match[1];
    if (/^(https?:|mailto:|tel:|data:|\/\/.+)/.test(ref) || ref.startsWith("/.netlify/")) continue;
    const target = ref.startsWith("/") ? resolve(root, ref.slice(1)) : resolve(dirname(file), ref);
    try { await stat(target); } catch { missing.push(`${file.replace(root, "")}: ${ref}`); }
  }
}
assert.deepEqual(missing, [], `Missing referenced files:\n${missing.join("\n")}`);
console.log(`Validated ${htmlFiles.length} HTML files with no missing local references`);
