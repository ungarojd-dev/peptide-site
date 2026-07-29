// Pulls the live catalog snapshot from production and writes it as the bundled
// fallback, then leaves build-programmatic-pages.mjs to rebake the static pages.
//
// Why this exists instead of build-catalog-fallback.mjs:
//   build-catalog-fallback.mjs rebuilds from data/catalog-fallback.json, a
//   committed static seed. That seed carries 14 vendors and no Orbitrex rows,
//   because Orbitrex runs a custom JSON feed authenticated with a Bearer key
//   that only exists in the Netlify environment. Rebuilding locally therefore
//   cannot ever see it, and the static pages silently advertise a smaller
//   roster than production actually serves.
//
// The coverage guard below refuses to overwrite the snapshot when the fetched
// payload is missing vendors the config expects. A partial snapshot baked into
// 100+ static pages is much worse than a failed build.
//
// Usage:  node scripts/pull-live-snapshot.mjs
//         node scripts/pull-live-snapshot.mjs --allow-missing="Solyn Labs"

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const W = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENDPOINT = process.env.SNAPSHOT_URL
  || "https://mypeptideprice.com/.netlify/functions/catalog-snapshot";
const TIMEOUT_MS = 45000;

const allowArg = process.argv.find(a => a.startsWith("--allow-missing="));
const allowMissing = new Set(
  (allowArg ? allowArg.split("=").slice(1).join("=") : "")
    .split(",").map(s => s.trim()).filter(Boolean)
);

const vendorCfg = JSON.parse(await readFile(`${W}/data/vendor-config.json`, "utf8"));
const expected = Object.keys(vendorCfg.vendors || {});

console.log(`Fetching ${ENDPOINT}`);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
let payload;
try {
  const response = await fetch(ENDPOINT, { signal: controller.signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  payload = await response.json();
} catch (error) {
  console.error(`FAILED: could not fetch live snapshot (${error.message})`);
  console.error("Snapshot left untouched.");
  process.exit(1);
} finally {
  clearTimeout(timer);
}

// The function wraps the snapshot in { data: ... }; accept either shape.
const snapshot = payload?.data?.products ? payload.data : payload;
if (!Array.isArray(snapshot?.products) || !snapshot.products.length) {
  console.error("FAILED: fetched payload has no products. Snapshot left untouched.");
  process.exit(1);
}

const seen = new Set();
let offerCount = 0;
let deepLinked = 0;
for (const product of snapshot.products) {
  for (const variant of product.variants || []) {
    for (const supplier of variant.suppliers || []) {
      seen.add(supplier.vendor_name);
      offerCount += 1;
      const url = String(supplier.affiliate_url || "");
      // A deep link has a path beyond "/", so a bare homepage plus query
      // string does not count.
      try { if (new URL(url).pathname.replace(/\/+$/, "")) deepLinked += 1; } catch { /* ignore */ }
    }
  }
}

const missing = expected.filter(name => !seen.has(name) && !allowMissing.has(name));
if (missing.length) {
  console.error(`FAILED: live snapshot is missing ${missing.length} configured vendor(s):`);
  for (const name of missing) console.error(`  - ${name}`);
  console.error("");
  console.error("A vendor absent here will be absent from every static page it should");
  console.error("appear on. Fix the vendor feed, or re-run with:");
  console.error(`  node scripts/pull-live-snapshot.mjs --allow-missing="${missing.join(",")}"`);
  console.error("Snapshot left untouched.");
  process.exit(1);
}

const output = { ...snapshot, snapshot_updated_at: new Date().toISOString(), snapshot_refresh_ms: 0 };
await writeFile(`${W}/data/catalog-fallback-snapshot.json`, `${JSON.stringify(output, null, 2)}\n`);

const pct = offerCount ? Math.round((deepLinked / offerCount) * 100) : 0;
console.log(`Wrote data/catalog-fallback-snapshot.json`);
console.log(`  vendors:      ${seen.size} of ${expected.length} configured`);
console.log(`  offers:       ${offerCount}`);
console.log(`  deep links:   ${deepLinked} (${pct}% of offers resolve to a product URL)`);
if (allowMissing.size) console.log(`  waived:       ${[...allowMissing].join(", ")}`);
console.log("");
console.log("Next: node scripts/build-programmatic-pages.mjs");
